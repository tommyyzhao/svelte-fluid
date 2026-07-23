import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, defineProject } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

const browserProject = defineProject({
	extends: true,
	test: {
		name: 'browser',
		include: ['src/**/*.browser.test.ts'],
		exclude: ['dist/**', '.svelte-kit/**'],
		// The bench files each create real WebGL contexts and run sustained GPU
		// workloads. Running files in parallel makes their wall-clock timing
		// depend on shared GPU contention and can trip otherwise healthy test
		// timeouts. Keep inter-file execution serial; individual tests remain
		// deterministic and exercise the same frames.
		fileParallelism: false,
		// Several benches run 2+ full deterministic advance() passes (100-220
		// frames of real WebGL sim each) inside one `it`; the 5s/15s vitest
		// defaults time out those tests even though nothing is hung.
		testTimeout: 60000,
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
