// Native Metal GPU-execution capture of one FluidEngine per page (measurement only;
// no runtime patch, no timer queries). Dev-docs: dev-docs/benchmarks/gpu-budget.md.
// Run: bun scripts/gpu-capture.mjs
// Env: GPU_CAPTURE_CASES='Karman@1440x900:own:2,...' (preset@CSS:tier:DPR; default = full
// preset matrix at the machine DPR), GPU_CAPTURE_DIR (default /tmp/gpu-capture; traces stay there).
// Hardware Chrome with ordinary flags: Playwright's default --enable-unsafe-swiftshader is removed.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const XCODE = { ...process.env, DEVELOPER_DIR: '/Applications/Xcode.app/Contents/Developer' };
const DIR = process.env.GPU_CAPTURE_DIR || '/tmp/gpu-capture';
const PORT = 5198, URL = `http://127.0.0.1:${PORT}`;
const FRAMES = 60, WARM = 200, RETRIES = 2, RETRY_WAIT_MS = 30000;
const PRESETS = ['(default)', 'LavaLamp', 'Plasma', 'InkInWater', 'FrozenSwirl', 'Aurora', 'CircularFluid', 'FrameFluid', 'AnnularFluid', 'SvgPathFluid', 'Toroidal', 'GasFlare', 'Venturi', 'Karman', 'TeslaValve'];
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
await mkdir(DIR, { recursive: true });

