import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { anthropic } from '@ai-sdk/anthropic';
import {
	createSpectronTools,
	Spectron,
	SpectronMemory,
	searchDocuments,
} from '@surrealdb/mastra-ai/spectron';

const endpoint = process.env['SPECTRON_ENDPOINT'];
const context = process.env['SPECTRON_CONTEXT'];
const apiKey = process.env['SPECTRON_API_KEY'];

if (!endpoint || !context || !apiKey) {
	console.error(
		'Set SPECTRON_ENDPOINT, SPECTRON_CONTEXT and SPECTRON_API_KEY to run this example.',
	);
	process.exit(1);
}

// Standalone Mastra x Spectron — no database to run. Facts and semantic recall
// live in the hosted Spectron service; verbatim history is kept in-process.
// (Pass `storage: new SurrealDBStore({...})` if you want durable verbatim history.)
const spectron = new Spectron({ endpoint, context, apiKey });

const agent = new Agent({
	name: 'assistant',
	instructions:
		'You are a helpful assistant with long-term memory backed by Spectron. ' +
		'Use the spectronRecall tool to look up what you know about the user before answering.',
	model: anthropic('claude-sonnet-4-5'),
	// Automatic memory: messages are mirrored into Spectron for fact extraction.
	memory: new SpectronMemory({ spectron, blocking: true }),
	// Explicit memory + RAG the model can call on demand.
	tools: createSpectronTools(spectron),
});

const mastra = new Mastra({ agents: { assistant: agent } });

async function main() {
	const resourceId = 'user-001';
	const threadId = 'thread-001';
	const a = mastra.getAgent('assistant');

	console.log('\n--- Turn 1 ---');
	const r1 = await a.generate(
		'Hi! I am Alice, and I love hiking in the Dolomites.',
		{ resourceId, threadId },
	);
	console.log('Agent:', r1.text);

	console.log('\n--- Turn 2 ---');
	const r2 = await a.generate('What outdoor activity do I enjoy?', {
		resourceId,
		threadId,
	});
	console.log('Agent:', r2.text);

	// Document RAG: search the Spectron corpus directly.
	console.log('\n--- Document search ---');
	const hits = await searchDocuments(spectron, {
		query: 'hiking trails',
		k: 3,
	});
	console.log('Document hits:', JSON.stringify(hits, null, 2));
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
