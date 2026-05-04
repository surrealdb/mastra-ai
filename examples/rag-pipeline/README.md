# rag-pipeline

Vector similarity search using SurrealDB v3 HNSW indexes and Anthropic embeddings.

## What it does

Embeds five documents with the `voyage-3-lite` model, stores them in SurrealDB with an HNSW index (cosine distance, 512 dimensions), then runs two similarity queries and prints the top-2 results for each.

This example uses the SurrealDB SDK directly — no Mastra storage layer — to demonstrate SurrealDB's native vector capabilities.

## Prerequisites

- SurrealDB v3 running locally (or set `SURREALDB_URL`)
- Anthropic API key (set `ANTHROPIC_API_KEY`) — used for the `voyage-3-lite` embedding model

```sh
docker compose -f ../../packages/surrealdb/docker-compose.yml up -d
```

## Run

```sh
pnpm install
pnpm start
```

## Environment variables

| Variable            | Default               | Description                              |
| ------------------- | --------------------- | ---------------------------------------- |
| `SURREALDB_URL`     | `ws://localhost:8000` | SurrealDB WebSocket URL                  |
| `SURREALDB_USER`    | `root`                | SurrealDB username                       |
| `SURREALDB_PASS`    | `root`                | SurrealDB password                       |
| `ANTHROPIC_API_KEY` | —                     | Required for voyage-3-lite embeddings    |

## Inspect stored vectors

```sh
surreal sql --endpoint ws://localhost:8000 --username root --password root \
  --namespace mastra --database rag_demo \
  "SELECT id, content, metadata FROM mastra_documents;"
```
