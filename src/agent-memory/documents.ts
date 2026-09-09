import type { AgentMemory, AgentMemoryFileInput } from '@surrealdb/memory';

/**
 * Thin, dependency-free helpers over AgentMemory's `documents` namespace for RAG
 * ingestion and retrieval pipelines. The retrieval helper ({@link searchDocuments})
 * is also exposed as the `agentMemorySearchDocuments` agent tool.
 */

/** Ingest a document into the AgentMemory corpus. Returns the ingestion handle. */
export function ingestDocument(
	agentMemory: AgentMemory,
	options: { file: AgentMemoryFileInput; title?: string; mimeType?: string },
) {
	return agentMemory.documents.upload(options);
}

/** Retrieval mode for {@link searchDocuments}. */
export type DocumentQueryMode = 'hybrid' | 'vector' | 'bm25' | 'hybrid_graph';

/** Hybrid/vector/BM25/graph search over the document corpus. */
export function searchDocuments(
	agentMemory: AgentMemory,
	options: { query: string; k?: number; mode?: DocumentQueryMode },
) {
	return agentMemory.documents.query({
		query: options.query,
		k: options.k,
		mode: options.mode,
	});
}

/** List documents, optionally filtered by status/mime type. */
export function listDocuments(
	agentMemory: AgentMemory,
	options?: {
		status?: string;
		mimeType?: string;
		page?: number;
		pageSize?: number;
	},
) {
	return agentMemory.documents.list(options);
}

/** Delete a document from the corpus. */
export function deleteDocument(agentMemory: AgentMemory, documentId: string) {
	return agentMemory.documents.delete(documentId);
}
