import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	exportSchemas,
	MEMORY_SCHEMA,
	OBSERVABILITY_SCHEMA,
	SCORES_SCHEMA,
	WORKFLOWS_SCHEMA,
} from '../schema/index.js';

describe('schema exports', () => {
	it('are non-empty strings', () => {
		for (const s of [
			MEMORY_SCHEMA,
			WORKFLOWS_SCHEMA,
			SCORES_SCHEMA,
			OBSERVABILITY_SCHEMA,
		]) {
			expect(typeof s).toBe('string');
			expect(s.length).toBeGreaterThan(0);
		}
	});

	it('memory schema defines all four tables', () => {
		expect(MEMORY_SCHEMA).toContain('mastra_threads');
		expect(MEMORY_SCHEMA).toContain('mastra_messages');
		expect(MEMORY_SCHEMA).toContain('mastra_resources');
		expect(MEMORY_SCHEMA).toContain('mastra_observational_memory');
	});

	it('observational memory chunks keep arbitrary keys (extractor payloads)', () => {
		// SCHEMAFULL rejects undefined nested keys inside array<object>
		// elements (extractedValues/extractionFailures), so the table must be
		// SCHEMALESS with typed definitions for the known fields.
		expect(MEMORY_SCHEMA).toContain(
			'DEFINE TABLE IF NOT EXISTS mastra_observational_memory SCHEMALESS;',
		);
		expect(MEMORY_SCHEMA).toContain(
			'DEFINE FIELD IF NOT EXISTS bufferedObservationChunks     ON mastra_observational_memory TYPE option<array<object>>;',
		);
	});

	it('observational memory has lookup indexes', () => {
		expect(MEMORY_SCHEMA).toContain('idx_om_thread');
		expect(MEMORY_SCHEMA).toContain('idx_om_resource');
		expect(MEMORY_SCHEMA).toContain('idx_om_id');
	});

	it('memory.surql mirror contains the same observational memory DDL', () => {
		const surql = readFileSync(
			join(__dirname, '../schema/memory.surql'),
			'utf8',
		);
		const omLines = MEMORY_SCHEMA.split('\n').filter((line) =>
			line.includes('mastra_observational_memory'),
		);
		expect(omLines.length).toBeGreaterThan(0);
		for (const line of omLines) {
			expect(surql).toContain(line);
		}
	});

	it('workflows schema has a unique composite index', () => {
		expect(WORKFLOWS_SCHEMA).toContain('mastra_workflow_snapshot');
		expect(WORKFLOWS_SCHEMA).toContain('UNIQUE');
	});

	it('observability schema has a unique span index', () => {
		expect(OBSERVABILITY_SCHEMA).toContain('mastra_ai_spans');
		expect(OBSERVABILITY_SCHEMA).toContain('UNIQUE');
	});

	it('exportSchemas returns all four domains', () => {
		const schemas = exportSchemas();
		expect(Object.keys(schemas).sort()).toEqual(
			['memory', 'observability', 'scores', 'workflows'].sort(),
		);
		for (const val of Object.values(schemas)) {
			expect(typeof val).toBe('string');
			expect(val.length).toBeGreaterThan(0);
		}
	});
});
