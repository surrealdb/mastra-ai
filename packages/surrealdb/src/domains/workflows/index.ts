import { WorkflowsStorage } from '@mastra/core/storage';
import type {
  WorkflowRun,
  WorkflowRuns,
  StorageListWorkflowRunsInput,
  UpdateWorkflowStateOptions,
} from '@mastra/core/storage';
import type { StepResult, WorkflowRunState } from '@mastra/core/workflows';
import { SurrealDBClient } from '../../client.js';
import { getWorkflowsSchema } from '../../schema/index.js';

type RawWorkflowRun = {
  id: string;
  workflowName: string;
  runId: string;
  resourceId?: string | null;
  snapshot: WorkflowRunState | string;
  status?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

function parseDate(d: string | Date): Date {
  return d instanceof Date ? d : new Date(d);
}

function parseRun(r: RawWorkflowRun): WorkflowRun {
  return {
    workflowName: r.workflowName,
    runId: r.runId,
    resourceId: r.resourceId ?? undefined,
    snapshot: r.snapshot,
    createdAt: parseDate(r.createdAt),
    updatedAt: parseDate(r.updatedAt),
  };
}

function compositeId(workflowName: string, runId: string): string {
  return `${workflowName}__${runId}`;
}

export class WorkflowsSurrealDB extends WorkflowsStorage {
  constructor(private readonly client: SurrealDBClient) {
    super();
  }

  async init(): Promise<void> {
    const schema = getWorkflowsSchema();
    await this.client.execute(schema);
  }

  async dangerouslyClearAll(): Promise<void> {
    await this.client.execute('DELETE mastra_workflow_snapshot');
  }

  supportsConcurrentUpdates(): boolean {
    return true;
  }

  async persistWorkflowSnapshot({
    workflowName,
    runId,
    resourceId,
    snapshot,
    createdAt,
    updatedAt,
  }: {
    workflowName: string;
    runId: string;
    resourceId?: string;
    snapshot: WorkflowRunState;
    createdAt?: Date;
    updatedAt?: Date;
  }): Promise<void> {
    const now = new Date();
    const id = compositeId(workflowName, runId);
    const data = {
      id,
      workflowName,
      runId,
      resourceId: resourceId ?? null,
      snapshot,
      status: (snapshot as WorkflowRunState & { status?: string }).status ?? null,
      createdAt: createdAt ?? now,
      updatedAt: updatedAt ?? now,
    };
    await this.client.execute(
      `UPSERT type::thing('mastra_workflow_snapshot', $id) CONTENT $data`,
      { id, data },
    );
  }

  async loadWorkflowSnapshot({
    workflowName,
    runId,
  }: {
    workflowName: string;
    runId: string;
  }): Promise<WorkflowRunState | null> {
    const row = await this.client.queryOne<{ snapshot: WorkflowRunState }>(
      'SELECT snapshot FROM mastra_workflow_snapshot WHERE workflowName = $wn AND runId = $rid LIMIT 1',
      { wn: workflowName, rid: runId },
    );
    return row?.snapshot ?? null;
  }

  async updateWorkflowResults({
    workflowName,
    runId,
    stepId,
    result,
    requestContext,
  }: {
    workflowName: string;
    runId: string;
    stepId: string;
    result: StepResult<unknown, unknown, unknown, unknown>;
    requestContext: Record<string, unknown>;
  }): Promise<Record<string, StepResult<unknown, unknown, unknown, unknown>>> {
    const current = await this.loadWorkflowSnapshot({ workflowName, runId });
    if (!current) throw new Error(`Workflow snapshot not found: ${workflowName}/${runId}`);

    const updatedResults = {
      ...((current as WorkflowRunState & { results?: Record<string, unknown> }).results ?? {}),
      [stepId]: result,
    };

    await this.client.execute(
      `UPDATE mastra_workflow_snapshot
       SET snapshot.results = $results,
           snapshot.requestContext = $ctx,
           updatedAt = $now
       WHERE workflowName = $wn AND runId = $rid`,
      {
        wn: workflowName,
        rid: runId,
        results: updatedResults,
        ctx: requestContext,
        now: new Date(),
      },
    );

    return updatedResults as Record<string, StepResult<unknown, unknown, unknown, unknown>>;
  }

  async updateWorkflowState({
    workflowName,
    runId,
    opts,
  }: {
    workflowName: string;
    runId: string;
    opts: UpdateWorkflowStateOptions;
  }): Promise<WorkflowRunState | undefined> {
    const current = await this.loadWorkflowSnapshot({ workflowName, runId });
    if (!current) return undefined;

    const merged: WorkflowRunState = {
      ...current,
      status: opts.status,
      ...(opts.result !== undefined ? { result: opts.result } : {}),
      ...(opts.error !== undefined ? { error: opts.error } : {}),
      ...(opts.suspendedPaths !== undefined ? { suspendedPaths: opts.suspendedPaths } : {}),
      ...(opts.waitingPaths !== undefined ? { waitingPaths: opts.waitingPaths } : {}),
    };

    await this.persistWorkflowSnapshot({
      workflowName,
      runId,
      snapshot: merged,
      updatedAt: new Date(),
    });

    return merged;
  }

  async getWorkflowRunById({
    runId,
    workflowName,
  }: {
    runId: string;
    workflowName?: string;
  }): Promise<WorkflowRun | null> {
    let surql: string;
    const bindings: Record<string, unknown> = { runId };

    if (workflowName) {
      surql = 'SELECT * FROM mastra_workflow_snapshot WHERE runId = $runId AND workflowName = $wn LIMIT 1';
      bindings['wn'] = workflowName;
    } else {
      surql = 'SELECT * FROM mastra_workflow_snapshot WHERE runId = $runId LIMIT 1';
    }

    const row = await this.client.queryOne<RawWorkflowRun>(surql, bindings);
    return row ? parseRun(row) : null;
  }

  async deleteWorkflowRunById({
    runId,
    workflowName,
  }: {
    runId: string;
    workflowName: string;
  }): Promise<void> {
    await this.client.execute(
      'DELETE mastra_workflow_snapshot WHERE workflowName = $wn AND runId = $rid',
      { wn: workflowName, rid: runId },
    );
  }

  async listWorkflowRuns(args: StorageListWorkflowRunsInput = {}): Promise<WorkflowRuns> {
    const { workflowName, fromDate, toDate, perPage, page = 0, resourceId, status } = args;

    const whereParts: string[] = [];
    const bindings: Record<string, unknown> = {};

    if (workflowName) {
      whereParts.push('workflowName = $wn');
      bindings['wn'] = workflowName;
    }
    if (resourceId) {
      whereParts.push('resourceId = $resourceId');
      bindings['resourceId'] = resourceId;
    }
    if (status) {
      whereParts.push('status = $status');
      bindings['status'] = status;
    }
    if (fromDate) {
      whereParts.push('createdAt >= $fromDate');
      bindings['fromDate'] = fromDate;
    }
    if (toDate) {
      whereParts.push('createdAt <= $toDate');
      bindings['toDate'] = toDate;
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    const paginate = perPage !== undefined && page !== undefined;
    const normalizedPerPage = perPage === false ? Number.MAX_SAFE_INTEGER : (perPage ?? Number.MAX_SAFE_INTEGER);
    const offset = paginate ? page * normalizedPerPage : 0;

    const limitClause = paginate ? `LIMIT ${normalizedPerPage} START ${offset}` : '';

    const [rows, countRows] = await Promise.all([
      this.client.queryAll<RawWorkflowRun>(
        `SELECT * FROM mastra_workflow_snapshot ${whereClause} ORDER BY createdAt DESC ${limitClause}`,
        bindings,
      ),
      this.client.queryAll<{ count: number }>(
        `SELECT count() AS count FROM mastra_workflow_snapshot ${whereClause} GROUP ALL`,
        bindings,
      ),
    ]);

    return {
      runs: rows.map(parseRun),
      total: countRows[0]?.count ?? 0,
    };
  }
}
