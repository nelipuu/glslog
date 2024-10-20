import type { Swizzle } from './Swizzle.js';

export type MainReturn<Func extends (...args: any) => any> = ReturnType<Func> extends [infer First, ...any] ? First : never;

export const $copy = <Type>(n: Type) => n;

class Pool {

	constructor(public Kind: typeof Float32Array | typeof Int32Array | typeof Uint32Array) { }

	alloc32(size: number) {
		let offset = this.offset;

		if((this.offset += size * 4) > Pool.bufferSize) {
			this.buffer = new ArrayBuffer(Pool.bufferSize);
			offset = 0;
			this.offset = size * 4;
		}

		return new this.Kind(this.buffer, offset, size);
	}

	static bufferSize = 1024 * 1024;
	buffer = new ArrayBuffer(Pool.bufferSize);
	offset = 0;

}

export class Vec {

	copy() {
		const v = this.arena[++this.kind.allocated] || (this.arena[this.kind.allocated] = new this.kind() as this);
		v.data.set(this.data);
		return v;
	}

	alloc(...args: (Vec | number)[]) {
		const v = this.arena[++this.kind.allocated] || (this.arena[this.kind.allocated] = new this.kind() as this);

		const size = this.size;
		const data = v.data;
		const argc = args.length;
		let n = argc && argc == 1 && args[0];

		if(typeof n == 'number') {
			data.fill(n);
		} else {
			let i = 0;

			for(const arg of args) {
				if(typeof arg == 'number') {
					data[i++] = arg;
				} else {
					const len = arg.size;
					for(let j = 0; j < len;) data[i++] = arg.data[j++];
				}
			}

			while(i < size) data[i++] = 0;
		}

		return v;
	}

	allocMap(fn: (value: number, index: number) => number) {
		const v = this.arena[++this.kind.allocated] || (this.arena[this.kind.allocated] = new this.kind() as this);

		const src = this.data;
		const dst = v.data;

		for(let i = this.size; i--;) dst[i] = fn(src[i], i);

		return v;
	}

	negate(): this { return this.allocMap((n) => -n); }

	add(v: Vec | number): this { return this.allocMap(typeof v == 'number' ? (n) => n + v : (n, i) => n + v.data[i]); }
	sub(v: Vec | number): this { return this.allocMap(typeof v == 'number' ? (n) => n - v : (n, i) => n - v.data[i]); }
	div(v: Vec | number): this { return this.allocMap(typeof v == 'number' ? (n) => n / v : (n, i) => n / v.data[i]); }
	subFlip(v: Vec | number): this { return this.allocMap(typeof v == 'number' ? (n) => v - n : (n, i) => v.data[i] - n); }
	divFlip(v: Vec | number): this { return this.allocMap(typeof v == 'number' ? (n) => v / n : (n, i) => v.data[i] / n); }

	mul(v: Mat | Vec | number): this {
		if(v instanceof Mat) {
			const size = v.size;
			const a = this.data;
			const b = v.data;

			return this.allocMap((_, i) => {
				let sum = 0;

				for(let j = 0, p = i * size; j < size;) sum += a[j++] * b[p++];

				return sum;
			});
		} else {
			return this.allocMap(typeof v == 'number' ? (n) => n * v : (n, i) => n * v.data[i]);
		}
	}

	toString() { return '[' + this.data.join(', ') + ']'; }

	pool!: Pool;
	arena!: this[];
	static allocated = 0;

	size!: number;
	kind!: typeof Vec;

	data = this.pool.alloc32(this.size);

}

export interface Vec extends Swizzle { }

export class Vec2 extends Vec { }
export class Vec3 extends Vec { }
export class Vec4 extends Vec { }
export class IVec2 extends Vec { }
export class IVec3 extends Vec { }
export class IVec4 extends Vec { }
export class UVec2 extends Vec { }
export class UVec3 extends Vec { }
export class UVec4 extends Vec { }

