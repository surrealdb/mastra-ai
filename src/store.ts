import type { StorageDomains } from '@mastra/core/storage';
import { MastraCompositeStore } from '@mastra/core/storage';
import { SurrealDBClient } from './client.js';
import type { SurrealDBStoreConfig } from './config.js';
import { MemorySurrealDB } from './domains/memory/index.js';
import { ObservabilitySurrealDB } from './domains/observability/index.js';
import { ScoresSurrealDB } from './domains/scores/index.js';
import { WorkflowsSurrealDB } from './domains/workflows/index.js';

export class SurrealDBStore extends MastraCompositeStore {
	readonly client: SurrealDBClient;
	private readonly storeConfig: SurrealDBStoreConfig;

	constructor(config: SurrealDBStoreConfig) {
		super({
			id: config.id,
			name: 'SurrealDBStore',
			disableInit: config.disableInit,
		});
		this.storeConfig = config;
		this.client = new SurrealDBClient(config);

		this.stores = {
			memory: new MemorySurrealDB(this.client),
			workflows: new WorkflowsSurrealDB(this.client),
			scores: new ScoresSurrealDB(this.client),
			observability: new ObservabilitySurrealDB(this.client),
		} satisfies Partial<StorageDomains>;
	}

	override async init(): Promise<void> {
		await this.client.connect(this.storeConfig);
		await Promise.all([
			this.stores?.memory?.init(),
			this.stores?.workflows?.init(),
			this.stores?.scores?.init(),
			this.stores?.observability?.init(),
		]);
	}

	async close(): Promise<void> {
		await this.client.close();
	}
}
