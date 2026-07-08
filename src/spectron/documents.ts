import type { Spectron, SpectronFileInput } from '@surrealdb/spectron';

/**
 * Thin, dependency-free helpers over Spectron's `documents` namespace for RAG
 * ingestion and retrieval pipelines. The retrieval helper ({@link searchDocuments})
 * is also exposed as the `spectronSearchDocuments` agent tool.
 */

/** Ingest a document into the Spectron corpus. Returns the ingestion handle. */
export function ingestDocument(
	spectron: Spectron,
	options: { file: SpectronFileInput; title?: string; mimeType?: string },
) {
	return spectron.documents.upload(options);
}

/** Retrieval mode for {@link searchDocuments}. */
export type DocumentQueryMode = 'hybrid' | 'vector' | 'bm25' | 'hybrid_graph';

/** Hybrid/vector/BM25/graph search over the document corpus. */
export function searchDocuments(
	spectron: Spectron,
	options: { query: string; k?: number; mode?: DocumentQueryMode },
) {
	return spectron.documents.query({
		query: options.query,
		k: options.k,
		mode: options.mode,
	});
}

/** List documents, optionally filtered by status/mime type. */
export function listDocuments(
	spectron: Spectron,
	options?: {
		status?: string;
		mimeType?: string;
		page?: number;
		pageSize?: number;
	},
) {
	return spectron.documents.list(options);
}

/** Delete a document from the corpus. */
export function deleteDocument(spectron: Spectron, documentId: string) {
	return spectron.documents.delete(documentId);
}
