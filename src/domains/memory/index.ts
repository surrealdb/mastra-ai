import type {
	MastraDBMessage,
	MastraMessageContentV2,
} from '@mastra/core/agent';
import type { StorageThreadType } from '@mastra/core/memory';
import type {
	BufferedObservationChunk,
	CreateObservationalMemoryInput,
	CreateReflectionGenerationInput,
	ObservationalMemoryHistoryOptions,
	ObservationalMemoryOriginType,
	ObservationalMemoryRecord,
	ObservationalMemoryScope,
	StorageListMessagesByResourceIdInput,
	StorageListMessagesInput,
	StorageListMessagesOutput,
	StorageListThreadsInput,
	StorageListThreadsOutput,
	StorageResourceType,
	SwapBufferedReflectionToActiveInput,
	SwapBufferedToActiveInput,
	SwapBufferedToActiveResult,
	UpdateActiveObservationsInput,
	UpdateBufferedObservationsInput,
	UpdateBufferedReflectionInput,
	UpdateObservationalMemoryConfigInput,
} from '@mastra/core/storage';
import { MemoryStorage } from '@mastra/core/storage';
import { RecordId } from 'surrealdb';
import { recordKey, type SurrealDBClient } from '../../client.js';
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
		id: recordKey(r.id),
		resourceId: r.resourceId,
		title: r.title ?? undefined,
		metadata: r.metadata ?? undefined,
		createdAt: parseDate(r.createdAt),
		updatedAt: parseDate(r.updatedAt),
	};
}

function parseMessage(r: RawMessage): MastraDBMessage {
	return {
		id: recordKey(r.id),
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
		id: recordKey(r.id),
		workingMemory: r.workingMemory ?? undefined,
		metadata: r.metadata ?? undefined,
		createdAt: parseDate(r.createdAt),
		updatedAt: parseDate(r.updatedAt),
	};
}

type RawOMChunk = Record<string, unknown> & {
	lastObservedAt: string | Date;
	createdAt: string | Date;
};

type RawOMRecord = {
	id: string;
	scope: ObservationalMemoryScope;
	threadId?: string | null;
	resourceId: string;
	originType: ObservationalMemoryOriginType;
	generationCount: number;
	activeObservations: string;
	bufferedObservationChunks?: RawOMChunk[] | null;
	bufferedReflection?: string | null;
	bufferedReflectionTokens?: number | null;
	bufferedReflectionInputTokens?: number | null;
	reflectedObservationLineCount?: number | null;
	observedMessageIds?: string[] | null;
	observedTimezone?: string | null;
	totalTokensObserved: number;
	observationTokenCount: number;
	pendingMessageTokens: number;
	isReflecting: boolean;
	isObserving: boolean;
	isBufferingObservation: boolean;
	isBufferingReflection: boolean;
	lastBufferedAtTokens?: number | null;
	lastBufferedAtTime?: string | Date | null;
	lastObservedAt?: string | Date | null;
	config: Record<string, unknown>;
	metadata?: Record<string, unknown> | null;
	createdAt: string | Date;
	updatedAt: string | Date;
};

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(obj).filter(([, v]) => v !== undefined),
	);
}

function parseOMChunk(c: RawOMChunk): BufferedObservationChunk {
	return {
		...c,
		lastObservedAt: parseDate(c.lastObservedAt),
		createdAt: parseDate(c.createdAt),
	} as BufferedObservationChunk;
}

