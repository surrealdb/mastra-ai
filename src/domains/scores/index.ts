import { randomUUID } from 'node:crypto';
import type {
	ListScoresResponse,
	SaveScorePayload,
	ScoreRowData,
	ScoringSource,
} from '@mastra/core/evals';
import type { StoragePagination } from '@mastra/core/storage';
import { ScoresStorage } from '@mastra/core/storage';
import { recordKey, type SurrealDBClient } from '../../client.js';
import { getScoresSchema } from '../../schema/index.js';

type RawScore = Record<string, unknown> & {
	id: string;
	scorerId: string;
	score: number;
	createdAt: string | Date;
};

function parseDate(d: string | Date): Date {
	return d instanceof Date ? d : new Date(d);
}

function parseScore(r: RawScore): ScoreRowData {
	return {
		...r,
		id: recordKey(r.id),
		createdAt: parseDate(r.createdAt),
	} as unknown as ScoreRowData;
}

function buildPaginated(
	table: string,
	whereClause: string,
	bindings: Record<string, unknown>,
	pagination: StoragePagination,
): {
	listSurql: string;
	countSurql: string;
	listBindings: Record<string, unknown>;
} {
	const { page, perPage } = pagination;
	const normalized = perPage === false ? Number.MAX_SAFE_INTEGER : perPage;
	const offset = page * normalized;
	const listBindings = { ...bindings, limit: normalized, offset };

	return {
		listSurql: `SELECT * FROM ${table} WHERE ${whereClause} ORDER BY createdAt DESC LIMIT $limit START $offset`,
		countSurql: `SELECT count() AS count FROM ${table} WHERE ${whereClause} GROUP ALL`,
		listBindings,
	};
}

async function paginateScores(
	client: SurrealDBClient,
	listSurql: string,
	countSurql: string,
	listBindings: Record<string, unknown>,
	countBindings: Record<string, unknown>,
	pagination: StoragePagination,
): Promise<ListScoresResponse> {
	const [rows, countRows] = await Promise.all([
		client.queryAll<RawScore>(listSurql, listBindings),
		client.queryAll<{ count: number }>(countSurql, countBindings),
	]);

	const total = countRows[0]?.count ?? 0;
	const { page, perPage } = pagination;
	const normalized = perPage === false ? Number.MAX_SAFE_INTEGER : perPage;

	return {
		scores: rows.map(parseScore),
		pagination: {
			total,
			page,
			perPage,
			hasMore: offset_from(page, normalized) + rows.length < total,
		},
	} as unknown as ListScoresResponse;
}

function offset_from(page: number, perPage: number): number {
	return page * perPage;
}

export class ScoresSurrealDB extends ScoresStorage {
	constructor(private readonly client: SurrealDBClient) {
		super();
	}

	async init(): Promise<void> {
		const schema = getScoresSchema();
		await this.client.execute(schema);
	}

	async dangerouslyClearAll(): Promise<void> {
		await this.client.execute('DELETE mastra_scorers');
	}

	async getScoreById({ id }: { id: string }): Promise<ScoreRowData | null> {
		const row = await this.client.queryOne<RawScore>(
			`SELECT * FROM type::record('mastra_scorers', $id)`,
			{ id },
		);
		return row ? parseScore(row) : null;
	}

	async saveScore(score: SaveScorePayload): Promise<{ score: ScoreRowData }> {
		const id =
			((score as Record<string, unknown>).id as string | undefined) ??
			randomUUID();
		const now = new Date();
		const data: Record<string, unknown> = {
			...score,
			id,
			createdAt: now,
		};

		await this.client.execute(
			`CREATE type::record('mastra_scorers', $id) CONTENT $data`,
			{ id, data },
		);

		const saved = await this.getScoreById({ id });
		if (!saved) throw new Error(`Score not found after save: ${id}`);
		return { score: saved };
	}

	async listScoresByScorerId({
		scorerId,
		pagination,
		entityId,
		entityType,
		source,
	}: {
		scorerId: string;
		pagination: StoragePagination;
		entityId?: string;
		entityType?: string;
		source?: ScoringSource;
	}): Promise<ListScoresResponse> {
		const whereParts = ['scorerId = $scorerId'];
		const bindings: Record<string, unknown> = { scorerId };

		if (entityId) {
			whereParts.push('entityId = $entityId');
			bindings.entityId = entityId;
		}
		if (entityType) {
			whereParts.push('entityType = $entityType');
			bindings.entityType = entityType;
		}
		if (source) {
			whereParts.push('source = $source');
			bindings.source = source;
		}

		const { listSurql, countSurql, listBindings } = buildPaginated(
			'mastra_scorers',
			whereParts.join(' AND '),
			bindings,
			pagination,
		);
		return paginateScores(
			this.client,
			listSurql,
			countSurql,
			listBindings,
			bindings,
			pagination,
		);
	}

	async listScoresByRunId({
		runId,
		pagination,
	}: {
		runId: string;
		pagination: StoragePagination;
	}): Promise<ListScoresResponse> {
		const bindings = { runId };
		const { listSurql, countSurql, listBindings } = buildPaginated(
			'mastra_scorers',
			'runId = $runId',
			bindings,
			pagination,
		);
		return paginateScores(
			this.client,
			listSurql,
			countSurql,
			listBindings,
			bindings,
			pagination,
		);
	}

	async listScoresByEntityId({
		entityId,
		entityType,
		pagination,
	}: {
		pagination: StoragePagination;
		entityId: string;
		entityType: string;
	}): Promise<ListScoresResponse> {
		const bindings = { entityId, entityType };
		const { listSurql, countSurql, listBindings } = buildPaginated(
			'mastra_scorers',
			'entityId = $entityId AND entityType = $entityType',
			bindings,
			pagination,
		);
		return paginateScores(
			this.client,
			listSurql,
			countSurql,
			listBindings,
			bindings,
			pagination,
		);
	}
}
