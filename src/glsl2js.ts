import { glsl2ts } from './glsl2ts';
import { compile, vfs, File } from './compile';
import { libs } from './libs';

for(const key of Object.keys(libs) as (keyof typeof libs)[]) {
	vfs.write('/' + key, new File(libs[key]));
}

export function glsl2js(code: string) {
	return compile('/index.ts', libs['webgl.ts'] + glsl2ts(code));
}
