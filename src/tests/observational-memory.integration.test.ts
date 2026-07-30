import type {
	BufferedObservationChunkInput,
	CreateObservationalMemoryInput,
	ObservationalMemoryRecord,
	SwapBufferedToActiveInput,
} from '@mastra/core/storage';
import { InMemoryDB, InMemoryMemory } from '@mastra/core/storage';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SurrealDBClient } from '../client.js';
import { MemorySurrealDB } from '../domains/memory/index.js';
import { createClient } from './helpers.js';

let client: SurrealDBClient;
let store: MemorySurrealDB;

const omInput = (
	overrides: Partial<CreateObservationalMemoryInput> = {},
): CreateObservationalMemoryInput => ({
	threadId: 'thread-1',
	resourceId: 'user-1',
	scope: 'thread',
	config: { observation: { messageTokens: 30_000 } },
	observedTimezone: 'Europe/London',
	...overrides,
});

let chunkSeq = 0;
const chunk = (
	overrides: Partial<BufferedObservationChunkInput> = {},
): BufferedObservationChunkInput => ({
	cycleId: `cycle-${++chunkSeq}`,
	observations: `observation ${chunkSeq}`,
	tokenCount: 10,
	messageIds: [`m-${chunkSeq}a`, `m-${chunkSeq}b`],
	messageTokens: 100,
	lastObservedAt: new Date('2026-07-01T10:00:00.000Z'),
	...overrides,
});

beforeAll(async () => {
	client = await createClient('test_observational_memory');
	store = new MemorySurrealDB(client);
	await store.init();
});

afterAll(async () => {
	await client.close();
});

beforeEach(async () => {
	await store.dangerouslyClearAll();
});

describe('lifecycle & scoping', () => {
	it('declares observational memory support', () => {
		expect(store.supportsObservationalMemory).toBe(true);
	});

	it('initializes a thread-scoped record with reference defaults', async () => {
		const record = await store.initializeObservationalMemory(omInput());
		expect(record.generationCount).toBe(0);
		expect(record.originType).toBe('initial');
		expect(record.activeObservations).toBe('');
		expect(record.lastObservedAt).toBeUndefined();
		expect(record.lastBufferedAtTime).toBeNull();
		expect(record.isObserving).toBe(false);
		expect(record.isReflecting).toBe(false);
		expect(record.isBufferingObservation).toBe(false);
		expect(record.isBufferingReflection).toBe(false);
		expect(record.totalTokensObserved).toBe(0);
		expect(record.pendingMessageTokens).toBe(0);

		const found = await store.getObservationalMemory('thread-1', 'user-1');
		expect(found?.id).toBe(record.id);
		expect(found?.threadId).toBe('thread-1');
		expect(found?.config).toEqual(omInput().config);
		expect(found?.observedTimezone).toBe('Europe/London');
	});

	it('keeps thread and resource scopes isolated for the same resource', async () => {
		const threadRecord = await store.initializeObservationalMemory(
			omInput(),
		);
		const resourceRecord = await store.initializeObservationalMemory(
			omInput({ threadId: null, scope: 'resource' }),
		);

		const byThread = await store.getObservationalMemory(
			'thread-1',
			'user-1',
		);
		const byResource = await store.getObservationalMemory(null, 'user-1');

		expect(byThread?.id).toBe(threadRecord.id);
		expect(byResource?.id).toBe(resourceRecord.id);
		expect(byResource?.threadId).toBeNull();
	});

	it('returns null when no record exists', async () => {
		expect(await store.getObservationalMemory('nope', 'user-1')).toBeNull();
		expect(await store.getObservationalMemory(null, 'nope')).toBeNull();
	});

	it('clears all generations for a key without touching other scopes', async () => {
		const threadRecord = await store.initializeObservationalMemory(
			omInput(),
		);
		await store.createReflectionGeneration({
			currentRecord: threadRecord,
			reflection: 'compressed',
			tokenCount: 5,
		});
		await store.initializeObservationalMemory(
			omInput({ threadId: null, scope: 'resource' }),
		);

		await store.clearObservationalMemory('thread-1', 'user-1');

		expect(
			await store.getObservationalMemory('thread-1', 'user-1'),
		).toBeNull();
		expect(
			await store.getObservationalMemoryHistory('thread-1', 'user-1'),
		).toEqual([]);
		expect(
			await store.getObservationalMemory(null, 'user-1'),
		).not.toBeNull();
	});

	it('insertObservationalMemoryRecord round-trips a full record', async () => {
		const base = await store.initializeObservationalMemory(omInput());
		const clone: ObservationalMemoryRecord = {
			...base,
			id: crypto.randomUUID(),
			threadId: 'thread-clone',
			generationCount: 3,
			activeObservations: 'cloned observations',
			lastObservedAt: new Date('2026-07-02T00:00:00.000Z'),
		};
		await store.insertObservationalMemoryRecord(clone);

		const found = await store.getObservationalMemory(
			'thread-clone',
			'user-1',
		);
		expect(found?.id).toBe(clone.id);
		expect(found?.generationCount).toBe(3);
		expect(found?.activeObservations).toBe('cloned observations');
		expect(found?.lastObservedAt?.getTime()).toBe(
			clone.lastObservedAt?.getTime(),
		);
	});
});

