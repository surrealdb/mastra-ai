import type {
	MastraDBMessage,
	MastraMessageContentV2,
} from '@mastra/core/agent';
import type { StorageThreadType } from '@mastra/core/memory';
import type {
	StorageListMessagesInput,
	StorageListMessagesOutput,
	StorageListThreadsInput,
	StorageListThreadsOutput,
	StorageResourceType,
} from '@mastra/core/storage';
import { MemoryStorage } from '@mastra/core/storage';
import type { SurrealDBClient } from '../../client.js';
import { getMemorySchema } from '../../schema/index.js';

type RawThread = {
	id: string;
	resourceId: string;
	title?: string | null;
	metadata?: Record<string, unknown> | null;
	createdAt: string | Date;
	updatedAt: string | Date;
};

type RawMessage = {
	id: string;
	threadId: string;
	resourceId?: string | null;
	role: string;
	type?: string | null;
	content: MastraMessageContentV2;
	createdAt: string | Date;
};

type RawResource = {
	id: string;
	workingMemory?: string | null;
	metadata?: Record<string, unknown> | null;
	createdAt: string | Date;
	updatedAt: string | Date;
};

function parseDate(d: string | Date): Date {
	return d instanceof Date ? d : new Date(d);
}

function parseThread(r: RawThread): StorageThreadType {
	return {
		id: r.id,
		resourceId: r.resourceId,
		title: r.title ?? undefined,
		metadata: r.metadata ?? undefined,
		createdAt: parseDate(r.createdAt),
		updatedAt: parseDate(r.updatedAt),
	};
}

function parseMessage(r: RawMessage): MastraDBMessage {
	return {
		id: r.id,
		threadId: r.threadId,
		resourceId: r.resourceId ?? undefined,
		role: r.role as MastraDBMessage['role'],
		type: r.type ?? undefined,
		content: r.content,
		createdAt: parseDate(r.createdAt),
	};
}

function parseResource(r: RawResource): StorageResourceType {
	return {
		id: r.id,
		workingMemory: r.workingMemory ?? undefined,
		metadata: r.metadata ?? undefined,
		createdAt: parseDate(r.createdAt),
		updatedAt: parseDate(r.updatedAt),
	};
}

export class MemorySurrealDB extends MemoryStorage {
	constructor(private readonly client: SurrealDBClient) {
		super();
	}

	async init(): Promise<void> {
		const schema = getMemorySchema();
		await this.client.execute(schema);
	}

	async dangerouslyClearAll(): Promise<void> {
		await this.client.execute(
			'DELETE mastra_threads; DELETE mastra_messages; DELETE mastra_resources;',
		);
	}

	async getThreadById({
		threadId,
	}: {
		threadId: string;
	}): Promise<StorageThreadType | null> {
		const row = await this.client.queryOne<RawThread>(
			'SELECT * FROM mastra_threads WHERE id = $id LIMIT 1',
			{ id: threadId },
		);
		return row ? parseThread(row) : null;
	}

	async saveThread({
		thread,
	}: {
		thread: StorageThreadType;
	}): Promise<StorageThreadType> {
		const now = new Date();
		const data = {
			id: thread.id,
			resourceId: thread.resourceId,
			title: thread.title ?? null,
			metadata: thread.metadata ?? null,
			createdAt: thread.createdAt ?? now,
			updatedAt: thread.updatedAt ?? now,
		};
		await this.client.execute(
			`UPSERT type::thing('mastra_threads', $id) CONTENT $data`,
			{ id: thread.id, data },
		);
		return thread;
	}

	async updateThread({
		id,
		title,
		metadata,
	}: {
		id: string;
		title: string;
		metadata: Record<string, unknown>;
	}): Promise<StorageThreadType> {
		const now = new Date();
		await this.client.execute(
			`UPDATE type::thing('mastra_threads', $id) MERGE { title: $title, metadata: $metadata, updatedAt: $now }`,
			{ id, title, metadata, now },
		);
		const updated = await this.getThreadById({ threadId: id });
		if (!updated) throw new Error(`Thread not found after update: ${id}`);
		return updated;
	}

	async deleteThread({ threadId }: { threadId: string }): Promise<void> {
		await this.client.execute(
			`DELETE type::thing('mastra_threads', $id); DELETE mastra_messages WHERE threadId = $id`,
			{ id: threadId },
		);
	}