export function vec2(...args: (Vec | number)[]) { return Vec2.prototype.alloc(...args); }
export function vec3(...args: (Vec | number)[]) { return Vec3.prototype.alloc(...args); }
export function vec4(...args: (Vec | number)[]) { return Vec4.prototype.alloc(...args); }
export function ivec2(...args: (Vec | number)[]) { return IVec2.prototype.alloc(...args); }
export function ivec3(...args: (Vec | number)[]) { return IVec3.prototype.alloc(...args); }
export function ivec4(...args: (Vec | number)[]) { return IVec4.prototype.alloc(...args); }
export function uvec2(...args: (Vec | number)[]) { return UVec2.prototype.alloc(...args); }
export function uvec3(...args: (Vec | number)[]) { return UVec3.prototype.alloc(...args); }
export function uvec4(...args: (Vec | number)[]) { return UVec4.prototype.alloc(...args); }
export function bvec2(...args: (Vec | number)[]) { return UVec2.prototype.alloc(...args); }
export function bvec3(...args: (Vec | number)[]) { return UVec3.prototype.alloc(...args); }
export function bvec4(...args: (Vec | number)[]) { return UVec4.prototype.alloc(...args); }

// Vector indexing and swizzling

function initVec(kinds: (typeof Vec)[], arrayKind: typeof Float32Array | typeof Int32Array | typeof Uint32Array) {
	kinds.map((kind, n) => {
		const size = n + 2;
		const pool = new Pool(arrayKind);

		kind.prototype.pool = pool;
		kind.prototype.arena = [];
		kind.prototype.data = pool.alloc32(size);

		kind.prototype.size = size;
		kind.prototype.kind = kind;

		const sets = ['xyzw', 'rgba', 'stpq'];

		for(let i = 0; i < size; ++i) {
			let desc: PropertyDescriptor = {
				get(this: Vec) { return this.data[i] },
				set(this: Vec, n: number) { this.data[i] = n; }
			};

			Object.defineProperty(kind.prototype, i, desc);

			for(const set of sets) {
				Object.defineProperty(kind.prototype, set[i], desc);
			}

			for(let j = 0; j < size; ++j) {
				desc = {
					get(this: Vec) {
						const d = this.data;
						return kinds[0].prototype.alloc(d[i], d[j]);
					},
					set(this: Vec, v: Vec2) {
						const d = this.data;
						const s = v.data;
						d[i] = s[0];
						d[j] = s[1];
					}
				};

				for(const set of sets) {
					Object.defineProperty(kind.prototype, set[i] + set[j], desc);
				}

				for(let k = 0; k < size; ++k) {
					desc = {
						get(this: Vec) {
							const d = this.data;
							return kinds[1].prototype.alloc(d[i], d[j], d[k]);
						},
						set(this: Vec, v: Vec3) {
							const d = this.data;
							const s = v.data;
							d[i] = s[0];
							d[j] = s[1];
							d[k] = s[2];
						}
					};

					for(const set of sets) {
						Object.defineProperty(kind.prototype, set[i] + set[j] + set[k], desc);
					}

					for(let l = 0; l < size; ++l) {
						desc = {
							get(this: Vec) {
								const d = this.data;
								return kinds[2].prototype.alloc(d[i], d[j], d[k], d[l]);
							},
							set(this: Vec, v: Vec4) {
								const d = this.data;
								const s = v.data;
								d[i] = s[0];
								d[j] = s[1];
								d[k] = s[2];
								d[l] = s[3];
							}
						};

						for(const set of sets) {
							Object.defineProperty(kind.prototype, set[i] + set[j] + set[k] + set[l], desc);
						}
					}
				}
			}
		}
	});
}

const vecKinds = [Vec2, Vec3, Vec4];
initVec(vecKinds, Float32Array);
initVec([IVec2, IVec3, IVec4], Int32Array);
initVec([UVec2, UVec3, UVec4], Uint32Array);

export class Mat {

	copy() {
		const M = this.arena[++this.kind.allocated] || (this.arena[this.kind.allocated] = new this.kind() as this);
		M.data.set(this.data);
		return M;
	}

	alloc(...args: (Vec | number)[]) {
		const M = this.arena[++this.kind.allocated] || (this.arena[this.kind.allocated] = new this.kind() as this);

		const size = this.size;
		const data = M.data;
		const argc = args.length;
		let n = +!argc || (argc == 1 && args[0]);
		let p = 0;

		if(typeof n == 'number') {
			data.fill(0);

			p = size * size - 1;

			while(p >= 0) {
				data[p] = n;
				p -= size + 1;
			}
		} else {
			for(const arg of args) {
				if(typeof arg === 'number') {
					data[p++] = arg;
				} else {
					for(let i = 0; i < size;) data[p++] = arg.data[i++];
				}
			}

			while(p < size) data[p++] = 0;
		}

		return M;
	}

