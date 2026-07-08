// Re-export the underlying client and error classes for convenience.
export {
	AuthError,
	ConnectionError,
	NotFoundError,
	RateLimitError,
	ScopeError,
	ServerError,
	Spectron,
	SpectronError,
	ValidationError,
} from '@surrealdb/spectron';
export type {
	SpectronCredentialsConfig,
	SpectronInstanceConfig,
	SpectronMemoryBaseConfig,
	SpectronMemoryConfig,
} from './config.js';
export { isSpectronInstanceConfig } from './config.js';
export type { DocumentQueryMode } from './documents.js';
export {
	deleteDocument,
	ingestDocument,
	listDocuments,
	searchDocuments,
} from './documents.js';
export { SpectronMemory } from './memory.js';
export { createSpectronTools } from './tools.js';
