import { RecordId, Surreal } from 'surrealdb';

export type Document = {
	id: string;
	content: string;
	embedding: number[];
	metadata?: Record<string, unknown>;
};

export type SearchResult = {
	id: string;
	content: string;
	metadata?: Record<string, unknown>;
	distance: number;
};

const SCHEMA = `
DEFINE TABLE IF NOT EXISTS mastra_documents SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS id        ON mastra_documents TYPE string;
DEFINE FIELD IF NOT EXISTS content   ON mastra_documents TYPE string;
DEFINE FIELD IF NOT EXISTS metadata  ON mastra_documents FLEXIBLE TYPE option<object>;
DEFINE FIELD IF NOT EXISTS embedding ON mastra_documents TYPE array<float>;
DEFINE FIELD IF NOT EXISTS createdAt ON mastra_documents TYPE datetime;
DEFINE INDEX IF NOT EXISTS idx_docs_hnsw
  ON mastra_documents FIELDS embedding HNSW DIMENSION 1536 DIST COSINE;
`;

export class SurrealVectorStore {
	constructor(private readonly db: Surreal) {}

	async init(): Promise<void> {
		await this.db.query(SCHEMA);
	}

	async upsert(doc: Document): Promise<void> {
		await this.db.upsert(new RecordId('mastra_documents', doc.id), {
			id: doc.id,
			content: doc.content,
			embedding: doc.embedding,
			metadata: doc.metadata ?? null,
			createdAt: new Date(),
		});
	}

	async similaritySearch(
		queryEmbedding: number[],
		topK = 5,
	): Promise<SearchResult[]> {
		const results = await this.db.query<
			[
				Array<{
					id: string;
					content: string;
					metadata?: Record<string, unknown>;
					dist: number;
				}>,
			]
		>(
			`SELECT id, content, metadata,
              vector::distance::cosine(embedding, $qe) AS dist
       FROM mastra_documents
       WHERE embedding <|${topK}|> $qe
       ORDER BY dist ASC`,
			{ qe: queryEmbedding },
		);

		return (results[0] ?? []).map((r) => ({
			id: r.id,
			content: r.content,
			metadata: r.metadata,
			distance: r.dist,
		}));
	}

	async count(): Promise<number> {
		const rows = await this.db.query<[Array<{ count: number }>]>(
			'SELECT count() AS count FROM mastra_documents GROUP ALL',
		);
		return rows[0]?.[0]?.count ?? 0;
	}
}
