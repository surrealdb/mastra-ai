import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/spectron/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  external: ['@mastra/core', '@surrealdb/spectron', 'zod'],
});
