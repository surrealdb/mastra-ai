import type {
	MastraDBMessage,
	MastraMessageContentV2,
} from '@mastra/core/agent';
import {
	filterSystemReminderMessages,
	MastraMemory,
	type MemoryConfigInternal,
	type MessageDeleteInput,
	type StorageThreadType,
	type WorkingMemoryTemplate,
} from '@mastra/core/memory';
import {
	InMemoryStore,
	type MemoryStorage,
	type StorageCloneThreadInput,
	type StorageCloneThreadOutput,
	type StorageListMessagesInput,
	type StorageListThreadsInput,
	type StorageListThreadsOutput,
} from '@mastra/core/storage';
import { Spectron, SpectronError } from '@surrealdb/spectron';
import {
	isSpectronInstanceConfig,
	type SpectronMemoryConfig,
} from './config.js';

/** Marker written onto synthesized recall messages so they never round-trip as facts. */
const SPECTRON_MARKER = '__spectron';
const SPECTRON_ID_PREFIX = 'spectron:';

type TurnRole = 'user' | 'assistant' | 'system' | 'tool';
type BatchMessage = { role: TurnRole; content: string };

/** A Mastra role maps 1:1 onto a Spectron `TurnRole`; unknown roles fall back to user. */
function mapRole(role: string): TurnRole {
	switch (role) {
		case 'user':
		case 'assistant':
		case 'system':
		case 'tool':
			return role;
		default:
			return 'user';
	}
}

/** Flatten a message's text parts into a single string for fact extraction. */
function extractText(
	content: MastraMessageContentV2,
	includeToolCalls: boolean,
): string {
	const chunks: string[] = [];
	for (const part of content?.parts ?? []) {
		if (
			part.type === 'text' &&
			typeof (part as { text?: string }).text === 'string'
		) {
			chunks.push((part as { text: string }).text);
		}
	}
	if (chunks.length === 0 && typeof content?.content === 'string') {
		chunks.push(content.content);
	}
	if (includeToolCalls && content?.toolInvocations?.length) {
		chunks.push(JSON.stringify(content.toolInvocations));
	}
	return chunks.join('\n').trim();
}

/** Synthesized recall messages are marked so they are excluded from mirror writes. */
function isSpectronSynthetic(msg: MastraDBMessage): boolean {
	return (
		msg.id?.startsWith(SPECTRON_ID_PREFIX) ||
		(msg.content?.metadata as Record<string, unknown> | undefined)?.[
			SPECTRON_MARKER
		] === true
	);
}

/**
 * A {@link MastraMemory} provider backed by SurrealDB's Spectron memory platform.
 *
 * Works standalone — no database required. Verbatim threads/messages/working
 * memory are kept in an in-process store by default, while Spectron is layered
 * on as the intelligence tier (fact extraction, semantic recall, profile).
 * Pass a durable Mastra `storage` (e.g. this package's `SurrealDBStore`) to make
 * the verbatim record survive restarts.
 *
 * Every Spectron call is guarded, so a service failure degrades gracefully to
 * verbatim-only behaviour and never breaks an agent's generate/stream loop.
 */
export class SpectronMemory extends MastraMemory {
	readonly spectron: Spectron;
	private readonly scopePrefix: string;
	private readonly blocking: boolean;
	private readonly injectProfile: boolean;
	private readonly includeToolCalls: boolean;
	private readonly recallEnabled: boolean;
	private readonly recallTopK: number;
	private readonly recallScope?: 'thread' | 'resource';
	private readonly sessionCache = new Map<string, string>();
	private probe?: Promise<void>;

	constructor(config: SpectronMemoryConfig) {
		super({
			id: config.id,
			name: config.name ?? 'SpectronMemory',
			storage: config.storage ?? new InMemoryStore(),
			options: config.options,
		});
		this._hasOwnStorage = true;
		this.scopePrefix = config.scopePrefix ?? 'mastra';
		this.blocking = config.blocking ?? false;
		this.injectProfile = config.injectProfile ?? false;
		this.includeToolCalls = config.includeToolCalls ?? false;
		const sr = config.spectronRecall ?? true;
		this.recallEnabled = sr !== false;
		this.recallTopK = typeof sr === 'object' ? (sr.topK ?? 5) : 5;
		this.recallScope = typeof sr === 'object' ? sr.scope : undefined;
		this.spectron = isSpectronInstanceConfig(config)
			? config.spectron
			: new Spectron({
					endpoint: config.endpoint,
					context: config.context,
					apiKey: config.apiKey,
					timeout: config.timeout,
					maxRetries: config.maxRetries,
					fetchImpl: config.fetchImpl,
				});
	}

