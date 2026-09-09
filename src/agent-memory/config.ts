import type { SharedMemoryConfig } from '@mastra/core/memory';
import type { MastraCompositeStore } from '@mastra/core/storage';
import type { AgentMemory } from '@surrealdb/memory';

/**
 * Options shared by every {@link AgentMemoryMemoryConfig} variant.
 *
 * `AgentMemoryMemory` is a hybrid: a durable {@link MastraCompositeStore} is the
 * system-of-record for verbatim threads, messages and working memory, while
 * the AgentMemory client is layered on top as a best-effort intelligence tier
 * (fact extraction + semantic recall + profile).
 */
export interface AgentMemoryMemoryBaseConfig {
	/** Unique id for the memory instance. Defaults to a generated id. */
	id?: string;
	/** Instance name. Defaults to `'AgentMemoryMemory'`. */
	name?: string;
	/** Mastra memory options (lastMessages, semanticRecall, workingMemory, ...). */
	options?: SharedMemoryConfig['options'];
	/**
	 * Durable system-of-record for threads/messages/working memory. Reuse this
	 * package's `SurrealDBStore` in production. Defaults to an in-memory store.
	 */
	storage?: MastraCompositeStore;
	/** Scope-selector prefix used when tagging AgentMemory writes. Defaults to `'mastra'`. */
	scopePrefix?: string;
	/**
	 * Augment `recall()` with AgentMemory semantic hits when a `vectorSearchString`
	 * is provided. Independent of Mastra's vector-based `semanticRecall` (AgentMemory
	 * embeds server-side, so no Mastra vector store is needed). Defaults to `true`.
	 * For automatic agent-driven recall, prefer the `agentMemoryRecall` tool from
	 * {@link createAgentMemoryTools}.
	 */
	agentMemoryRecall?:
		| boolean
		| { topK?: number; scope?: 'thread' | 'resource' };
	/**
	 * Await AgentMemory mirror writes on the critical path. When `false` (default)
	 * writes are fire-and-forget so a slow/failed AgentMemory never stalls the loop.
	 */
	blocking?: boolean;
	/**
	 * Inject a AgentMemory profile/context block via `getSystemMessage`. Off by
	 * default so working-memory round-trips stay lossless.
	 */
	injectProfile?: boolean;
	/**
	 * Serialize tool-call parts into the facts sent to AgentMemory. Off by default
	 * because tool noise tends to pollute fact extraction.
	 */
	includeToolCalls?: boolean;
}

/** Construct the AgentMemory client from credentials. */
export interface AgentMemoryCredentialsConfig
	extends AgentMemoryMemoryBaseConfig {
	/** API endpoint origin without a trailing slash. */
	endpoint: string;
	/** AgentMemory context id (API path segment). */
	context: string;
	/** API key sent as a bearer token. */
	apiKey: string;
	/** Request timeout in milliseconds. */
	timeout?: number;
	/** Maximum retry attempts for idempotent requests. */
	maxRetries?: number;
	/** Override `fetch` (for tests or custom stacks). */
	fetchImpl?: typeof fetch;
}

/** Reuse a pre-built AgentMemory client. */
export interface AgentMemoryInstanceConfig extends AgentMemoryMemoryBaseConfig {
	agentMemory: AgentMemory;
}

export type AgentMemoryMemoryConfig =
	| AgentMemoryCredentialsConfig
	| AgentMemoryInstanceConfig;

export function isAgentMemoryInstanceConfig(
	cfg: AgentMemoryMemoryConfig,
): cfg is AgentMemoryInstanceConfig {
	return 'agentMemory' in cfg;
}
