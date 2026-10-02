import { writeFile } from 'node:fs/promises';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, defineProject } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

const browserProject = defineProject({
	extends: true,
	test: {
		name: 'browser',
		include: ['src/**/*.browser.test.ts'],
		exclude: [
			'dist/**',
			'.svelte-kit/**',
			// Slow measurement-only bench: opt in with SVELTE_FLUID_GPU_BENCH=1.
			...(process.env.SVELTE_FLUID_GPU_BENCH ? [] : ['**/gpu-budget.browser.test.ts'])
		],
		env: {
			SVELTE_FLUID_GPU_BENCH_OUT: process.env.SVELTE_FLUID_GPU_BENCH_OUT ?? '',
			SVELTE_FLUID_GPU_BENCH_PRESETS: process.env.SVELTE_FLUID_GPU_BENCH_PRESETS ?? '',
			SVELTE_FLUID_GPU_BENCH_CSS: process.env.SVELTE_FLUID_GPU_BENCH_CSS ?? ''
		},
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
			// VITEST_CHROME_PATH selects a hardware-capable installed Chrome.
			provider: playwright(
				process.env.VITEST_CHROME_PATH
					? { launchOptions: { executablePath: process.env.VITEST_CHROME_PATH } }
					: {}
			),
			instances: [{ browser: 'chromium' }],
			commands: {
				// Built-in writeFile is confined to the project root; the GPU bench
				// writes its JSON to an arbitrary path (default /tmp).
				async writeBenchJson(_ctx: unknown, path: string, content: string) {
					await writeFile(path, content);
				}
			}
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
