import { SurrealDBClient } from '../client.js';

const URL = process.env.SURREALDB_URL ?? 'ws://localhost:8000';
const USERNAME = process.env.SURREALDB_USER ?? 'root';
const PASSWORD = process.env.SURREALDB_PASS ?? 'root';

export function makeConfig(database: string) {
	return {
		id: 'test',
		url: URL,
		username: USERNAME,
		password: PASSWORD,
		namespace: 'mastra_test',
		database,
	};
}

export async function createClient(database: string): Promise<SurrealDBClient> {
	const config = makeConfig(database);
	const client = new SurrealDBClient(config);
	await client.connect(config);
	return client;
}
