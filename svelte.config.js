import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	preprocess: vitePreprocess(),
	kit: {
		// Docs site only: registry/ files import 'svelte-fluid' exactly as a consumer would.
		alias: { 'svelte-fluid': 'src/lib/index.ts' },
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			// 404.html is the SPA shell GitHub Pages serves for unknown paths; it renders +error.svelte.
			fallback: '404.html',
			precompress: false,
			strict: true
		}),
		paths: {
			base: process.env.BASE_PATH ?? ''
		}
	}
};

export default config;
