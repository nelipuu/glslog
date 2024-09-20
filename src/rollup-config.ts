import { builtinModules } from 'module';
import { defineConfig } from 'rollup';
import { typescript } from './rollup-typescript';

export default defineConfig({
	external: builtinModules.concat(['../lib/typescript.cjs']),
	plugins: [typescript],
	input: 'src/index.ts',
	output: {
		format: 'commonjs',
		file: 'dist/index.js'
	}
});