describe('updateActiveObservations', () => {
	it('accumulates totals and resets pending tokens', async () => {
		const record = await store.initializeObservationalMemory(omInput());
		await store.setPendingMessageTokens(record.id, 500);

		const t1 = new Date('2026-07-01T10:00:00.000Z');
		await store.updateActiveObservations({
			id: record.id,
			observations: 'first pass',
			tokenCount: 100,
			lastObservedAt: t1,
		});

		let found = await store.getObservationalMemory('thread-1', 'user-1');
		expect(found?.activeObservations).toBe('first pass');
		expect(found?.observationTokenCount).toBe(100);
		expect(found?.totalTokensObserved).toBe(100);
		expect(found?.pendingMessageTokens).toBe(0);
		expect(found?.lastObservedAt?.getTime()).toBe(t1.getTime());
		expect(found?.observedMessageIds).toBeUndefined();

		await store.updateActiveObservations({
			id: record.id,
			observations: 'second pass',
			tokenCount: 50,
			lastObservedAt: new Date(),
			observedMessageIds: ['m1', 'm2'],
		});

		found = await store.getObservationalMemory('thread-1', 'user-1');
		expect(found?.observationTokenCount).toBe(50);
		expect(found?.totalTokensObserved).toBe(150);
		expect(found?.observedMessageIds).toEqual(['m1', 'm2']);
	});

	it('throws the contract error for unknown ids', async () => {
		await expect(
			store.updateActiveObservations({
				id: 'missing-id',
				observations: 'x',
				tokenCount: 1,
				lastObservedAt: new Date(),
			}),
		).rejects.toThrow('Observational memory record not found: missing-id');
	});
});

describe('buffered observations & extractor payloads', () => {
	it('appends chunks and preserves extractedValues/extractionFailures', async () => {
		const record = await store.initializeObservationalMemory(omInput());

		await store.updateBufferedObservations({
			id: record.id,
			chunk: chunk({
				extractedValues: {
					userProfile: { preferredName: 'Ada', timezone: 'UTC' },
				},
				extractionFailures: [
					{ slug: 'sentiment', error: 'schema mismatch' },
				],
				suggestedContinuation: 'continue with tests',
				currentTask: 'porting OM',
				threadTitle: 'OM work',
			}),
		});
		await store.updateBufferedObservations({
			id: record.id,
			chunk: chunk(),
			lastBufferedAtTime: new Date('2026-07-01T11:00:00.000Z'),
		});

		const found = await store.getObservationalMemory('thread-1', 'user-1');
		const chunks = found?.bufferedObservationChunks ?? [];
		expect(chunks).toHaveLength(2);

		const first = chunks[0];
		if (!first) throw new Error('chunk missing');
		expect(first.id).toMatch(/^ombuf-/);
		expect(first.createdAt).toBeInstanceOf(Date);
		expect(first.lastObservedAt.getTime()).toBe(
			new Date('2026-07-01T10:00:00.000Z').getTime(),
		);
		expect(first.extractedValues).toEqual({
			userProfile: { preferredName: 'Ada', timezone: 'UTC' },
		});
		expect(first.extractionFailures).toEqual([
			{ slug: 'sentiment', error: 'schema mismatch' },
		]);
		expect(first.suggestedContinuation).toBe('continue with tests');
		expect(first.currentTask).toBe('porting OM');
		expect(first.threadTitle).toBe('OM work');

		// lastBufferedAtTime cursor is only set when provided.
		expect(found?.lastBufferedAtTime?.getTime()).toBe(
			new Date('2026-07-01T11:00:00.000Z').getTime(),
		);
	});

	it('leaves lastBufferedAtTime null when not provided', async () => {
		const record = await store.initializeObservationalMemory(omInput());
		await store.updateBufferedObservations({
			id: record.id,
			chunk: chunk(),
		});
		const found = await store.getObservationalMemory('thread-1', 'user-1');
		expect(found?.lastBufferedAtTime).toBeNull();
	});
});

