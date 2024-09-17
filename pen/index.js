import '../src/index';

/** @type HTMLCanvasElement */
const canvas = document.getElementById('gl');
const log = document.getElementById('log');
const gl = wrapContext(canvas.getContext('webgl'), (...args) => {
	log.value += '\n' + args.map(JSON.stringify).join(' ');
});

var vs = `
precision highp float;

uniform vec2 uSize;
attribute vec2 aPosition;
varying vec4 vColor;

#define M_PI 3.14159265358979

void main(void) {
	vec2 pos = aPosition / uSize;

	#ifdef TS
		const examples: Vec[] = [ pos, abs(pos.yx) + 1, 1 / (abs(pos.xxyy) + 1) ];
		print('Swizzle me this', ...examples);
	#endif

	gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
	vColor = vec4(pos.x, cos(length(pos - 0.5) * M_PI * 5.0), pos.y, 1.0);
}
`;

var fs = `
precision highp float;

varying vec4 vColor;

void main(void) {
	gl_FragColor = vColor;
}
`;

function createShader(type, code) {
	const shader = gl.createShader(type);

	gl.shaderSource(shader, code);
	gl.compileShader(shader);

	if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		throw new Error(gl.getShaderInfoLog(shader));
	}

	return shader;
}

const program = gl.createProgram();

gl.attachShader(program, createShader(gl.VERTEX_SHADER, vs));
gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fs));
gl.linkProgram(program);

if(!gl.getProgramParameter(program, gl.LINK_STATUS)) {
	throw new Error(gl.getProgramInfoLog(program));
}

function createQuadMesh(width, height) {
	const coords = new Float32Array(width * height * 2);
	let p = 0;

	for(let y = 0; y < height; ++y) {
		for(let x = 0; x < width; ++x) {
			coords[p++] = x;
			coords[p++] = y;
		}
	}

	const indices = new Uint16Array((width * 3 + 1) * (height - 1));
	let index = 0;
	p = 0;

	for(let y = 0; y < height - 1; ++y) {
		for(let x = 0; x < width * 3 - 1; ++x) {
			index = ~~((x + 1) / 3) + (((x + y) % 2 + y) * width);

			if(x == 0) indices[p++] = index;
			indices[p++] = index;
		}

		indices[p++] = index;
	}

	return { coords, indices };
}

const { coords, indices } = createQuadMesh(13, 13);

gl.clearColor(0, 0, 0, 1);
gl.enable(gl.DEPTH_TEST);

gl.useProgram(program);

gl.uniform2f(gl.getUniformLocation(program, 'uSize'), 12, 12);

let attribute = gl.getAttribLocation(program, 'aPosition');
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(coords), gl.STATIC_DRAW);
gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
gl.enableVertexAttribArray(attribute);

gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;

gl.viewport(0, 0, canvas.width, canvas.height);
gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

gl.drawElements(gl.TRIANGLE_STRIP, indices.length - 2, gl.UNSIGNED_SHORT, 0);
