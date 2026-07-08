import type { MastraDBMessage } from '@mastra/core/agent';
import type { StorageThreadType } from '@mastra/core/memory';
import { InMemoryStore } from '@mastra/core/storage';
import { type Spectron, SpectronError } from '@surrealdb/spectron';
import { beforeEach, describe, expect, it } from 'vitest';
import { SpectronMemory } from '../spectron/memory.js';

type Calls = {
	sessionsCreate: unknown[];
	rememberMany: Array<{ batch: Array<{ role: string; content: string }> }>;
	recall: Array<{ query: string }>;
	remember: unknown[];
	forget: unknown[];
};

function makeFakeSpectron(
	overrides: Partial<Record<keyof Spectron, unknown>> = {},
): { spectron: Spectron; calls: Calls } {
	const calls: Calls = {
		sessionsCreate: [],
		rememberMany: [],
		recall: [],
		remember: [],
		forget: [],
	};
	const fake = {
		sessions: {
			create: async (opts: unknown) => {
				calls.sessionsCreate.push(opts);
				return { id: 'sess-1', createdAt: '', scopes: [] };
			},
		},
		documents: { query: async () => ({ hits: [] }) },
		whoami: async () => ({}),
		rememberMany: async (
			batch: Array<{ role: string; content: string }>,
		) => {
			calls.rememberMany.push({ batch });
			return {};
		},
		recall: async (query: string) => {
			calls.recall.push({ query });
			return {
				hits: [
					{
						id: 'h1',
						score: 0.9,
						source: 'facts',
						text: 'Alice hikes',
					},
				],
			};
		},
		remember: async (...args: unknown[]) => {
			calls.remember.push(args);
			return {};
		},
		forget: async (...args: unknown[]) => {
			calls.forget.push(args);
			return {};
		},
		context: async () => ({
			context: 'known things',
			queryMs: 0,
			tier: '',
		}),
		...overrides,
	};
	return { spectron: fake as unknown as Spectron, calls };
}

function textMsg(
	id: string,
	role: MastraDBMessage['role'],
	text: string,
	threadId = 'thread-1',
): MastraDBMessage {
	return {
		id,
		role,
		type: 'text',
		threadId,
		resourceId: 'user-1',
		createdAt: new Date(),
		content: { format: 2, parts: [{ type: 'text', text }] },
	} as MastraDBMessage;
}

const thread: StorageThreadType = {
	id: 'thread-1',
	resourceId: 'user-1',
	createdAt: new Date(),
	updatedAt: new Date(),
};

describe('SpectronMemory', () => {
	let calls: Calls;
	let memory: SpectronMemory;

	beforeEach(async () => {
		const fake = makeFakeSpectron();
		calls = fake.calls;
		memory = new SpectronMemory({
			spectron: fake.spectron,
			storage: new InMemoryStore(),
			spectronRecall: { topK: 3 },
		});
		await memory.saveThread({ thread });
	});

	it('creates a Spectron session lazily on saveThread and caches it', async () => {
		expect(calls.sessionsCreate.length).toBe(1);
		const saved = await memory.getThreadById({ threadId: 'thread-1' });
		expect(
			(saved?.metadata?.__spectron as { sessionId?: string })?.sessionId,
		).toBe('sess-1');
	});

	it('mirrors only non-empty, non-synthetic messages to rememberMany', async () => {
		const messages: MastraDBMessage[] = [
			textMsg('m1', 'user', 'My name is Alice'),
			textMsg('spectron:x', 'assistant', 'synthetic recall'),
			{
				...textMsg('m2', 'assistant', ''),
				content: { format: 2, parts: [] },
			} as MastraDBMessage,
		];
		const result = await memory.saveMessages({ messages });

		expect(result.messages).toHaveLength(3); // verbatim store keeps all
		expect(calls.rememberMany).toHaveLength(1);
		const batch = calls.rememberMany[0]?.batch;
		expect(batch).toEqual([{ role: 'user', content: 'My name is Alice' }]);
	});

	it('recall merges verbatim history with synthesized Spectron hits', async () => {
		await memory.saveMessages({ messages: [textMsg('m1', 'user', 'hi')] });
		const res = await memory.recall({
			threadId: 'thread-1',
			resourceId: 'user-1',
			vectorSearchString: 'hobbies',
		} as never);

		expect(calls.recall).toHaveLength(1);
		const ids = res.messages.map((m) => m.id);
		expect(ids).toContain('spectron:h1');
		expect(ids).toContain('m1');
		// synthesized hit is prepended
		expect(ids[0]).toBe('spectron:h1');
	});

	it('does not call Spectron recall when no vectorSearchString', async () => {
		await memory.saveMessages({ messages: [textMsg('m1', 'user', 'hi')] });
		const res = await memory.recall({
			threadId: 'thread-1',
			resourceId: 'user-1',
		} as never);
		expect(calls.recall).toHaveLength(0);
		expect(res.messages.map((m) => m.id)).toEqual(['m1']);
	});

	it('guards Spectron failures so the local write still succeeds', async () => {
		const fake = makeFakeSpectron({
			rememberMany: async () => {
				throw new SpectronError({ status: 500, title: 'boom' });
			},
		});
		const mem = new SpectronMemory({
			spectron: fake.spectron,
			storage: new InMemoryStore(),
			blocking: true,
		});
		await mem.saveThread({ thread });
		const result = await mem.saveMessages({
			messages: [textMsg('m1', 'user', 'still saved')],
		});
		expect(result.messages).toHaveLength(1);
		const back = await mem.recall({
			threadId: 'thread-1',
			resourceId: 'user-1',
		} as never);
		expect(back.messages.map((m) => m.id)).toEqual(['m1']);
	});
});
