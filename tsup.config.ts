import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/cli.ts'],
	format: ['esm'],
	target: 'node18',
	outDir: 'dist',
	clean: true,
	dts: true,
	sourcemap: true,
	banner: {
		js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
	},
});
