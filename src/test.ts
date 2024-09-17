import { readFileSync } from 'fs';
import { glsl2ts } from './glsl2ts';
import { compile, vfs, File } from './compile';
import { libs } from './libs';

for(const key of Object.keys(libs) as (keyof typeof libs)[]) {
	vfs.write('/' + key, new File(libs[key]));
}

process.stdout.write(compile('/index.ts', libs['webgl.ts'].replace(/export /g, '') + glsl2ts(readFileSync(process.argv[2], 'utf-8'))));
