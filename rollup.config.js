var fs = require('fs');
var ts = require('typescript');

require.extensions['.ts'] = function(module, key) {
	module._compile(
		ts.transpileModule(fs.readFileSync(key, 'utf-8'), {
			fileName: key,
			compilerOptions: {
				esModuleInterop: true,
				inlineSourceMap: true,
				module: ts.ModuleKind.CommonJS,
				target: ts.ScriptTarget.ES2018
			}
		}).outputText,
		key
	);
};

module.exports = require('./src/rollup-config.ts');
