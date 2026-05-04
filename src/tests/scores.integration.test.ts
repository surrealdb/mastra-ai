import type { SaveScorePayload } from '@mastra/core/evals';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SurrealDBClient } from '../client.js';
import { ScoresSurrealDB } from '../domains/scores/index.js';
import { createClient } from './helpers.js';

let client: SurrealDBClient;
let store: ScoresSurrealDB;

const pagination = { page: 0, perPage: 20 as number };

function makeScore(
	overrides: Partial<SaveScorePayload> = {},
): SaveScorePayload {
	return {
		runId: `run-${Date.now()}`,
		scorerId: 'scorer-001',
		entityId: 'entity-001',
		score: 0.85,
		source: 'TEST',
		output: 'test output',
		scorer: { name: 'test-scorer' },
		entity: { id: 'entity-001' },
		...overrides,
	} as SaveScorePayload;
}

beforeAll(async () => {
	client = await createClient('test_scores');
	store = new ScoresSurrealDB(client);
	await store.init();
});

afterAll(async () => {
	await client.close();
});

beforeEach(async () => {
	await store.dangerouslyClearAll();
});

describe('saveScore / getScoreById', () => {
	it('saves and retrieves a score', async () => {
		const { score } = await store.saveScore(makeScore());
		const found = await store.getScoreById({ id: score.id });
		expect(found?.id).toBe(score.id);
		expect((found as unknown as { score: number })?.score).toBe(0.85);
	});

	it('returns null for unknown id', async () => {
		const found = await store.getScoreById({ id: 'no-such-score' });
		expect(found).toBeNull();
	});
});

describe('listScoresByScorerId', () => {
	it('lists scores for a scorer', async () => {
		await store.saveScore(makeScore({ scorerId: 'scorer-A' }));
		await store.saveScore(makeScore({ scorerId: 'scorer-A' }));
		await store.saveScore(makeScore({ scorerId: 'scorer-B' }));

		const { scores } = await store.listScoresByScorerId({
			scorerId: 'scorer-A',
			pagination,
		});
		expect(scores.length).toBe(2);
	});
});

describe('listScoresByEntityId', () => {
	it('lists scores for an entity', async () => {
		await store.saveScore(
			makeScore({ entityId: 'ent-1', entityType: 'agent' }),
		);
		await store.saveScore(
			makeScore({ entityId: 'ent-2', entityType: 'agent' }),
		);

		const { scores } = await store.listScoresByEntityId({
			entityId: 'ent-1',
			entityType: 'agent',
			pagination,
		});
		expect(scores.length).toBe(1);
	});
});

describe('listScoresByRunId', () => {
	it('lists scores for a run', async () => {
		await store.saveScore(makeScore({ runId: 'run-abc' }));
		await store.saveScore(makeScore({ runId: 'run-abc' }));
		await store.saveScore(makeScore({ runId: 'run-xyz' }));

		const { scores } = await store.listScoresByRunId({
			runId: 'run-abc',
			pagination,
		});
		expect(scores.length).toBe(2);
	});
});
