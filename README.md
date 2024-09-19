
# glslog

A utility for converting WebGL 1.0 GLSL shaders to JavaScript/TypeScript and debugging WebGL rendering contexts.

See the [interactive demo](https://codepen.io/Juha-J-rvi/pen/YzooeGJ).

## Description

`glslog` is a powerful tool designed to aid developers in debugging and understanding WebGL shaders and rendering processes. It provides functionality to:

- **Convert GLSL shader code to JavaScript or TypeScript:** This allows you to run and test shader logic directly in JavaScript, making it easier to debug and understand shader behavior.
- **Wrap WebGL contexts:** Intercept and log WebGL calls, simulate shader execution, and visualize rendering output on a 2D canvas overlay.

By integrating `glslog` into your development workflow, you can gain deeper insights into your WebGL applications and streamline the debugging process.

## Installation

Install `glslog` via npm:

```bash
npm install --save glslog
```

## Usage

### Converting GLSL to JavaScript or TypeScript

`glslog` provides two functions, `glsl2js` and `glsl2ts`, which convert GLSL shader code into JavaScript and TypeScript code respectively. This is particularly useful for testing and debugging shader logic outside of the GPU.

#### Example

```javascript
import { glsl2js, glsl2ts } from 'glslog';

const glslCode = `
void main() {
    gl_FragColor = vec4(1.0);
}
`;

// Convert GLSL to JavaScript
const jsCode = glsl2js(glslCode);
console.log(jsCode);

// Convert GLSL to TypeScript
const tsCode = glsl2ts(glslCode);
console.log(tsCode);
```

### Wrapping a WebGL Context

The `wrapContext` function allows you to wrap a `WebGLRenderingContext` to intercept WebGL API calls. This helps in debugging by:

- Logging WebGL function calls and parameters.
- Simulating shader execution in JavaScript.
- Visualizing rendering output on an overlay canvas.

#### Example
```javascript
import 'https://unpkg.com/glslog';

const canvas = document.getElementById('myCanvas');
const gl = wrapContext(canvas.getContext('webgl'), console.log);

const vertexShader = gl.createShader(gl.VERTEX_SHADER);
// ... continue with your WebGL setup and rendering code
```

When using the wrapped context, `glslog` will create an overlay canvas on top of your original canvas to visualize the output, which is helpful for debugging rendering issues.

## API Reference

On browsers, the API functions are exported as globals.

### Functions

`glsl2js(glslCode: string): string`
Converts GLSL shader code to JavaScript code.

- Parameters:
  - `glslCode`: The GLSL shader code as a string.
- Returns:
  - A string containing the converted JavaScript code.

`glsl2ts(glslCode: string): string`
Converts GLSL shader code to TypeScript code.

- Parameters:
  - `glslCode`: The GLSL shader code as a string.
- Returns:
  - A string containing the converted TypeScript code.

`wrapContext(gl: WebGLRenderingContext, print: (...args: any[]) => void): WebGLRenderingContext`
Wraps a WebGLRenderingContext to intercept and debug WebGL API calls.

- Parameters:
  - `gl`: The original WebGLRenderingContext to be wrapped.
  - `print`: A function used for logging (e.g., console.log).
- Returns:
  - A wrapped WebGLRenderingContext that can be used in place of the original.

## License

This project is licensed under the MIT License - see the `LICENSE` file for details.
The distribution package also includes the TypeScript compiler, which is under its own free license.
