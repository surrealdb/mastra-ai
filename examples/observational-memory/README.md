# Observational Memory example

Runs Mastra's [Observational Memory](https://mastra.ai/docs/memory/observational-memory)
with SurrealDB as the storage backend, plus a
[memory extractor](https://mastra.ai/blog/introducing-memory-extractors) that
pulls structured user-profile facts out of each observation cycle. When the
`AGENT_MEMORY_*` environment variables are set, extracted values are also piped
into AgentMemory via `agentMemoryExtractedSink`.

## Run

```sh
# 1. Start SurrealDB
surreal start --user root --pass root memory

# 2. Install and run
bun install
ANTHROPIC_API_KEY=your-key bun start

# Optional: bridge extractions into AgentMemory
AGENT_MEMORY_ENDPOINT=... AGENT_MEMORY_CONTEXT=... AGENT_MEMORY_API_KEY=... \
  ANTHROPIC_API_KEY=your-key bun start
```

## What to look at

- `mastra_observational_memory` table — one row per generation, with
  `activeObservations`, buffered chunks, and extractor payloads
  (`extractedValues`) intact.
- `src/index.ts` — the `Memory({ options: { observationalMemory } })` config
  and the `Extractor` with `onExtracted: agentMemoryExtractedSink(...)`.
