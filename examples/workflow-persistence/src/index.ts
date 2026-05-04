import { Mastra } from '@mastra/core/mastra';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { SurrealDBStore } from '@mastra/surrealdb';
import { z } from 'zod';

const store = new SurrealDBStore({
	id: 'workflow-store',
	url: process.env['SURREALDB_URL'] ?? 'ws://localhost:8000',
	username: process.env['SURREALDB_USER'] ?? 'root',
	password: process.env['SURREALDB_PASS'] ?? 'root',
	namespace: 'mastra',
	database: 'workflow_demo',
});

const collectDataStep = createStep({
	id: 'collect-data',
	description: 'Collects and validates input data',
	inputSchema: z.object({ requestId: z.string() }),
	outputSchema: z.object({
		requestId: z.string(),
		collectedAt: z.string(),
		data: z.record(z.unknown()),
	}),
	execute: async ({ inputData }) => {
		console.log(`[collect-data] Processing request: ${inputData.requestId}`);
		await new Promise((r) => setTimeout(r, 200));
		return {
			requestId: inputData.requestId,
			collectedAt: new Date().toISOString(),
			data: { items: 42, totalValue: 1500 },
		};
	},
});

const waitApprovalStep = createStep({
	id: 'wait-approval',
	description: 'Suspends and waits for a human approval decision',
	inputSchema: z.object({
		requestId: z.string(),
		collectedAt: z.string(),
		data: z.record(z.unknown()),
	}),
	resumeSchema: z.object({ approved: z.boolean(), approver: z.string() }),
	suspendSchema: z.object({ reason: z.string() }),
	outputSchema: z.object({ approved: z.boolean(), approver: z.string() }),
	execute: async ({ inputData, resumeData, suspend }) => {
		if (!resumeData) {
			console.log('[wait-approval] Suspending — awaiting human approval...');
			console.log('[wait-approval] Review data:', inputData.data);
			await suspend({ reason: 'Requires human review before finalizing.' });
			throw new Error('unreachable after suspend');
		}

		console.log(
			`[wait-approval] Resumed by ${resumeData.approver}, approved=${resumeData.approved}`,
		);
		return { approved: resumeData.approved, approver: resumeData.approver };
	},
});

const finalizeStep = createStep({
	id: 'finalize',
	description: 'Finalizes the workflow based on the approval decision',
	inputSchema: z.object({ approved: z.boolean(), approver: z.string() }),
	outputSchema: z.object({ status: z.string(), message: z.string() }),
	execute: async ({ inputData }) => {
		const status = inputData.approved ? 'approved' : 'rejected';
		const message = inputData.approved
			? `Request approved by ${inputData.approver}. Processing complete.`
			: `Request rejected by ${inputData.approver}. No further action.`;
		console.log(`[finalize] ${message}`);
		return { status, message };
	},
});

const mastra = new Mastra({ storage: store });

const approvalWorkflow = createWorkflow({
	id: 'approval-workflow',
	mastra,
	inputSchema: z.object({ requestId: z.string() }),
	outputSchema: z.object({ status: z.string(), message: z.string() }),
	steps: [collectDataStep, waitApprovalStep, finalizeStep],
})
	.then(collectDataStep)
	.then(waitApprovalStep)
	.then(finalizeStep)
	.commit();

async function main() {
	await store.init();

	console.log('Starting workflow run...');
	const run = approvalWorkflow.createRun();
	const { runId } = run;
	console.log(`Run ID: ${runId}`);

	let result = await run.start({ inputData: { requestId: 'req-2026-001' } });

	if (result.status === 'suspended') {
		console.log('Workflow suspended. Snapshot persisted to SurrealDB.');
		await new Promise((r) => setTimeout(r, 1000));

		console.log('Resuming with approval...');
		result = await run.resume({
			step: waitApprovalStep,
			resumeData: { approved: true, approver: 'admin@example.com' },
		});
	}

	console.log('Final status:', result.status);
	if (result.status === 'success') {
		console.log('Output:', result.result);
	}

	const stored = await store.client.queryOne<{
		workflowName: string;
		status: string;
	}>(
		'SELECT workflowName, status FROM mastra_workflow_snapshot WHERE runId = $rid LIMIT 1',
		{ rid: runId },
	);
	console.log('SurrealDB snapshot:', stored);

	await store.close();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
