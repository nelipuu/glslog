import {
	CompilerOptions,
	JsxEmit,
	ScriptTarget,
	getDefaultCompilerOptions,

	System,
	CompilerHost,
	Program,
	getDefaultLibFileName,

	LanguageServiceHost,

	SourceFile,
	createSourceFile,

	CustomTransformers,
	formatDiagnostics,
	ScriptSnapshot,

	createProgram,
	TypeChecker, Node, Expression, PrefixUnaryOperator, BinaryOperator,
	SyntaxKind, visitEachChild, isParenthesizedExpression, isPrefixUnaryExpression, isBinaryExpression, isCallExpression, isIdentifier, factory, visitNode,
	/* getPreEmitDiagnostics,
	getLineAndCharacterOfPosition,
	flattenDiagnosticMessageText, */
	ModuleKind
} from '../lib/typescript.cjs';

import type { Vec } from './webgl';
import { VFS } from './vfs';

const textDecoder = new TextDecoder();

const tsOptions: CompilerOptions = {
	strict: true,
	esModuleInterop: true,
	jsx: JsxEmit.ReactJSX,

	// Don't check whether transpile output overwrites input.
	suppressOutputPathCheck: true,
	// Don't check types in EcmaScript API declarations.
	skipDefaultLibCheck: true,
	// Don't check types in declarations.
	skipLibCheck: true,

	module: ModuleKind.CommonJS,

	// Support spread, Promise.prototype.finally (async/await is ES2017).
	target: ScriptTarget.ES2018,

	lib: ['lib.es5.d.ts', 'lib.es2015.core.d.ts', 'lib.es2015.iterable.d.ts', 'lib.dom.d.ts'],
	types: []
};

const returnTrue = () => true;
const useCaseSensitiveFileNames = Object.assign(returnTrue, { valueOf: returnTrue }) as (() => boolean) & boolean;

export class File {

	constructor(private data: string | Uint8Array) { }

	getText(): string {
		if(typeof this.data != 'string') this.data = textDecoder.decode(this.data);
		return this.data;
	}

	setText(data: string) { this.data = data; }

	source?: SourceFile;
	version?: number;

}

function createFile(path: string) {
	return new File('');
}

function createHost(
	vfs: VFS<File>,
	scripts: string[],
	compilerOptions: CompilerOptions,
	customTransformers?: CustomTransformers
) {
	const host: System & CompilerHost & LanguageServiceHost = {
		// System members

		args: [],
		newLine: '\n',
		useCaseSensitiveFileNames,
		write: () => { throw new Error('Not implemented') },
		writeOutputIsTTY: () => false,

		readFile: (path: string) => {
			const file = vfs.read(path);
			if(!file) return;

			return file.getText();
		},

		writeFile: (path: string, data: string) => { vfs.write(path, new File(data)); },

		resolvePath: (path: string) => path,

		fileExists: (path: string) => vfs.isFile(path),
		directoryExists: (path: string) => vfs.isDir(path),

		createDirectory: (path: string) => { vfs.mkdir(path); },
		getExecutingFilePath: () => { throw new Error('Not implemented'); },
		getCurrentDirectory: () => '/',
		getDirectories: () => [],
		readDirectory: (path: string) => vfs.readDir(path) || [],

		// deleteFile?(path: string): void;
		// createHash?(data: string): string;
		// createSHA256Hash?(data: string): string;

		exit: () => { throw new Error('Cannot exit'); },

		// CompilerHost members

		getSourceFile: (path: string, options, onError, createNew?: boolean) => {
			const file = createNew ? vfs.create(path, createFile) : vfs.read(path);
			if(!file) return;

			if(!file.source) file.source = createSourceFile(path, file.getText(), options);
			return file.source;
		},

		getDefaultLibFileName: () => '/' + getDefaultLibFileName(compilerOptions), // '/lib.d.ts',
		getDefaultLibLocation: () => '/',
		getCanonicalFileName: (path: string) => path,
		getNewLine: () => host.newLine,

		// LanguageServiceHost members

		getCompilationSettings: () => compilerOptions,
		getProjectVersion: () => '' + projectVersion,
		getScriptFileNames: () => scripts,
		getScriptVersion: (path: string) => {
			const file = vfs.read(path);
			return '' + ((file && file.version) || 0);
		},
		getScriptSnapshot: (path: string) => {
			const file = vfs.read(path);
			if(!file) return;

			return ScriptSnapshot.fromString(file.getText());
		},
		getCustomTransformers: () => customTransformers
	}

	return host;
}

export const vfs = new VFS<File>();

let projectVersion = 0;

const vectorTypes: Record<string, boolean | undefined> = {
	Vec: true,
	Vec2: true,
	Vec3: true,
	Vec4: true,
	IVec2: true,
	IVec3: true,
	IVec4: true,
	UVec2: true,
	UVec3: true,
	UVec4: true,

	// Matrices need the same operator overloading.
	Mat: true,
	Mat2: true,
	Mat3: true,
	Mat4: true
};

