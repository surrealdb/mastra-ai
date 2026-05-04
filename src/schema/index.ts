export const MEMORY_SCHEMA = `
DEFINE TABLE IF NOT EXISTS mastra_threads SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS id          ON mastra_threads TYPE string;
DEFINE FIELD IF NOT EXISTS resourceId  ON mastra_threads TYPE string;
DEFINE FIELD IF NOT EXISTS title       ON mastra_threads TYPE option<string>;
DEFINE FIELD IF NOT EXISTS metadata    ON mastra_threads FLEXIBLE TYPE option<object>;
DEFINE FIELD IF NOT EXISTS createdAt   ON mastra_threads TYPE datetime;
DEFINE FIELD IF NOT EXISTS updatedAt   ON mastra_threads TYPE datetime;
DEFINE INDEX IF NOT EXISTS idx_threads_resource  ON mastra_threads FIELDS resourceId;
DEFINE INDEX IF NOT EXISTS idx_threads_created   ON mastra_threads FIELDS createdAt;

DEFINE TABLE IF NOT EXISTS mastra_messages SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS id          ON mastra_messages TYPE string;
DEFINE FIELD IF NOT EXISTS threadId    ON mastra_messages TYPE string;
DEFINE FIELD IF NOT EXISTS resourceId  ON mastra_messages TYPE option<string>;
DEFINE FIELD IF NOT EXISTS role        ON mastra_messages TYPE string;
DEFINE FIELD IF NOT EXISTS type        ON mastra_messages TYPE option<string>;
DEFINE FIELD IF NOT EXISTS content     ON mastra_messages FLEXIBLE TYPE object;
DEFINE FIELD IF NOT EXISTS createdAt   ON mastra_messages TYPE datetime;
DEFINE INDEX IF NOT EXISTS idx_messages_thread   ON mastra_messages FIELDS threadId, createdAt;
DEFINE INDEX IF NOT EXISTS idx_messages_resource ON mastra_messages FIELDS resourceId;
DEFINE INDEX IF NOT EXISTS idx_messages_ids      ON mastra_messages FIELDS id;

DEFINE TABLE IF NOT EXISTS mastra_resources SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS id            ON mastra_resources TYPE string;
DEFINE FIELD IF NOT EXISTS workingMemory ON mastra_resources TYPE option<string>;
DEFINE FIELD IF NOT EXISTS metadata      ON mastra_resources FLEXIBLE TYPE option<object>;
DEFINE FIELD IF NOT EXISTS createdAt     ON mastra_resources TYPE datetime;
DEFINE FIELD IF NOT EXISTS updatedAt     ON mastra_resources TYPE datetime;
`;

export const WORKFLOWS_SCHEMA = `
DEFINE TABLE IF NOT EXISTS mastra_workflow_snapshot SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS id           ON mastra_workflow_snapshot TYPE string;
DEFINE FIELD IF NOT EXISTS workflowName ON mastra_workflow_snapshot TYPE string;
DEFINE FIELD IF NOT EXISTS runId        ON mastra_workflow_snapshot TYPE string;
DEFINE FIELD IF NOT EXISTS resourceId   ON mastra_workflow_snapshot TYPE option<string>;
DEFINE FIELD IF NOT EXISTS snapshot     ON mastra_workflow_snapshot FLEXIBLE TYPE object;
DEFINE FIELD IF NOT EXISTS status       ON mastra_workflow_snapshot TYPE option<string>;
DEFINE FIELD IF NOT EXISTS createdAt    ON mastra_workflow_snapshot TYPE datetime;
DEFINE FIELD IF NOT EXISTS updatedAt    ON mastra_workflow_snapshot TYPE datetime;
DEFINE INDEX IF NOT EXISTS idx_workflow_snapshot_unique ON mastra_workflow_snapshot FIELDS workflowName, runId UNIQUE;
DEFINE INDEX IF NOT EXISTS idx_workflow_name            ON mastra_workflow_snapshot FIELDS workflowName;
DEFINE INDEX IF NOT EXISTS idx_workflow_status          ON mastra_workflow_snapshot FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_workflow_run_id          ON mastra_workflow_snapshot FIELDS runId;
DEFINE INDEX IF NOT EXISTS idx_workflow_created         ON mastra_workflow_snapshot FIELDS createdAt;
`;

export const SCORES_SCHEMA = `
DEFINE TABLE IF NOT EXISTS mastra_scorers SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS id         ON mastra_scorers TYPE string;
DEFINE FIELD IF NOT EXISTS scorerId   ON mastra_scorers TYPE string;
DEFINE FIELD IF NOT EXISTS runId      ON mastra_scorers TYPE option<string>;
DEFINE FIELD IF NOT EXISTS entityId   ON mastra_scorers TYPE option<string>;
DEFINE FIELD IF NOT EXISTS entityType ON mastra_scorers TYPE option<string>;
DEFINE FIELD IF NOT EXISTS traceId    ON mastra_scorers TYPE option<string>;
DEFINE FIELD IF NOT EXISTS spanId     ON mastra_scorers TYPE option<string>;
DEFINE FIELD IF NOT EXISTS score      ON mastra_scorers TYPE float;
DEFINE FIELD IF NOT EXISTS source     ON mastra_scorers TYPE option<string>;
DEFINE FIELD IF NOT EXISTS metadata   ON mastra_scorers FLEXIBLE TYPE option<object>;
DEFINE FIELD IF NOT EXISTS createdAt  ON mastra_scorers TYPE datetime;
DEFINE INDEX IF NOT EXISTS idx_scorers_scorer  ON mastra_scorers FIELDS scorerId;
DEFINE INDEX IF NOT EXISTS idx_scorers_run     ON mastra_scorers FIELDS runId;
DEFINE INDEX IF NOT EXISTS idx_scorers_entity  ON mastra_scorers FIELDS entityId, entityType;
DEFINE INDEX IF NOT EXISTS idx_scorers_span    ON mastra_scorers FIELDS traceId, spanId;
`;

