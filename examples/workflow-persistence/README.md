# workflow-persistence

Mastra workflow with suspend/resume, backed by SurrealDB snapshot storage.

## What it does

Runs a three-step approval workflow:

1. **collect-data** — gathers input and simulates processing
2. **wait-approval** — suspends, persisting state to SurrealDB
3. **finalize** — completes after the workflow is resumed with an approval decision

The example suspends the workflow, waits one second (simulating an out-of-band approval), then resumes it programmatically. The final snapshot is read back from SurrealDB to confirm persistence.

## Prerequisites

- SurrealDB v3 running locally (or set `SURREALDB_URL`)

```sh
docker compose -f ../../packages/surrealdb/docker-compose.yml up -d
```

## Run

```sh
pnpm install
pnpm start
```

## Environment variables

| Variable         | Default               | Description             |
| ---------------- | --------------------- | ----------------------- |
| `SURREALDB_URL`  | `ws://localhost:8000` | SurrealDB WebSocket URL |
| `SURREALDB_USER` | `root`                | SurrealDB username      |
| `SURREALDB_PASS` | `root`                | SurrealDB password      |

## Inspect stored snapshots

```sh
surreal sql --endpoint ws://localhost:8000 --username root --password root \
  --namespace mastra --database workflow_demo \
  "SELECT workflowName, runId, status FROM mastra_workflow_snapshot;"
```
