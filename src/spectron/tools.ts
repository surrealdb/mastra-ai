import { createTool } from '@mastra/core/tools';
import { type Spectron, SpectronError } from '@surrealdb/spectron';
import { z } from 'zod';

/** Run a Spectron call for a tool, returning a structured error instead of throwing. */
async function safe<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof SpectronError) {
			return {
				error: `${err.status} ${err.title}: ${err.detail ?? ''}`.trim(),
			};
		}
		return { error: err instanceof Error ? err.message : 'Unknown error' };
	}
}

/**
 * Build a Mastra toolset that lets an agent call Spectron explicitly:
 * store facts, semantically recall memory, forget, fetch assembled context,
 * and search the document corpus (RAG).
 *
 * @example
 * const agent = new Agent({ ..., tools: createSpectronTools(client) });
 */
export function createSpectronTools(spectron: Spectron) {
	return {
		spectronRemember: createTool({
			id: 'spectron-remember',
			description:
				'Persist a fact or note to long-term memory so it can be recalled later.',
			inputSchema: z.object({
				text: z.string().describe('The fact or note to remember.'),
				labels: z
					.array(z.string())
					.optional()
					.describe('Optional key=value labels to tag the memory.'),
			}),
			execute: async (input) =>
				safe(() =>
					spectron.remember(input.text, { labels: input.labels }),
				),
		}),

		spectronRecall: createTool({
			id: 'spectron-recall',
			description:
				'Semantically recall facts and passages from long-term memory for a query.',
			inputSchema: z.object({
				query: z.string().describe('What to recall.'),
				k: z
					.number()
					.int()
					.positive()
					.optional()
					.describe('Maximum number of hits to return.'),
			}),
			execute: async (input) =>
				safe(async () => {
					const res = await spectron.recall(input.query, {
						k: input.k,
					});
					return { hits: res.hits };
				}),
		}),

		spectronForget: createTool({
			id: 'spectron-forget',
			description: 'Forget memory matching a natural-language query.',
			inputSchema: z.object({
				query: z.string().describe('What to forget.'),
				purge: z
					.boolean()
					.optional()
					.describe('Hard-delete instead of tombstoning.'),
			}),
			execute: async (input) =>
				safe(() =>
					spectron.forget(input.query, { purge: input.purge }),
				),
		}),

		spectronContext: createTool({
			id: 'spectron-context',
			description:
				'Retrieve an assembled context block from memory for a query.',
			inputSchema: z.object({
				query: z
					.string()
					.describe('The query to assemble context for.'),
				k: z.number().int().positive().optional(),
			}),
			execute: async (input) =>
				safe(() => spectron.context(input.query, { k: input.k })),
		}),

		spectronSearchDocuments: createTool({
			id: 'spectron-search-documents',
			description:
				'Search the ingested document corpus (hybrid/vector/BM25) for relevant chunks.',
			inputSchema: z.object({
				query: z.string().describe('The search query.'),
				k: z.number().int().positive().optional(),
				mode: z
					.enum(['hybrid', 'vector', 'bm25', 'hybrid_graph'])
					.optional()
					.describe('Retrieval mode. Defaults to hybrid.'),
			}),
			execute: async (input) =>
				safe(() =>
					spectron.documents.query({
						query: input.query,
						k: input.k,
						mode: input.mode,
					}),
				),
		}),
	};
}
