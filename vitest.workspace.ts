import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, defineProject } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

const browserProject = defineProject({
	extends: true,
	test: {
		name: 'browser',
		include: ['src/**/*.browser.test.ts'],
		exclude: ['dist/**', '.svelte-kit/**'],
		browser: {
			enabled: true,
			headless: true,
			// vitest 4 takes a provider factory (not the string 'playwright')
			// and per-browser `instances` instead of a top-level `name`.
			provider: playwright(),
			instances: [{ browser: 'chromium' }]
		}
	}
});

const nodeProject = defineProject({
	extends: true,
	test: {
		name: 'node',
		environment: 'node',
		include: ['src/**/*.test.ts'],
		exclude: ['dist/**', '.svelte-kit/**', 'src/**/*.browser.test.ts']
	}
});

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		projects: [nodeProject, ...(process.env.VITEST_BROWSER ? [browserProject] : [])]
	}
});
