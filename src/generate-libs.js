const path = require('path');
const fs = require('fs');

const files = {};

for(const key of [
	'lib.decorators.d.ts',
	'lib.decorators.legacy.d.ts',
	'lib.dom.d.ts',
	'lib.es2015.core.d.ts',
	'lib.es2015.iterable.d.ts',
	'lib.es2015.symbol.d.ts',
	'lib.es5.d.ts',
	'../lib/Swizzle.d.ts',
	'webgl.ts'
]) {
	files[path.basename(key)] = fs.readFileSync(path.resolve(__dirname, key), 'utf-8');
}

fs.writeFileSync(path.resolve(__dirname, 'libs.ts'), 'export const libs = {' + Object.keys(files).map((key) => '"' + key + '": `' + files[key].replace(/([\$`])/g, "\\$1") + '`').join(',\n') + '};\n');
