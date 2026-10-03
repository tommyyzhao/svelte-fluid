// Measurement only. No runtime patch, timer query, unsafe flags, or GPU-budget verdict.
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const url = 'http://127.0.0.1:5197';
const out = process.env.PACED_BENCH_OUT || '/tmp/paced-presentation.json';
const server = Bun.spawn(['bun', 'run', 'dev', '--host', '127.0.0.1', '--port', '5197', '--strictPort'], { stdout: 'ignore', stderr: 'inherit' });
let browser;
// Finite hardware experiment even if a snapshot promise stalls.
const deadline = setTimeout(() => { void browser?.close(); server.kill(); }, 28 * 60 * 1000);
const rows = [];
try {
	let ready = false;
	for (let i = 0; i < 100; i++) {
		try { ready = (await fetch(url)).ok; } catch {}
		if (ready) break;
		await Bun.sleep(100);
	}
	if (!ready) throw new Error('Benchmark dev server unavailable');
	browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: false });
	for (const dpr of [1, 2, 3]) {
		const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr });
		const page = await context.newPage();
		await page.route('**/__paced-bench__', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="margin:0"></body></html>' }));
		await page.goto(`${url}/__paced-bench__`);
		await page.bringToFront();
		for (const preset of ['Karman', 'GasFlare', 'LavaLamp', 'default']) {
			for (let run = 1; run <= (dpr === 3 && preset === 'Karman' ? 3 : 1); run++) {
				const row = await page.evaluate(async ({ preset, run }) => {
					const { FluidEngine, _setContextTier } = await import('/src/lib/engine/FluidEngine.ts');
					const { PRESETS } = await import('/src/lib/presets/registry.ts');
					const { cssQualityPolicy } = await import('/src/lib/engine/resolution.ts');
					const dpr = devicePixelRatio;
					if (document.visibilityState !== 'visible') throw new Error('Foreground visibility required');
					const engines = [];
					let delivered = 0, requested = 0, completed = 0;
					const snapshot = globalThis.createImageBitmap;
					const transfer = ImageBitmapRenderingContext.prototype.transferFromImageBitmap;
					const jobs = [];
					let mainCanvas;
					globalThis.createImageBitmap = function (...args) {
						requested++;
						const job = snapshot.apply(this, args).then((bitmap) => { completed++; return bitmap; });
						jobs.push(job);
						return job;
					};
					ImageBitmapRenderingContext.prototype.transferFromImageBitmap = function (bitmap) {
						transfer.call(this, bitmap);
						if (this.canvas === mainCanvas) delivered++;
					};
					function build(name, w, h, paused) {
						const canvas = document.createElement('canvas');
						canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
						canvas.style.cssText = `width:${w}px;height:${h}px;${paused ? 'display:none' : ''}`;
						document.body.append(canvas);
						const config = { ...(name === 'default' ? {} : PRESETS.find((p) => p.id === name).config), pointerInput: false, paused };
						const max = Math.max(canvas.width, canvas.height);
						config.dyeResolution = Math.min(config.dyeResolution ?? 1024, max);
						config.bloomResolution = Math.min(config.bloomResolution ?? 256, max);
						config.sunraysResolution = Math.min(config.sunraysResolution ?? 196, max);
						const policy = cssQualityPolicy(w, h, config.simResolution ?? 128, config.bloomIterations !== undefined, config.pressureIterations !== undefined);
						if (policy.suppressPost) { config.bloom ??= false; config.sunrays ??= false; }
						if (policy.bloomIterations !== undefined) config.bloomIterations = policy.bloomIterations;
						if (policy.pressureIterations !== undefined) config.pressureIterations = policy.pressureIterations;
						_setContextTier('shared');
						let e;
						try { e = new FluidEngine({ canvas, autoStart: false, config }); }
						finally { _setContextTier('auto'); }
						engines.push(e);
						if (!e.sharedContext) throw new Error('Shared tier required');
						return e;
					}
					try {
						for (let i = 0; i < 8; i++) build('default', 320, 200, true);
						const e = build(preset, 1440, 900, false);
						mainCanvas = e.canvas;
						// Private test gates only: preserve actual trackSettle eligibility, suppress automatic RAF.
						e.autoStart = true;
						e.deterministicMode = false;
						e.startRaf = () => {};
						e.calcDeltaTime = () => 1 / 60;
						const frame = () => { e.rafRunning = true; e.update(); e.stopRaf(); };
						const pixel = new Uint8Array(4);
						const drain = () => e.withGl(() => {
							const gl = e.gl;
							gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
							gl.bindFramebuffer(gl.FRAMEBUFFER, null);
							gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
							if (gl.getError() !== gl.NO_ERROR || gl.isContextLost()) throw new Error('GL drain failed');
						});
						const warmJobs = [];
						for (let i = 0; i < 200; i++) { frame(); warmJobs.push(e.presented()); }
						await Promise.all(warmJobs); await Promise.all(jobs); drain();
						const warm = { requested, completed, delivered, stale: requested - delivered };
						const dbg = e.gl.getExtension('WEBGL_debug_renderer_info');
						const adapter = dbg ? String(e.gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown';
						const stages = [];
						for (const name of ['issueSettleProbe', 'advanceSettleProbe', 'pollSettleProbe']) {
							const original = e[name];
							e[name] = function (...args) {
								const probe = e.settleProbe;
								const stage = name === 'advanceSettleProbe' && probe && !probe.sync
									? (probe.velocityLevel < e.settleVelocityChain.length ? `velocity-${probe.velocityLevel}` : probe.dyeLevel < e.settleDyeChain.length ? `dye-${probe.dyeLevel}` : 'readback') : name;
								const result = original.apply(this, args);
								if ((name === 'issueSettleProbe' && !probe && e.settleProbe) || (name === 'advanceSettleProbe' && probe && !stage.startsWith('advance')) || (name === 'pollSettleProbe' && result !== null)) stages.push({ stage, verdict: result ?? null });
								return result;
							};
						}
						const before = { requested, completed, delivered };
						const samples = [];
						for (let i = 0; i < 60; i++) {
							await new Promise(requestAnimationFrame); // Outside measured span; no competing frame subscription.
							const count = delivered, requestCount = requested, stageStart = stages.length;
							const t0 = performance.now();
							frame();
							await e.presented();
							drain();
							const ms = performance.now() - t0;
							if (delivered !== count + 1 || requested !== requestCount + 1) throw new Error(`Frame ${i}: delivery/request count mismatch`);
							samples.push({ frame: i, ms, stages: stages.slice(stageStart), settled: e.settled });
						}
						const sorted = samples.map((s) => s.ms).sort((a, b) => a - b);
						const counts = { requested: requested - before.requested, completed: completed - before.completed, delivered: delivered - before.delivered };
						return { preset, run, dpr, css: [1440, 900], backing: [mainCanvas.width, mainCanvas.height], resident: 9, pausedOthers: 8, adapter, browser: navigator.userAgent, visibility: document.visibilityState, warm, counts, stale: counts.requested - counts.delivered, medianMs: sorted[30], p95Ms: sorted[56], maxMs: sorted[59], allBelow2: sorted[59] < 2, samples };
					} finally {
						await Promise.all(engines.map((e) => e.presented()));
						globalThis.createImageBitmap = snapshot;
						ImageBitmapRenderingContext.prototype.transferFromImageBitmap = transfer;
						for (const e of engines) e.dispose();
						document.body.replaceChildren();
					}
				}, { preset, run });
				rows.push(row);
				await writeFile(out, JSON.stringify({ measuredSha: '3788960257b3c7e12c5576f15b829afd080a4502', scope: 'wall update + snapshot promise + actual bitmaprenderer transfer call + originating shared GL 1px readPixels; NOT compositor/raster completion or display scanout', rows }, null, 2));
				console.log(JSON.stringify({ preset, dpr, run, counts: row.counts, stale: row.stale, medianMs: row.medianMs, p95Ms: row.p95Ms, maxMs: row.maxMs }));
			}
		}
		await context.close();
	}
} finally {
	clearTimeout(deadline);
	await browser?.close();
	server.kill();
	await server.exited;
}
