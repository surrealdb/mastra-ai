import type { Surreal } from 'surrealdb';
import { describe, expect, it } from 'vitest';
import { isInstanceConfig, isTokenConfig, isUrlConfig } from '../config.js';

describe('isUrlConfig', () => {
	it('returns true for username/password config', () => {
		expect(
			isUrlConfig({
				id: 'x',
				url: 'ws://localhost:8000',
				username: 'root',
				password: 'root',
			}),
		).toBe(true);
	});

	it('returns false for token config', () => {
		expect(
			isUrlConfig({ id: 'x', url: 'ws://localhost:8000', token: 'tok' }),
		).toBe(false);
	});

	it('returns false for instance config', () => {
		expect(isUrlConfig({ id: 'x', db: {} as Surreal })).toBe(false);
	});
});

describe('isTokenConfig', () => {
	it('returns true for token config', () => {
		expect(
			isTokenConfig({
				id: 'x',
				url: 'ws://localhost:8000',
				token: 'tok',
			}),
		).toBe(true);
	});

	it('returns false for username/password config', () => {
		expect(
			isTokenConfig({
				id: 'x',
				url: 'ws://localhost:8000',
				username: 'root',
				password: 'root',
			}),
		).toBe(false);
	});
});

describe('isInstanceConfig', () => {
	it('returns true for pre-connected instance', () => {
		expect(isInstanceConfig({ id: 'x', db: {} as Surreal })).toBe(true);
	});

	it('returns false for url config', () => {
		expect(
			isInstanceConfig({
				id: 'x',
				url: 'ws://localhost:8000',
				username: 'root',
				password: 'root',
			}),
		).toBe(false);
	});
});
