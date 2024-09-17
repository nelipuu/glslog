import { glsl2js } from './glsl2js';
import type { Vec, Mat, vec2, vec3, vec4, $setPrint, $saveCheckpoint, $loadCheckpoint } from './webgl';

type FunctionOnly<Type> = {
	[Key in keyof Type as Type[Key] extends (...args: any[]) => any ? Key : never]: Type[Key];
};

type StoragePart = Record<string, Value>;

interface Storage {
	/** Internals like gl_Position. */
	internal: StoragePart;
	uniform: StoragePart;
	attribute: StoragePart;
	varying: StoragePart;
}

interface ShaderModule {
	$storage: Storage;
	vec2: typeof vec2;
	vec3: typeof vec3;
	vec4: typeof vec4;

	$setPrint: typeof $setPrint;
	$saveCheckpoint: typeof $saveCheckpoint;
	$loadCheckpoint: typeof $loadCheckpoint;

	main(): void;
}

interface ShaderMeta {
	shader: WebGLShader;
	kind: number;
	source?: string;
	module?: ShaderModule;
}

type AttributeData = Float32Array | Uint32Array | Uint16Array | Uint8Array | Int32Array | Int16Array | Int8Array;

interface AttributeMeta {
	name?: string;
	data: AttributeData | null;
	size: number;
	kind: number;
	normalized: boolean;
	offset: number;
	stride: number;
	enabled: boolean;
}

interface EnabledAttribute {
	name: string,
	data: AttributeData,
	size: number,
	offset: number,
	stride: number
}

interface ProgramMeta {
	program: WebGLProgram;
	vertex?: ShaderMeta;
	fragment?: ShaderMeta;

	uniformLocation: Record<string, WebGLUniformLocation>;
	uniformData: Map<WebGLUniformLocation, number[]>;

	attributeLocation: Record<string, number>;
	attributes: AttributeMeta[];
}

interface BufferMeta {
	target: number;
	data: BufferSource | null;
}

type Value = number | Vec | Mat;