	allocMap(fn: (value: number, index: number) => number) {
		const M = this.arena[++this.kind.allocated] || (this.arena[this.kind.allocated] = new this.kind() as this);

		const src = this.data;
		const dst = M.data;

		for(let i = this.size; i--;) dst[i] = fn(src[i], i);

		return M;
	}

	negate(): this { return this.allocMap((n) => -n); }

	add(M: Mat | number): this { return this.allocMap(typeof M == 'number' ? (n) => n + M : (n, i) => n + M.data[i]); }
	sub(M: Mat | number): this { return this.allocMap(typeof M == 'number' ? (n) => n - M : (n, i) => n - M.data[i]); }
	subFlip(M: Mat | number): this { return this.allocMap(typeof M == 'number' ? (n) => M - n : (n, i) => M.data[i] - n); }

	mul(M: Vec): Vec;
	mul(M: Mat | number): this;
	mul(M: Mat | Vec | number): this | Vec {
		if(typeof M == 'number') return this.allocMap((n) => n * M);

		const size = this.size;
		const a = this.data;
		const b = M.data;

		if(M instanceof Vec) {
			return this.vecKind.prototype.allocMap((_, i) => {
				let sum = 0;

				for(let j = 0, p = i; j < size; p += size) sum += a[p] * b[j++];

				return sum;
			});
		}

		const result = this.alloc(); // Allocate space for the result matrix
		const data = result.data;
		let p = 0;

		for(let i = 0; i < size; ++i) {
			for(let j = 0; j < size; ++j) {
				let sum = 0;

				for(let k = 0, q = i * size, r = j; k < size; ++k, r += size) sum += a[q++] * b[r];

				data[p++] = sum;
			}
		}

		return result;
	}

	pool!: Pool;
	arena!: this[];
	static allocated = 0;

	size!: number;
	kind!: typeof Mat;
	vecKind!: typeof Vec;

	data = this.pool.alloc32(this.size * this.size);

}

export class Mat2 extends Mat { }
export class Mat3 extends Mat { }
export class Mat4 extends Mat { }

export function mat2(...args: number[]) { return Mat2.prototype.alloc(...args); }
export function mat3(...args: number[]) { return Mat3.prototype.alloc(...args); }
export function mat4(...args: number[]) { return Mat4.prototype.alloc(...args); }

export function mat2x2(...args: number[]) { return Mat2.prototype.alloc(...args); }
export function mat3x3(...args: number[]) { return Mat3.prototype.alloc(...args); }
export function mat4x4(...args: number[]) { return Mat4.prototype.alloc(...args); }

// Matrix indexing

[Mat2, Mat3, Mat4].map((kind, n) => {
	const size = n + 2;
	const pool = new Pool(Float32Array);

	kind.prototype.pool = pool;
	kind.prototype.arena = [];
	kind.prototype.data = pool.alloc32(size * size);

	kind.prototype.size = size;
	kind.prototype.kind = kind;
	kind.prototype.vecKind = vecKinds[n];

	for(let i = size; i--;) {
		let pos = i * size;

		Object.defineProperty(kind.prototype, i, {
			get() { return this.vecKind.prototype.alloc(...this.data.slice(pos, pos + size)); },
			set(v: Vec | number) {
				const data = this.data;

				if(typeof v == 'number') {
					for(let j = size; j--;) data[pos + j] = v;
				} else {
					for(let j = size; j--;) data[pos + j] = v.data[j];
				}
			}
		});
	}
});

export function $saveCheckpoint() {
	return [Vec2, Vec3, Vec4, IVec2, IVec3, IVec4, UVec2, UVec3, UVec4, Mat2, Mat3, Mat4].map((kind) => kind.allocated);
}

export function $loadCheckpoint(checkpoint: number[]) {
	[Vec2, Vec3, Vec4, IVec2, IVec3, IVec4, UVec2, UVec3, UVec4, Mat2, Mat3, Mat4].forEach((kind, i) => kind.allocated = checkpoint[i]);
}

