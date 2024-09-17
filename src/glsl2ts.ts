/** Modification to GLSL code, to turn it into TypeScript. */

interface Edit {
	start: number;
	length: number;
	replace: string;
}

/** Map WebGL types to TypeScript types. */

const jsKind: Record<string, string | undefined> = {
	void: 'void',
	float: 'number',
	int: 'number',
	bool: 'boolean',
	vec2: 'Vec2',
	vec3: 'Vec3',
	vec4: 'Vec4',
	ivec2: 'IVec2',
	ivec3: 'IVec3',
	ivec4: 'IVec4',
	uvec2: 'UVec2',
	uvec3: 'UVec3',
	uvec4: 'UVec4',
	bvec2: 'UVec2',
	bvec3: 'UVec3',
	bvec4: 'UVec4',
	mat2: 'Mat2',
	mat3: 'Mat3',
	mat4: 'Mat4'
};

const commentEnd: Record<string, string | undefined> = {
	'/*': '*/',
	'//': '\n',
	'#': '\n'
};

const reBeforeDeclaration = /[{};]|\/[*/]|#/g;
const reBeforeIdentifier = /[()=,;]|\/[*/]|#/g;
const reIdentifier = /^[ \t\n]*([A-Za-z_][A-Za-z0-9_]*)[ \t\n]*$/;

const reDeclaration = new RegExp([
	'^([ \t\n]*)', // Indentation
	'(?:(uniform|attribute|varying|in|out|inout|const|precision)[ \t]+)?', // Storage / parameter qualifier
	'(?:highp[ \t]+|mediump[ \t]+|lowp[ \t]+)?', // Precision (discard)
	'(void|float|bool|[iub]?vec[234]|mat[234])', // Data type
	'[ \t]?([;)]?)'
].join(''));

interface FunctionMeta {
	name: string;
	/** Start offset in source file. */
	start: number;
	/** End offset in source file. */
	end: number;

	argCount: number;
	/** Flags whether each argument has an out qualifier. */
	isOut: boolean[];
	/** Names of arguments with out qualifiers. */
	outNames: string[];
}

/** Exposed variables grouped by linkage. */

interface Storage {
	[key: string]: string[];
	/** Internals like gl_Position. */
	internal: string[];
	uniform: string[];
	attribute: string[];
	varying: string[];
	'in': string[];
	out: string[];
}

const isSpace: Record<string, boolean | undefined> = {
	' ': true,
	'\t': true,
	'\n': true
};

function backtrackSpace(code: string, pos: number) {
	while(isSpace[code[--pos]]);
	return pos + 1;
}

function backtrackIdentifier(code: string, pos: number) {
	while(/[A-Za-z0-9_]/.test(code[--pos]));
	return pos + 1;
}

function forEachToken(code: string, pos: number, end: number, reToken: RegExp, func: (token: string, pos: number, setRe: (re: RegExp) => void) => void) {
	const setRe = (re: RegExp) => { reToken = re; };

	while(pos < end) {
		// Move to next token.
		reToken.lastIndex = pos;
		const match = reToken.exec(code);
		if(!match) break;

		const token = match[0];
		const endToken = commentEnd[token];
		pos = match.index;

		if(endToken) {
			// Skip to end of comment.
			pos = code.indexOf(endToken, pos + token.length) + endToken.length;
			continue;
		}

		func(token, pos, setRe);
		pos += token.length;
	}
}

/** Patch return statements of a function to return a tuple with the return value and all output parameters. */

function patchReturns(code: string, meta: FunctionMeta, edits: Edit[]) {
	let returnEnd = 0;

	forEachToken(code, meta.start, meta.end, /[ \t\n;]return([ \t;])|\/[*/]|#/g, (token, pos) => {
		if(token[1] == 'r') {
			const start = pos + token.length - 1;
			returnEnd = code.indexOf(';', start);

			// Include return statement in first edit to give it a different start offset, in case sort is not stable.
			edits.push({
				start: start - 6,
				length: 6,
				replace: 'return ([ (' + (/[^ \t\n]/.test(code.substring(start, returnEnd)) ? '' : 'void 0')
			});
			edits.push({
				start: returnEnd,
				length: 0,
				replace: '), ' + meta.outNames.map((name) => '$copy(' + name + ')').join(', ') + ' ] as const)'
			});
		}
	});

	// If there's no return statement at the end, add one.

	if(!returnEnd || /[^; \t\n]/.test(code.substring(returnEnd, meta.end - 1))) {
		edits.push({ start: meta.end - 1, length: 0, replace: '\treturn ([ void 0, ' + meta.outNames.map((name) => '$copy(' + name + ')').join(', ') + ' ] as const);\n' });
	}
}

/** Patch all calls to functions with output parameters, to destructure return tuples back into input variables. */

