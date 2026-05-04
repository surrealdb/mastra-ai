# basic-agent

Multi-turn agent conversation with conversation history persisted in SurrealDB.

## What it does

Runs a three-turn dialogue with a Mastra agent. Each message and thread is stored in SurrealDB via `@surrealdb/mastra-ai`, so history survives process restarts.

## Prerequisites

- SurrealDB v3 running locally (or set `SURREALDB_URL`)
- Anthropic API key (set `ANTHROPIC_API_KEY`)

```sh
docker compose -f ../../packages/surrealdb/docker-compose.yml up -d
```

## Run

```sh
pnpm install
pnpm start
```

## Environment variables

| Variable         | Default                  | Description              |
| ---------------- | ------------------------ | ------------------------ |
| `SURREALDB_URL`  | `ws://localhost:8000`    | SurrealDB WebSocket URL  |
| `SURREALDB_USER` | `root`                   | SurrealDB username       |
| `SURREALDB_PASS` | `root`                   | SurrealDB password       |
| `ANTHROPIC_API_KEY` | —                     | Required for the agent model |

## Inspect stored data

```sh
surreal sql --endpoint ws://localhost:8000 --username root --password root \
  --namespace mastra --database basic_agent \
  "SELECT * FROM mastra_threads; SELECT * FROM mastra_messages;"
```
