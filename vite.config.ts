import { defineConfig } from 'vite';

async function init() {
	return defineConfig({
		build: {
			rollupOptions: {
				output: {
					entryFileNames: '[name].js',
					chunkFileNames: '[name].js',
				        assetFileNames: '[name].[ext]'
				}
			}
		}
	});
}

export default init();
