precision highp float;

uniform vec2 uSize;
attribute vec2 aPosition;
varying vec4 vColor;

#define M_PI 3.1415926535897932384626433832795

void main(void) {
	vec2 pos = aPosition / uSize;

	#ifdef TS
		const samples: Vec[] = [ pos, length(pos), 1 / pos.xxyy ];
		log('Swizzle me this', samples);
	#endif

	gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
	vColor = vec4(pos.x, cos(length(pos - 0.5) * M_PI * 5.0), pos.y, 1.0);
}
