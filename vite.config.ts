import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// Private R&D routes run under `bun run dev` only. In production builds their
// components are replaced with empty stubs so no R&D code ships; their
// +layout.ts sets `prerender = dev`, so no HTML is emitted either.
const RD_ROUTE = /[\\/]src[\\/]routes[\\/](?:lab|examples[\\/]webgpu)[\\/].*\.svelte$/;

export default defineConfig({
	plugins: [
		{
			name: 'strip-rd-routes',
			apply: 'build',
			enforce: 'pre',
			load: (id) => (RD_ROUTE.test(id) ? '<!-- R&D route: dev only -->' : null)
		},
		sveltekit()
	]
});