export const OBSERVABILITY_SCHEMA = `
DEFINE TABLE IF NOT EXISTS mastra_ai_spans SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS spanId       ON mastra_ai_spans TYPE string;
DEFINE FIELD IF NOT EXISTS traceId      ON mastra_ai_spans TYPE string;
DEFINE FIELD IF NOT EXISTS parentSpanId ON mastra_ai_spans TYPE option<string>;
DEFINE FIELD IF NOT EXISTS name         ON mastra_ai_spans TYPE string;
DEFINE FIELD IF NOT EXISTS spanType     ON mastra_ai_spans TYPE option<string>;
DEFINE FIELD IF NOT EXISTS isEvent      ON mastra_ai_spans TYPE bool DEFAULT false;
DEFINE FIELD IF NOT EXISTS startedAt    ON mastra_ai_spans TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS endedAt      ON mastra_ai_spans TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS input        ON mastra_ai_spans FLEXIBLE TYPE option<object>;
DEFINE FIELD IF NOT EXISTS output       ON mastra_ai_spans FLEXIBLE TYPE option<object>;
DEFINE FIELD IF NOT EXISTS attributes   ON mastra_ai_spans FLEXIBLE TYPE option<object>;
DEFINE FIELD IF NOT EXISTS metadata     ON mastra_ai_spans FLEXIBLE TYPE option<object>;
DEFINE FIELD IF NOT EXISTS tags         ON mastra_ai_spans FLEXIBLE TYPE option<object>;
DEFINE FIELD IF NOT EXISTS links        ON mastra_ai_spans TYPE option<array<object>>;
DEFINE FIELD IF NOT EXISTS status       ON mastra_ai_spans TYPE option<string>;
DEFINE FIELD IF NOT EXISTS error        ON mastra_ai_spans FLEXIBLE TYPE option<object>;
DEFINE FIELD IF NOT EXISTS runId        ON mastra_ai_spans TYPE option<string>;
DEFINE FIELD IF NOT EXISTS threadId     ON mastra_ai_spans TYPE option<string>;
DEFINE FIELD IF NOT EXISTS resourceId   ON mastra_ai_spans TYPE option<string>;
DEFINE FIELD IF NOT EXISTS entityId     ON mastra_ai_spans TYPE option<string>;
DEFINE FIELD IF NOT EXISTS entityType   ON mastra_ai_spans TYPE option<string>;
DEFINE FIELD IF NOT EXISTS userId       ON mastra_ai_spans TYPE option<string>;
DEFINE FIELD IF NOT EXISTS sessionId    ON mastra_ai_spans TYPE option<string>;
DEFINE FIELD IF NOT EXISTS environment  ON mastra_ai_spans TYPE option<string>;
DEFINE FIELD IF NOT EXISTS serviceName  ON mastra_ai_spans TYPE option<string>;
DEFINE FIELD IF NOT EXISTS scope        ON mastra_ai_spans FLEXIBLE TYPE option<object>;
DEFINE FIELD IF NOT EXISTS createdAt    ON mastra_ai_spans TYPE datetime;
DEFINE FIELD IF NOT EXISTS updatedAt    ON mastra_ai_spans TYPE datetime;
DEFINE INDEX IF NOT EXISTS idx_spans_pk     ON mastra_ai_spans FIELDS traceId, spanId UNIQUE;
DEFINE INDEX IF NOT EXISTS idx_spans_trace  ON mastra_ai_spans FIELDS traceId;
DEFINE INDEX IF NOT EXISTS idx_spans_parent ON mastra_ai_spans FIELDS parentSpanId;
DEFINE INDEX IF NOT EXISTS idx_spans_entity ON mastra_ai_spans FIELDS entityId, entityType;
DEFINE INDEX IF NOT EXISTS idx_spans_run    ON mastra_ai_spans FIELDS runId;
`;

export function getMemorySchema(): string {
	return MEMORY_SCHEMA;
}

export function getWorkflowsSchema(): string {
	return WORKFLOWS_SCHEMA;
}

export function getScoresSchema(): string {
	return SCORES_SCHEMA;
}

export function getObservabilitySchema(): string {
	return OBSERVABILITY_SCHEMA;
}

export function exportSchemas(): Record<string, string> {
	return {
		memory: MEMORY_SCHEMA,
		workflows: WORKFLOWS_SCHEMA,
		scores: SCORES_SCHEMA,
		observability: OBSERVABILITY_SCHEMA,
	};
}