function patchFunctionCalls(code: string, functions: Record<string, FunctionMeta>, edits: Edit[]) {
	/** Match a function call just before the paren. Find the name by advancing backwards. */
	const reCall = /[A-Za-z0-9_][ \t]*\(|\/[*/]|#/g;
	/** Match a token that might precede or follow a function argument. */
	const reAroundArgument = /[(),]|\/[*/]|#/g;

	let meta: FunctionMeta | null = null;
	let callStart = 0;
	let argumentStart = 0;
	let argumentNum = 0;
	let capture: string[] = [];
	let inCall = false;

	/** If > 0, the token is inside a function call.
	  * If > 1, then inside a parenthesized expression passed as an argument. */
	let nesting = 0;

	forEachToken(code, 0, code.length, reCall, (token, pos, setRe) => {
		if(!inCall) {
			callStart = backtrackIdentifier(code, pos);
			meta = functions[code.substring(callStart, pos + 1)];
			if(meta && meta.outNames.length) {
				argumentStart = pos + token.length;
				argumentNum = 0;
				capture = [];

				inCall = true;
				nesting = 1;

				// Now look for arguments.
				setRe(reAroundArgument);
			} else {
				meta = null;
			}
		} else if(token == '(') {
			++nesting;
		} else {
			if(meta && nesting == 1) {
				const argument = code.substring(argumentStart, pos);

				if(reDeclaration.test(argument)) {
					// This is a function declaration instead of a call, so ignore it.
					meta = null;
				} else if(meta.isOut[argumentNum]) {
					// Collect variables passed to output parameters, to add destructuring to the call.
					// Use _ as a placeholder when something other than a variable was passed, so there's nowhere for the output to go.
					const identifierMatch = argument.match(reIdentifier);
					capture.push(identifierMatch ? identifierMatch[1] : '_');
				}

				argumentStart = pos + token.length;
				++argumentNum;
			}

			if(token == ')' && !--nesting) {
				if(meta) {
					edits.push({ start: callStart, length: 0, replace: '([$, ' + capture.join(', ') + '] = ' });
					edits.push({ start: pos + token.length, length: 0, replace: ', $ as MainReturn<typeof ' + meta.name + '>)' });
					meta = null;
				}

				inCall = false;
				setRe(reCall);
			}
		}
	});
}

function patchPragma(code: string, start: number, end: number, edits: Edit[]) {
	const match = code.substring(start, end).match(/^([ \t]*)(#[ \t]*define)[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t\n]+/);

	if(match) {
		edits.push({ start: start + match[1].length, length: match[2].length, replace: 'const' });
		edits.push({ start: start + match[0].length, length: 0, replace: '= ' });
		edits.push({ start: end, length: 0, replace: ';' });
	} else {
		edits.push({ start, length: end - start, replace: '' });
	}
}

/** Transform GLSL into valid TypeScript. */

function transformCode(code: string, storage: Storage) {
	const edits: Edit[] = [];
	// Start by looking for a declaration.
	let reToken = reBeforeDeclaration;

	const functions: Record<string, FunctionMeta> = {};
	let meta: FunctionMeta | null = null;
	let declarationEmitted = false;
	let declarationFound = false;
	/** If true, the token comes after = and forms part of the value of a declaration. */
	let inValue = false;

	let declarationStart = 0;
	let declarationLength = 0;
	let blockNesting = 0;
	/** If > 0, the token is inside a parenthesized expression. */
	let nesting = 0;
	let pos = 0;

	let qualifier = '';
	let kind = '';

	while(pos < code.length) {
		// If we're expecting a declaration here, see if there is one.
		if(!declarationFound && !nesting && !inValue) {
			const parts = code.substring(pos).match(reDeclaration);

			if(parts) {
				// Declaration was found.
				const indentLength = parts[1].length;
				qualifier = parts[2];
				kind = parts[3];

				if(qualifier == 'precision') {
					// Comment out precision setting.
					edits.push({ start: pos + indentLength, length: 0, replace: '// ' });
				} else {
					declarationStart = pos + indentLength;
					declarationLength = parts[0].length - indentLength - parts[4].length;
					declarationFound = true;

					// Now look for the identifier(s) that are declared here.
					reToken = reBeforeIdentifier;
				}
			} else if(!declarationEmitted) {
				// No declaration here...
				qualifier = '';
				kind = '';
				declarationFound = false;
			}
		}

		// Move to next token.
		reToken.lastIndex = pos;
		const match = reToken.exec(code);
		if(!match) break;

		const token = match[0];
		const endToken = commentEnd[token];
		pos = match.index;

		if(endToken) {
			// Skip to end of comment.
			const commentEnd = code.indexOf(endToken, pos + token.length) + endToken.length;

			if(token == '#') patchPragma(code, pos, commentEnd - 1, edits);
			pos = commentEnd;
			continue;
		}

		if(token == '{') {
			// If a function declaration was found but not the start of its body, then it starts here.
			if(meta && !meta.start) meta.start = pos;
			++blockNesting;
		} else if(token == '}') {
			// If no longer inside any block and we were parsing a function, then its body ends here.
			if(!--blockNesting && meta) {
				meta.end = pos + token.length;
				// If the function had output parameters, patch it to return them in a tuple.
				if(meta.outNames.length) patchReturns(code, meta, edits);
				meta = null;
			}
		}

		if(declarationFound || declarationEmitted) {
			switch(token) {
				case '(':
					if(declarationFound) {
						edits.push({ start: declarationStart, length: declarationLength, replace: 'export function ' });

						meta = {
							name: code.substring(declarationStart + declarationLength, pos).replace(/[ \t\n]+$/, ''),
							start: 0,
							end: 0,
							argCount: 0,
							isOut: [],
							outNames: []
						};

						functions[meta.name] = meta;
						declarationEmitted = true;
						declarationFound = false;
					} else {
						++nesting;
					}

					break;
				case ')':
					--nesting;
					if(nesting >= 0) break;

				// Fallthru
				case '=': case ',': case ';':
					if(declarationFound) {
						let replace = '';

						if(!declarationEmitted) {
							if(qualifier == 'const') {
								replace = 'const ';
							} else {
								if(qualifier && storage[qualifier]) {
									const identifierMatch = code.substring(declarationStart + declarationLength).match(/^[ \t\n]*([A-Za-z_][A-Za-z0-9_]*)/);
									if(identifierMatch) storage[qualifier].push(identifierMatch[1]);
								}

								replace = 'let ';
							}
						}

						if(declarationLength || replace) edits.push({ start: declarationStart, length: declarationLength, replace });
						declarationEmitted = true;
						declarationFound = false;
					}

					if(nesting <= 0) {
						if(kind && !inValue) {
							const p = backtrackSpace(code, pos);
							const c = code[p - 1];
							const name = code.substring(declarationStart + declarationLength, p);

							if(meta) {
								if(qualifier == 'out' || qualifier == 'inout') {
									meta.isOut[meta.argCount] = true;
									meta.outNames.push(name);
								}

								++meta.argCount;
							}

							if(c != '(' && name) {
								if(qualifier && !meta && /vec|mat/.test(kind)) {
									edits.push({ start: p, length: 0, replace: ' = ' + kind + '(0)' });
								} else {
									edits.push({ start: p, length: 0, replace: ': ' + (jsKind[kind] || 'any') });
								}
							}
						}

						inValue = token == '=';
					}

					if(token == ';' || token == ')') {
						reToken = reBeforeDeclaration;
						declarationEmitted = false;
						declarationFound = false;
						nesting = 0;
					}

					break;
			}
		}

		pos += token.length;
	}

	patchFunctionCalls(code, functions, edits);

	return edits;
}

/* import {
	MainReturn, $copy,
	Vec2, Vec3, Vec4, Vec,
	vec2, vec3, vec4,
	Mat2, Mat3, Mat4, Mat,
	mat2, mat3, mat4,
	IVec2, IVec3, IVec4,
	UVec2, UVec3, UVec4,
	ivec2, ivec3, ivec4,
	uvec2, uvec3, uvec4,
	bvec2, bvec3, bvec4,
	radians, degrees, sin, cos, tan, asin, acos, atan,
	pow, exp, log, exp2, log2, sqrt, inversesqrt,
	abs, sign, floor, ceil, fract, mod, min, max, clamp, mix, step, smoothstep,
	length, distance, dot, cross, normalize, reflect,
	matrixCompMult,
	lessThan, lessThanEqual, greaterThan, greaterThanEqual, equal, notEqual, any, all, not,
	print
} from './webgl'; */

const prologue = `// Automatically transpiled from WebGL
let gl_Position = vec4(0);
let gl_PointSize: number;
let gl_FragCoord = vec4(0);
let gl_FrontFacing: boolean;
let gl_PointCoord = vec2(0);
let gl_FragColor = vec4(0);
let gl_FragData: Vec4[];

/** For discarding unused out parameters and capturing actual return value for function calls. */
let _: any, $: any;
`;

/** Expose variables with external linkage as an object with getters and setters for access from outside the compiled ES6 module. */

function exposeStorage(storage: Storage) {
	return '{\n' + (
		Object.keys(storage) as (keyof Storage)[]
	).map(
		(qualifier) => (
			'\t' + qualifier + ': {' +
			storage[qualifier].map(
				(name) => (
					'\n\t\tget ' + name + '() { return ' + name + '; },' +
					'\n\t\tset ' + name + '($: any) { ' + name + ' = $; }'
				)
			).join(',') +
			'\n\t}'
		)
	).join(',\n') + '\n}';
}

function applyEdits(code: string, edits: Edit[]) {
	let result: string[] = [];
	let pos = 0;

	for(const { start, length, replace } of edits) {
		result.push(code.substring(pos, start) + replace);
		pos = start + length;
	}

	result.push(code.substring(pos));

	return result.join('');
}

const internal = [
	'gl_Position',
	'gl_PointSize',
	'gl_FragCoord',
	'gl_FrontFacing',
	'gl_PointCoord',
	'gl_FragColor',
	'gl_FragData'
];

export function glsl2ts(code: string) {
	const storage: Storage = { internal, uniform: [], attribute: [], varying: [], 'in': [], out: [] };
	const edits = transformCode(code, storage);

	edits.unshift({
		start: 0,
		length: 0,
		replace: prologue + '\nexport const $storage = ' + exposeStorage(storage) + ';\n\n'
	});

	return applyEdits(code, edits.sort((a, b) => a.start - b.start));
}
