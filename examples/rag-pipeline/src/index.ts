import { anthropic } from '@ai-sdk/anthropic';
import { Surreal } from 'surrealdb';
import { embed, embedMany } from 'ai';
import { SurrealVectorStore } from './vector-store.js';

const db = new Surreal();

async function connect() {
	await db.connect(process.env['SURREALDB_URL'] ?? 'ws://localhost:8000', {
		namespace: 'mastra',
		database: 'rag_demo',
		authentication: {
			username: process.env['SURREALDB_USER'] ?? 'root',
			password: process.env['SURREALDB_PASS'] ?? 'root',
		},
	});
}

const embeddingModel = anthropic.textEmbeddingModel('voyage-3-lite');

async function embedText(text: string): Promise<number[]> {
	const { embedding } = await embed({ model: embeddingModel, value: text });
	return embedding;
}

async function embedTexts(texts: string[]): Promise<number[][]> {
	const { embeddings } = await embedMany({
		model: embeddingModel,
		values: texts,
	});
	return embeddings;
}

const DOCUMENTS = [
	{
		id: 'doc-001',
		content:
			'SurrealDB is a multi-model database that supports documents, graphs, and vector search.',
		metadata: { source: 'surrealdb-docs', category: 'database' },
	},
	{
		id: 'doc-002',
		content:
			'Mastra is an open-source TypeScript framework for building AI agents and workflows.',
		metadata: { source: 'mastra-docs', category: 'framework' },
	},
	{
		id: 'doc-003',
		content:
			'SurrealDB v3 introduces HNSW indexing for approximate nearest-neighbor vector search with cosine similarity.',
		metadata: { source: 'surrealdb-release', category: 'database' },
	},
	{
		id: 'doc-004',
		content:
			'Agent workflows in Mastra support suspend and resume via persistent storage backends.',
		metadata: { source: 'mastra-docs', category: 'framework' },
	},
	{
		id: 'doc-005',
		content:
			'The @mastra/surrealdb package provides a production-ready SurrealDB storage adapter for Mastra AI.',
		metadata: { source: 'mastra-surrealdb', category: 'integration' },
	},
];

async function main() {
	await connect();

	const vectorStore = new SurrealVectorStore(db);
	await vectorStore.init();

	console.log(`Ingesting ${DOCUMENTS.length} documents...`);
	const contents = DOCUMENTS.map((d) => d.content);
	const embeddings = await embedTexts(contents);

	for (let i = 0; i < DOCUMENTS.length; i++) {
		const doc = DOCUMENTS[i]!;
		await vectorStore.upsert({
			id: doc.id,
			content: doc.content,
			embedding: embeddings[i]!,
			metadata: doc.metadata,
		});
	}

	const total = await vectorStore.count();
	console.log(`Total documents: ${total}\n`);

	const queries = [
		'How does SurrealDB handle vector similarity search?',
		'What is Mastra and how do its agents work?',
	];

	for (const query of queries) {
		console.log(`Query: "${query}"`);
		const queryEmbedding = await embedText(query);
		const results = await vectorStore.similaritySearch(queryEmbedding, 2);

		for (const r of results) {
			console.log(
				`  [dist=${r.distance.toFixed(4)}] ${r.content.slice(0, 80)}...`,
			);
		}
		console.log();
	}

	await db.close();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
