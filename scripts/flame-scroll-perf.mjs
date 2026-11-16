import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const argument = process.argv[2];
const variantArgument = argument?.startsWith('paper-') ? argument : null;
const base = variantArgument
	? process.env.FLUID_PERF_BASE || 'http://localhost:5180'
	: argument || 'http://localhost:5173';
const tag = process.argv[3] || 'live';
const out = variantArgument
	? '.svelte-kit/paper-flow/perf'
	: '.svelte-kit/flame-perf';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
	executablePath:
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	headless: true,
	ignoreDefaultArgs: ['--enable-unsafe-swiftshader']
});
const percentile = (xs, p) =>
	[...xs].sort((a, b) => a - b)[Math.ceil(xs.length * p) - 1];
const summarize = (xs) => ({
	count: xs.length,
	median: percentile(xs, 0.5),
	p90: percentile(xs, 0.9),
	fps: 1000 / (xs.reduce((a, b) => a + b, 0) / xs.length)
});
const reports = [];
const stepsPerFrame = Number(process.env.FLAME_STEPS || 2);
const maxTimeStep = 1 / 240;
try {
	for (const variant of (
		variantArgument ||
		process.env.FLUID_PERF_VARIANTS ||
		'flame-jet,gentle-jet'
	).split(',')) {
		const page = await browser.newPage({
			viewport: { width: 1280, height: 900 },
			deviceScaleFactor: 2
		});
		await page.goto(`${base}/test/tesla-valve?variant=${variant}`, {
			waitUntil: 'networkidle'
		});
		await page.locator('canvas').waitFor();
		await page
			.locator('canvas')
			.evaluate((canvas) => canvas.scrollIntoView({ block: 'center' }));
		if (variant.startsWith('paper-'))
			await page.waitForFunction(
				() => document.querySelector('canvas')?.paperFlowStats?.ready,
				null,
				{ timeout: 120000 }
			);
		await page.waitForTimeout(5000); // Measure an on-screen, running scene, not a paused offscreen canvas.
		const paperStart = await page.locator('canvas').evaluate((canvas) =>
			canvas.paperFlowStats
				? {
						...canvas.paperFlowStats,
						gpuFrameMs: [...canvas.paperFlowStats.gpuFrameMs]
				  }
				: null
		);
		await page.evaluate(() => {
			window.__rafTimes = [];
			window.__rafPhysical = [];
			window.__rafCollect = true;
			const tick = (t) => {
				if (!window.__rafCollect) return;
				window.__rafTimes.push(t);
				// Sampled in the same callback as the timestamp so the numerator and the rAF-span
				// denominator bound the identical window (reading it before/after overshot 1-2.4%).
				window.__rafPhysical.push(
					document.querySelector('canvas')?.paperFlowStats?.physicalSeconds ?? null
				);
				requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		});
		const cdp = await page.context().newCDPSession(page);
		const chunks = [];
		cdp.on('Tracing.dataCollected', ({ value }) => chunks.push(...value));
		const complete = new Promise((resolve) =>
			cdp.once('Tracing.tracingComplete', resolve)
		);
		await cdp.send('Tracing.start', {
			categories:
				'cc,viz,gpu,benchmark,input,devtools.timeline,disabled-by-default-devtools.timeline.frame,disabled-by-default-viz.debug',
			transferMode: 'ReportEvents'
		});
		await cdp.send('Tracing.recordClockSyncMarker', {
			syncId: 'flame-scroll-start'
		});
		await page.mouse.move(1100, 450);
		const start = performance.now();
		const visibility = [];
		for (let i = 0; performance.now() - start < 3000; i++) {
			await page.mouse.wheel(0, i % 6 < 3 ? 60 : -60);
			await page.waitForTimeout(25);
			visibility.push(
				await page.locator('canvas').evaluate((canvas) => {
					const r = canvas.getBoundingClientRect();
					return (
						Math.max(0, Math.min(innerHeight, r.bottom) - Math.max(0, r.top)) /
						r.height
					);
				})
			);
		}
		await cdp.send('Tracing.recordClockSyncMarker', {
			syncId: 'flame-scroll-end'
		});
		await cdp.send('Tracing.end');
		await complete;
		const { raf, rafPhysical } = await page.evaluate(() => {
			window.__rafCollect = false;
			return { raf: window.__rafTimes, rafPhysical: window.__rafPhysical };
		});
		const events = chunks.filter((e) =>
			/FramePresented|Display::FrameDisplayed|DrawAndSwap|DrawFrame|Presentation|PipelineReporter/.test(
				e.name
			)
		);
		const names = {};
		for (const e of events) names[e.name] = (names[e.name] || 0) + 1;
		const begin = chunks.find(
			(e) => e.args?.sync_id === 'flame-scroll-start'
		).ts;
		const end = chunks.find((e) => e.args?.sync_id === 'flame-scroll-end').ts;
		const displayed = [
			...new Set(
				chunks
					.filter(
						(e) =>
							e.name === 'Display::FrameDisplayed' &&
							e.ts >= begin &&
							e.ts <= end
					)
					.map((e) => e.ts)
			)
		].sort((a, b) => a - b);
		const cap = variant.startsWith('paper-')
			? 1 / 60
			: variant === 'flame-jet'
			? maxTimeStep * stepsPerFrame
			: 1 / 60;
		const simulated = raf
			.slice(1)
			.reduce((sum, t, i) => sum + Math.min((t - raf[i]) / 1000, cap), 0);
		const paperEnd = await page.locator('canvas').evaluate((canvas) =>
			canvas.paperFlowStats
				? {
						...canvas.paperFlowStats,
						gpuFrameMs: [...canvas.paperFlowStats.gpuFrameMs]
				  }
				: null
		);
		const playbackFactor =
			paperStart && paperEnd && rafPhysical[0] !== null
				? (rafPhysical.at(-1) - rafPhysical[0]) / ((raf.at(-1) - raf[0]) / 1000)
				: simulated / ((raf.at(-1) - raf[0]) / 1000);
		const report = {
			paper: paperEnd,
			gpuMs: paperEnd?.gpuFrameMs?.length
				? summarize(paperEnd.gpuFrameMs)
				: null,
			minimumVisibleFraction: Math.min(...visibility),
			playbackFactor,
			stepsPerFrame: paperEnd?.stepsPerFrame ?? stepsPerFrame,
			tag,
			variant,
			url: page.url(),
			raf: summarize(raf.slice(1).map((t, i) => t - raf[i])),
			presented: summarize(
				displayed.slice(1).map((t, i) => (t - displayed[i]) / 1000)
			),
			eventCounts: names,
			scroll: await page.evaluate(() => ({
				y: scrollY,
				height: document.documentElement.scrollHeight,
				viewport: innerHeight
			}))
		};
		reports.push(report);
		await writeFile(
			`${out}/${tag}-${variant}-scroll-trace.json`,
			JSON.stringify({ traceEvents: chunks })
		);
		await page.screenshot({ path: `${out}/${tag}-${variant}-page.png` });
		await page.close();
	}
	await writeFile(
		`${out}/${tag}-scroll.json`,
		JSON.stringify(reports, null, 2)
	);
	console.log(JSON.stringify(reports, null, 2));
} finally {
	await browser.close();
}
