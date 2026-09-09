# agent-memory

Standalone **Mastra × AgentMemory**: agent memory, explicit memory tools, and
document RAG backed by SurrealDB's
[AgentMemory](https://surrealdb.com/platform/agentMemory) platform via
`@surrealdb/mastra-ai/agentMemory`. No database to run — AgentMemory is a hosted service.

## What it does

- Uses `AgentMemoryMemory` as the agent's memory provider (no external store —
  verbatim history is in-process, facts persist in AgentMemory).
- Registers `createAgentMemoryTools(...)` so the model can explicitly remember,
  recall, forget, fetch context, and search documents.
- Runs a document search against the AgentMemory corpus.

> Want durable verbatim history too? Pass `storage: new SurrealDBStore({...})`
> to `AgentMemoryMemory` — that combines Mastra × AgentMemory with Mastra × SurrealDB.

## Prerequisites

- A AgentMemory endpoint, context and API key
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
