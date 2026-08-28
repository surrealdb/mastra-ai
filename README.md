# @surrealdb/mastra-ai

SurrealDB storage adapter for [Mastra AI](https://mastra.ai). Covers conversation memory, workflow snapshots, scoring, observability, and native vector search.

## Features

- Conversation memory (threads, messages, working memory)
- Observational Memory — `@mastra/memory`'s observer/reflector compression and memory extractors, backed by SurrealDB
- Workflow suspend/resume with atomic snapshot storage
- Scores and observability spans
- HNSW vector indexes for RAG without a separate vector database

## Requirements

- [SurrealDB v3](https://surrealdb.com/docs/surrealdb/installation)
- Bun >= 1.0 or Node >= 22
- `@mastra/core` >= 1.31.0

## Installation

The 1.0 line is currently in beta and is published under the `beta` dist-tag:

```sh
bun add @surrealdb/mastra-ai@beta
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

## Choosing a memory setup

This package supports three memory configurations. They solve different
problems: Observational Memory manages the *context window* (compressing the
active thread so long sessions don't blow the token budget), while Spectron is
a *context layer* (durable cross-session facts, semantic recall, profile, and
documents, served from the cloud).

| Setup | Use when | Context-window compression | Long-term cross-session memory |
|---|---|---|---|
| `Memory` (`@mastra/memory`) + `SurrealDBStore` | You want Mastra's native memory stack on your own SurrealDB — threads, working memory, Observational Memory, extractors | ✅ Observational Memory | Per-resource working memory; OM resource scope (experimental) |
| `SpectronMemory` | You want hosted fact extraction, semantic recall, and profile with zero memory infrastructure to run | ❌ (verbatim history) | ✅ Spectron |
| `Memory` + `SurrealDBStore` + `spectronExtractedSink` | You want both: OM keeps the active thread lean, and extracted facts land in your Spectron context layer | ✅ Observational Memory | ✅ Spectron (via the sink) |

Notes:

- Observational Memory is a feature of `@mastra/memory`'s `Memory` class; it
  does not apply to `SpectronMemory`.
- OM extractors run on the observer's existing LLM pass (no extra model call);
  Spectron extraction runs server-side and doesn't spend your app's tokens.
  The sink bridges the first into the second.

## Observational Memory & memory extractors

SurrealDB is a supported storage backend for Mastra's
[Observational Memory](https://mastra.ai/docs/memory/observational-memory) —
the observer/reflector system that compresses long message histories into
observations — including
[memory extractors](https://mastra.ai/blog/introducing-memory-extractors),
which pull structured facts out of conversations during observation cycles.
Extracted values persist automatically through the same SurrealDB tables.

Requires `@mastra/memory` >= 1.1.0 (>= 1.22.0 for extractors) in your app:

```ts
import { Extractor, Memory } from '@mastra/memory';
import { SurrealDBStore } from '@surrealdb/mastra-ai';
import { z } from 'zod';

const store = new SurrealDBStore({
  id: 'om-store',
  url: 'ws://localhost:8000',
  username: 'root',
  password: 'root',
});
await store.init();

const memory = new Memory({
  storage: store,
  options: {
    observationalMemory: {
      model: 'anthropic/claude-haiku-4-5',
      observation: {
        extract: [
          new Extractor({
            name: 'User profile',
            instructions: 'Extract stable user profile facts.',
            schema: z.object({
              preferredName: z.string().optional(),
              timezone: z.string().optional(),
            }),
          }),
        ],
      },
    },
  },
});
```

**Bridging extractors to Spectron.** Spectron already performs *server-side*
fact extraction (`remember(..., { infer })`); OM extractors are the
*client-side* alternative. If you use both, `spectronExtractedSink` pipes each
extracted value into Spectron as an `onExtracted` hook. Values are stored as
literal facts (`infer: 'none'`) — extraction already happened client-side, so
Spectron doesn't run inference over them again (pass
`remember: { infer: 'full' }` to re-infer anyway). Failures are swallowed so a
Spectron outage never breaks the observation cycle:

```ts
import { Spectron, spectronExtractedSink } from '@surrealdb/mastra-ai/spectron';

const spectron = new Spectron({ endpoint, context, apiKey });

new Extractor({
  name: 'User profile',
  instructions: 'Extract stable user profile facts.',
  onExtracted: spectronExtractedSink(spectron, {
    remember: { memoryCategory: 'profile' },
  }),
});
```

## Examples

| Example | Description |
|---|---|
| [basic-agent](examples/basic-agent/) | Multi-turn agent conversation with SurrealDB memory |
| [workflow-persistence](examples/workflow-persistence/) | Suspend/resume workflow with snapshot storage |
| [rag-pipeline](examples/rag-pipeline/) | Vector similarity search with SurrealDB HNSW indexes |
| [spectron-memory](examples/spectron-memory/) | Agent memory + tools + RAG backed by the Spectron platform |
| [observational-memory](examples/observational-memory/) | Observational Memory + extractors on SurrealDB, bridged to Spectron |

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
  `UPSERT type::record('documents', $id) CONTENT $data`,
  { id: 'doc-1', data: { content: 'SurrealDB supports vector search.', embedding: [] } },
);

const results = await client.queryAll(
  `SELECT content, vector::distance::cosine(embedding, $qe) AS dist
   FROM documents WHERE embedding <|5|> $qe ORDER BY dist ASC`,
  { qe: [] },
);
```

See [examples/rag-pipeline](examples/rag-pipeline/) for a full working example.

## Spectron memory (Mastra × Spectron)

[Spectron](https://surrealdb.com/platform/spectron) is SurrealDB's hosted memory
platform — it extracts facts, recalls them semantically, and manages documents.
It's a **separate, standalone integration** from the SurrealDB storage adapter
above: Spectron is a hosted *service* (reached over REST with an API key), not a
database you run. This package exposes it through the `@surrealdb/mastra-ai/spectron`
subpath as a Mastra memory provider, a set of agent tools, and RAG helpers.

Install `zod` alongside this package (the Spectron client ships with it):

```sh
bun add zod
```

### `SpectronMemory` provider

`SpectronMemory` works standalone — no database required. Verbatim message
history is kept in-process while Spectron handles fact extraction, semantic
recall, and profile. Every Spectron call is guarded, so a service outage
degrades gracefully to verbatim-only behaviour and never breaks the agent loop.

```ts
import { Agent } from '@mastra/core/agent';
import { anthropic } from '@ai-sdk/anthropic';
import { SpectronMemory } from '@surrealdb/mastra-ai/spectron';

const agent = new Agent({
  name: 'assistant',
  instructions: 'You are a helpful assistant with long-term memory.',
  model: anthropic('claude-sonnet-4-5'),
  memory: new SpectronMemory({
    endpoint: process.env.SPECTRON_ENDPOINT!,
    context: process.env.SPECTRON_CONTEXT!,
    apiKey: process.env.SPECTRON_API_KEY!,
  }),
});
```

**Optional — combine with Mastra × SurrealDB.** Pass a Mastra store as the
durable system-of-record for verbatim threads/messages/working memory; Spectron
then layers on as the intelligence tier. Reuse this package's own adapter:

```ts
import { SurrealDBStore } from '@surrealdb/mastra-ai';

const store = new SurrealDBStore({
  id: 'spectron-demo',
  url: 'ws://localhost:8000',
  username: 'root',
  password: 'root',
});
await store.init();

const memory = new SpectronMemory({
  endpoint: process.env.SPECTRON_ENDPOINT!,
  context: process.env.SPECTRON_CONTEXT!,
  apiKey: process.env.SPECTRON_API_KEY!,
  storage: store, // durable verbatim history; omit to keep it in-process
});
```

### Spectron tools

Let an agent call Spectron explicitly — store, recall, forget, fetch context,
and search documents (RAG):

```ts
import { Spectron } from '@surrealdb/mastra-ai/spectron';
import { createSpectronTools } from '@surrealdb/mastra-ai/spectron';

const client = new Spectron({
  endpoint: process.env.SPECTRON_ENDPOINT!,
  context: process.env.SPECTRON_CONTEXT!,
  apiKey: process.env.SPECTRON_API_KEY!,
});

const agent = new Agent({
  name: 'assistant',
  instructions: 'Use spectronRecall before answering questions about the user.',
  model: anthropic('claude-sonnet-4-5'),
  tools: createSpectronTools(client),
});
```

The toolset is `spectronRemember`, `spectronRecall`, `spectronForget`,
`spectronContext`, and `spectronSearchDocuments`.

### Documents / RAG

```ts
import { ingestDocument, searchDocuments } from '@surrealdb/mastra-ai/spectron';

await ingestDocument(client, { file, title: 'Handbook' });
const results = await searchDocuments(client, { query: 'refund policy', k: 5 });
```

### Limitations

- **Fact cleanup is best-effort.** Deleting a thread or messages removes the
  verbatim rows exactly, but facts Spectron already derived cannot be surgically
  removed by message id.
- **Automatic recall injection needs a query.** `SpectronMemory.recall()` only
  augments with Spectron hits when a `vectorSearchString` is supplied (this is
  decoupled from Mastra's vector-based `semanticRecall`, since Spectron embeds
  server-side). For agent-driven recall, prefer the `spectronRecall` tool.
- **Isolation is soft under a shared API key.** `resourceId` maps to Spectron
  scopes/labels, not a hard tenant boundary; use `client.onBehalfOf(principal)`
  for stronger isolation. One client is pinned to one Spectron `context`.

See [examples/spectron-memory](examples/spectron-memory/) for a full example.

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
| `txBatch(statements, bindings?)` | Run statements in a single `BEGIN`/`COMMIT TRANSACTION` request (SurrealDB v3 has no cross-request transactions) |

## License

Apache-2.0
