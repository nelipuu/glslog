export interface PromiseKind {
	new <Type>(executor: (
		resolve: (value: Lazy<Type>) => void,
		reject: (reason?: any) => void) => void
	): PromiseLike<Type>;

	resolve: typeof PromiseSync.resolve;
	reject: typeof PromiseSync.reject;
	all: typeof PromiseSync.all;
}

export type PromiseInstance<Type, Kind extends PromiseKind = PromiseConstructor> = (
	Kind extends typeof PromiseSync ? PromiseSync<Type> : Promise<Type>
);

type Executor<Type> = (
	resolve: (value: Lazy<Type>) => void,
	reject: (reason?: any) => void
) => void;

export type Lazy<Type> = Type | PromiseLike<Type>;
type Resolved<Type = unknown> = (value: Type) => Lazy<Type>;
type Rejected<Type = never> = (reason: any) => Lazy<Type>;

export function isPromiseLike<Type = unknown>(value: unknown): value is PromiseLike<Type> {
	return typeof value == 'object' && !!value && typeof (value as PromiseLike<Type>).then == 'function';
}

export class PromiseSync<Type = unknown> implements PromiseLike<Type> {

	static Instance: <Type>() => PromiseSync<Type>;

	static resolve(): PromiseLike<void>;
	static resolve<Type = unknown>(value: Lazy<Type>): PromiseLike<Type>;
	static resolve<Type = unknown>(value?: Lazy<Type>): PromiseLike<Type> {
		return new PromiseSync<Type>((resolve) => resolve(value!));
	}

	static reject(reason: any): PromiseLike<any> {
		return new PromiseSync<never>((resolve, reject) => reject(reason));
	}

	static all<Type extends unknown[]>(iterable: Type): PromiseLike<{ [Key in keyof Type]: Awaited<Type[Key]> }>;
	static all<Type>(iterable: Iterable<Lazy<Type>>): PromiseLike<Type[]>;
	static all<Type>(iterable: Iterable<Lazy<Type>>): PromiseLike<Type[]> {
		return new PromiseSync((resolve, reject) => {
			const results: Type[] = [];
			let completed = -1;
			let count = 0;

			for(let item of iterable) {
				const index = count++;

				if(!isPromiseLike(item)) item = PromiseSync.resolve(item);

				item.then(
					(value) => {
						results[index] = value;
						if(++completed === count) resolve(results);
					},
					reject
				);
			}

			if(++completed === count) resolve(results);
		});
	}

	constructor(executor: Executor<Type>) {
		const resolve = (value?: Lazy<Type>) => {
			if(this.success !== void 0) return;

			if(isPromiseLike(value)) {
				value.then(resolve, reject);
			} else {
				this.success = true;
				this.value = value;

				if(this.fulfilled) {
					for(const fulfilled of this.fulfilled) fulfilled(value);
					this.fulfilled = void 0;
				}
			}
		};

		const reject = (reason?: any) => {
			if(this.success !== void 0) return;

			this.success = false;
			this.reason = reason;

			if(this.rejected) {
				for(const rejected of this.rejected) rejected(reason);
				this.rejected = void 0;
			}
		};

		this.resolve = resolve;
		this.reject = reject;

		try { executor(resolve, reject); } catch(error) { reject(error); }
	}

	then<FulfillType = Type, RejectType = never>(
		fulfilled?: ((value: Type) => Lazy<FulfillType>) | null,
		rejected?: ((reason: any) => Lazy<RejectType>) | null
	): PromiseLike<FulfillType | RejectType> {
		const success = this.success;

		if(success === void 0) {
			const promise = new PromiseSync<FulfillType | RejectType>(() => { });
			const resolve = promise.resolve;
			const reject = promise.reject;

			(this.fulfilled || (this.fulfilled = [])).push(
				!fulfilled ? resolve : (value: Type) => {
					try { resolve(fulfilled(value)); } catch(error) { reject(error); }
				}
			);
			(this.rejected || (this.rejected = [])).push(
				!rejected ? reject : (reason: any) => {
					try { resolve(rejected(reason)); } catch(error) { reject(error); }
				}
			);

			return promise;
		}

		if((success && fulfilled) || (!success && rejected)) {
			try {
				let result: Lazy<FulfillType | RejectType> = success ? fulfilled!(this.value!) : rejected!(this.reason);
				if(!isPromiseLike(result)) result = PromiseSync.resolve(result);
				return result;
			} catch(error) {
				return PromiseSync.reject(error);
			}
		}

		return success ? PromiseSync.resolve(this.value as FulfillType) : PromiseSync.reject(this.reason);
	}

	catch<Rejected>(rejected?: (reason: any) => Lazy<Rejected>) {
		return this.then(null, rejected);
	}

	finally(resolved: () => void): PromiseLike<Type> {
		return this.then(
			(value: Type) => PromiseSync.resolve(resolved()).then(() => value),
			(reason: any) => PromiseSync.resolve(resolved()).then(() => PromiseSync.reject(reason))
		);
	}

	valueOf() {
		const success = this.success;

		if(success === true) {
			return this.value!;
		} else if(success === false) {
			throw this.reason;
		} else {
			throw new Error('Unresolved');
		}
	}

	private resolve: (value: Lazy<Type>) => void;
	private reject: (reason?: any) => void;
	private fulfilled?: Resolved<any>[];
	private rejected?: Rejected<any>[];

	private success?: boolean;
	private value?: Type;
	private reason?: any;

}
