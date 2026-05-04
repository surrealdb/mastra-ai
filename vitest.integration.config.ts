import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		testTimeout: 30000,
		hookTimeout: 60000,
		include: ['src/tests/*.integration.test.ts'],
	},
});
