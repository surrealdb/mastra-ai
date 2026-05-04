import type { WorkflowRunState } from '@mastra/core/workflows';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SurrealDBClient } from '../client.js';
import { WorkflowsSurrealDB } from '../domains/workflows/index.js';
import { createClient } from './helpers.js';

let client: SurrealDBClient;
let store: WorkflowsSurrealDB;

function makeSnapshot(
	overrides: Partial<WorkflowRunState> = {},
): WorkflowRunState {
	return {
		runId: `run-${Date.now()}`,
		status: 'running',
		value: {},
		context: { input: {} },
		serializedStepGraph: [],
		activePaths: [],
		activeStepsPath: {},
		suspendedPaths: {},
		resumeLabels: {},
		waitingPaths: {},
		timestamp: Date.now(),
		...overrides,
	} as unknown as WorkflowRunState;
}

beforeAll(async () => {
	client = await createClient('test_workflows');
	store = new WorkflowsSurrealDB(client);
	await store.init();
});

afterAll(async () => {
	await client.close();
});

beforeEach(async () => {
	await store.dangerouslyClearAll();
});

describe('persistWorkflowSnapshot / loadWorkflowSnapshot', () => {
	it('persists and loads a snapshot', async () => {
		const snapshot = makeSnapshot();
		await store.persistWorkflowSnapshot({
			workflowName: 'wf-a',
			runId: 'run-001',
			snapshot,
		});
		const loaded = await store.loadWorkflowSnapshot({
			workflowName: 'wf-a',
			runId: 'run-001',
		});
		expect(loaded).not.toBeNull();
		expect((loaded as WorkflowRunState).runId).toBe(snapshot.runId);
	});

	it('returns null for unknown workflow/run', async () => {
		const loaded = await store.loadWorkflowSnapshot({
			workflowName: 'no-wf',
			runId: 'no-run',
		});
		expect(loaded).toBeNull();
	});

	it('upserts on second persist (same workflowName + runId)', async () => {
		await store.persistWorkflowSnapshot({
			workflowName: 'wf-b',
			runId: 'run-002',
			snapshot: makeSnapshot({ status: 'running' }),
		});
		await store.persistWorkflowSnapshot({
			workflowName: 'wf-b',
			runId: 'run-002',
			snapshot: makeSnapshot({ status: 'suspended' }),
		});
		const loaded = await store.loadWorkflowSnapshot({
			workflowName: 'wf-b',
			runId: 'run-002',
		});
		expect((loaded as WorkflowRunState & { status: string }).status).toBe(
			'suspended',
		);
	});
});

describe('getWorkflowRunById', () => {
	it('retrieves a run by runId', async () => {
		await store.persistWorkflowSnapshot({
			workflowName: 'wf-c',
			runId: 'run-003',
			snapshot: makeSnapshot(),
		});
		const run = await store.getWorkflowRunById({ runId: 'run-003' });
		expect(run?.runId).toBe('run-003');
		expect(run?.workflowName).toBe('wf-c');
	});

	it('returns null for unknown runId', async () => {
		const run = await store.getWorkflowRunById({ runId: 'ghost' });
		expect(run).toBeNull();
	});
});

describe('listWorkflowRuns', () => {
	it('lists all runs without filters', async () => {
		await store.persistWorkflowSnapshot({
			workflowName: 'wf-d',
			runId: 'run-004',
			snapshot: makeSnapshot(),
		});
		await store.persistWorkflowSnapshot({
			workflowName: 'wf-d',
			runId: 'run-005',
			snapshot: makeSnapshot(),
		});
		const { runs, total } = await store.listWorkflowRuns({
			workflowName: 'wf-d',
		});
		expect(runs.length).toBe(2);
		expect(total).toBe(2);
	});

	it('filters by workflowName', async () => {
		await store.persistWorkflowSnapshot({
			workflowName: 'wf-x',
			runId: 'run-x1',
			snapshot: makeSnapshot(),
		});
		await store.persistWorkflowSnapshot({
			workflowName: 'wf-y',
			runId: 'run-y1',
			snapshot: makeSnapshot(),
		});
		const { runs } = await store.listWorkflowRuns({ workflowName: 'wf-x' });
		expect(runs.every((r) => r.workflowName === 'wf-x')).toBe(true);
	});
});

describe('deleteWorkflowRunById', () => {
	it('deletes a run', async () => {
		await store.persistWorkflowSnapshot({
			workflowName: 'wf-e',
			runId: 'run-006',
			snapshot: makeSnapshot(),
		});
		await store.deleteWorkflowRunById({
			workflowName: 'wf-e',
			runId: 'run-006',
		});
		const run = await store.getWorkflowRunById({ runId: 'run-006' });
		expect(run).toBeNull();
	});
});

describe('supportsConcurrentUpdates', () => {
	it('returns true', () => {
		expect(store.supportsConcurrentUpdates()).toBe(true);
	});
});