	async listThreads(
		args: StorageListThreadsInput,
	): Promise<StorageListThreadsOutput> {
		const { filter, page = 0, perPage = 100, orderBy } = args;
		const normalizedPerPage =
			perPage === false ? Number.MAX_SAFE_INTEGER : (perPage ?? 100);
		const offset = page * normalizedPerPage;

		const { field: sortField, direction: sortDir } =
			this.parseOrderBy(orderBy);
		const orderClause = `ORDER BY ${sortField} ${sortDir.toUpperCase()}`;

		let whereClause = '1 = 1';
		const bindings: Record<string, unknown> = {
			limit: normalizedPerPage,
			offset,
		};

		if (filter?.resourceId) {
			whereClause += ' AND resourceId = $resourceId';
			bindings.resourceId = filter.resourceId;
		}

		if (filter?.metadata && Object.keys(filter.metadata).length > 0) {
			this.validateMetadataKeys(filter.metadata);
			let i = 0;
			for (const [key, value] of Object.entries(filter.metadata)) {
				const paramKey = `meta_${i++}`;
				whereClause += ` AND metadata.${key} = $${paramKey}`;
				bindings[paramKey] = value;
			}
		}

		const [rows, countRows] = await Promise.all([
			this.client.queryAll<RawThread>(
				`SELECT * FROM mastra_threads WHERE ${whereClause} ${orderClause} LIMIT $limit START $offset`,
				bindings,
			),
			this.client.queryAll<{ count: number }>(
				`SELECT count() AS count FROM mastra_threads WHERE ${whereClause} GROUP ALL`,
				bindings,
			),
		]);

		const total = countRows[0]?.count ?? 0;
		const threads = rows.map(parseThread);

		return {
			threads,
			total,
			page,
			perPage: perPage as number | false,
			hasMore: offset + threads.length < total,
		};
	}

	async listMessages(
		args: StorageListMessagesInput,
	): Promise<StorageListMessagesOutput> {
		const {
			threadId,
			resourceId,
			page = 0,
			perPage = 40,
			filter,
			orderBy,
		} = args;

		const threadIds = Array.isArray(threadId) ? threadId : [threadId];
		const whereParts: string[] = ['threadId INSIDE $threadIds'];
		const bindings: Record<string, unknown> = { threadIds };

		if (resourceId) {
			whereParts.push('resourceId = $resourceId');
			bindings.resourceId = resourceId;
		}
		if (filter?.dateRange?.start) {
			const op = filter.dateRange.startExclusive ? '>' : '>=';
			whereParts.push(`createdAt ${op} $startDate`);
			bindings.startDate = filter.dateRange.start;
		}
		if (filter?.dateRange?.end) {
			const op = filter.dateRange.endExclusive ? '<' : '<=';
			whereParts.push(`createdAt ${op} $endDate`);
			bindings.endDate = filter.dateRange.end;
		}

		const whereClause = whereParts.join(' AND ');
		const { field: sortField, direction: sortDir } =
			this.parseOrderBy(orderBy);
		const normalizedPerPage =
			perPage === false ? Number.MAX_SAFE_INTEGER : (perPage ?? 40);
		const offset = page * normalizedPerPage;

		const [rows, countRows] = await Promise.all([
			this.client.queryAll<RawMessage>(
				`SELECT * FROM mastra_messages WHERE ${whereClause} ORDER BY ${sortField} ${sortDir.toUpperCase()} LIMIT $limit START $offset`,
				{ ...bindings, limit: normalizedPerPage, offset },
			),
			this.client.queryAll<{ count: number }>(
				`SELECT count() AS count FROM mastra_messages WHERE ${whereClause} GROUP ALL`,
				bindings,
			),
		]);

		const total = countRows[0]?.count ?? 0;
		const messages = rows.map(parseMessage);

		return {
			messages,
			total,
			page,
			perPage: perPage as number | false,
			hasMore: offset + messages.length < total,
		};
	}

	async listMessagesById({
		messageIds,
	}: {
		messageIds: string[];
	}): Promise<{ messages: MastraDBMessage[] }> {
		if (messageIds.length === 0) return { messages: [] };
		const rows = await this.client.queryAll<RawMessage>(
			'SELECT * FROM mastra_messages WHERE id INSIDE $ids ORDER BY createdAt ASC',
			{ ids: messageIds },
		);
		return { messages: rows.map(parseMessage) };
	}