describe('swapBufferedToActive', () => {
	// Runs the identical scenario against @mastra/core's InMemoryMemory and
	// asserts our adapter reaches the same result and post-state.
	async function runParity(args: {
		chunks: BufferedObservationChunkInput[];
		swap: Omit<SwapBufferedToActiveInput, 'id'>;
		pendingTokens?: number;
		preActivate?: { observations: string; tokenCount: number };
	}) {
		const oracle = new InMemoryMemory({ db: new InMemoryDB() });

		const [ours, theirs] = await Promise.all([
			store.initializeObservationalMemory(omInput()),
			oracle.initializeObservationalMemory(omInput()),
		]);

		for (const target of [
			{ s: store as MemorySurrealDB | InMemoryMemory, id: ours.id },
			{ s: oracle as MemorySurrealDB | InMemoryMemory, id: theirs.id },
		]) {
			if (args.preActivate) {
				await target.s.updateActiveObservations({
					id: target.id,
					observations: args.preActivate.observations,
					tokenCount: args.preActivate.tokenCount,
					lastObservedAt: new Date('2026-06-30T00:00:00.000Z'),
				});
			}
			for (const c of args.chunks) {
				await target.s.updateBufferedObservations({
					id: target.id,
					chunk: c,
				});
			}
			if (args.pendingTokens !== undefined) {
				await target.s.setPendingMessageTokens(
					target.id,
					args.pendingTokens,
				);
			}
		}

		const [ourResult, theirResult] = await Promise.all([
			store.swapBufferedToActive({ id: ours.id, ...args.swap }),
			oracle.swapBufferedToActive({ id: theirs.id, ...args.swap }),
		]);
		expect(ourResult).toEqual(theirResult);

		const [ourState, theirState] = await Promise.all([
			store.getObservationalMemory('thread-1', 'user-1'),
			oracle.getObservationalMemory('thread-1', 'user-1'),
		]);
		expect(ourState?.activeObservations).toBe(
			theirState?.activeObservations,
		);
		expect(ourState?.observationTokenCount).toBe(
			theirState?.observationTokenCount,
		);
		expect(ourState?.pendingMessageTokens).toBe(
			theirState?.pendingMessageTokens,
		);
		expect(ourState?.bufferedObservationChunks?.length).toBe(
			theirState?.bufferedObservationChunks?.length,
		);
		expect(ourState?.lastObservedAt?.getTime()).toBe(
			theirState?.lastObservedAt?.getTime(),
		);
		return ourResult;
	}

	it('returns the zero result when nothing is buffered', async () => {
		const record = await store.initializeObservationalMemory(omInput());
		const result = await store.swapBufferedToActive({
			id: record.id,
			activationRatio: 1,
			messageTokensThreshold: 1000,
			currentPendingTokens: 0,
		});
		expect(result).toEqual({
			chunksActivated: 0,
			messageTokensActivated: 0,
			observationTokensActivated: 0,
			messagesActivated: 0,
			activatedCycleIds: [],
			activatedMessageIds: [],
		});
	});

	it('activates a single chunk fully (parity)', async () => {
		const result = await runParity({
			chunks: [chunk({ messageTokens: 500, tokenCount: 42 })],
			pendingTokens: 500,
			swap: {
				activationRatio: 1,
				messageTokensThreshold: 1000,
				currentPendingTokens: 500,
			},
		});
		expect(result.chunksActivated).toBe(1);
		expect(result.observationTokensActivated).toBe(42);
	});

	it('partially activates multiple chunks and keeps the remainder (parity)', async () => {
		const result = await runParity({
			chunks: [
				chunk({ messageTokens: 300 }),
				chunk({ messageTokens: 300 }),
				chunk({ messageTokens: 300 }),
				chunk({ messageTokens: 100 }),
			],
			pendingTokens: 1000,
			swap: {
				activationRatio: 0.5,
				messageTokensThreshold: 1000,
				currentPendingTokens: 1000,
			},
		});
		expect(result.chunksActivated).toBeGreaterThan(0);
		expect(result.chunksActivated).toBeLessThan(4);
	});

	it('forceMaxActivation activates through the over boundary (parity)', async () => {
		await runParity({
			chunks: [
				chunk({ messageTokens: 2000 }),
				chunk({ messageTokens: 2000 }),
				chunk({ messageTokens: 2000 }),
			],
			pendingTokens: 6000,
			swap: {
				activationRatio: 0.8,
				messageTokensThreshold: 5000,
				currentPendingTokens: 6000,
				forceMaxActivation: true,
			},
		});
	});

	it('appends with a message boundary marker when observations exist (parity)', async () => {
		const observedAt = new Date('2026-07-03T12:00:00.000Z');
		const result = await runParity({
			preActivate: {
				observations: 'earlier observations',
				tokenCount: 10,
			},
			chunks: [chunk({ messageTokens: 400, lastObservedAt: observedAt })],
			pendingTokens: 400,
			swap: {
				activationRatio: 1,
				messageTokensThreshold: 1000,
				currentPendingTokens: 400,
			},
		});
		expect(result.chunksActivated).toBe(1);
		const state = await store.getObservationalMemory('thread-1', 'user-1');
		expect(state?.activeObservations).toContain('earlier observations');
		expect(state?.activeObservations).toContain(
			`--- message boundary (${observedAt.toISOString()}) ---`,
		);
	});

	it('uses refreshed bufferedChunks from the input when provided (parity)', async () => {
		const persisted = [
			chunk({ messageTokens: 100 }),
			chunk({ messageTokens: 100 }),
		];
		const refreshed = persisted.map((c, i) => ({
			...c,
			id: `refreshed-${i}`,
			createdAt: new Date(),
			messageTokens: 450,
		}));
		const result = await runParity({
			chunks: persisted,
			pendingTokens: 900,
			swap: {
				activationRatio: 1,
				messageTokensThreshold: 1000,
				currentPendingTokens: 900,
				bufferedChunks: refreshed,
			},
		});
		expect(result.messageTokensActivated).toBe(900);
	});

	it('throws for unknown ids', async () => {
		await expect(
			store.swapBufferedToActive({
				id: 'missing-id',
				activationRatio: 1,
				messageTokensThreshold: 1000,
				currentPendingTokens: 0,
			}),
		).rejects.toThrow('Observational memory record not found: missing-id');
	});
});