	private async getMemoryStore(): Promise<MemoryStorage> {
		const store = await this.storage.getStore('memory');
		if (!store) {
			throw new Error(
				'SpectronMemory requires a storage adapter with a memory domain',
			);
		}
		return store;
	}

	/** Wrap a Spectron call: catch every {@link SpectronError} and degrade to `fallback`. */
	private async guard<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
		try {
			return await fn();
		} catch (err) {
			if (err instanceof SpectronError) {
				this.logger?.warn?.(
					`Spectron call failed (${err.status} ${err.title}); degrading gracefully`,
				);
				return fallback;
			}
			this.logger?.warn?.('Spectron call failed; degrading gracefully');
			return fallback;
		}
	}

	/** Fire a best-effort mirror write; awaited only when `blocking` is set. */
	private mirror(fn: () => Promise<unknown>): Promise<void> {
		const p = this.guard(fn, undefined).then(() => undefined);
		if (this.blocking) return p;
		void p;
		return Promise.resolve();
	}

	/**
	 * Surface auth/scope errors early (on first use) rather than mid-generation.
	 * Cached so it runs at most once.
	 */
	private ensureProbe(): Promise<void> {
		if (!this.probe) {
			this.probe = this.spectron
				.whoami()
				.then(() => undefined)
				.catch((err) => {
					if (
						err instanceof SpectronError &&
						(err.status === 401 || err.status === 403)
					) {
						throw err;
					}
					// Transient/unreachable errors must not block; they degrade later.
				});
		}
		return this.probe;
	}

	private scopesFor(
		resourceId: string | undefined,
		threadId: string,
	): string[][] {
		const scopes: string[][] = [[this.scopePrefix, 'thread', threadId]];
		if (resourceId) {
			scopes.unshift([this.scopePrefix, 'resource', resourceId]);
		}
		return scopes;
	}

	/**
	 * Resolve the Spectron session for a thread, creating one lazily. The
	 * server-generated id is cached in-process and stashed on `thread.metadata`.
	 */
	private async ensureSession(
		threadId: string,
		resourceId: string | undefined,
		metadata?: Record<string, unknown>,
	): Promise<{ sessionId?: string; scopes: string[][] }> {
		const scopes = this.scopesFor(resourceId, threadId);
		const cached = this.sessionCache.get(threadId);
		if (cached) return { sessionId: cached, scopes };

		const fromMeta = (
			metadata?.[SPECTRON_MARKER] as { sessionId?: string } | undefined
		)?.sessionId;
		if (fromMeta) {
			this.sessionCache.set(threadId, fromMeta);
			return { sessionId: fromMeta, scopes };
		}

		const session = await this.guard(
			() =>
				this.spectron.sessions.create({
					scopes,
					metadata: { threadId, resourceId },
				}),
			undefined,
		);
		if (session?.id) this.sessionCache.set(threadId, session.id);
		return { sessionId: session?.id, scopes };
	}

	async getThreadById({
		threadId,
	}: {
		threadId: string;
	}): Promise<StorageThreadType | null> {
		const store = await this.getMemoryStore();
		return store.getThreadById({ threadId });
	}

	async listThreads(
		args: StorageListThreadsInput,
	): Promise<StorageListThreadsOutput> {
		const store = await this.getMemoryStore();
		return store.listThreads(args);
	}

	async saveThread({
		thread,
	}: {
		thread: StorageThreadType;
		memoryConfig?: MemoryConfigInternal;
	}): Promise<StorageThreadType> {
		await this.ensureProbe();
		const { sessionId, scopes } = await this.ensureSession(
			thread.id,
			thread.resourceId,
			thread.metadata,
		);
		const toSave: StorageThreadType = sessionId
			? {
					...thread,
					metadata: {
						...thread.metadata,
						[SPECTRON_MARKER]: { sessionId, scopes },
					},
				}
			: thread;
		const store = await this.getMemoryStore();
		return store.saveThread({ thread: toSave });
	}

	async updateThread({
		id,
		title,
		metadata,
	}: {
		id: string;
		title: string;
		metadata: Record<string, unknown>;
		memoryConfig?: MemoryConfigInternal;
	}): Promise<StorageThreadType> {
		const store = await this.getMemoryStore();
		return store.updateThread({ id, title, metadata });
	}

	async saveMessages({
		messages,
	}: {
		messages: MastraDBMessage[];
		memoryConfig?: MemoryConfigInternal;
	}): Promise<{ messages: MastraDBMessage[] }> {
		const store = await this.getMemoryStore();
		const result = await store.saveMessages({ messages });

		// Best-effort mirror into Spectron, grouped by thread; skip synthesized rows.
		const byThread = new Map<string, MastraDBMessage[]>();
		for (const msg of messages) {
			if (isSpectronSynthetic(msg) || !msg.threadId) continue;
			const list = byThread.get(msg.threadId) ?? [];
			list.push(msg);
			byThread.set(msg.threadId, list);
		}

		for (const [threadId, group] of byThread) {
			const resourceId = group.find((m) => m.resourceId)?.resourceId;
			const batch: BatchMessage[] = [];
			for (const msg of group) {
				const content = extractText(msg.content, this.includeToolCalls);
				if (content) batch.push({ role: mapRole(msg.role), content });
			}
			if (batch.length === 0) continue;
			await this.mirror(async () => {
				const { sessionId, scopes } = await this.ensureSession(
					threadId,
					resourceId,
				);
				return this.spectron.rememberMany(batch, {
					sessionId,
					scopes,
					labels: [`threadId=${threadId}`],
				});
			});
		}

		return result;
	}

	async recall(
		args: StorageListMessagesInput & {
			threadConfig?: MemoryConfigInternal;
			vectorSearchString?: string;
			includeSystemReminders?: boolean;
		},
	): Promise<{
		messages: MastraDBMessage[];
		total: number;
		page: number;
		perPage: number | false;
		hasMore: boolean;
	}> {
		const store = await this.getMemoryStore();
		const {
			threadConfig,
			vectorSearchString,
			includeSystemReminders,
			...listArgs
		} = args;

		const base = await store.listMessages(listArgs);
		const messages = filterSystemReminderMessages(
			base.messages,
			includeSystemReminders,
		);

		void threadConfig;
		if (!this.recallEnabled || !vectorSearchString) {
			return { ...base, messages };
		}

		const threadId = Array.isArray(listArgs.threadId)
			? listArgs.threadId[0]
			: listArgs.threadId;
		const sessionId =
			this.recallScope === 'thread' && threadId
				? this.sessionCache.get(threadId)
				: undefined;

		const res = await this.guard(
			() =>
				this.spectron.recall(vectorSearchString, {
					k: this.recallTopK,
					sessionId,
				}),
			undefined,
		);

		const seen = new Set(messages.map((m) => m.id));
		const synthesized: MastraDBMessage[] = [];
		for (const hit of res?.hits ?? []) {
			const id = `${SPECTRON_ID_PREFIX}${hit.id}`;
			if (seen.has(id)) continue;
			seen.add(id);
			synthesized.push({
				id,
				role: 'assistant',
				type: 'text',
				threadId: threadId,
				resourceId: listArgs.resourceId,
				createdAt: new Date(),
				content: {
					format: 2,
					parts: [{ type: 'text', text: hit.text }],
					content: hit.text,
					metadata: { [SPECTRON_MARKER]: true, score: hit.score },
				},
			} as MastraDBMessage);
		}

		return { ...base, messages: [...synthesized, ...messages] };
	}

	async deleteThread(threadId: string): Promise<void> {
		const store = await this.getMemoryStore();
		await store.deleteThread({ threadId });
		this.sessionCache.delete(threadId);
		await this.mirror(() =>
			this.spectron.forget(`thread ${threadId}`, { purge: true }),
		);
	}

	async deleteMessages(messageIds: MessageDeleteInput): Promise<void> {
		const ids = Array.isArray(messageIds)
			? messageIds.map((item) =>
					typeof item === 'string' ? item : item.id,
				)
			: [messageIds as unknown as string];
		const store = await this.getMemoryStore();
		await store.deleteMessages(ids);
		// Spectron cannot delete facts by message id; verbatim delete is exact.
	}

	async getWorkingMemory({
		threadId,
		resourceId,
		memoryConfig,
	}: {
		threadId: string;
		resourceId?: string;
		memoryConfig?: MemoryConfigInternal;
	}): Promise<string | null> {
		const merged = this.getMergedThreadConfig(memoryConfig);
		const wm = merged.workingMemory;
		if (!wm?.enabled) return null;
		const scope = wm.scope || 'resource';
		const id = scope === 'resource' ? resourceId : threadId;
		if (!id) return null;
		const store = await this.getMemoryStore();
		const resource = await store.getResourceById({ resourceId: id });
		return resource?.workingMemory || null;
	}

	async getWorkingMemoryTemplate({
		memoryConfig,
	}: {
		memoryConfig?: MemoryConfigInternal;
	} = {}): Promise<WorkingMemoryTemplate | null> {
		const merged = this.getMergedThreadConfig(memoryConfig);
		const wm = merged.workingMemory;
		if (!wm?.enabled) return null;
		if (wm.template) return { format: 'markdown', content: wm.template };
		if (wm.schema) {
			this.logger?.warn?.(
				'SpectronMemory: schema-based working memory templates are not supported; use `template`',
			);
		}
		return null;
	}

	async updateWorkingMemory({
		threadId,
		resourceId,
		workingMemory,
		memoryConfig,
	}: {
		threadId: string;
		resourceId?: string;
		workingMemory: string;
		memoryConfig?: MemoryConfigInternal;
	}): Promise<void> {
		const merged = this.getMergedThreadConfig(memoryConfig);
		const wm = merged.workingMemory;
		if (!wm?.enabled) return;
		const scope = wm.scope || 'resource';
		const id = scope === 'resource' ? resourceId : threadId;
		if (!id)
			throw new Error(
				`Cannot update working memory: ${scope} ID is required`,
			);
		const store = await this.getMemoryStore();
		await store.updateResource({ resourceId: id, workingMemory });

		await this.mirror(async () => {
			const { sessionId, scopes } = await this.ensureSession(
				threadId,
				resourceId,
			);
			return this.spectron.remember(workingMemory, {
				infer: 'full',
				sessionId,
				scopes,
				labels: ['kind=working_memory'],
			});
		});
	}

	async __experimental_updateWorkingMemoryVNext({
		threadId,
		resourceId,
		workingMemory,
		memoryConfig,
	}: {
		threadId: string;
		resourceId?: string;
		workingMemory: string;
		searchString?: string;
		memoryConfig?: MemoryConfigInternal;
	}): Promise<{ success: boolean; reason: string }> {
		try {
			await this.updateWorkingMemory({
				threadId,
				resourceId,
				workingMemory,
				memoryConfig,
			});
			return {
				success: true,
				reason: 'Working memory updated successfully',
			};
		} catch (err) {
			return {
				success: false,
				reason:
					err instanceof Error
						? err.message
						: 'Failed to update working memory',
			};
		}
	}

	async cloneThread(
		args: StorageCloneThreadInput,
	): Promise<StorageCloneThreadOutput> {
		const store = await this.getMemoryStore();
		const result = await store.cloneThread(args);
		// Give the clone its own Spectron session, lazily on next write.
		return result;
	}

	async getSystemMessage(input: {
		threadId: string;
		resourceId?: string;
		memoryConfig?: MemoryConfigInternal;
	}): Promise<string | null> {
		if (!this.injectProfile) return null;
		const sessionId = this.sessionCache.get(input.threadId);
		const res = await this.guard(
			() =>
				this.spectron.context('What is known about this user?', {
					k: 10,
					...(sessionId ? {} : {}),
				}),
			undefined,
		);
		const text = (res as { context?: string; text?: string } | undefined)
			?.context;
		return text ? `Known context about this user:\n${text}` : null;
	}
}
