import { existsSync, readFileSync } from 'fs';
import { resolve, normalize } from 'path';
import {
	CompilerOptions,
	ModuleKind,
	ScriptTarget,
	ModuleResolutionHost,
	createModuleResolutionCache,
	sys,
	transpileModule,
	nodeModuleNameResolver
} from 'typescript';
import { Plugin } from 'rollup';

const tsOptions: CompilerOptions = Object.assign(require('./tsconfig.json').compilerOptions, {
	module: ModuleKind.ES2015,
	target: ScriptTarget.ES2017,
});

const tsHost: ModuleResolutionHost = {
	readFile: (key: string) => readFileSync(key, 'utf-8'),
	fileExists: (key: string) => existsSync(key),
	getCurrentDirectory: () => process.cwd()
};

const tsCache = createModuleResolutionCache(
	process.cwd(),
	(key) => sys.useCaseSensitiveFileNames ? key : key.toLowerCase(),
	tsOptions
);

export const typescript: Plugin = {
	name: 'typescript',
	transform: (code: string, id: string) => transpileModule(code, { compilerOptions: tsOptions }).outputText,
	resolveId: (key: string, base?: string) => {
		const resolved = base && nodeModuleNameResolver(
			key,
			base,
			tsOptions,
			tsHost,
			tsCache
		).resolvedModule;

		if(resolved) {
			const key = resolved.resolvedFileName;

			if(resolved.extension != '.d.ts') {
				return normalize(key);
			} else if(resolved.packageId) {
				const base = key.substring(0, key.length - resolved.packageId.subModuleName.length);
				const index = JSON.parse(readFileSync(resolve(base, 'package.json'), 'utf-8')).module;

				if(index) return resolve(base, index);
			}
		}

		return null;
	}
};