describe('reflection generations & history', () => {
	it('createReflectionGeneration archives the old record', async () => {
		const record = await store.initializeObservationalMemory(omInput());
		await store.updateActiveObservations({
			id: record.id,
			observations: 'raw observations',
			tokenCount: 100,
			lastObservedAt: new Date('2026-07-01T09:00:00.000Z'),
		});
		const current = await store.getObservationalMemory(
			'thread-1',
			'user-1',
		);
		if (!current) throw new Error('record missing');

		const reflected = await store.createReflectionGeneration({
			currentRecord: current,
			reflection: 'compressed insight',
			tokenCount: 20,
		});

		expect(reflected.generationCount).toBe(1);
		expect(reflected.originType).toBe('reflection');
		expect(reflected.activeObservations).toBe('compressed insight');
		expect(reflected.totalTokensObserved).toBe(current.totalTokensObserved);
		expect(reflected.lastObservedAt?.getTime()).toBe(
			current.lastObservedAt?.getTime(),
		);

		const now = await store.getObservationalMemory('thread-1', 'user-1');
		expect(now?.id).toBe(reflected.id);

		const history = await store.getObservationalMemoryHistory(
			'thread-1',
			'user-1',
		);
		expect(history.map((r) => r.id)).toEqual([reflected.id, record.id]);
	});

	it('history honors from/to (inclusive), offset and limit', async () => {
		// Small gaps keep createdAt distinct so date filters don't tie.
		const tick = () => new Promise((r) => setTimeout(r, 5));
		const g0 = await store.initializeObservationalMemory(omInput());
		await tick();
		const g1 = await store.createReflectionGeneration({
			currentRecord: g0,
			reflection: 'gen 1',
			tokenCount: 1,
		});
		await tick();
		const g2 = await store.createReflectionGeneration({
			currentRecord: g1,
			reflection: 'gen 2',
			tokenCount: 1,
		});

		const all = await store.getObservationalMemoryHistory(
			'thread-1',
			'user-1',
		);
		expect(all.map((r) => r.id)).toEqual([g2.id, g1.id, g0.id]);

		const limited = await store.getObservationalMemoryHistory(
			'thread-1',
			'user-1',
			2,
		);
		expect(limited.map((r) => r.id)).toEqual([g2.id, g1.id]);

		const offset = await store.getObservationalMemoryHistory(
			'thread-1',
			'user-1',
			undefined,
			{ offset: 1 },
		);
		expect(offset.map((r) => r.id)).toEqual([g1.id, g0.id]);

		const fromFiltered = await store.getObservationalMemoryHistory(
			'thread-1',
			'user-1',
			undefined,
			{ from: g1.createdAt },
		);
		expect(fromFiltered.map((r) => r.id)).toContain(g1.id);
		expect(fromFiltered.map((r) => r.id)).not.toContain(g0.id);

		const toFiltered = await store.getObservationalMemoryHistory(
			'thread-1',
			'user-1',
			undefined,
			{ to: g0.createdAt },
		);
		expect(toFiltered.map((r) => r.id)).toEqual([g0.id]);
	});
});

