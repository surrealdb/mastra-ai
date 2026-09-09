import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { anthropic } from '@ai-sdk/anthropic';
import {
	createAgentMemoryTools,
	AgentMemory,
	AgentMemoryMemory,
	searchDocuments,
} from '@surrealdb/mastra-ai/agentMemory';

const endpoint = process.env['AGENT_MEMORY_ENDPOINT'];
const context = process.env['AGENT_MEMORY_CONTEXT'];
const apiKey = process.env['AGENT_MEMORY_API_KEY'];

if (!endpoint || !context || !apiKey) {
	console.error(
		'Set AGENT_MEMORY_ENDPOINT, AGENT_MEMORY_CONTEXT and AGENT_MEMORY_API_KEY to run this example.',
	);
	process.exit(1);
}

// Standalone Mastra x AgentMemory — no database to run. Facts and semantic recall
// live in the hosted AgentMemory service; verbatim history is kept in-process.
// (Pass `storage: new SurrealDBStore({...})` if you want durable verbatim history.)
const agentMemory = new AgentMemory({ endpoint, context, apiKey });

const agent = new Agent({
	name: 'assistant',
	instructions:
		'You are a helpful assistant with long-term memory backed by AgentMemory. ' +
		'Use the agentMemoryRecall tool to look up what you know about the user before answering.',
	model: anthropic('claude-sonnet-4-5'),
	// Automatic memory: messages are mirrored into AgentMemory for fact extraction.
	memory: new AgentMemoryMemory({ agentMemory, blocking: true }),
	// Explicit memory + RAG the model can call on demand.
	tools: createAgentMemoryTools(agentMemory),
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

	// Document RAG: search the AgentMemory corpus directly.
	console.log('\n--- Document search ---');
	const hits = await searchDocuments(agentMemory, {
		query: 'hiking trails',
		k: 3,
	});
	console.log('Document hits:', JSON.stringify(hits, null, 2));
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