function parseOMRecord(r: RawOMRecord): ObservationalMemoryRecord {
	return {
		id: recordKey(r.id),
		scope: r.scope,
		threadId: r.threadId ?? null,
		resourceId: r.resourceId,
		originType: r.originType,
		generationCount: r.generationCount,
		activeObservations: r.activeObservations,
		bufferedObservationChunks: r.bufferedObservationChunks
			? r.bufferedObservationChunks.map(parseOMChunk)
			: undefined,
		bufferedReflection: r.bufferedReflection ?? undefined,
		bufferedReflectionTokens: r.bufferedReflectionTokens ?? undefined,
		bufferedReflectionInputTokens:
			r.bufferedReflectionInputTokens ?? undefined,
		reflectedObservationLineCount:
			r.reflectedObservationLineCount ?? undefined,
		observedMessageIds: r.observedMessageIds ?? undefined,
		observedTimezone: r.observedTimezone ?? undefined,
		totalTokensObserved: r.totalTokensObserved,
		observationTokenCount: r.observationTokenCount,
		pendingMessageTokens: r.pendingMessageTokens,
		isReflecting: r.isReflecting,
		isObserving: r.isObserving,
		isBufferingObservation: r.isBufferingObservation,
		isBufferingReflection: r.isBufferingReflection,
		lastBufferedAtTokens: r.lastBufferedAtTokens ?? 0,
		lastBufferedAtTime: r.lastBufferedAtTime
			? parseDate(r.lastBufferedAtTime)
			: null,
		lastObservedAt: r.lastObservedAt
			? parseDate(r.lastObservedAt)
			: undefined,
		config: r.config,
		metadata: r.metadata ?? undefined,
		createdAt: parseDate(r.createdAt),
		updatedAt: parseDate(r.updatedAt),
	};
}

// Serialize for CONTENT writes: drop undefined keys (option fields become NONE)
// and the deprecated legacy buffer fields not present in the schema.
function serializeOMRecord(
	record: ObservationalMemoryRecord,
): Record<string, unknown> {
	const {
		bufferedObservations: _legacyObs,
		bufferedObservationTokens: _legacyTokens,
		bufferedMessageIds: _legacyIds,
		...rest
	} = record;
	return stripUndefined({
		...rest,
		threadId: record.threadId ?? undefined,
		lastBufferedAtTime: record.lastBufferedAtTime ?? undefined,
		metadata: record.metadata ?? {},
	});
}

const OM_TABLE = 'mastra_observational_memory';

export class MemorySurrealDB extends MemoryStorage {
	override readonly supportsObservationalMemory = true;

	constructor(private readonly client: SurrealDBClient) {
		super();
	}

	async init(): Promise<void> {
		const schema = getMemorySchema();
		await this.client.execute(schema);
	}

	async dangerouslyClearAll(): Promise<void> {
		await this.client.execute(
			'DELETE mastra_threads; DELETE mastra_messages; DELETE mastra_resources; DELETE mastra_observational_memory;',
		);
	}

	async getThreadById({
		threadId,
	}: {
		threadId: string;
	}): Promise<StorageThreadType | null> {
		const row = await this.client.queryOne<RawThread>(
			`SELECT * FROM type::record('mastra_threads', $id)`,
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
		// Omit empty option fields: SurrealDB v3 rejects NULL for option<T>.
		const data = stripUndefined({
			id: thread.id,
			resourceId: thread.resourceId,
			title: thread.title ?? undefined,
			metadata: thread.metadata ?? undefined,
			createdAt: thread.createdAt ?? now,
			updatedAt: thread.updatedAt ?? now,
		});
		await this.client.execute(
			`UPSERT type::record('mastra_threads', $id) CONTENT $data`,
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
			`UPDATE type::record('mastra_threads', $id) MERGE { title: $title, metadata: $metadata, updatedAt: $now }`,
			{ id, title, metadata, now },
		);
		const updated = await this.getThreadById({ threadId: id });
		if (!updated) throw new Error(`Thread not found after update: ${id}`);
		return updated;
	}

	async deleteThread({ threadId }: { threadId: string }): Promise<void> {
		await this.client.execute(
			`DELETE type::record('mastra_threads', $id); DELETE mastra_messages WHERE threadId = $id`,
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
			{
				ids: messageIds.map(
					(id) => new RecordId('mastra_messages', id),
				),
			},
		);
		return { messages: rows.map(parseMessage) };
	}

	async saveMessages({
		messages,
	}: {
		messages: MastraDBMessage[];
	}): Promise<{ messages: MastraDBMessage[] }> {
		if (messages.length === 0) return { messages: [] };

		const statements: string[] = [];
		const bindings: Record<string, unknown> = {};
		messages.forEach((msg, i) => {
			statements.push(
				`UPSERT type::record('mastra_messages', $id_${i}) CONTENT $data_${i}`,
			);
			bindings[`id_${i}`] = msg.id;
			bindings[`data_${i}`] = stripUndefined({
				id: msg.id,
				threadId: msg.threadId,
				resourceId: msg.resourceId ?? undefined,
				role: msg.role,
				type: msg.type ?? undefined,
				content: msg.content,
				createdAt: msg.createdAt ?? new Date(),
			});
		});
		await this.client.txBatch(statements, bindings);

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
					`UPDATE type::record('mastra_messages', $id) MERGE $merge`,
					{ id: patch.id, merge },
				);
			}

