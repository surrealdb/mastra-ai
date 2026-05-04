import type {
	BatchCreateSpansArgs,
	CreateSpanArgs,
} from '@mastra/core/storage';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SurrealDBClient } from '../client.js';
import { ObservabilitySurrealDB } from '../domains/observability/index.js';
import { createClient } from './helpers.js';

let client: SurrealDBClient;
let store: ObservabilitySurrealDB;

function makeSpanArgs(traceId: string, spanId: string): CreateSpanArgs {
	return {
		span: {
			traceId,
			spanId,
			name: 'test-span',
			createdAt: new Date(),
			updatedAt: null,
		},
	} as unknown as CreateSpanArgs;
}

beforeAll(async () => {
	client = await createClient('test_observability');
	store = new ObservabilitySurrealDB(client);
	await store.init();
});

afterAll(async () => {
	await client.close();
});

beforeEach(async () => {
	await store.dangerouslyClearAll();
});

describe('tracingStrategy', () => {
	it('prefers insert-only', () => {
		expect(store.tracingStrategy.preferred).toBe('insert-only');
		expect(store.tracingStrategy.supported).toContain('insert-only');
	});
});

describe('createSpan / getSpan', () => {
	it('creates and retrieves a span', async () => {
		await store.createSpan(makeSpanArgs('trace-001', 'span-001'));
		const result = await store.getSpan({
			traceId: 'trace-001',
			spanId: 'span-001',
		});
		expect(result?.span).toBeDefined();
		expect((result?.span as unknown as { spanId: string }).spanId).toBe(
			'span-001',
		);
	});

	it('returns null for unknown span', async () => {
		const result = await store.getSpan({
			traceId: 'no-trace',
			spanId: 'no-span',
		});
		expect(result).toBeNull();
	});
});

describe('getTrace', () => {
	it('returns all spans for a trace', async () => {
		await store.createSpan(makeSpanArgs('trace-002', 'span-a'));
		await store.createSpan(makeSpanArgs('trace-002', 'span-b'));
		const result = await store.getTrace({ traceId: 'trace-002' });
		expect(result?.spans?.length).toBe(2);
	});

	it('returns null for unknown trace', async () => {
		const result = await store.getTrace({ traceId: 'ghost' });
		expect(result).toBeNull();
	});
});

describe('batchCreateSpans', () => {
	it('inserts multiple spans at once', async () => {
		const records = [
			{
				traceId: 'trace-003',
				spanId: 'span-x',
				name: 'span-x',
				createdAt: new Date(),
				updatedAt: null,
			},
			{
				traceId: 'trace-003',
				spanId: 'span-y',
				name: 'span-y',
				createdAt: new Date(),
				updatedAt: null,
			},
		];
		await store.batchCreateSpans({
			records,
		} as unknown as BatchCreateSpansArgs);

		const result = await store.getTrace({ traceId: 'trace-003' });
		expect(result?.spans?.length).toBe(2);
	});

	it('no-ops on empty records', async () => {
		await expect(
			store.batchCreateSpans({
				records: [],
			} as unknown as BatchCreateSpansArgs),
		).resolves.toBeUndefined();
	});
});

describe('listTraces', () => {
	it('returns spans with pagination', async () => {
		await store.createSpan(makeSpanArgs('trace-004', 'span-p1'));
		await store.createSpan(makeSpanArgs('trace-004', 'span-p2'));

		const result = await store.listTraces({
			filters: { runId: undefined },
			pagination: { page: 0, perPage: 10 },
		});
		expect(result).toBeDefined();
	});
});
