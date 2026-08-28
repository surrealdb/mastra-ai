import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		testTimeout: 30000,
		hookTimeout: 60000,
		include: ['src/tests/*.integration.test.ts'],
		// Each file initialises the schema in its own database against one shared
		// server; running them concurrently can hit KV write conflicts on DEFINE.
		fileParallelism: false,
	},
});