// Angle and Trigonometry Functions

function wrapMath(op: (n: number) => number) {
	function wrapped(v: Vec): Vec;
	function wrapped(v: number): number;
	function wrapped(v: Vec | number) { return typeof v == 'number' ? op(v) : v.allocMap(op); }

	return wrapped;
}

function wrap2(op: (a: number, b: number) => number) {
	function wrapped(u: number, v: number): number;
	function wrapped(u: Vec, v: number): Vec;
	function wrapped(u: number, v: Vec): Vec;
	function wrapped(u: Vec, v: Vec): Vec;
	function wrapped(u: Vec | number, v: Vec | number) {
		if(typeof u == 'number') {
			return typeof v == 'number' ? op(u, v) : v.allocMap((n) => op(u, n));
		} else {
			return typeof v == 'number' ? u.allocMap((n) => op(n, v)) : u.allocMap((n, i) => op(n, v.data[i]));
		}
	}

	return wrapped;
}

function wrap3(op: (a: number, b: number, c: number) => number) {
	function wrapped(u: number, v: number, a: number): number;
	function wrapped(u: Vec, v: number, a: number): Vec;
	function wrapped(u: number, v: Vec, a: number): Vec;
	function wrapped(u: number, v: number, a: Vec): Vec;
	function wrapped(u: number, v: Vec, a: Vec): Vec;
	function wrapped(u: Vec, v: number, a: Vec): Vec;
	function wrapped(u: Vec, v: Vec, a: number): Vec;
	function wrapped(u: Vec, v: Vec, a: Vec): Vec;
	function wrapped(u: Vec | number, v: Vec | number, a: Vec | number) {
		if(typeof u == 'number') {
			if(typeof v == 'number') {
				return typeof a == 'number' ? op(u, v, a) : a.allocMap((n) => op(u, v, n));
			} else {
				return typeof a == 'number' ? v.allocMap((n) => op(u, n, a)) : a.allocMap((n, i) => op(u, v.data[i], n));
			}
		} else {
			if(typeof v == 'number') {
				return typeof a == 'number' ? u.allocMap((n) => op(n, v, a)) : a.allocMap((n, i) => op(u.data[i], v, n));
			} else {
				return typeof a == 'number' ? u.allocMap((n, i) => op(n, v.data[i], a)) : a.allocMap((n, i) => op(u.data[i], v.data[i], n));
			}
		}
	}

	return wrapped;
}

export function radians(v: number): number;
export function radians(v: Vec): Vec;
export function radians(v: Vec | number): Vec | number {
	return typeof v == 'number' ? v * Math.PI / 180 : v.allocMap((n) => n * Math.PI / 180);
}

export function degrees(v: number): number;
export function degrees(v: Vec): Vec;
export function degrees(v: Vec | number): Vec | number {
	return typeof v == 'number' ? v * 180 / Math.PI : v.allocMap((n) => n * 180 / Math.PI);
}

export const sin = wrapMath(Math.sin);
export const cos = wrapMath(Math.cos);
export const tan = wrapMath(Math.tan);
export const asin = wrapMath(Math.asin);
export const acos = wrapMath(Math.acos);

const atan2 = wrap2(Math.atan2);

export function atan(u: number): number;
export function atan(u: Vec): Vec;
export function atan(u: number, v: number): number;
export function atan(u: Vec, v: number): Vec;
export function atan(u: number, v: Vec): Vec;
export function atan(u: Vec, v: Vec): Vec;
export function atan(u: Vec | number, v?: Vec | number): Vec | number {
	if(typeof v == 'undefined') {
		return typeof u == 'number' ? Math.atan(u) : u.allocMap((n) => Math.atan(n));
	} else {
		return atan2(u as Vec, v as Vec);
	}
}

// Exponential Functions

export const pow = wrap2((a, b) => Math.pow(a, b));
export const exp = wrapMath(Math.exp);
export const log = wrapMath(Math.log);

export function exp2(v: number): number;
export function exp2(v: Vec): Vec;
export function exp2(v: Vec | number): Vec | number {
	return typeof v == 'number' ? Math.pow(2, v) : v.allocMap((n) => Math.pow(2, n));
}

