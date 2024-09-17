import { PromiseSync, PromiseKind, PromiseInstance, Lazy, isPromiseLike } from './PromiseSync';

interface Module {
	default?: any;
	[name: string]: any;
}

interface Meta {
	url: string;
	resolve: (id: string, base?: string) => Promise<string>;
}

interface Import {
	<Type extends Module>(name: string, base?: string): Promise<Type>;
	meta: Meta;
}

interface Context {
	import: Import;
	meta: Meta;
}

type Declare = (
	exports: (<Type>(name: string, value: Type) => Type) | (<Type extends Module>(exports: Type) => void),
	context?: Context
) => ({
	setters?: (((value: any) => any) | null | undefined)[],
	execute?: () => Lazy<any>
});

interface PathItem {
	importation: Importation;
	parent?: PathItem;
}

const empty: never[] = [];

/** Lifecycle of importing a single module and its dependencies:
  *
  * - Resolve name to an ID (URL).
  * - Fetch resolved URL.
  * - Analyze dependencies, what relative paths and names are imported?
  * - Recursively resolve and fetch dependencies.
  *
  * - Translate, produce JavaScript function to call for initializing the module.
  * - Link, assign export objects from dependencies to imports,
  *   ensure imports update after instantiating dependencies.
  * - Instantiate, call module top-level code that initializes its exports.
  *
  * Each step is applied to all transitive dependencies before moving to the next step. */

class Importation {

	constructor(public id: string, public registry: Registry, public parent?: Importation) { }

	fetch() {
		// TODO: Stub for now
		Promise.resolve([]).then(
			(dependencyNames: string[]) => {
				this.dependencyNames = dependencyNames;
			}
		);
	}

	analyze(): Promise<this> {
		if(this.analyzed) return this.analyzed;

		this.analyzed = Promise.all(this.dependencyNames.map(
			(name) => this.registry.getImportation(Promise, name, this))
		).then(
			(dependencies: Importation[]) => {
				this.dependencies = dependencies;
				return this;
			},
			(error) => {
				this.registry.logError(this, 'Error resolving and fetching dependencies', error);
				return Promise.reject(error);
			}
		);

		return this.analyzed;
	}

	translate(): Promise<this> {
		if(this.translated) return this.translated;

		this.translated = new Promise<this>((resolve, reject) => {
			const module = this.module;

			const meta: Meta = {
				url: this.id,
				resolve: (name: string, base?: string) => this.registry.resolve(Promise, name, base || this.id)
			};

			const context: Context = {
				import: Object.assign(<Type extends Module>(name: string, base?: string): Promise<Type> => {
					const parent = base === void 0 ? base : this.registry.getImportation(PromiseSync, base).valueOf();
					return this.registry.getImportation(Promise, name, parent).then(importation => importation.module as Type);
				}, { meta }),
				meta
			}

			let changed = false;

			const setExport = <Type>(name: string, value: Type): Type => {
				if(!(name in module) || module[name] !== value) {
					module[name] = value;
					changed = true;
				}

				return value;
			};

			const exports = <Type>(name: string | Module, value?: Type): Type | undefined => {
				let result: Type | undefined;
				changed = false;

				if(typeof name == 'string') {
					result = setExport(name, value);
				} else if(name) {
					for(const key of Object.keys(name) as (keyof Module & string)[]) {
						setExport(key, name[key]);
					}

					const magic = '__esModule';
					if(name[magic]) setExport(magic, name[magic]);
				}

				if(changed) {
					for(const setter of this.importerSetters) {
						setter.call(void 0, module);
					}
				}

				return result;
			};

			try {
				const declaration = this.declare && this.declare.call(void 0, exports, context) as ReturnType<Declare>;
				if(declaration) {
					this.setters = declaration.setters;
					this.execute = declaration.execute;
				}
			} catch(error) {
				this.registry.logError(this, 'Error in module declaration code', error);
				return reject(error);
			}

			resolve(this);
		});

		return this.translated;
	}

	link(): Promise<this> {
		if(this.linked) return this.linked;

		this.linked = new Promise<this>((resolve, reject) => {
			const setters = this.setters;

			if(setters) {
				const dependencies = this.dependencies;
				let num = 0;

				for(const setter of setters) {
					if(setter) {
						const dep = dependencies[num];
						dep.importerSetters.push(setter);
						try {
							setter.call(void 0, dep.module);
						} catch(error) {
							this.registry.logError(this, 'Error passing module to dependent', error);
							return reject(error);
						}
					}

					++num;
				}
			}

			resolve(this);
		});

		return this.linked;
	}

