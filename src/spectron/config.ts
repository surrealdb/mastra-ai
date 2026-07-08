import type { SharedMemoryConfig } from '@mastra/core/memory';
import type { MastraCompositeStore } from '@mastra/core/storage';
import type { Spectron } from '@surrealdb/spectron';

/**
 * Options shared by every {@link SpectronMemoryConfig} variant.
 *
 * `SpectronMemory` is a hybrid: a durable {@link MastraCompositeStore} is the
 * system-of-record for verbatim threads, messages and working memory, while
 * the Spectron client is layered on top as a best-effort intelligence tier
 * (fact extraction + semantic recall + profile).
 */
export interface SpectronMemoryBaseConfig {
	/** Unique id for the memory instance. Defaults to a generated id. */
	id?: string;
	/** Instance name. Defaults to `'SpectronMemory'`. */
	name?: string;
	/** Mastra memory options (lastMessages, semanticRecall, workingMemory, ...). */
	options?: SharedMemoryConfig['options'];
	/**
	 * Durable system-of-record for threads/messages/working memory. Reuse this
	 * package's `SurrealDBStore` in production. Defaults to an in-memory store.
	 */
	storage?: MastraCompositeStore;
	/** Scope-selector prefix used when tagging Spectron writes. Defaults to `'mastra'`. */
	scopePrefix?: string;
	/**
	 * Augment `recall()` with Spectron semantic hits when a `vectorSearchString`
	 * is provided. Independent of Mastra's vector-based `semanticRecall` (Spectron
	 * embeds server-side, so no Mastra vector store is needed). Defaults to `true`.
	 * For automatic agent-driven recall, prefer the `spectronRecall` tool from
	 * {@link createSpectronTools}.
	 */
	spectronRecall?: boolean | { topK?: number; scope?: 'thread' | 'resource' };
	/**
	 * Await Spectron mirror writes on the critical path. When `false` (default)
	 * writes are fire-and-forget so a slow/failed Spectron never stalls the loop.
	 */
	blocking?: boolean;
	/**
	 * Inject a Spectron profile/context block via `getSystemMessage`. Off by
	 * default so working-memory round-trips stay lossless.
	 */
	injectProfile?: boolean;
	/**
	 * Serialize tool-call parts into the facts sent to Spectron. Off by default
	 * because tool noise tends to pollute fact extraction.
	 */
	includeToolCalls?: boolean;
}

/** Construct the Spectron client from credentials. */
export interface SpectronCredentialsConfig extends SpectronMemoryBaseConfig {
	/** API endpoint origin without a trailing slash. */
	endpoint: string;
	/** Spectron context id (API path segment). */
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

/** Reuse a pre-built Spectron client. */
export interface SpectronInstanceConfig extends SpectronMemoryBaseConfig {
	spectron: Spectron;
}

export type SpectronMemoryConfig =
	| SpectronCredentialsConfig
	| SpectronInstanceConfig;

export function isSpectronInstanceConfig(
	cfg: SpectronMemoryConfig,
): cfg is SpectronInstanceConfig {
	return 'spectron' in cfg;
}