function isVector(vectors: Set<Node>, checker: TypeChecker, node: Node) {
	return vectors.has(node) || vectorTypes[checker.typeToString(checker.getTypeAtLocation(node))];
}

function isVectorOperand(vectors: Set<Node>, checker: TypeChecker, node: Node) {
	if(vectors.has(node)) return true;

	const type = checker.getTypeAtLocation(node);
	if(type.isNumberLiteral()) return true;

	const name = checker.typeToString(type);
	return vectorTypes[name] || name == 'number';
}

const unary: Partial<Record<PrefixUnaryOperator, keyof Vec | 'plus'>> = {
	[SyntaxKind.PlusToken]: 'plus',
	[SyntaxKind.MinusToken]: 'negate'
};

const binary: Partial<Record<BinaryOperator, keyof Vec>> = {
	[SyntaxKind.PlusToken]: 'add',
	[SyntaxKind.MinusToken]: 'sub',
	[SyntaxKind.AsteriskToken]: 'mul',
	[SyntaxKind.SlashToken]: 'div'
};

const commutative: Record<string, keyof Vec | true> = {
	'add': true,
	'mul': true,
	'sub': 'subFlip',
	'div': 'divFlip',
};

function vectorOperators(checker: TypeChecker) {
	const vectors = new Set<Node>();

	const visit = (node: Node) => {
		node = visitEachChild(node, visit, void 0);

		if(isParenthesizedExpression(node)) {
			if(vectors.has(node.expression)) vectors.add(node);
		} else if(isPrefixUnaryExpression(node)) {
			const op = unary[node.operator];
			const operand = node.operand;

			if(op && isVector(vectors, checker, operand)) {
				if(op == 'plus') {
					vectors.add(operand);
					return operand;
				}

				const call = factory.createCallExpression(
					factory.createPropertyAccessExpression(operand, op),
					void 0,
					[]
				);

				vectors.add(call);
				return call;
			}
		} else if(isBinaryExpression(node)) {
			let op = binary[node.operatorToken.kind];
			let left = node.left;
			let right = node.right;
			if(
				op &&
				(isVector(vectors, checker, left) || isVector(vectors, checker, right)) &&
				(isVectorOperand(vectors, checker, left) && isVectorOperand(vectors, checker, right))
			) {
				if(!isVector(vectors, checker, left)) {
					const flip = commutative[op];
					if(flip) {
						left = node.right;
						right = node.left;
						if(flip != true) op = flip;
					} else {
						left = factory.createCallExpression(factory.createIdentifier(
							checker.typeToString(checker.getTypeAtLocation(right)).toLowerCase()
						), void 0, [left]);
					}
				}

				const call = factory.createCallExpression(
					factory.createPropertyAccessExpression(left, op!),
					void 0,
					[right]
				);

				vectors.add(call);
				return call;
			} else if(node.operatorToken.kind == SyntaxKind.EqualsToken && isIdentifier(right) && isVector(vectors, checker, right)) {
				const call = factory.createCallExpression(
					factory.createPropertyAccessExpression(right, 'copy'),
					void 0,
					[]
				);

				const assign = factory.updateBinaryExpression(
					node,
					left,
					node.operatorToken,
					call
				);

				vectors.add(call);
				vectors.add(assign);
				return assign;
			}
		} else if(isCallExpression(node)) {
			const args = node.arguments.map((arg: Expression) => {
				if(isIdentifier(arg) && isVector(vectors, checker, arg)) {
					return factory.createCallExpression(
						factory.createPropertyAccessExpression(arg, 'copy'),
						void 0,
						[]
					);
				}

				return arg;
			});

			return factory.updateCallExpression(
				node,
				node.expression,
				node.typeArguments,
				args
			);
		}

		return node;
	};

	return () => (node: Node) => visitNode(node, visit) as SourceFile;
}

const config = Object.assign({}, getDefaultCompilerOptions(), tsOptions);
let host: CompilerHost;
let program: Program;

export function compile(key: string, code: string) {
	vfs.write(key, new File(code));

	host = createHost(vfs, [key], config);
	program = createProgram([key], config, host);
	const checker = program.getTypeChecker();

	const result = program.emit(void 0, void 0, void 0, void 0, { before: [vectorOperators(checker)] });

	/* for(const diagnostic of getPreEmitDiagnostics(program).concat(result.diagnostics)) {
		if(diagnostic.file) {
			const { line, character } = getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start || 0);
			const message = flattenDiagnosticMessageText(diagnostic.messageText, '\n');
			console.error(diagnostic.file.fileName + ' (' + (line + 1) + ',' + (character + 1) + '): ' + message);
		} else {
			console.error(flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
		}
	} */

	return vfs.read('/index.js')!.getText();
}