describe('buffered reflection', () => {
	it('appends reflections and accumulates token counters', async () => {
		const record = await store.initializeObservationalMemory(omInput());

		await store.updateBufferedReflection({
			id: record.id,
			reflection: 'part one',
			tokenCount: 10,
			inputTokenCount: 100,
			reflectedObservationLineCount: 3,
		});
		await store.updateBufferedReflection({
			id: record.id,
			reflection: 'part two',
			tokenCount: 5,
			inputTokenCount: 50,
			reflectedObservationLineCount: 7,
		});

		const found = await store.getObservationalMemory('thread-1', 'user-1');
		expect(found?.bufferedReflection).toBe('part one\n\npart two');
		expect(found?.bufferedReflectionTokens).toBe(15);
		expect(found?.bufferedReflectionInputTokens).toBe(150);
		// line count is overwritten, not accumulated
		expect(found?.reflectedObservationLineCount).toBe(7);
	});

	it('swapBufferedReflectionToActive splits at the reflected line count', async () => {
		const record = await store.initializeObservationalMemory(omInput());
		await store.updateActiveObservations({
			id: record.id,
			observations: 'line 1\nline 2\nline 3\nline 4',
			tokenCount: 40,
			lastObservedAt: new Date('2026-07-01T09:00:00.000Z'),
		});
		await store.updateBufferedReflection({
			id: record.id,
			reflection: 'reflected summary',
			tokenCount: 8,
			inputTokenCount: 20,
			reflectedObservationLineCount: 2,
		});

		const current = await store.getObservationalMemory(
			'thread-1',
			'user-1',
		);
		if (!current) throw new Error('record missing');
		const newRecord = await store.swapBufferedReflectionToActive({
			currentRecord: current,
			tokenCount: 12,
		});

		expect(newRecord.generationCount).toBe(1);
		expect(newRecord.activeObservations).toBe(
			'reflected summary\n\nline 3\nline 4',
		);
		expect(newRecord.observationTokenCount).toBe(12);

		// buffered reflection fields cleared on the archived record
		const history = await store.getObservationalMemoryHistory(
			'thread-1',
			'user-1',
		);
		const archived = history.find((r) => r.id === record.id);
		expect(archived?.bufferedReflection).toBeUndefined();
		expect(archived?.bufferedReflectionTokens).toBeUndefined();
		expect(archived?.bufferedReflectionInputTokens).toBeUndefined();
		expect(archived?.reflectedObservationLineCount).toBeUndefined();
	});

	it('throws when there is no buffered reflection', async () => {
		const record = await store.initializeObservationalMemory(omInput());
		await expect(
			store.swapBufferedReflectionToActive({
				currentRecord: record,
				tokenCount: 1,
			}),
		).rejects.toThrow('No buffered reflection to swap');
	});
});

