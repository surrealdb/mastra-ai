import { InMemoryStore } from '@mastra/core/storage';
import { Spectron } from '@surrealdb/spectron';
import { beforeAll, describe, expect, it } from 'vitest';
import { searchDocuments } from '../spectron/documents.js';
import { SpectronMemory } from '../spectron/memory.js';

const endpoint = process.env['SPECTRON_ENDPOINT'];
const context = process.env['SPECTRON_CONTEXT'];
const apiKey = process.env['SPECTRON_API_KEY'];
const hasCreds = Boolean(endpoint && context && apiKey);

describe.skipIf(!hasCreds)('SpectronMemory (integration)', () => {
	// Constructed in beforeAll so nothing runs at collection time when skipped.
	let client: Spectron;
	beforeAll(() => {
		client = new Spectron({
			endpoint: endpoint as string,
			context: context as string,
			apiKey: apiKey as string,
		});
	});

	it('round-trips remember -> recall through the memory provider', async () => {
		const memory = new SpectronMemory({
			spectron: client,
			storage: new InMemoryStore(),
			blocking: true,
			spectronRecall: { topK: 5 },
		});
		const threadId = `it-${Date.now()}`;
		await memory.saveThread({
			thread: {
				id: threadId,
				resourceId: 'it-user',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		await memory.saveMessages({
			messages: [
				{
					id: `${threadId}-1`,
					role: 'user',
					type: 'text',
					threadId,
					resourceId: 'it-user',
					createdAt: new Date(),
					content: {
						format: 2,
						parts: [
							{
								type: 'text',
								text: 'My favourite colour is teal.',
							},
						],
					},
				} as never,
			],
		});

		const res = await memory.recall({
			threadId,
			resourceId: 'it-user',
			vectorSearchString: 'favourite colour',
		} as never);
		expect(res.messages.length).toBeGreaterThan(0);
	});

	it('searches the document corpus', async () => {
		const res = await searchDocuments(client, {
			query: 'test',
			k: 3,
		});
		expect(res).toBeDefined();
	});
});
