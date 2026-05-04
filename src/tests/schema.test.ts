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

	it('memory schema defines all three tables', () => {
		expect(MEMORY_SCHEMA).toContain('mastra_threads');
		expect(MEMORY_SCHEMA).toContain('mastra_messages');
		expect(MEMORY_SCHEMA).toContain('mastra_resources');
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