	instantiate(): Promise<this> {
		if(this.instantiated) return this.instantiated;

		this.instantiated = new Promise<this>((resolve, reject) => {
			if(this.execute) {
				try {
					const result = this.execute.call(void 0);

					if(isPromiseLike(result)) {
						return Promise.resolve(result).then(
							() => resolve(this),
							(error) => {
								this.registry.logError(this, 'Error instantiating module', error);
								reject(error);
							}
						);
					}
				} catch(error) {
					this.registry.logError(this, 'Error instantiating module', error);
					return reject(error);
				}
			}

			resolve(this);
		});

		return this.instantiated;
	}

	DFS(
		visitBefore?: ((node: Importation) => Promise<unknown>) | null,
		visitAfter?: ((node: Importation) => Promise<unknown>) | null,
		path?: PathItem
	): Promise<this> {
		const id = this.id;
		let parent = path;

		// Avoid processing a module as a transitive dependency of itself,
		// or we'll wait forever for dependencies to be ready before the module.
		while(parent) {
			if(parent.importation == this) return this.selfPromise;
			parent = parent.parent;
		}

		path = { importation: this, parent: path };

		return (visitBefore ? visitBefore(this) : this.selfPromise).then(
			() => Promise.all(this.dependencies.map((dep) => dep.DFS(visitBefore, visitAfter, path)))
		).then(
			() => visitAfter && visitAfter(this)
		).then(() => this);
	}

	analyzeAll(): Promise<this> {
		return this.DFS((dep) => dep.analyze());
	}

	translateAll(): Promise<this> {
		return this.DFS(null, (dep) => dep.translate());
	}

	linkAll(): Promise<this> {
		return this.DFS(null, (dep) => dep.link());
	}

	instantiateAll(): Promise<this> {
		return this.DFS(null, (dep) => dep.instantiate());
	}

	selfPromise = Promise.resolve(this);

	// Initially set
	module: Module = {};

	// After fetch (or given through System.register)
	dependencyNames: string[] = [];
	declare?: Declare;

	// After analyze
	analyzed?: Promise<this>;
	dependencies: Importation[] = [];

	// After translate (calls declare)
	translated?: Promise<this>;
	setters?: ((<Type>(value: Type) => Type) | null | undefined)[];
	execute?: () => Lazy<any>;

	// After link
	linked?: Promise<this>;
	importerSetters: ((module: Module) => void)[] = [];

	// After instantiate
	instantiated?: Promise<this>;

}

class Registry {

	logError(importation: Importation, message: string, originalError?: any) {
		console.error(message, importation.id);
	}

	resolve<Promish extends PromiseKind>(Promish: Promish, name: string, base?: string) {
		return Promish.resolve(new URL(name, base).href) as PromiseInstance<string, Promish>;
	}

	getImportation<Promish extends PromiseKind>(Promish: Promish, name: string, parent?: Importation) {
		return this.resolve(Promish, name, parent && parent.id).then((id) =>
			this.importations[id] || (this.importations[id] = new Importation(id, this, parent))
		) as PromiseInstance<Importation, Promish>;
	}

	importations: { [id: string]: Importation | undefined } = {};

}

export class SystemJS {

	constructor(base: string) {
		this.root = this.registry.getImportation(PromiseSync, base).valueOf();
	}

	import(name: string, base?: string): Promise<Module> {
		const parent = base === void 0 ? this.root : this.registry.getImportation(PromiseSync, base).valueOf();

		return this.registry.getImportation(Promise, name, parent).then(
			(importation) => importation.analyzeAll()
		).then(
			(importation) => importation.translateAll()
		).then(
			(importation) => importation.linkAll()
		).then(
			(importation) => importation.instantiateAll()
		).then(
			(importation) => importation.module
		);
	}

	register(name: string, dependencies: string[], declare: Declare): void {
		let importation = this.registry.getImportation(PromiseSync, name, this.root).valueOf();

		importation.dependencyNames = dependencies;
		importation.declare = declare;
	}

	resolve(name: string, base?: string): string {
		return new URL(name, base).href;
	}

	root: Importation;
	registry = new Registry();

}

declare module globalThis {
	let System: SystemJS;
}

declare global {
	let System: SystemJS;
}

export const System = new SystemJS(new URL('.', window.location.href).href);
globalThis.System = System;