export const log2 = wrapMath(Math.log2);
export const sqrt = wrapMath(Math.sqrt);

export function inversesqrt(v: number): number;
export function inversesqrt(v: Vec): Vec;
export function inversesqrt(v: Vec | number): Vec | number {
	return typeof v == 'number' ? 1 / Math.sqrt(v) : v.allocMap((n) => 1 / Math.sqrt(n));
}

// Common Functions

export const abs = wrapMath(Math.abs);
export const sign = wrapMath(Math.sign);
export const floor = wrapMath(Math.floor);
export const ceil = wrapMath(Math.ceil);

export function fract(v: number): number;
export function fract(v: Vec): Vec;
export function fract(v: Vec | number): Vec | number {
	return typeof v == 'number' ? v - Math.floor(v) : v.allocMap((n) => n - Math.floor(n));
}

export const mod = wrap2((a, b) => a % b);
export const min = wrap2(Math.min);
export const max = wrap2(Math.max);
export const clamp = wrap3((x, a, b) => x < a ? a : (x > b ? b : x));
export const mix = wrap3((x, y, a) => x + (y - x) * a);
export const step = wrap2((a, b) => +(a <= b));

function smooth(edge0: number, edge1: number, x: number): number {
	const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

export const smoothstep = wrap3(smooth);

// Geometric functions

export function length(v: Vec) {
	return Math.sqrt(dot(v, v));
}

export function distance(u: Vec, v: Vec) {
	const len = u.size;
	let sum = 0;

	for(let i = len; i--;) {
		const d = v.data[i] - u.data[i];
		sum += d * d;
	}

	return Math.sqrt(sum);
}

export function dot(u: Vec, v: Vec) {
	const len = u.size;
	let sum = 0;

	for(let i = len; i--;) sum += u.data[i] * v.data[i];

	return sum;
}

export function cross(u: Vec3, v: Vec3): Vec3 {
	const a = u.data;
	const b = v.data;

	return Vec3.prototype.alloc(
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0]
	);
}

export function normalize(v: Vec) {
	const scale = 1 / Math.sqrt(dot(v, v));
	return v.allocMap((n) => n * scale);
}

export function faceforward(u: Vec, v: Vec, r: Vec) {
	return dot(r, v) < 0 ? u : u.negate();
}

export function reflect(u: Vec, v: Vec) {
	const scale = 2 * dot(u, v);
	return u.allocMap((n, i) => n - scale * v.data[i]);
}

export function refract(u: Vec, v: Vec, eta: number) {
	const dotUV = dot(u, v);
	const k = 1 - eta * eta * (1 - dotUV * dotUV);
	if(k < 0) return u.alloc(0);

	const r = eta * dotUV + Math.sqrt(k);
	return u.allocMap((n, i) => n * eta - v.data[i] * r);
}

// Matrix Functions

export function matrixCompMult(m: Mat, n: Mat) { const data = n.data; return m.allocMap((a, i) => a * data[i]); }

// Vector Relational Functions

export const lessThan = wrap2((a, b) => +(a < b));
export const lessThanEqual = wrap2((a, b) => +(a <= b));
export const greaterThan = wrap2((a, b) => +(a > b));
export const greaterThanEqual = wrap2((a, b) => +(a >= b));
export const equal = wrap2((a, b) => +(a == b));
export const notEqual = wrap2((a, b) => +(a != b));

export function any(v: Vec) {
	const data = v.data;
	for(let i = v.size; i--;) if(data[i]) return 1;
	return 0;
}

export function all(v: Vec) {
	const data = v.data;
	for(let i = v.size; i--;) if(!data[i]) return 0;
	return 1;
}

export function not(v: Vec) { return v.allocMap((n) => +!n); }

// Debug functions

function deepString(value: any): any {
	if(!value || typeof value != 'object') return value;

	if(Array.isArray(value)) return value.map(deepString);
	if(value instanceof Vec || value instanceof Mat) return Array.from(value.data);

	const result: Record<string, any> = {};

	for(const key of Object.keys(value)) {
		result[key] = deepString(value[key]);
	}

	return result;
}

let $print: (...args: any[]) => void;

export function $setPrint(fn: (...args: any[]) => void) { $print = fn; }

export function print(...args: any[]) { $print(...args.map(deepString)); }
