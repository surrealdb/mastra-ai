import type { Spectron } from '@surrealdb/spectron';
import { describe, expect, it } from 'vitest';
import { isSpectronInstanceConfig } from '../spectron/config.js';

describe('isSpectronInstanceConfig', () => {
	it('returns true when a pre-built client is provided', () => {
		expect(isSpectronInstanceConfig({ spectron: {} as Spectron })).toBe(
			true,
		);
	});

	it('returns false for credentials config', () => {
		expect(
			isSpectronInstanceConfig({
				endpoint: 'https://api.example.com',
				context: 'acme',
				apiKey: 'sp-key',
			}),
		).toBe(false);
	});
});