// --- xctrace export parsing (id/ref-deduplicated XML rows) -------------------------------
function exportTable(trace, schema) {
	const xml = execFileSync('xcrun', ['xctrace', 'export', '--input', trace, '--xpath', `/trace-toc/run[@number="1"]/data/table[@schema="${schema}"]`], { env: XCODE, encoding: 'utf8', maxBuffer: 1 << 30 });
	const ids = new Map(), stack = [], rows = [], cols = [];
	const dec = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
	const re = /<\?[^>]*\?>|<(\/)?([\w:-]+)((?:\s+[\w:-]+=(?:"[^"]*"|'[^']*'))*)\s*(\/)?>|([^<]+)/g;
	for (let m; (m = re.exec(xml)); ) {
		if (m[5] !== undefined) { if (stack.length) stack.at(-1).text += dec(m[5]); continue; }
		if (!m[2]) continue;
		if (m[1]) { const el = stack.pop(); close(el); continue; }
		const attrs = {};
		for (const a of m[3].matchAll(/([\w:-]+)=(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = dec(a[2] ?? a[3]);
		const el = { tag: m[2], attrs, text: '', children: [] };
		stack.at(-1)?.children.push(el);
		if (m[4]) close(el); else stack.push(el);
	}
	function close(el) {
		if (el.attrs.id) ids.set(el.attrs.id, el);
		if (el.tag === 'mnemonic') cols.push(el.text);
		if (el.tag === 'row') rows.push(el.children);
	}
	const val = (el) => (el.attrs.ref ? ids.get(el.attrs.ref) : el);
	return {
		xml,
		rows: rows.map((cells) => Object.fromEntries(cols.map((c, i) => [c, cells[i] && cells[i].tag !== 'sentinel' ? val(cells[i]) : null])))
	};
}
const n = (el) => (el ? Number(el.text) : NaN);
const pidOf = (el) => Number(el?.attrs.fmt?.match(/\((\d+)\)$/)?.[1] ?? NaN); // fmt: 'name (pid)'
function union(intervals) {
	let total = 0, end = -Infinity;
	for (const [s, e] of intervals.sort((a, b) => a[0] - b[0])) {
		if (e <= end) continue;
		total += e - Math.max(s, end);
		end = e;
	}
	return total;
}
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const rank = (v, q) => [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.round(q * (v.length - 1)))];

function analyse(trace, gpuPid, marks, backing) {
	const gpu = exportTable(trace, 'metal-gpu-intervals');
	const subs = exportTable(trace, 'metal-application-command-buffer-submissions');
	const io = exportTable(trace, 'metal-io-surface-access');
	const hashes = { 'metal-gpu-intervals': sha256(gpu.xml), 'metal-application-command-buffer-submissions': sha256(subs.xml), 'metal-io-surface-access': sha256(io.xml) };
	const exec = new Map(); // cmdbuffer-id -> [start,end] ns, Chrome GPU process only
	const other = []; // [start,end,label] for non-instance processes
	for (const r of gpu.rows) {
		const s = n(r.start), e = s + n(r.duration), pid = pidOf(r.process);
		if (pid === gpuPid) { const cb = n(r['cmdbuffer-id']); if (!exec.has(cb)) exec.set(cb, []); exec.get(cb).push([s, e]); }
		else other.push([s, e, r.process ? r.process.attrs.fmt : 'unattributed']);
	}
	const commits = subs.rows.filter((r) => pidOf(r.process) === gpuPid).map((r) => ({ t: n(r.start), cb: n(r['cmdbuffer-id']), enc: n(r['num-encoders']) || 0 })).sort((a, b) => a.t - b.t);
	const writes = new Map(); // cmdbuffer-id -> IOSurface sizes written by the Chrome GPU process
	for (const r of io.rows) if (Number(r.pid?.text) === gpuPid && r['access-type']?.text === '1') {
		const cb = n(r['cmdbuffer-id']);
		if (!writes.has(cb)) writes.set(cb, new Set());
		writes.get(cb).add(`${n(r.width)}x${n(r.height)}`);
	}
	// Frame windows: the page is otherwise static, so each paced frame appears as one burst of
	// GPU-process commits separated from the next by most of a vsync. Cluster encoder-bearing
	// commits on CPU commit-time gaps > GAP; the measured run must yield exactly one burst per
	// JS mark, with burst-to-burst spacing matching the JS mark spacing.
	const GAP = 6e6;
	const bursts = [];
	for (const c of commits) {
		if (c.enc === 0) continue;
		const last = bursts.at(-1);
		if (last && c.t - last.end < GAP) { last.cbs.push(c); last.end = c.t; }
		else bursts.push({ start: c.t, end: c.t, cbs: [c] });
	}
	// Choose the run of marks.length consecutive bursts whose start spacing best matches marks.
	const t0 = marks.map((m) => m.t0 * 1e6);
	let best = { err: Infinity, k: -1 };
	for (let k = 0; k + t0.length <= bursts.length; k++) {
		let err = 0;
		for (let i = 1; i < t0.length; i++) err = Math.max(err, Math.abs((bursts[k + i].start - bursts[k].start) - (t0[i] - t0[0])));
		if (err < best.err) best = { err, k };
	}
	const aligned = best.k >= 0 && best.err < 4e6; // every burst within 4 ms of its mark-relative time
	const run = aligned ? bursts.slice(best.k, best.k + t0.length) : [];
	const spanLo = run[0]?.start ?? 0, spanHi = run.length ? Math.max(...run.at(-1).cbs.flatMap((c) => (exec.get(c.cb) ?? []).map((x) => x[1])), run.at(-1).end) : 0;
	// Any GPU-process burst between/around measured ones that is not a measured frame (e.g. a
	// browser-compositor-only redraw) is counted, not silently assigned to the instance.
	const strays = aligned ? bursts.filter((b) => b.start >= spanLo && b.start <= spanHi && !run.includes(b)).length : null;
	const frames = run.map((b, i) => {
		const iv = b.cbs.flatMap((c) => exec.get(c.cb) ?? []);
		const s = Math.min(...iv.map((x) => x[0])), e = Math.max(...iv.map((x) => x[1]));
		const sizes = new Set(b.cbs.flatMap((c) => [...(writes.get(c.cb) ?? [])]));
		const by = {};
		for (const x of other) if (x[1] > s && x[0] < e) (by[x[2]] ??= []).push([Math.max(x[0], s), Math.min(x[1], e)]);
		return {
			gpuMs: union(iv) / 1e6, firstToLastMs: (e - s) / 1e6, commitOffsetMs: (b.start - run[0].start - (t0[i] - t0[0])) / 1e6,
			cbs: b.cbs.map((c) => `0x${c.cb.toString(16)}:${c.enc}`), encoders: b.cbs.reduce((sum, c) => sum + c.enc, 0),
			presentWrite: sizes.has(`${backing[0]}x${backing[1]}`), otherWrites: [...sizes].filter((z) => z !== `${backing[0]}x${backing[1]}`),
			overlap: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, union(v) / 1e6]))
		};
	});
	// Contention: union of each non-Chrome-GPU-process client's execution inside the measured span.
	const clients = {};
	for (const x of other) if (x[1] > spanLo && x[0] < spanHi) (clients[x[2]] ??= []).push([Math.max(x[0], spanLo), Math.min(x[1], spanHi)]);
	const spanMs = (spanHi - spanLo) / 1e6;
	const otherClients = Object.fromEntries(Object.entries(clients).map(([k, v]) => [k, { busyMs: +(union(v) / 1e6).toFixed(3), busyPct: +((100 * union(v)) / (spanHi - spanLo)).toFixed(2) }]));
	const g = frames.map((f) => f.gpuMs);
	return {
		aligned, alignErrMs: best.err / 1e6, bursts: bursts.length, strays, spanMs,
		medianMs: g.length ? rank(g, 0.5) : NaN, p95Ms: g.length ? rank(g, 0.95) : NaN, maxMs: g.length ? Math.max(...g) : NaN,
		framesWithPresentWrite: frames.filter((f) => f.presentWrite).length,
		otherClients, hashes, frames
	};
}

// --- capture --------------------------------------------------------------------------------
const owned = [];
const server = Bun.spawn(['bun', 'run', 'dev', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdout: 'ignore', stderr: 'inherit' });
owned.push(server);
let browser, gpuPid;
const deadline = setTimeout(() => { for (const p of owned) p.kill(); process.exit(2); }, 60 * 60 * 1000);
const results = [];
try {
	for (let i = 0; i < 100 && !(await fetch(URL).then((r) => r.ok, () => false)); i++) await Bun.sleep(100);
	browser = await chromium.launch({ executablePath: CHROME, headless: false, ignoreDefaultArgs: ['--enable-unsafe-swiftshader'] });
	const ps = () => execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' }).split('\n').map((l) => l.trim().split(/\s+/));
	const chromePid = Number(ps().find((f) => +f[1] === process.pid && f.slice(2).join(' ').startsWith(CHROME))?.[0]);
	gpuPid = () => Number(ps().find((f) => +f[1] === chromePid && f.join(' ').includes('--type=gpu-process'))?.[0]);
	const probe = await browser.newPage();
	const machineDpr = await probe.evaluate(() => devicePixelRatio);
	await probe.close();
	const CASES = (process.env.GPU_CAPTURE_CASES || PRESETS.flatMap((p) => [`${p}@1440x900:own:${machineDpr}`, `${p}@800x500:own:${machineDpr}`]).join(','))
		.split(',').map((s) => { const [, preset, w, h, tier, dpr] = s.match(/^(.+)@([\d.]+)x([\d.]+):(own|shared):([\d.]+)$/); return { preset, w: +w, h: +h, tier, dpr: +dpr }; });
	let page, pageDpr;
	for (const c of CASES) {
		if (pageDpr !== c.dpr) {
			await page?.context().close();
			// Same viewport/DPR mechanism as scripts/paced-presentation.mjs.
			page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: c.dpr })).newPage();
			await page.route('**/__gpu_capture__', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="margin:0;overflow:hidden;background:#000"></body></html>' }));
			await page.goto(`${URL}/__gpu_capture__`);
			pageDpr = c.dpr;
		}
		const name = `${c.preset.replace(/\W/g, '')}-${c.w}x${c.h}-${c.tier}-dpr${c.dpr}`;
		for (let attempt = 1; ; attempt++) {
			const r = await capture(page, c, name, attempt);
			const foreign = Object.entries(r.otherClients).filter(([k]) => !/^WindowServer \(/.test(k));
			// Foreign GPU clients (not WindowServer compositing) busy >2% of the measured span, or
			// overlapping instance execution by >1% of instance GPU time, invalidate the run.
			const overlapMs = r.frameDetail.reduce((s, f) => s + Object.entries(f.overlap).filter(([k]) => !/^WindowServer \(/.test(k)).reduce((t, [, v]) => t + v, 0), 0);
			const gpuSum = r.perFrameGpuMs.reduce((s, v) => s + v, 0);
			r.foreignOverlapMs = +overlapMs.toFixed(3);
			r.contended = foreign.some(([, v]) => v.busyPct > 2) || overlapMs > 0.01 * gpuSum;
			r.verdict = !r.aligned || r.transfersOk === false ? 'INCONCLUSIVE' : r.contended ? 'CONTENDED' : r.maxMs < 2 ? 'PASS' : 'FAIL';
			const { frameDetail, ...row } = r;
			results.push({ ...row, attempt });
			await writeFile(`${DIR}/capture.json`, JSON.stringify({ sha, machineDpr, chrome: CHROME, results }, null, 2));
			await writeFile(`${DIR}/${name}-a${attempt}.frames.json`, JSON.stringify(frameDetail, null, 1));
			console.log(JSON.stringify({ name, attempt, verdict: r.verdict, backing: r.backing, median: +r.medianMs.toFixed(3), p95: +r.p95Ms.toFixed(3), max: +r.maxMs.toFixed(3), aligned: r.aligned, alignErrMs: +r.alignErrMs.toFixed(3), strays: r.strays, presentWrites: r.framesWithPresentWrite, transfers: r.transfers, otherClients: r.otherClients, foreignOverlapMs: r.foreignOverlapMs }));
			if (r.verdict !== 'CONTENDED' || attempt >= RETRIES) break;
			await Bun.sleep(RETRY_WAIT_MS);
		}
	}
} finally {
	clearTimeout(deadline);
	await browser?.close();
	for (const p of owned.reverse()) { p.kill(); await p.exited; }
}

async function capture(page, c, name, attempt) {
		await page.bringToFront();
		const setup = await page.evaluate(async ({ preset, w, h, tier }) => {
			if (document.visibilityState !== 'visible') throw new Error('Foreground visibility required');
			const { FluidEngine, _setContextTier } = await import('/src/lib/engine/FluidEngine.ts');
			const { PRESETS } = await import('/src/lib/presets/registry.ts');
			const { cssQualityPolicy, canvasPixelSize } = await import('/src/lib/engine/resolution.ts');
			const canvas = document.createElement('canvas');
			const size = canvasPixelSize(w, h, devicePixelRatio); // Fluid.svelte native-DPR backing
			canvas.width = size.width; canvas.height = size.height;
			canvas.style.cssText = `display:block;width:${w}px;height:${h}px`;
			document.body.append(canvas);
			// Config derivation identical to gpu-budget.browser.test.ts / paced-presentation.mjs.
			const cfg = { ...(preset === '(default)' ? {} : PRESETS.find((p) => p.id === preset).config), pointerInput: false };
			const max = Math.max(canvas.width, canvas.height);
			cfg.dyeResolution = Math.min(cfg.dyeResolution ?? 1024, max);
			cfg.bloomResolution = Math.min(cfg.bloomResolution ?? 256, max);
			cfg.sunraysResolution = Math.min(cfg.sunraysResolution ?? 196, max);
			const policy = cssQualityPolicy(w, h, cfg.simResolution ?? 128, cfg.bloomIterations !== undefined, cfg.pressureIterations !== undefined);
			if (policy.suppressPost) { cfg.bloom ??= false; cfg.sunrays ??= false; }
			if (policy.bloomIterations !== undefined) cfg.bloomIterations = policy.bloomIterations;
			if (policy.pressureIterations !== undefined) cfg.pressureIterations = policy.pressureIterations;
			_setContextTier(tier);
			let e;
			try { e = new FluidEngine({ canvas, autoStart: false, config: cfg }); } finally { _setContextTier('auto'); }
			if (e.sharedContext !== (tier === 'shared')) throw new Error('tier mismatch');
			// Private gates as in paced-presentation.mjs: production trackSettle, no competing RAF.
			e.autoStart = true; e.deterministicMode = false; e.startRaf = () => {}; e.calcDeltaTime = () => 1 / 60;
			const counts = { requested: 0, delivered: 0 };
			const snap = globalThis.createImageBitmap, transfer = ImageBitmapRenderingContext.prototype.transferFromImageBitmap;
			globalThis.createImageBitmap = function (...a) { counts.requested++; return snap.apply(this, a); };
			ImageBitmapRenderingContext.prototype.transferFromImageBitmap = function (b) { transfer.call(this, b); if (this.canvas === canvas) counts.delivered++; };
			const frame = () => { e.rafRunning = true; e.update(); e.stopRaf(); };
			const px = new Uint8Array(4);
			const drain = () => e.withGl(() => { const gl = e.gl; gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); });
			for (let i = 0; i < 200; i++) frame();
			await e.presented(); drain();
			const dbg = e.gl.getExtension('WEBGL_debug_renderer_info');
			globalThis.__cap = { e, frame, counts, restore: () => { globalThis.createImageBitmap = snap; ImageBitmapRenderingContext.prototype.transferFromImageBitmap = transfer; } };
			return { dprActual: devicePixelRatio, backing: [canvas.width, canvas.height], adapter: dbg ? String(e.gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown', ua: navigator.userAgent, config: { sim: cfg.simResolution ?? 128, dye: cfg.dyeResolution, pressureIterations: cfg.pressureIterations ?? null, bloom: cfg.bloom ?? null, sunrays: cfg.sunrays ?? null } };
		}, c);
		const pid = gpuPid();
		const trace = `${DIR}/${name}-a${attempt}.trace`;
		execFileSync('rm', ['-rf', trace]);
		const note = `svelte-fluid.gpu-capture.${process.pid}.${name}.${attempt}`;
		const started = Bun.spawn(['/usr/bin/notifyutil', '-1', note], { stdout: 'ignore' });
		owned.push(started);
		const cmd = ['xcrun', 'xctrace', 'record', '--template', 'Metal System Trace', '--attach', String(pid), '--time-limit', '10s', '--no-prompt', '--notify-tracing-started', note, '--output', trace];
		const rec = Bun.spawn(cmd, { env: XCODE, stdout: 'pipe', stderr: 'pipe' });
		owned.push(rec);
		await Promise.race([started.exited, Bun.sleep(6000)]);
		started.kill();
		await Bun.sleep(300); // quiet lead-in
	// 60 individually paced frames: three RAFs apart so each frame's GPU burst is
	// isolated in the trace; presentation verified per frame (transferFromImageBitmap).
	const run = await page.evaluate(async (FRAMES) => {
		const { e, frame, counts, restore } = globalThis.__cap;
		const before = { ...counts }, marks = [];
		try {
			for (let i = 0; i < FRAMES; i++) {
				for (let raf = 0; raf < 3; raf++) await new Promise(requestAnimationFrame);
				const shared = !!e.sharedContext;
				const r0 = counts.requested, d0 = counts.delivered, t0 = performance.now();
				frame();
				const cpuMs = performance.now() - t0;
				await e.presented();
				marks.push({ t0, cpuMs });
				if (shared && (counts.requested !== r0 + 1 || counts.delivered !== d0 + 1)) throw new Error(`frame ${i}: transfer not delivered`);
			}
			return { marks, transfers: { requested: counts.requested - before.requested, delivered: counts.delivered - before.delivered }, settled: e.settled, transfersOk: runOk() };
			function runOk() { return !e.sharedContext || (counts.requested - before.requested === FRAMES && counts.delivered - before.delivered === FRAMES); }
		} finally { restore(); }
	}, FRAMES);
	await Bun.sleep(500); // let the last frame's GPU execution and display dependencies complete
	rec.kill('SIGINT'); // early stop; --time-limit 10s is the hard ceiling
	const code = await rec.exited;
	if (code !== 0) throw new Error(`xctrace exit ${code}: ${await new Response(rec.stderr).text()}`);
	await page.evaluate(() => { globalThis.__cap.e.dispose(); document.body.replaceChildren(); delete globalThis.__cap; });
	const a = analyse(trace, pid, run.marks, setup.backing);
	const { frames, ...summary } = a;
	return { ...c, name, trace, gpuPid: pid, command: cmd.join(' '), ...setup, transfers: run.transfers, settled: run.settled, transfersOk: run.transfersOk, ...summary, frameDetail: frames, perFrameGpuMs: frames.map((f) => +f.gpuMs.toFixed(4)) };
}
