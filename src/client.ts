import { RecordId, Surreal } from 'surrealdb';
import {
	isInstanceConfig,
	isTokenConfig,
	isUrlConfig,
	type SurrealDBStoreConfig,
} from './config.js';

export { RecordId };

export class SurrealDBClient {
	readonly db: Surreal;
	private readonly owned: boolean;
	private connected = false;
	readonly namespace: string;
	readonly database: string;

	constructor(config: SurrealDBStoreConfig) {
		this.namespace = config.namespace ?? 'mastra';
		this.database = config.database ?? 'mastra';

		if (isInstanceConfig(config)) {
			this.db = config.db;
			this.owned = false;
		} else {
			this.db = new Surreal();
			this.owned = true;
		}
	}

	async connect(config?: SurrealDBStoreConfig): Promise<void> {
		if (this.connected || !this.owned) return;

		if (!config) {
			this.connected = true;
			return;
		}

		if (isUrlConfig(config)) {
			await this.db.connect(config.url);
			await this.db.signin({
				username: config.username,
				password: config.password,
			});
			await this.db.use({
				namespace: this.namespace,
				database: this.database,
			});
		} else if (isTokenConfig(config)) {
			await this.db.connect(config.url);
			await this.db.authenticate(config.token);
			await this.db.use({
				namespace: this.namespace,
				database: this.database,
			});
		}

		this.connected = true;
	}

	async close(): Promise<void> {
		if (this.owned && this.connected) {
			await this.db.close();
			this.connected = false;
		}
	}

	async queryAll<T>(
		surql: string,
		bindings?: Record<string, unknown>,
	): Promise<T[]> {
		const results = await this.db.query<[T[]]>(surql, bindings);
		return (results[0] as T[]) ?? [];
	}

	async queryOne<T>(
		surql: string,
		bindings?: Record<string, unknown>,
	): Promise<T | null> {
		const rows = await this.queryAll<T>(surql, bindings);
		return rows[0] ?? null;
	}

	async queryCount(
		surql: string,
		bindings?: Record<string, unknown>,
	): Promise<number> {
		const rows = await this.db.query<[Array<{ count: number }>]>(
			surql,
			bindings,
		);
		return rows[0]?.[0]?.count ?? 0;
	}

	async execute(
		surql: string,
		bindings?: Record<string, unknown>,
	): Promise<void> {
		await this.db.query(surql, bindings);
	}

	async tx<T>(fn: (db: Surreal) => Promise<T>): Promise<T> {
		await this.db.query('BEGIN TRANSACTION');
		try {
			const result = await fn(this.db);
			await this.db.query('COMMIT TRANSACTION');
			return result;
		} catch (err) {
			await this.db.query('CANCEL TRANSACTION');
			throw err;
		}
	}
}
