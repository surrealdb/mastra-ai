import { anthropic } from '@ai-sdk/anthropic';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { Extractor, Memory } from '@mastra/memory';
import { SurrealDBStore } from '@surrealdb/mastra-ai';
import { AgentMemory, agentMemoryExtractedSink } from '@surrealdb/mastra-ai/agent-memory';
import { z } from 'zod';

// Observational Memory on SurrealDB: the observer agent compresses message
// history into observations once it crosses the token threshold, and the
// extractor pulls structured facts out of each observation cycle. Everything
// persists in the mastra_observational_memory table.

const store = new SurrealDBStore({
	id: 'om-example',
	url: process.env['SURREALDB_URL'] ?? 'ws://localhost:8000',
	username: process.env['SURREALDB_USER'] ?? 'root',
	password: process.env['SURREALDB_PASS'] ?? 'root',
	namespace: 'examples',
	database: 'observational_memory',
});

// Optional: bridge extracted values into Agent Memory. Skipped when the
// AGENT_MEMORY_* environment variables are absent.
const endpoint = process.env['AGENT_MEMORY_ENDPOINT'];
const context = process.env['AGENT_MEMORY_CONTEXT'];
const apiKey = process.env['AGENT_MEMORY_API_KEY'];
const agentMemory =
	endpoint && context && apiKey
		? new AgentMemory({ endpoint, context, apiKey })
		: undefined;

const profileSchema = z.object({
	preferredName: z.string().optional(),
	location: z.string().optional(),
	interests: z.array(z.string()).optional(),
});

const profileExtractor = new Extractor<z.infer<typeof profileSchema>>({
	name: 'User profile',
	instructions:
		'Extract stable facts about the user: name, location, preferences.',
	schema: profileSchema,
	...(agentMemory
		? {
				onExtracted: agentMemoryExtractedSink(agentMemory, {
					remember: { memoryCategory: 'profile' },
				}),
			}
		: {}),
});

const memory = new Memory({
	storage: store,
	options: {
		observationalMemory: {
			model: 'anthropic/claude-haiku-4-5',
			observation: {
				// Low threshold so the example triggers observation quickly;
				// production defaults to 30_000.
				messageTokens: 2_000,
				extract: [profileExtractor],
			},
		},
	},
});

const agent = new Agent({
	id: 'assistant',
	name: 'assistant',
	instructions: 'You are a helpful assistant with long-term memory.',
	model: anthropic('claude-sonnet-4-5'),
	memory,
});

const mastra = new Mastra({ agents: { assistant: agent }, storage: store });

async function main() {
	await store.init();

	const resourceId = 'user-001';
	const threadId = 'thread-om-001';
	const a = mastra.getAgent('assistant');

	const memoryOptions = {
		memory: { thread: threadId, resource: resourceId },
	};

	console.log('\n--- Turn 1 ---');
	const r1 = await a.generate(
		'Hi! I am Alice from Bolzano, and I love hiking in the Dolomites.',
		memoryOptions,
	);
	console.log('Agent:', r1.text);

	console.log('\n--- Turn 2 (long content to trigger observation) ---');
	const r2 = await a.generate(
		'Please summarize the plot of a classic mountaineering novel in detail.',
		memoryOptions,
	);
	console.log('Agent:', r2.text.slice(0, 200), '…');

	// Inspect the persisted observational memory record directly.
	const omRecord = await store.stores?.memory?.getObservationalMemory(
		threadId,
		resourceId,
	);
	console.log('\n--- Observational memory record ---');
	console.log('generation:', omRecord?.generationCount);
	console.log('observations:', omRecord?.activeObservations.slice(0, 300));
	console.log(
		'extracted (buffered chunks):',
		omRecord?.bufferedObservationChunks?.map((c) => c.extractedValues),
	);

	await store.close();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