export function wrapContext(gl: WebGLRenderingContext, print: (...args: any[]) => void) {
	if(!gl) return gl;

	const DebugContext = function DebugContext() { } as unknown as { new(): WebGLRenderingContext };
	DebugContext.prototype = gl;

	const typeInfo: Record<number, { array: { new(buffer: ArrayBufferLike, byteOffset?: number, length?: number): AttributeData }, size: number }> = {
		[gl.FLOAT]: { array: Float32Array, size: 4 },
		[gl.UNSIGNED_INT]: { array: Uint32Array, size: 4 },
		[gl.UNSIGNED_SHORT]: { array: Uint16Array, size: 2 },
		[gl.UNSIGNED_BYTE]: { array: Uint8Array, size: 1 },
		[gl.INT]: { array: Int32Array, size: 4 },
		[gl.SHORT]: { array: Int16Array, size: 2 },
		[gl.BYTE]: { array: Int8Array, size: 1 },
	};

	const defaultAttribute: AttributeMeta = {
		data: null,
		size: 4,
		kind: gl.FLOAT,
		normalized: false,
		stride: 0,
		offset: 0,
		enabled: false
	};

	const shaderMeta = new WeakMap<WebGLShader, ShaderMeta>();

	let currentProgram: ProgramMeta | null;
	const programMeta = new WeakMap<WebGLProgram, ProgramMeta>();

	const bufferBound: Record<number, WebGLBuffer | null> = {};
	const bufferMeta = new WeakMap<WebGLBuffer, BufferMeta>();

	function getCurrentData(target: number, kind: number): AttributeData | null {
		const meta = bufferMeta.get(bufferBound[target]!);
		let data = meta && meta.data;

		if(data) {
			let offset = 0;
			let length = data.byteLength;

			if(!(data instanceof ArrayBuffer)) {
				offset = data.byteOffset;
				data = data.buffer;
			}

			const info = typeInfo[kind];
			return new info.array(data, offset, length / info.size);
		}

		return null;
	}

	const implementation: Partial<WebGLRenderingContext> = {
		createProgram() {
			const program = gl.createProgram();

			if(program) {
				programMeta.set(program, {
					program,

					uniformLocation: {},
					uniformData: new Map<WebGLUniformLocation, number[]>(),

					attributeLocation: {},
					attributes: []
				});
			}
			return program;
		},
		createShader(kind) {
			const shader = gl.createShader(kind);

			if(shader) shaderMeta.set(shader, { shader, kind });
			return shader;
		},

		shaderSource(shader, source) {
			gl.shaderSource(shader, source);
			shaderMeta.get(shader)!.source = source;
		},
		compileShader(shader) {
			gl.compileShader(shader);
			const meta = shaderMeta.get(shader)!;

			try {
				const module = {} as ShaderModule;
				eval('(function(exports){' + glsl2js(meta.source!) + '})')(module);
				meta.module = module;
			} catch(err) {
				console.error(err);
			}
		},
		attachShader(program, shader) {
			gl.attachShader(program, shader);
			const metaP = programMeta.get(program)!;
			const metaS = shaderMeta.get(shader)!;
			if(metaS.kind == gl.VERTEX_SHADER) metaP.vertex = metaS;
			if(metaS.kind == gl.FRAGMENT_SHADER) metaP.fragment = metaS;
		},

		useProgram(program) {
			gl.useProgram(program);
			currentProgram = (program && programMeta.get(program)) || null;
		},
		getUniformLocation(program, name) {
			const location = gl.getUniformLocation(program, name);

			if(location !== null) {
				const meta = programMeta.get(program)!;
				meta.uniformLocation[name] = location;
				meta.uniformData.set(location, []);
			}

			return location;
		},
		uniform1f(location, x) {
			gl.uniform1f(location, x);

			const data = currentProgram!.uniformData.get(location!)!;
			data[0] = x;
		},
		uniform2f(location, x, y) {
			gl.uniform2f(location, x, y);

			const data = currentProgram!.uniformData.get(location!)!;
			data[0] = x;
			data[1] = y;
		},
		uniform3f(location, x, y, z) {
			gl.uniform3f(location, x, y, z);

			const data = currentProgram!.uniformData.get(location!)!;
			data[0] = x;
			data[1] = y;
			data[2] = z;
		},
		uniform4f(location, x, y, z, w) {
			gl.uniform4f(location, x, y, z, w);

			const data = currentProgram!.uniformData.get(location!)!;
			data[0] = x;
			data[1] = y;
			data[2] = z;
			data[3] = w;
		},
		bindBuffer(target, buffer) {
			gl.bindBuffer(target, buffer);
			bufferBound[target] = buffer;
		},
		bufferData(target, data, usage) {
			gl.bufferData(target, data as BufferSource, usage);

			if(typeof data == 'number') data = new ArrayBuffer(data);
			const meta: BufferMeta = { target, data };

			const buffer = bufferBound[target];
			if(buffer) bufferMeta.set(buffer, meta);
		},

		getAttribLocation(program, name) {
			const location = gl.getAttribLocation(program, name);

			const meta = programMeta.get(program)!;
			meta.attributeLocation[name] = location;

			meta.attributes[location] = meta.attributes[location] || { ...defaultAttribute };
			meta.attributes[location].name = name;

			return location;
		},
		enableVertexAttribArray(index) {
			gl.enableVertexAttribArray(index);

			currentProgram!.attributes[index] = currentProgram!.attributes[index] || { ...defaultAttribute };
			currentProgram!.attributes[index].enabled = true;
		},
		disableVertexAttribArray(index) {
			gl.disableVertexAttribArray(index);

			if(currentProgram!.attributes[index]) {
				currentProgram!.attributes[index].enabled = false;
			}
		},
		vertexAttribPointer(index, size, kind, normalized, stride, offset) {
			gl.vertexAttribPointer(index, size, kind, normalized, stride, offset);
			let values = getCurrentData(gl.ARRAY_BUFFER, kind)!;
			const name = currentProgram!.attributes[index] && currentProgram!.attributes[index].name;
			const typeSize = typeInfo[kind].size;

			if(stride) {
				stride /= typeSize;
			} else {
				stride = size;
			}

			currentProgram!.attributes[index] = {
				name,
				data: values,
				size,
				kind,
				normalized,
				stride,
				offset: offset / typeSize,
				enabled: true
			};
		},

		drawElements(mode, count, kind, offset) {
			gl.drawElements(mode, count, kind, offset);
			let indices = getCurrentData(gl.ELEMENT_ARRAY_BUFFER, kind)!;

			const module = currentProgram!.vertex!.module!;
			const storage = module.$storage;
			module.$setPrint(print);

			// Save arena allocator state.
			const afterConstants = module.$saveCheckpoint();
			const uniformLocation = currentProgram!.uniformLocation;
			const uniformData = currentProgram!.uniformData;

			for(const key of Object.keys(uniformLocation)) {
				const data = uniformData.get(uniformLocation[key]);

				if(data!.length == 1) {
					storage.uniform[key] = data![0];
				} else {
					(storage.uniform[key] as Vec).data.set(data!);
				}
			}

			const afterUniforms = module.$saveCheckpoint();
			const vertices: Record<number, any> = {};
			const indexCount = indices.length;

			const attributes = currentProgram!.attributes;
			const attributeCount = attributes.length;

			const floatAttributes: EnabledAttribute[] = [];
			const vectorAttributes: EnabledAttribute[] = [];

			for(let n = 0; n < attributeCount; ++n) {
				const attribute = attributes[n];

				if(attribute.enabled && attribute.name && attribute.data) {
					(attribute.size > 1 ? vectorAttributes : floatAttributes).push({
						name: attribute.name,
						data: attribute.data.subarray(),
						size: attribute.size,
						offset: attribute.offset,
						stride: attribute.stride
					});
				}
			}

			for(let n = 0; n < indexCount; ++n) {
				const index = indices[n];

				if(!vertices[index]) {
					// Free shader resources allocated since the last vertex.
					module.$loadCheckpoint(afterUniforms);

					for(const attribute of floatAttributes) {
						(storage.attribute[attribute.name] as number) = attribute.data[attribute.offset];
						attribute.offset += attribute.stride;
					}

					for(const attribute of vectorAttributes) {
						const src = attribute.data;
						const dst = (storage.attribute[attribute.name] as Vec | Mat).data;
						let p = attribute.offset;
						let q = 0;
						while(q < count) dst[q++] = src[p++];

						attribute.offset += attribute.stride;
					}

					module.main();

					vertices[index] = true;
				}
			}

			// Free shader resources allocated during the draw call.
			module.$loadCheckpoint(afterConstants);
		}
	};

	const proto = gl.constructor.prototype;

	for(const key of Object.keys(proto) as (keyof WebGLRenderingContext)[]) {
		if(implementation[key]) continue;

		const value = gl[key];

		if(typeof value == 'function') {
			implementation[key as keyof FunctionOnly<WebGLRenderingContext>] = (...args: any[]) => (value as any).apply(gl, args);
		} else if(Object.getOwnPropertyDescriptor(proto, key)!.get) {
			Object.defineProperty(implementation, key, {
				get() { return gl[key]; },
				set(v: any) { (gl as any)[key] = v; }
			});
		}
	}

	return Object.assign(new DebugContext(), implementation);
}
