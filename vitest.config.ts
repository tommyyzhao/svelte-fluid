import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, defineProject } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

const hardwareChromePath = process.env.VITEST_CHROME_PATH;

const browserProject = defineProject({
	extends: true,
	test: {
		name: 'browser',
		include: ['src/**/*.browser.test.ts'],
		exclude: ['dist/**', '.svelte-kit/**'],
		// Browser files run sustained GPU workloads. Keep inter-file execution
		// workloads. Running files in parallel makes their wall-clock timing
		// depend on shared GPU contention and can trip otherwise healthy test
		// timeouts. Keep inter-file execution serial; individual tests remain
		// deterministic and exercise the same frames.
		fileParallelism: false,
		// Directed hardware tests can run long deterministic solver tapes; the
		// default timeout is too small even when the GPU is making progress.
		testTimeout: 60000,
		browser: {
			enabled: true,
			headless: true,
			// vitest 4 takes a provider factory (not the string 'playwright')
			// and per-browser `instances` instead of a top-level `name`.
			provider: playwright({
				launchOptions: {
					// Match ordinary browser WGSL validation. --enable-unsafe-webgpu
					// silently enabled experimental syntax our users could not run.
					...(hardwareChromePath ? { executablePath: hardwareChromePath } : {})
				}
			}),
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
