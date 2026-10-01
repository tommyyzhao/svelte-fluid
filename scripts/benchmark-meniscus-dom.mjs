import { chromium } from 'playwright';

// Ordinary installed Chrome; no unsafe WebGPU flags. Run only in the repository's
// serialized hardware slot. This records actual DOM routes, not isolated GPU time.
const executablePath = process.env.VITEST_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const base = process.env.FLUID_BENCH_BASE || 'http://localhost:5173';
const browser = await chromium.launch({ headless: true, executablePath });
const output = [];
try {
	for (const [cssWidth, cssHeight] of [[420.375, 260.625], [900, 520]]) for (const dpr of [2, 3]) for (const renderer of ['webgpu', 'svg']) {
		const context = await browser.newContext({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: dpr, reducedMotion: 'no-preference' });
		try {
			await context.addInitScript(() => {
				const nativeRAF = window.requestAnimationFrame.bind(window);
				const state = { measured: false, callbackMs: [], eventMs: [], pathMs: [], submitMs: [], pathWrites: 0,
					pathCodeUnits: 0, submits: 0, adapterRequests: 0, frame: -1 };
				window.__meniscusBench = { state, nativeRAF };
				window.requestAnimationFrame = (callback) => nativeRAF((now) => {
					const measured = state.measured, started = performance.now();
					try { return callback(now); } finally { if (measured) state.callbackMs.push(performance.now() - started); }
				});
				const setAttribute = Element.prototype.setAttribute;
				Element.prototype.setAttribute = function (name, value) {
					const measured = state.measured && this.namespaceURI === 'http://www.w3.org/2000/svg' && name === 'd';
					const started = measured ? performance.now() : 0;
					try { return Reflect.apply(setAttribute, this, [name, value]); }
					finally { if (measured) { state.pathMs.push(performance.now() - started); state.pathWrites++; state.pathCodeUnits += String(value).length; } }
				};
				if (globalThis.GPUQueue) {
					const submit = GPUQueue.prototype.submit;
					GPUQueue.prototype.submit = function (commands) {
						const measured = state.measured, started = measured ? performance.now() : 0;
						try { return Reflect.apply(submit, this, [commands]); }
						finally { if (measured) { state.submitMs.push(performance.now() - started); state.submits++; } }
					};
				}
				if (navigator.gpu) {
					const requestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
					navigator.gpu.requestAdapter = (...args) => { state.adapterRequests++; return requestAdapter(...args); };
				}
			});
			const page = await context.newPage(), errors = [];
			page.on('pageerror', (error) => errors.push(error.message));
			const started = performance.now();
			await page.goto(`${base}/lab/interfaces/${renderer === 'svg' ? 'meniscus-svg' : 'meniscus'}`);
			await page.addStyleTag({ content: `.aperture { width: ${cssWidth}px !important; height: ${cssHeight}px !important; aspect-ratio: auto !important; }` });
			await page.locator('.aperture').scrollIntoViewIfNeeded();
			await page.waitForFunction((renderer) => renderer === 'svg'
				? document.querySelector('section[data-renderer="svg"]')?.getAttribute('data-ready') === 'true'
				: document.querySelector('.material')?.getAttribute('data-ready') === 'true', renderer);
			await page.locator('.aperture img').evaluate((image) => image.decode());
			await page.evaluate(async () => { await document.fonts.ready; });
			const routeLoadDecodeReadyWallMs = performance.now() - started;
			const result = await page.evaluate(async ({ renderer, cssWidth, cssHeight, dpr }) => {
				const { state, nativeRAF } = window.__meniscusBench;
				const nextFrame = () => new Promise((resolve) => nativeRAF(resolve));
				await nextFrame(); await nextFrame(); await nextFrame();
				const aperture = document.querySelector('.aperture'), rect = aperture.getBoundingClientRect();
				const frames = [], warmupFrames = 30, measuredFrames = 60;
				let previous = 0;
				for (let frame = 0; frame < warmupFrames + measuredFrames; frame++) {
					const now = await nextFrame();
					if (frame >= warmupFrames && previous) frames.push(now - previous);
					previous = now; state.measured = frame >= warmupFrames; state.frame = frame;
					const angle = frame / 60 * Math.PI * 2, x = .5 + .28 * Math.sin(angle), y = .5 + .2 * Math.cos(angle);
					const clientX = rect.left + x * rect.width, clientY = rect.top + y * rect.height;
					const target = document.elementFromPoint(clientX, clientY) || aperture, started = performance.now();
					target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, isPrimary: true, pointerType: 'mouse', pointerId: 1, clientX, clientY }));
					if (state.measured) state.eventMs.push(performance.now() - started);
				}
				// Drain the final command's application callback and Svelte microtasks.
				await nextFrame(); state.measured = false;
				const distribution = (values) => {
					const ordered = [...values].sort((a, b) => a - b), count = ordered.length;
					return { count, mean: count ? ordered.reduce((sum, value) => sum + value, 0) / count : 0,
						p50: ordered[Math.ceil(count * .5) - 1] ?? null, p95: ordered[Math.ceil(count * .95) - 1] ?? null,
						min: ordered[0] ?? null, max: ordered.at(-1) ?? null, zeroSamples: ordered.filter((value) => value === 0).length };
				};
				const canvas = aperture.querySelector('canvas'), svg = aperture.querySelector('svg'), view = svg?.viewBox.baseVal;
				const result = { renderer, cssWidth, cssHeight, requestedBrowserDpr: dpr, actualBrowserDpr: devicePixelRatio,
					actualCssWidth: rect.width, actualCssHeight: rect.height, nativeWidth: canvas?.width ?? view?.width, nativeHeight: canvas?.height ?? view?.height,
					warmupFrames, measuredFrames, rafIntervalMs: distribution(frames), scriptedEventDispatchMs: distribution(state.eventMs),
					applicationRafCallbackMs: distribution(state.callbackMs), svgPathAttributeMs: distribution(state.pathMs), gpuQueueSubmitCpuMs: distribution(state.submitMs),
					svgPathWrites: state.pathWrites, svgPathCodeUnitsWritten: state.pathCodeUnits, gpuSubmissions: state.submits,
					adapterRequests: state.adapterRequests, userAgent: navigator.userAgent };
				const material = aperture.querySelector('.material');
				material?.dispatchEvent(new PointerEvent('pointerleave', { isPrimary: true, pointerType: 'mouse', pointerId: 1 }));
				aperture.dispatchEvent(new PointerEvent('pointerleave', { isPrimary: true, pointerType: 'mouse', pointerId: 1 }));
				return result;
			}, { renderer, cssWidth, cssHeight, dpr });
			await page.waitForFunction((renderer) => (renderer === 'svg' ? document.querySelector('section[data-renderer="svg"]') : document.querySelector('.material'))?.getAttribute('data-sleeping') === 'true', renderer, { timeout: 5000 });
			const idle = await page.evaluate(async () => {
				const { state, nativeRAF } = window.__meniscusBench, frame = () => new Promise((resolve) => nativeRAF(resolve));
				await frame(); await frame(); state.callbackMs.length = 0; state.pathMs.length = 0; state.submits = 0; state.measured = true;
				for (let i = 0; i < 10; i++) await frame(); state.measured = false;
				return { observedRefreshFrames: 10, applicationRafCallbacks: state.callbackMs.length,
					applicationRafCpuTotalMs: state.callbackMs.reduce((sum, value) => sum + value, 0),
					pathWrites: state.pathMs.length, gpuSubmissions: state.submits };
			});
			if (errors.length || result.nativeWidth !== Math.round(cssWidth * dpr) || result.nativeHeight !== Math.round(cssHeight * dpr) ||
				result.actualBrowserDpr !== dpr || renderer === 'svg' && (result.adapterRequests || result.gpuSubmissions || result.svgPathWrites < 10) ||
				renderer === 'webgpu' && result.gpuSubmissions < 10 || idle.pathWrites || idle.gpuSubmissions) {
				throw new Error(`Meniscus DOM benchmark validity failed: ${JSON.stringify({ result, idle, errors })}`);
			}
			const row = { ...result, routeLoadDecodeReadyWallMs, idle, pageErrors: errors };
			output.push(row); console.info('Meniscus DOM benchmark row', JSON.stringify(row));
		} finally { await context.close(); }
	}
	console.info('Meniscus DOM benchmark summary', JSON.stringify({ rows: output.length, passed: true, executablePath,
		scope: 'Actual local routes in installed headless Chrome with context DPR2/3, desktop1280×1100 viewport, identical scripted primary-pointer ellipse. Not physical phone hardware or trusted OS/coalesced input.',
		clock: '30 warmup +60 measured visible RAF intervals; one synchronous synthetic pointer event per frame, followed by final application callback drain. Continuous hover is used in both routes.',
		cost: 'Application RAF callback CPU and synchronous event/attribute/queue-submit CPU are instrumented; these categories can overlap and must not be added. Svelte microtasks beyond attribute calls, layout, rasterization, GPU execution and compositor time are not isolated. RAF spacing is refresh-paced, not the amount of compute used. Idle requires no GPU submissions or SVG path writes; persistent shared scheduling callbacks are measured, not silently relabelled as zero work.',
		comparison: 'Same boundary dynamics/photograph/controls, intentionally different gradient versus surface-normal lighting. No frame-cost or energy winner is implied by callback CPU or matched refresh intervals alone.',
		cache: 'Fresh context per row; route ready time includes navigation/photo decode/pipeline setup and is not cache-cold attribution. User desktop background activity uncontrolled.' }));
} finally { await browser.close(); }
