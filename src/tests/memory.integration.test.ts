import type { MastraDBMessage } from '@mastra/core/agent';
import type { StorageThreadType } from '@mastra/core/memory';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SurrealDBClient } from '../client.js';
import { MemorySurrealDB } from '../domains/memory/index.js';
import { createClient } from './helpers.js';

let client: SurrealDBClient;
let store: MemorySurrealDB;

const thread = (): StorageThreadType => ({
	id: `thread-${Date.now()}`,
	resourceId: 'user-001',
	title: 'Test thread',
	createdAt: new Date(),
	updatedAt: new Date(),
});

const message = (
	threadId: string,
	overrides: Partial<MastraDBMessage> = {},
): MastraDBMessage => ({
	id: `msg-${Date.now()}-${Math.random()}`,
	threadId,
	role: 'user',
	content: {
		format: 2,
		parts: [{ type: 'text', text: 'hello' }],
	} as unknown as MastraDBMessage['content'],
	createdAt: new Date(),
	...overrides,
});

beforeAll(async () => {
	client = await createClient('test_memory');
	store = new MemorySurrealDB(client);
	await store.init();
});

afterAll(async () => {
	await client.close();
});

beforeEach(async () => {
	await store.dangerouslyClearAll();
});

describe('threads', () => {
	it('saves and retrieves a thread by id', async () => {
		const t = thread();
		await store.saveThread({ thread: t });
		const found = await store.getThreadById({ threadId: t.id });
		expect(found?.id).toBe(t.id);
		expect(found?.resourceId).toBe(t.resourceId);
		expect(found?.title).toBe(t.title);
	});

	it('returns null for unknown thread', async () => {
		const found = await store.getThreadById({ threadId: 'no-such-thread' });
		expect(found).toBeNull();
	});

	it('updates thread title and metadata', async () => {
		const t = thread();
		await store.saveThread({ thread: t });
		const updated = await store.updateThread({
			id: t.id,
			title: 'Updated title',
			metadata: { tag: 'important' },
		});
		expect(updated.title).toBe('Updated title');
		expect(updated.metadata?.tag).toBe('important');
	});

	it('deletes a thread', async () => {
		const t = thread();
		await store.saveThread({ thread: t });
		await store.deleteThread({ threadId: t.id });
		expect(await store.getThreadById({ threadId: t.id })).toBeNull();
	});

	it('lists threads filtered by resourceId', async () => {
		const t1 = { ...thread(), resourceId: 'res-A' };
		const t2 = { ...thread(), resourceId: 'res-B' };
		await store.saveThread({ thread: t1 });
		await store.saveThread({ thread: t2 });

		const { threads } = await store.listThreads({
			filter: { resourceId: 'res-A' },
		});
		expect(threads.length).toBe(1);
		expect(threads[0]?.id).toBe(t1.id);
	});
});

describe('messages', () => {
	it('saves and lists messages for a thread', async () => {
		const t = thread();
		await store.saveThread({ thread: t });
		const m = message(t.id);
		await store.saveMessages({ messages: [m] });

		const { messages } = await store.listMessages({ threadId: t.id });
		expect(messages.length).toBe(1);
		expect(messages[0]?.id).toBe(m.id);
	});

	it('saves multiple messages and retrieves them by id', async () => {
		const t = thread();
		await store.saveThread({ thread: t });
		const msgs = [message(t.id), message(t.id)];
		await store.saveMessages({ messages: msgs });

		const { messages } = await store.listMessagesById({
			messageIds: msgs.map((m) => m.id),
		});
		expect(messages.length).toBe(2);
	});

	it('deletes thread cascades to messages', async () => {
		const t = thread();
		await store.saveThread({ thread: t });
		await store.saveMessages({ messages: [message(t.id), message(t.id)] });
		await store.deleteThread({ threadId: t.id });

		const { messages } = await store.listMessages({ threadId: t.id });
		expect(messages.length).toBe(0);
	});
});

describe('resources', () => {
	it('saves and retrieves a resource', async () => {
		const resource = {
			id: 'res-001',
			workingMemory: 'some context',
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		await store.saveResource({ resource });
		const found = await store.getResourceById({ resourceId: resource.id });
		expect(found?.id).toBe(resource.id);
		expect(found?.workingMemory).toBe('some context');
	});

	it('updates working memory', async () => {
		const resource = {
			id: 'res-002',
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		await store.saveResource({ resource });
		await store.updateResource({
			resourceId: resource.id,
			workingMemory: 'updated memory',
		});
		const found = await store.getResourceById({ resourceId: resource.id });
		expect(found?.workingMemory).toBe('updated memory');
	});
});
