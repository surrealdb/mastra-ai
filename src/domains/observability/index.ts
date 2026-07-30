import type {
	BatchCreateSpansArgs,
	CreateSpanArgs,
	GetSpanArgs,
	GetSpanResponse,
	GetTraceArgs,
	GetTraceResponse,
	ListTracesArgs,
	ListTracesResponse,
} from '@mastra/core/storage';
import { ObservabilityStorage } from '@mastra/core/storage';
import type { SurrealDBClient } from '../../client.js';
import { getObservabilitySchema } from '../../schema/index.js';

type RawSpan = Record<string, unknown> & {
	spanId: string;
	traceId: string;
	name: string;
	createdAt: string | Date;
	updatedAt: string | Date;
};

function parseDate(d: string | Date | undefined | null): Date | null {
	if (!d) return null;
	return d instanceof Date ? d : new Date(d as string);
}

function spanToResponse(r: RawSpan): GetSpanResponse['span'] {
	return {
		...r,
		createdAt: parseDate(r.createdAt) as Date,
		updatedAt: parseDate(r.updatedAt),
	} as unknown as GetSpanResponse['span'];
}

export class ObservabilitySurrealDB extends ObservabilityStorage {
	constructor(private readonly client: SurrealDBClient) {
		super();
	}

	async init(): Promise<void> {
		const schema = getObservabilitySchema();
		await this.client.execute(schema);
	}

	async dangerouslyClearAll(): Promise<void> {
		await this.client.execute('DELETE mastra_ai_spans');
	}

	override get tracingStrategy() {
		return {
			preferred: 'insert-only' as 'insert-only',
			supported: ['insert-only'] as Array<
				| 'realtime'
				| 'batch-with-updates'
				| 'insert-only'
				| 'event-sourced'
			>,
		};
	}

	override async createSpan({ span }: CreateSpanArgs): Promise<void> {
		const now = new Date();
		const id = `${span.traceId}__${span.spanId}`;
		const data: Record<string, unknown> = {
			...span,
			createdAt: now,
			updatedAt: now,
		};
		await this.client.execute(
			`UPSERT type::record('mastra_ai_spans', $id) CONTENT $data`,
			{ id, data },
		);
	}

	override async batchCreateSpans({
		records,
	}: BatchCreateSpansArgs): Promise<void> {
		if (records.length === 0) return;
		const now = new Date();
		const rows = records.map((s) => ({
			...s,
			createdAt: now,
			updatedAt: now,
		}));
		await this.client.execute('INSERT INTO mastra_ai_spans $rows', {
			rows,
		});
	}

	override async getSpan({
		spanId,
		traceId,
	}: GetSpanArgs): Promise<GetSpanResponse | null> {
		const row = await this.client.queryOne<RawSpan>(
			'SELECT * FROM mastra_ai_spans WHERE spanId = $spanId AND traceId = $traceId LIMIT 1',
			{ spanId, traceId },
		);
		if (!row) return null;
		return { span: spanToResponse(row) };
	}

	override async getTrace({
		traceId,
	}: GetTraceArgs): Promise<GetTraceResponse | null> {
		const spans = await this.client.queryAll<RawSpan>(
			'SELECT * FROM mastra_ai_spans WHERE traceId = $traceId ORDER BY createdAt ASC',
			{ traceId },
		);
		if (spans.length === 0) return null;
		return {
			traceId,
			spans: spans.map(spanToResponse),
		} as unknown as GetTraceResponse;
	}

	override async listTraces(
		args: ListTracesArgs,
	): Promise<ListTracesResponse> {
		const { filters, pagination } = args;
		const page: number = (pagination?.page as number | undefined) ?? 0;
		const perPageRaw = pagination?.perPage;
		const perPage: number | false =
			(perPageRaw as number | false | undefined) ?? 100;

		const whereParts: string[] = [];
		const bindings: Record<string, unknown> = {};

		if (filters?.entityId) {
			whereParts.push('entityId = $entityId');
			bindings.entityId = filters.entityId;
		}
		if (filters?.entityType) {
			whereParts.push('entityType = $entityType');
			bindings.entityType = filters.entityType;
		}
		if (filters?.runId) {
			whereParts.push('runId = $runId');
			bindings.runId = filters.runId;
		}
		if (filters?.threadId) {
			whereParts.push('threadId = $threadId');
			bindings.threadId = filters.threadId;
		}

		const whereClause =
			whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
		const normalizedPerPage: number =
			perPage === false ? Number.MAX_SAFE_INTEGER : (perPage ?? 100);
		const offset: number = page * normalizedPerPage;

		const [rows, countRows] = await Promise.all([
			this.client.queryAll<RawSpan>(
				`SELECT * FROM mastra_ai_spans ${whereClause} ORDER BY createdAt DESC LIMIT ${normalizedPerPage} START ${offset}`,
				bindings,
			),
			this.client.queryAll<{ count: number }>(
				`SELECT count() AS count FROM mastra_ai_spans ${whereClause} GROUP ALL`,
				bindings,
			),
		]);

		const total = countRows[0]?.count ?? 0;

		return {
			spans: rows.map(spanToResponse),
			pagination: {
				total,
				page,
				perPage,
				hasMore: offset + rows.length < total,
			},
		} as unknown as ListTracesResponse;
	}
}
