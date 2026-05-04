# @surrealdb/mastra-ai

SurrealDB storage adapter for [Mastra AI](https://mastra.ai). Covers conversation memory, workflow snapshots, scoring, observability, and native vector search.

## Features

- Conversation memory (threads, messages, working memory)
- Workflow suspend/resume with atomic snapshot storage
- Scores and observability spans
- HNSW vector indexes for RAG without a separate vector database

## Requirements

- [SurrealDB v3](https://surrealdb.com/docs/surrealdb/installation)
- Bun >= 1.0 or Node >= 22
- `@mastra/core` >= 1.31.0

## Installation

```sh
bun add @surrealdb/mastra-ai
```

## Start SurrealDB

```sh
surreal start --user root --pass root memory
```

## Quick start

```ts
import { Mastra } from '@mastra/core/mastra';
import { Agent } from '@mastra/core/agent';
import { anthropic } from '@ai-sdk/anthropic';
import { SurrealDBStore } from '@surrealdb/mastra-ai';

const store = new SurrealDBStore({
  id: 'my-store',
  url: 'ws://localhost:8000',
  username: 'root',
  password: 'root',
  namespace: 'mastra',
  database: 'my_app',
});

const agent = new Agent({
  name: 'assistant',
  instructions: 'You are a helpful assistant.',
  model: anthropic('claude-sonnet-4-6'),
});

const mastra = new Mastra({
  agents: { assistant: agent },
  storage: store,
});

await store.init();

const response = await mastra.getAgent('assistant').generate('Hello!', {
  resourceId: 'user-001',
  threadId: 'thread-001',
});

console.log(response.text);
await store.close();
```

## Configuration

`SurrealDBStore` accepts three config shapes.

**Username + password:**

```ts
new SurrealDBStore({
  id: 'my-store',
  url: 'ws://localhost:8000',
  username: 'root',
  password: 'root',
  namespace: 'mastra',   // optional, defaults to 'mastra'
  database: 'my_app',    // optional, defaults to 'mastra'
});
```

**Token auth:**

```ts
new SurrealDBStore({
  id: 'my-store',
  url: 'wss://cloud.surrealdb.com',
  token: 'your-jwt-token',
  namespace: 'mastra',
  database: 'my_app',
});
```

**Pre-connected instance:**

```ts
import { Surreal } from 'surrealdb';

const db = new Surreal();
await db.connect('ws://localhost:8000', { /* ... */ });

new SurrealDBStore({ id: 'my-store', db });
```

## Workflow suspend/resume

```ts
import { Mastra } from '@mastra/core/mastra';
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { SurrealDBStore } from '@surrealdb/mastra-ai';
import { z } from 'zod';

const store = new SurrealDBStore({ id: 'store', url: 'ws://localhost:8000', username: 'root', password: 'root' });
const mastra = new Mastra({ storage: store });

const approveStep = createStep({
  id: 'approve',
  inputSchema: z.object({ value: z.number() }),
  resumeSchema: z.object({ approved: z.boolean() }),
  outputSchema: z.object({ approved: z.boolean() }),
  execute: async ({ inputData, resumeData, suspend }) => {
    if (!resumeData) {
      await suspend({});
    }
    return { approved: resumeData!.approved };
  },
});

const workflow = createWorkflow({
  id: 'approval',
  mastra,
  inputSchema: z.object({ value: z.number() }),
  outputSchema: z.object({ approved: z.boolean() }),
  steps: [approveStep],
}).then(approveStep).commit();

await store.init();

const run = workflow.createRun();
await run.start({ inputData: { value: 42 } });

await run.resume({
  step: approveStep,
  resumeData: { approved: true },
});

await store.close();
```

## Examples

| Example | Description |
|---|---|
| [basic-agent](examples/basic-agent/) | Multi-turn agent conversation with SurrealDB memory |
| [workflow-persistence](examples/workflow-persistence/) | Suspend/resume workflow with snapshot storage |
| [rag-pipeline](examples/rag-pipeline/) | Vector similarity search with SurrealDB HNSW indexes |

To run an example:

```sh
cd examples/basic-agent
bun install
ANTHROPIC_API_KEY=your-key bun start
```

## Vector search

SurrealDB v3 includes native HNSW vector indexes. You can use `SurrealDBClient` directly for RAG:

```ts
import { SurrealDBClient } from '@surrealdb/mastra-ai';

const SCHEMA = `
DEFINE TABLE IF NOT EXISTS documents SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS content   ON documents TYPE string;
DEFINE FIELD IF NOT EXISTS embedding ON documents TYPE array<float>;
DEFINE INDEX IF NOT EXISTS idx_hnsw
  ON documents FIELDS embedding HNSW DIMENSION 1536 DIST COSINE;
`;

const client = new SurrealDBClient({ id: 'rag', url: 'ws://localhost:8000', username: 'root', password: 'root' });
await client.connect();
await client.execute(SCHEMA);

await client.execute(
  `UPSERT type::thing('documents', $id) CONTENT $data`,
  { id: 'doc-1', data: { content: 'SurrealDB supports vector search.', embedding: [] } },
);

const results = await client.queryAll(
  `SELECT content, vector::distance::cosine(embedding, $qe) AS dist
   FROM documents WHERE embedding <|5|> $qe ORDER BY dist ASC`,
  { qe: [] },
);
```

See [examples/rag-pipeline](examples/rag-pipeline/) for a full working example.

## API

### `SurrealDBStore`

| Method | Description |
|---|---|
| `init()` | Connect and apply all table schemas |
| `close()` | Disconnect |
| `client` | The underlying `SurrealDBClient` for raw queries |
| `stores` | Individual domain stores (`memory`, `workflows`, `scores`, `observability`) |

### `SurrealDBClient`

| Method | Description |
|---|---|
| `connect(config?)` | Open the WebSocket connection |
| `close()` | Disconnect |
| `queryAll<T>(surql, bindings?)` | Run a query, return all rows |
| `queryOne<T>(surql, bindings?)` | Run a query, return first row or `null` |
| `execute(surql, bindings?)` | Run a statement, no return value |
| `tx<T>(fn)` | Run `fn` inside `BEGIN`/`COMMIT TRANSACTION`, cancels on error |

## License

Apache-2.0