			const row = await this.client.queryOne<RawMessage>(
				`SELECT * FROM type::record('mastra_messages', $id)`,
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
			{
				ids: messageIds.map(
					(id) => new RecordId('mastra_messages', id),
				),
			},
		);
	}

	override async getResourceById({
		resourceId,
	}: {
		resourceId: string;
	}): Promise<StorageResourceType | null> {
		const row = await this.client.queryOne<RawResource>(
			`SELECT * FROM type::record('mastra_resources', $id)`,
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
		const data = stripUndefined({
			id: resource.id,
			workingMemory: resource.workingMemory ?? undefined,
			metadata: resource.metadata ?? undefined,
			createdAt: resource.createdAt ?? now,
			updatedAt: resource.updatedAt ?? now,
		});
		await this.client.execute(
			`UPSERT type::record('mastra_resources', $id) CONTENT $data`,
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
			`UPDATE type::record('mastra_resources', $id) MERGE $merge`,
			{ id: resourceId, merge },
		);

		const updated = await this.getResourceById({ resourceId });
		if (!updated)
			throw new Error(`Resource not found after update: ${resourceId}`);
		return updated;
	}

	override async listMessagesByResourceId(
		args: StorageListMessagesByResourceIdInput,
	): Promise<StorageListMessagesOutput> {
		const { resourceId, page = 0, perPage = 40, filter, orderBy } = args;

		const whereParts: string[] = ['resourceId = $resourceId'];
		const bindings: Record<string, unknown> = { resourceId };

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
		// Observational Memory reads oldest-first by default, unlike listMessages.
		const { field: sortField, direction: sortDir } = this.parseOrderBy(
			orderBy,
			'ASC',
		);
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

	// ---------------------------------------------------------------------
	// Observational Memory
	// ---------------------------------------------------------------------

	// Thread-scoped records match on threadId; resource-scoped records are the
	// ones without a threadId (thread records also carry resourceId, so the
	// resource predicate must exclude them).
	private omKeyWhere(
		threadId: string | null | undefined,
		resourceId: string,
	): { where: string; bindings: Record<string, unknown> } {
		if (threadId) {
			return {
				where: 'threadId = $threadId',
				bindings: { threadId },
			};
		}
		return {
			where: '(threadId IS NONE OR threadId IS NULL) AND resourceId = $resourceId',
			bindings: { resourceId },
		};
	}

	private async getOMById(
		id: string,
	): Promise<ObservationalMemoryRecord | null> {
		const row = await this.client.queryOne<RawOMRecord>(
			`SELECT * FROM type::record('${OM_TABLE}', $id)`,
			{ id },
		);
		return row ? parseOMRecord(row) : null;
	}

	// Runs an UPDATE against a record id and throws the contract's
	// not-found error when the record doesn't exist.
	private async updateOMById(
		id: string,
		setClause: string,
		bindings: Record<string, unknown>,
	): Promise<void> {
		const rows = await this.client.queryAll<RawOMRecord>(
			`UPDATE type::record('${OM_TABLE}', $id) SET ${setClause}`,
			{ ...bindings, id },
		);
		if (rows.length === 0) {
			throw new Error(`Observational memory record not found: ${id}`);
		}
	}

	override async getObservationalMemory(
		threadId: string | null,
		resourceId: string,
	): Promise<ObservationalMemoryRecord | null> {
		const { where, bindings } = this.omKeyWhere(threadId, resourceId);
		const row = await this.client.queryOne<RawOMRecord>(
			`SELECT * FROM ${OM_TABLE} WHERE ${where} ORDER BY generationCount DESC, createdAt DESC LIMIT 1`,
			bindings,
		);
		return row ? parseOMRecord(row) : null;
	}

	override async getObservationalMemoryHistory(
		threadId: string | null,
		resourceId: string,
		limit?: number,
		options?: ObservationalMemoryHistoryOptions,
	): Promise<ObservationalMemoryRecord[]> {
		const { where, bindings } = this.omKeyWhere(threadId, resourceId);
		const whereParts = [where];
		if (options?.from) {
			whereParts.push('createdAt >= $from');
			bindings.from = options.from;
		}
		if (options?.to) {
			whereParts.push('createdAt <= $to');
			bindings.to = options.to;
		}
		// SurrealQL requires LIMIT before START, so fetching "all" still
		// needs an explicit limit when only an offset is given.
		bindings.limit = limit ?? Number.MAX_SAFE_INTEGER;
		bindings.offset = options?.offset ?? 0;

		const rows = await this.client.queryAll<RawOMRecord>(
			`SELECT * FROM ${OM_TABLE} WHERE ${whereParts.join(' AND ')} ORDER BY generationCount DESC, createdAt DESC LIMIT $limit START $offset`,
			bindings,
		);
		return rows.map(parseOMRecord);
	}

	override async initializeObservationalMemory(
		input: CreateObservationalMemoryInput,
	): Promise<ObservationalMemoryRecord> {
		const { threadId, resourceId, scope, config, observedTimezone } = input;
		const now = new Date();
		const record: ObservationalMemoryRecord = {
			id: crypto.randomUUID(),
			scope,
			threadId,
			resourceId,
			createdAt: now,
			updatedAt: now,
			// lastObservedAt starts undefined - all messages are "unobserved"
			// initially, so historical data works correctly.
			lastObservedAt: undefined,
			originType: 'initial',
			generationCount: 0,
			activeObservations: '',
			totalTokensObserved: 0,
			observationTokenCount: 0,
			pendingMessageTokens: 0,
			isReflecting: false,
			isObserving: false,
			isBufferingObservation: false,
			isBufferingReflection: false,
			lastBufferedAtTokens: 0,
			lastBufferedAtTime: null,
			config,
			observedTimezone,
			metadata: {},
		};
		await this.client.execute(
			`CREATE type::record('${OM_TABLE}', $id) CONTENT $data`,
			{ id: record.id, data: serializeOMRecord(record) },
		);
		return record;
	}

	override async insertObservationalMemoryRecord(
		record: ObservationalMemoryRecord,
	): Promise<void> {
		await this.client.execute(
			`UPSERT type::record('${OM_TABLE}', $id) CONTENT $data`,
			{ id: record.id, data: serializeOMRecord(record) },
		);
	}

	override async updateActiveObservations(
		input: UpdateActiveObservationsInput,
	): Promise<void> {
		const setParts = [
			'activeObservations = $observations',
			'observationTokenCount = $tokenCount',
			'totalTokensObserved += $tokenCount',
			'pendingMessageTokens = 0',
			'lastObservedAt = $lastObservedAt',
			'updatedAt = $now',
		];
		const bindings: Record<string, unknown> = {
			observations: input.observations,
			tokenCount: input.tokenCount,
			lastObservedAt: input.lastObservedAt,
			now: new Date(),
		};
		if (input.observedMessageIds) {
			setParts.push('observedMessageIds = $observedMessageIds');
			bindings.observedMessageIds = input.observedMessageIds;
		}
		if (input.observedTimezone) {
			setParts.push('observedTimezone = $observedTimezone');
			bindings.observedTimezone = input.observedTimezone;
		}
		await this.updateOMById(input.id, setParts.join(', '), bindings);
	}

	override async updateBufferedObservations(
		input: UpdateBufferedObservationsInput,
	): Promise<void> {
		// Spread pass-through keeps extractor payloads (extractedValues,
		// extractionFailures) and future chunk fields intact.
		const chunk = {
			...stripUndefined(
				input.chunk as unknown as Record<string, unknown>,
			),
			id: `ombuf-${crypto.randomUUID()}`,
			createdAt: new Date(),
		};
		const setParts = [
			'bufferedObservationChunks = array::concat(bufferedObservationChunks ?? [], $chunks)',
			'updatedAt = $now',
		];
		const bindings: Record<string, unknown> = {
			chunks: [chunk],
			now: new Date(),
		};
		if (input.lastBufferedAtTime) {
			setParts.push('lastBufferedAtTime = $lastBufferedAtTime');
			bindings.lastBufferedAtTime = input.lastBufferedAtTime;
		}
		await this.updateOMById(input.id, setParts.join(', '), bindings);
	}

	// Read-modify-write without a transaction: SurrealDB v3 has no
	// cross-request transactions, and the OM processor serializes access via
	// the isBufferingObservation/isObserving flags (matching the in-memory
	// reference, which is not transactional either).
	override async swapBufferedToActive(
		input: SwapBufferedToActiveInput,
	): Promise<SwapBufferedToActiveResult> {
		const record = await this.getOMById(input.id);
		if (!record) {
			throw new Error(
				`Observational memory record not found: ${input.id}`,
			);
		}

		const persistedChunks = record.bufferedObservationChunks ?? [];
		const chunks = Array.isArray(input.bufferedChunks)
			? input.bufferedChunks
			: persistedChunks;
		if (chunks.length === 0) {
			return {
				chunksActivated: 0,
				messageTokensActivated: 0,
				observationTokensActivated: 0,
				messagesActivated: 0,
				activatedCycleIds: [],
				activatedMessageIds: [],
			};
		}

		// Boundary selection (ported from @mastra/core's InMemoryMemory):
		// activate whole chunks until the remaining raw-message tokens
		// drop to the retention floor, preferring the boundary just over
		// the target unless the overshoot is too large.
		const retentionFloor =
			input.messageTokensThreshold * (1 - input.activationRatio);
		const targetMessageTokens = Math.max(
			0,
			input.currentPendingTokens - retentionFloor,
		);

		let cumulativeMessageTokens = 0;
		let bestOverBoundary = 0;
		let bestOverTokens = 0;
		let bestUnderBoundary = 0;
		let bestUnderTokens = 0;
		for (let i = 0; i < chunks.length; i++) {
			cumulativeMessageTokens += chunks[i]?.messageTokens ?? 0;
			const boundary = i + 1;
			if (cumulativeMessageTokens >= targetMessageTokens) {
				if (
					bestOverBoundary === 0 ||
					cumulativeMessageTokens < bestOverTokens
				) {
					bestOverBoundary = boundary;
					bestOverTokens = cumulativeMessageTokens;
				}
			} else if (cumulativeMessageTokens > bestUnderTokens) {
				bestUnderBoundary = boundary;
				bestUnderTokens = cumulativeMessageTokens;
			}
		}

		const maxOvershoot = retentionFloor * 0.95;
		const overshoot = bestOverTokens - targetMessageTokens;
		const remainingAfterOver = input.currentPendingTokens - bestOverTokens;
		const remainingAfterUnder =
			input.currentPendingTokens - bestUnderTokens;
		const minRemaining = Math.min(1000, retentionFloor);

		let chunksToActivate: number;
		if (
			input.forceMaxActivation &&
			bestOverBoundary > 0 &&
			remainingAfterOver >= minRemaining
		) {
			chunksToActivate = bestOverBoundary;
		} else if (
			bestOverBoundary > 0 &&
			overshoot <= maxOvershoot &&
			remainingAfterOver >= minRemaining
		) {
			chunksToActivate = bestOverBoundary;
		} else if (
			bestUnderBoundary > 0 &&
			remainingAfterUnder >= minRemaining
		) {
			chunksToActivate = bestUnderBoundary;
		} else if (bestOverBoundary > 0) {
			chunksToActivate = bestOverBoundary;
		} else {
			chunksToActivate = 1;
		}

		const activatedChunks = chunks.slice(0, chunksToActivate);
		const remainingChunks = chunks.slice(chunksToActivate);
		const activatedContent = activatedChunks
			.map((c) => c.observations)
			.join('\n\n');
		const activatedTokens = activatedChunks.reduce(
			(sum, c) => sum + c.tokenCount,
			0,
		);
		const activatedMessageTokens = activatedChunks.reduce(
			(sum, c) => sum + (c.messageTokens ?? 0),
			0,
		);
		const activatedMessageCount = activatedChunks.reduce(
			(sum, c) => sum + c.messageIds.length,
			0,
		);
		const activatedCycleIds = activatedChunks
			.map((c) => c.cycleId)
			.filter((cycleId) => !!cycleId);
		const activatedMessageIds = activatedChunks.flatMap(
			(c) => c.messageIds,
		);

		const latestChunk = activatedChunks[activatedChunks.length - 1];
		const derivedLastObservedAt =
			input.lastObservedAt ??
			(latestChunk?.lastObservedAt
				? new Date(latestChunk.lastObservedAt)
				: new Date());

		const newActive = record.activeObservations
			? `${record.activeObservations}\n\n--- message boundary (${derivedLastObservedAt.toISOString()}) ---\n\n${activatedContent}`
			: activatedContent;

		const setParts = [
			'activeObservations = $newActive',
			'observationTokenCount = $newObservationTokenCount',
			'pendingMessageTokens = $newPendingMessageTokens',
			'lastObservedAt = $lastObservedAt',
			'updatedAt = $now',
			remainingChunks.length > 0
				? 'bufferedObservationChunks = $remainingChunks'
				: 'bufferedObservationChunks = NONE',
		];
		const bindings: Record<string, unknown> = {
			id: input.id,
			newActive,
			newObservationTokenCount:
				(record.observationTokenCount ?? 0) + activatedTokens,
			newPendingMessageTokens: Math.max(
				0,
				(record.pendingMessageTokens ?? 0) - activatedMessageTokens,
			),
			lastObservedAt: derivedLastObservedAt,
			now: new Date(),
		};
		if (remainingChunks.length > 0) {
			bindings.remainingChunks = remainingChunks;
		}
		await this.client.execute(
			`UPDATE type::record('${OM_TABLE}', $id) SET ${setParts.join(', ')}`,
			bindings,
		);

		return {
			chunksActivated: activatedChunks.length,
			messageTokensActivated: activatedMessageTokens,
			observationTokensActivated: activatedTokens,
			messagesActivated: activatedMessageCount,
			activatedCycleIds,
			activatedMessageIds,
			observations: activatedContent,
			perChunk: activatedChunks.map((c) => ({
				cycleId: c.cycleId ?? '',
				messageTokens: c.messageTokens ?? 0,
				observationTokens: c.tokenCount,
				messageCount: c.messageIds.length,
				observations: c.observations,
			})),
			suggestedContinuation:
				latestChunk?.suggestedContinuation ?? undefined,
			currentTask: latestChunk?.currentTask ?? undefined,
		};
	}

	private buildReflectionGeneration(
		currentRecord: ObservationalMemoryRecord,
		reflection: string,
		tokenCount: number,
	): ObservationalMemoryRecord {
		const now = new Date();
		return {
			id: crypto.randomUUID(),
			scope: currentRecord.scope,
			threadId: currentRecord.threadId,
			resourceId: currentRecord.resourceId,
			createdAt: now,
			updatedAt: now,
			lastObservedAt: currentRecord.lastObservedAt ?? now,
			originType: 'reflection',
			generationCount: currentRecord.generationCount + 1,
			activeObservations: reflection,
			config: currentRecord.config,
			totalTokensObserved: currentRecord.totalTokensObserved,
			observationTokenCount: tokenCount,
			pendingMessageTokens: 0,
			isReflecting: false,
			isObserving: false,
			isBufferingObservation: false,
			isBufferingReflection: false,
			lastBufferedAtTokens: 0,
			lastBufferedAtTime: null,
			observedTimezone: currentRecord.observedTimezone,
			metadata: {},
		};
	}

	override async createReflectionGeneration(
		input: CreateReflectionGenerationInput,
	): Promise<ObservationalMemoryRecord> {
		const record = this.buildReflectionGeneration(
			input.currentRecord,
			input.reflection,
			input.tokenCount,
		);
		await this.client.execute(
			`CREATE type::record('${OM_TABLE}', $id) CONTENT $data`,
			{ id: record.id, data: serializeOMRecord(record) },
		);
		return record;
	}

	override async updateBufferedReflection(
		input: UpdateBufferedReflectionInput,
	): Promise<void> {
		const record = await this.getOMById(input.id);
		if (!record) {
			throw new Error(
				`Observational memory record not found: ${input.id}`,
			);
		}
		const existing = record.bufferedReflection || '';
		await this.client.execute(
			`UPDATE type::record('${OM_TABLE}', $id) SET bufferedReflection = $reflection, bufferedReflectionTokens = $tokens, bufferedReflectionInputTokens = $inputTokens, reflectedObservationLineCount = $lineCount, updatedAt = $now`,
			{
				id: input.id,
				reflection: existing
					? `${existing}\n\n${input.reflection}`
					: input.reflection,
				tokens:
					(record.bufferedReflectionTokens || 0) + input.tokenCount,
				inputTokens:
					(record.bufferedReflectionInputTokens || 0) +
					input.inputTokenCount,
				lineCount: input.reflectedObservationLineCount,
				now: new Date(),
			},
		);
	}

	override async swapBufferedReflectionToActive(
		input: SwapBufferedReflectionToActiveInput,
	): Promise<ObservationalMemoryRecord> {
		const record = await this.getOMById(input.currentRecord.id);
		if (!record) {
			throw new Error(
				`Observational memory record not found: ${input.currentRecord.id}`,
			);
		}
		if (!record.bufferedReflection) {
			throw new Error('No buffered reflection to swap');
		}

		const reflectedLineCount = record.reflectedObservationLineCount ?? 0;
		const unreflectedContent = (record.activeObservations ?? '')
			.split('\n')
			.slice(reflectedLineCount)
			.join('\n')
			.trim();
		const newObservations = unreflectedContent
			? `${record.bufferedReflection}\n\n${unreflectedContent}`
			: record.bufferedReflection;

		const newRecord = this.buildReflectionGeneration(
			record,
			newObservations,
			input.tokenCount,
		);
		await this.client.txBatch(
			[
				`CREATE type::record('${OM_TABLE}', $newId) CONTENT $newData`,
				`UPDATE type::record('${OM_TABLE}', $oldId) SET bufferedReflection = NONE, bufferedReflectionTokens = NONE, bufferedReflectionInputTokens = NONE, reflectedObservationLineCount = NONE, updatedAt = $now`,
			],
			{
				newId: newRecord.id,
				newData: serializeOMRecord(newRecord),
				oldId: record.id,
				now: new Date(),
			},
		);
		return newRecord;
	}

	override async setReflectingFlag(
		id: string,
		isReflecting: boolean,
	): Promise<void> {
		await this.updateOMById(id, 'isReflecting = $value, updatedAt = $now', {
			value: isReflecting,
			now: new Date(),
		});
	}

	override async setObservingFlag(
		id: string,
		isObserving: boolean,
	): Promise<void> {
		await this.updateOMById(id, 'isObserving = $value, updatedAt = $now', {
			value: isObserving,
			now: new Date(),
		});
	}

	override async setBufferingObservationFlag(
		id: string,
		isBuffering: boolean,
		lastBufferedAtTokens?: number,
	): Promise<void> {
		const setParts = [
			'isBufferingObservation = $value',
			'updatedAt = $now',
		];
		const bindings: Record<string, unknown> = {
			value: isBuffering,
			now: new Date(),
		};
		if (lastBufferedAtTokens !== undefined) {
			setParts.push('lastBufferedAtTokens = $lastBufferedAtTokens');
			bindings.lastBufferedAtTokens = lastBufferedAtTokens;
		}
		await this.updateOMById(id, setParts.join(', '), bindings);
	}

	override async setBufferingReflectionFlag(
		id: string,
		isBuffering: boolean,
	): Promise<void> {
		await this.updateOMById(
			id,
			'isBufferingReflection = $value, updatedAt = $now',
			{ value: isBuffering, now: new Date() },
		);
	}

	override async setPendingMessageTokens(
		id: string,
		tokenCount: number,
	): Promise<void> {
		await this.updateOMById(
			id,
			'pendingMessageTokens = $value, updatedAt = $now',
			{ value: tokenCount, now: new Date() },
		);
	}

	override async clearObservationalMemory(
		threadId: string | null,
		resourceId: string,
	): Promise<void> {
		const { where, bindings } = this.omKeyWhere(threadId, resourceId);
		await this.client.execute(
			`DELETE ${OM_TABLE} WHERE ${where}`,
			bindings,
		);
	}

	override async updateObservationalMemoryConfig(
		input: UpdateObservationalMemoryConfigInput,
	): Promise<void> {
		const record = await this.getOMById(input.id);
		if (!record) {
			throw new Error(
				`Observational memory record not found: ${input.id}`,
			);
		}
		await this.client.execute(
			`UPDATE type::record('${OM_TABLE}', $id) SET config = $config, updatedAt = $now`,
			{
				id: input.id,
				config: this.deepMergeConfig(record.config, input.config),
				now: new Date(),
			},
		);
	}
}
