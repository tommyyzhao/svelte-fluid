import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
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
			...(process.env.SVELTE_FLUID_GPU_BENCH
				? []
				: ['**/pressure-residual.browser.test.ts', '**/gpu-budget.browser.test.ts', '**/dpr-shots.browser.test.ts', '**/surface-shots.browser.test.ts', '**/surface-gpu.browser.test.ts', '**/dropzone-shots.browser.test.ts', '**/caustics-shots.browser.test.ts', '**/dropzone-gpu.browser.test.ts', '**/enamel-shots.browser.test.ts', '**/enamel-gpu.browser.test.ts', '**/shared-present.browser.test.ts'])
		],
		env: {
			SVELTE_FLUID_GPU_BENCH_OUT: process.env.SVELTE_FLUID_GPU_BENCH_OUT ?? '',
			SVELTE_FLUID_GPU_BENCH_PRESETS: process.env.SVELTE_FLUID_GPU_BENCH_PRESETS ?? '',
			SVELTE_FLUID_GPU_BENCH_TIER: process.env.SVELTE_FLUID_GPU_BENCH_TIER ?? '',
			SVELTE_FLUID_GPU_BENCH_CSS: process.env.SVELTE_FLUID_GPU_BENCH_CSS ?? '',
			SVELTE_FLUID_GPU_BENCH_STAGES: process.env.SVELTE_FLUID_GPU_BENCH_STAGES ?? '',
			SVELTE_FLUID_SHOTS_DIR: process.env.SVELTE_FLUID_SHOTS_DIR ?? '',
			SVELTE_FLUID_SHOTS_DPRS: process.env.SVELTE_FLUID_SHOTS_DPRS ?? '',
			SVELTE_FLUID_SHOTS_CSS: process.env.SVELTE_FLUID_SHOTS_CSS ?? '',
			SVELTE_FLUID_SHOTS_EXTRA: process.env.SVELTE_FLUID_SHOTS_EXTRA ?? '',
			SVELTE_FLUID_SHOTS_DYE: process.env.SVELTE_FLUID_SHOTS_DYE ?? '',
			SVELTE_FLUID_CONTRAST_TAG: process.env.SVELTE_FLUID_CONTRAST_TAG ?? ''
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
		hookTimeout: 30000,
		browser: {
			enabled: true,
			headless: true,
			// vitest 4 takes a provider factory (not the string 'playwright')
			// and per-browser `instances` instead of a top-level `name`.
			// VITEST_CHROME_PATH selects a hardware-capable installed Chrome.
			provider: playwright(
				process.env.VITEST_CHROME_PATH
					? {
							launchOptions: { executablePath: process.env.VITEST_CHROME_PATH, ignoreDefaultArgs: ['--enable-unsafe-swiftshader'] },
							// Opt-in DPR for native-DPR captures and GPU benches.
							...(process.env.SVELTE_FLUID_DPR ? { contextOptions: { deviceScaleFactor: Number(process.env.SVELTE_FLUID_DPR) } } : {})
						}
					: {}
			),
			instances: [{ browser: 'chromium' }],
			commands: {
				async captureCanvasScreenshot(ctx: { page: any; frame: () => Promise<any> }, rect: { x: number; y: number; width: number; height: number }) {
					const frame = await ctx.frame();
					const offset = await (await frame.frameElement()).boundingBox();
					return (await ctx.page.screenshot({ clip: { ...rect, x: offset.x + rect.x, y: offset.y + rect.y } })).toString('base64');
				},
				async emulateControlMedia(ctx: { page: any }, media: { forcedColors?: 'active' | 'none'; reducedMotion?: 'reduce' | 'no-preference' }) {
					await ctx.page.emulateMedia(media);
				},
				// Built-in writeFile is confined to the project root; the GPU bench
				// writes its JSON to an arbitrary path (default /tmp).
				async writeBenchJson(_ctx: unknown, path: string, content: string) {
					await mkdir(dirname(path), { recursive: true });
					await writeFile(path, content);
				},
				// Real mouse drag with intermediate moves (userEvent.dragAndDrop sends
				// none); coordinates are relative to the test iframe viewport.
				async dragMouse(ctx: { page: any; frame: () => Promise<any> }, x0: number, y0: number, x1: number, y1: number) {
					const frame = await ctx.frame();
					const offset = await (await frame.frameElement()).boundingBox();
					const { mouse } = ctx.page;
					await mouse.move(offset.x + x0, offset.y + y0);
					await mouse.down();
					await mouse.move(offset.x + x1, offset.y + y1, { steps: 24 });
					await mouse.up();
				},
				// Evidence frames (PNG) from the contrast measurement; base64 payload.
				async writeBenchBase64(_ctx: unknown, path: string, base64: string) {
					await mkdir(dirname(path), { recursive: true });
					await writeFile(path, Buffer.from(base64, 'base64'));
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
