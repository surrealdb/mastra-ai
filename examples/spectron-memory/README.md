# spectron-memory

Standalone **Mastra × Spectron**: agent memory, explicit memory tools, and
document RAG backed by SurrealDB's
[Spectron](https://surrealdb.com/platform/spectron) platform via
`@surrealdb/mastra-ai/spectron`. No database to run — Spectron is a hosted service.

## What it does

- Uses `SpectronMemory` as the agent's memory provider (no external store —
  verbatim history is in-process, facts persist in Spectron).
- Registers `createSpectronTools(...)` so the model can explicitly remember,
  recall, forget, fetch context, and search documents.
- Runs a document search against the Spectron corpus.

> Want durable verbatim history too? Pass `storage: new SurrealDBStore({...})`
> to `SpectronMemory` — that combines Mastra × Spectron with Mastra × SurrealDB.

## Prerequisites

- A Spectron endpoint, context and API key
- An Anthropic API key

## Run

```sh
bun install
SPECTRON_ENDPOINT=https://... \
SPECTRON_CONTEXT=your-context \
SPECTRON_API_KEY=sp-... \
ANTHROPIC_API_KEY=your-key \
bun start
```
