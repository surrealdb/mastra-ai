import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { anthropic } from '@ai-sdk/anthropic';
import { SurrealDBStore } from '@mastra/surrealdb';

const store = new SurrealDBStore({
	id: 'basic-agent-store',
	url: process.env['SURREALDB_URL'] ?? 'ws://localhost:8000',
	username: process.env['SURREALDB_USER'] ?? 'root',
	password: process.env['SURREALDB_PASS'] ?? 'root',
	namespace: 'mastra',
	database: 'basic_agent',
});

const agent = new Agent({
	name: 'assistant',
	instructions:
		'You are a helpful assistant with persistent memory backed by SurrealDB. ' +
		'You remember details shared by the user across conversations.',
	model: anthropic('claude-sonnet-4-5'),
});

const mastra = new Mastra({
	agents: { assistant: agent },
	storage: store,
});

async function main() {
	await store.init();

	const resourceId = 'user-001';
	const threadId = 'thread-001';

	const a = mastra.getAgent('assistant');

	console.log('\n--- Turn 1 ---');
	const r1 = await a.generate(
		'Hello! My name is Alice and I love hiking in the mountains.',
		{ resourceId, threadId },
	);
	console.log('Agent:', r1.text);

	console.log('\n--- Turn 2 ---');
	const r2 = await a.generate('What do you know about me so far?', {
		resourceId,
		threadId,
	});
	console.log('Agent:', r2.text);

	console.log('\n--- Turn 3 ---');
	const r3 = await a.generate(
		'I also really enjoy cooking Italian food. What should we talk about?',
		{ resourceId, threadId },
	);
	console.log('Agent:', r3.text);

	await store.close();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