	async saveMessages({
		messages,
	}: {
		messages: MastraDBMessage[];
	}): Promise<{ messages: MastraDBMessage[] }> {
		if (messages.length === 0) return { messages: [] };

		await this.client.tx(async (db) => {
			for (const msg of messages) {
				const data = {
					id: msg.id,
					threadId: msg.threadId,
					resourceId: msg.resourceId ?? null,
					role: msg.role,
					type: msg.type ?? null,
					content: msg.content,
					createdAt: msg.createdAt ?? new Date(),
				};
				await db.query(
					`UPSERT type::thing('mastra_messages', $id) CONTENT $data`,
					{
						id: msg.id,
						data,
					},
				);
			}
		});

		return { messages };
	}

	async updateMessages(args: {
		messages: (Partial<Omit<MastraDBMessage, 'createdAt'>> & {
			id: string;
			content?: {
				metadata?: MastraMessageContentV2['metadata'];
				content?: MastraMessageContentV2['content'];
			};
		})[];
	}): Promise<MastraDBMessage[]> {
		const updated: MastraDBMessage[] = [];

		for (const patch of args.messages) {
			const merge: Record<string, unknown> = {};
			if (patch.role !== undefined) merge.role = patch.role;
			if (patch.type !== undefined) merge.type = patch.type;
			if (patch.threadId !== undefined) merge.threadId = patch.threadId;
			if (patch.resourceId !== undefined)
				merge.resourceId = patch.resourceId;

			if (patch.content) {
				if (patch.content.metadata !== undefined)
					merge['content.metadata'] = patch.content.metadata;
				if (patch.content.content !== undefined)
					merge['content.content'] = patch.content.content;
			}

			if (Object.keys(merge).length > 0) {
				await this.client.execute(
					`UPDATE type::thing('mastra_messages', $id) MERGE $merge`,
					{ id: patch.id, merge },
				);
			}

			const row = await this.client.queryOne<RawMessage>(
				'SELECT * FROM mastra_messages WHERE id = $id LIMIT 1',
				{ id: patch.id },
			);
			if (row) updated.push(parseMessage(row));
		}

		return updated;
	}

	override async deleteMessages(messageIds: string[]): Promise<void> {
		if (messageIds.length === 0) return;
		await this.client.execute(
			'DELETE mastra_messages WHERE id INSIDE $ids',
			{ ids: messageIds },
		);
	}

	override async getResourceById({
		resourceId,
	}: {
		resourceId: string;
	}): Promise<StorageResourceType | null> {
		const row = await this.client.queryOne<RawResource>(
			'SELECT * FROM mastra_resources WHERE id = $id LIMIT 1',
			{ id: resourceId },
		);
		return row ? parseResource(row) : null;
	}

	override async saveResource({
		resource,
	}: {
		resource: StorageResourceType;
	}): Promise<StorageResourceType> {
		const now = new Date();
		const data = {
			id: resource.id,
			workingMemory: resource.workingMemory ?? null,
			metadata: resource.metadata ?? null,
			createdAt: resource.createdAt ?? now,
			updatedAt: resource.updatedAt ?? now,
		};
		await this.client.execute(
			`UPSERT type::thing('mastra_resources', $id) CONTENT $data`,
			{ id: resource.id, data },
		);
		return resource;
	}

	override async updateResource({
		resourceId,
		workingMemory,
		metadata,
	}: {
		resourceId: string;
		workingMemory?: string;
		metadata?: Record<string, unknown>;
	}): Promise<StorageResourceType> {
		const now = new Date();
		const merge: Record<string, unknown> = { updatedAt: now };
		if (workingMemory !== undefined) merge.workingMemory = workingMemory;
		if (metadata !== undefined) merge.metadata = metadata;

		await this.client.execute(
			`UPDATE type::thing('mastra_resources', $id) MERGE $merge`,
			{ id: resourceId, merge },
		);

		const updated = await this.getResourceById({ resourceId });
		if (!updated)
			throw new Error(`Resource not found after update: ${resourceId}`);
		return updated;
	}
}
