const path = require('path');
const fs = require('fs');

// Patch TypeScript compiler to understand types of arithmetic operators on vectors and matrices.

const key = require.resolve('typescript');

let code = fs.readFileSync(key, 'utf-8').replace(
	/(function checkBinaryLikeExpressionWorker[^{]+\{)/,
	'$1\nfor(const kind of [leftType, rightType]) if(/^[IU]?Vec|^Mat/.test(kind.intrinsicName || kind.checker.typeToString(kind))) return kind;\n'
).replace(
	/(function checkPrefixUnaryExpression[^{]+\{[ \t\n]*const operandType[ =]+[^;]+;)/,
	'$1\nif(/^[IU]?Vec|^Mat/.test(operandType.intrinsicName || operandType.checker.typeToString(operandType))) return operandType;\n'
);

fs.mkdirSync(path.resolve(__dirname, '../lib'), { recursive: true });
fs.writeFileSync(path.resolve(__dirname, '../lib/typescript.cjs'), code, 'utf-8');
fs.writeFileSync(path.resolve(__dirname, '../lib/typescript.cjs.d.ts'), fs.readFileSync(key.replace(/\.js$/, '.d.ts')));

// Generate typings for swizzling vectors.

const lines = [];

for(const set of ['xyzw', 'rgba', 'stpq']) {
	for(let i = 0; i < 4; ++i) {
		lines.push('\t' + set[i] + ': number;');

		for(let j = 0; j < 4; ++j) {
			lines.push('\t' + set[i] + set[j] + ': Vec2;');

			for(let k = 0; k < 4; ++k) {
				lines.push('\t' + set[i] + set[j] + set[k] + ': Vec3;');

				for(let l = 0; l < 4; ++l) {
					lines.push('\t' + set[i] + set[j] + set[k] + set[l] + ': Vec4;');
				}
			}
		}
	}
}

code = [
	'// Autogenerated using install.cjs',
	'',
	'import type { Vec2, Vec3, Vec4 } from \'./webgl.js\';',
	'export interface Swizzle {',
	lines.join('\n'),
	'};',
	''
].join('\n');

fs.writeFileSync(path.resolve(__dirname, 'Swizzle.ts'), code, 'utf-8');
