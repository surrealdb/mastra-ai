// Re-export the underlying client and error classes for convenience.
export {
	AgentMemory,
	AgentMemoryError,
	AuthError,
	ConnectionError,
	NotFoundError,
	RateLimitError,
	ScopeError,
	ServerError,
	ValidationError,
} from '@surrealdb/memory';
export type {
	AgentMemoryCredentialsConfig,
	AgentMemoryInstanceConfig,
	AgentMemoryMemoryBaseConfig,
	AgentMemoryMemoryConfig,
} from './config.js';
export { isAgentMemoryInstanceConfig } from './config.js';
export type { DocumentQueryMode } from './documents.js';
export {
	deleteDocument,
	ingestDocument,
	listDocuments,
	searchDocuments,
} from './documents.js';
export type {
	AgentMemoryExtractedContext,
	AgentMemoryExtractedSinkOptions,
} from './extractors.js';
export { agentMemoryExtractedSink } from './extractors.js';
export { AgentMemoryMemory } from './memory.js';
export { createAgentMemoryTools } from './tools.js';
