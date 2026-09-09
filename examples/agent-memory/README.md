# agent-memory

Standalone **Mastra × Agent Memory**: agent memory, explicit memory tools, and
document RAG backed by SurrealDB's
[Agent Memory](https://surrealdb.com/agent-memory) platform via
`@surrealdb/mastra-ai/agent-memory`. No database to run — Agent Memory is a hosted service.

## What it does

- Uses `AgentMemory` as the agent's memory provider (no external store —
  verbatim history is in-process, facts persist in Agent Memory).
- Registers `createAgentMemoryTools(...)` so the model can explicitly remember,
  recall, forget, fetch context, and search documents.
- Runs a document search against the Agent Memory corpus.

> Want durable verbatim history too? Pass `storage: new SurrealDBStore({...})`
> to `AgentMemory` — that combines Mastra × Agent Memory with Mastra × SurrealDB.

## Prerequisites

- An Agent Memory endpoint, context and API key
- An Anthropic API key

## Run

```sh
bun install
AGENT_MEMORY_ENDPOINT=https://... \
AGENT_MEMORY_CONTEXT=your-context \
AGENT_MEMORY_API_KEY=sp-... \
ANTHROPIC_API_KEY=your-key \
bun start
```
