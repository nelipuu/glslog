import { glsl2ts } from './glsl2ts';
import { glsl2js } from './glsl2js';
import { wrapContext } from './wrapContext';

(window as any).glsl2ts = glsl2ts;
(window as any).glsl2js = glsl2js;
(window as any).wrapContext = wrapContext;