describe('flags & config', () => {
	it('round-trips every flag setter', async () => {
		const record = await store.initializeObservationalMemory(omInput());

		await store.setReflectingFlag(record.id, true);
		await store.setObservingFlag(record.id, true);
		await store.setBufferingObservationFlag(record.id, true, 1234);
		await store.setBufferingReflectionFlag(record.id, true);
		await store.setPendingMessageTokens(record.id, 777);

		let found = await store.getObservationalMemory('thread-1', 'user-1');
		expect(found?.isReflecting).toBe(true);
		expect(found?.isObserving).toBe(true);
		expect(found?.isBufferingObservation).toBe(true);
		expect(found?.lastBufferedAtTokens).toBe(1234);
		expect(found?.isBufferingReflection).toBe(true);
		expect(found?.pendingMessageTokens).toBe(777);

		// lastBufferedAtTokens only changes when explicitly passed
		await store.setBufferingObservationFlag(record.id, false);
		found = await store.getObservationalMemory('thread-1', 'user-1');
		expect(found?.isBufferingObservation).toBe(false);
		expect(found?.lastBufferedAtTokens).toBe(1234);
	});

	it('flag setters throw for unknown ids', async () => {
		await expect(
			store.setObservingFlag('missing-id', true),
		).rejects.toThrow('Observational memory record not found: missing-id');
	});

	it('deep-merges config updates', async () => {
		const record = await store.initializeObservationalMemory(
			omInput({
				config: {
					observation: { messageTokens: 30_000, bufferTokens: 0.2 },
					scope: 'thread',
				},
			}),
		);

		await store.updateObservationalMemoryConfig({
			id: record.id,
			config: { observation: { messageTokens: 50_000 } },
		});

		const found = await store.getObservationalMemory('thread-1', 'user-1');
		expect(found?.config).toEqual({
			observation: { messageTokens: 50_000, bufferTokens: 0.2 },
			scope: 'thread',
		});
	});
});

describe('listMessagesByResourceId', () => {
	const msg = (
		id: string,
		threadId: string,
		resourceId: string,
		createdAt: Date,
	) => ({
		id,
		threadId,
		resourceId,
		role: 'user' as const,
		content: {
			format: 2,
			parts: [{ type: 'text', text: id }],
		} as never,
		createdAt,
	});

	it('returns messages across threads oldest-first by default', async () => {
		await store.saveMessages({
			messages: [
				msg('m3', 't2', 'user-1', new Date('2026-07-03T00:00:00Z')),
				msg('m1', 't1', 'user-1', new Date('2026-07-01T00:00:00Z')),
				msg('m2', 't1', 'user-1', new Date('2026-07-02T00:00:00Z')),
				msg('other', 't3', 'user-2', new Date('2026-07-01T00:00:00Z')),
			],
		});

		const result = await store.listMessagesByResourceId({
			resourceId: 'user-1',
		});
		expect(result.total).toBe(3);
		expect(result.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
	});

	it('supports pagination and date filters', async () => {
		await store.saveMessages({
			messages: [
				msg('m1', 't1', 'user-1', new Date('2026-07-01T00:00:00Z')),
				msg('m2', 't1', 'user-1', new Date('2026-07-02T00:00:00Z')),
				msg('m3', 't2', 'user-1', new Date('2026-07-03T00:00:00Z')),
			],
		});

		const page = await store.listMessagesByResourceId({
			resourceId: 'user-1',
			page: 0,
			perPage: 2,
		});
		expect(page.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
		expect(page.hasMore).toBe(true);

		const filtered = await store.listMessagesByResourceId({
			resourceId: 'user-1',
			filter: {
				dateRange: { start: new Date('2026-07-02T00:00:00Z') },
			},
		});
		expect(filtered.messages.map((m) => m.id)).toEqual(['m2', 'm3']);

		const all = await store.listMessagesByResourceId({
			resourceId: 'user-1',
			perPage: false,
		});
		expect(all.messages).toHaveLength(3);
		expect(all.hasMore).toBe(false);
	});
});
