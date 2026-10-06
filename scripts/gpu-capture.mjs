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
const FRAMES = 60, WARM = 200;
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
	const writes = new Map();
	for (const r of io.rows) if (Number(r.pid?.text) === gpuPid && n(r.width) === backing[0] && n(r.height) === backing[1] && r['access-type']?.text === '1') writes.set(n(r['cmdbuffer-id']), true);
	// Align JS frame marks (ms) to trace time (ns): choose the offset that places the most
	// encoder-bearing GPU-process commits inside [t0, t0 + cpu + 1 ms] of some measured frame.
	const work = commits.filter((c) => c.enc > 0);
	const t0 = marks.map((m) => m.t0 * 1e6), cpu = marks.map((m) => m.cpuMs * 1e6);
	let best = { score: -1, off: 0 };
	for (const c of work) {
		const off = c.t - t0[0] - 0.05e6;
		let score = 0, j = 0;
		for (const w of work) {
			while (j < t0.length - 1 && w.t >= t0[j + 1] + off - 0.5e6) j++;
			if (w.t >= t0[j] + off - 0.5e6 && w.t <= t0[j] + off + cpu[j] + 1e6) score++;
		}
		if (score > best.score) best = { score, off };
	}
	const lo = t0[0] + best.off - 0.5e6, hi = t0.at(-1) + best.off + 16.7e6;
	const inSpan = work.filter((c) => c.t >= lo && c.t < hi).length;
	const frames = t0.map((start, i) => {
		const a = start + best.off - 0.5e6, b = i + 1 < t0.length ? t0[i + 1] + best.off - 0.5e6 : hi;
		const cbs = commits.filter((c) => c.t >= a && c.t < b);
		const iv = cbs.flatMap((c) => exec.get(c.cb) ?? []);
		const end = iv.length ? Math.max(...iv.map((x) => x[1])) : a;
		// Non-instance GPU work overlapping this frame's commit window through its last instance execution.
		const ws = other.filter((x) => x[1] > a && x[0] < Math.max(b, end));
		const by = {};
		for (const x of ws) (by[x[2]] ??= []).push([Math.max(x[0], a), Math.min(x[1], Math.max(b, end))]);
		return { gpuMs: union(iv) / 1e6, cbs: cbs.length, encoders: cbs.reduce((s, c) => s + c.enc, 0), presentWrite: cbs.some((c) => writes.get(c.cb)), other: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, union(v) / 1e6])) };
	});
	const g = frames.map((f) => f.gpuMs);
	const otherKeys = [...new Set(frames.flatMap((f) => Object.keys(f.other)))];
	return {
		medianMs: rank(g, 0.5), p95Ms: rank(g, 0.95), maxMs: Math.max(...g), minMs: Math.min(...g),
		framesWithWork: frames.filter((f) => f.encoders > 0).length, framesWithPresentWrite: frames.filter((f) => f.presentWrite).length,
		alignment: { matchedCommits: best.score, encoderCommitsInSpan: inSpan },
		nonInstanceMedianMs: Object.fromEntries(otherKeys.map((k) => [k, rank(frames.map((f) => f.other[k] ?? 0), 0.5)])),
		nonInstanceMaxMs: Object.fromEntries(otherKeys.map((k) => [k, Math.max(...frames.map((f) => f.other[k] ?? 0))])),
		hashes, frames
	};
}

// --- capture --------------------------------------------------------------------------------
const owned = [];
const server = Bun.spawn(['bun', 'run', 'dev', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdout: 'ignore', stderr: 'inherit' });
owned.push(server);
let browser;
const deadline = setTimeout(() => { for (const p of owned) p.kill(); process.exit(2); }, 60 * 60 * 1000);
const results = [];
try {
	for (let i = 0; i < 100 && !(await fetch(URL).then((r) => r.ok, () => false)); i++) await Bun.sleep(100);
	browser = await chromium.launch({ executablePath: CHROME, headless: false, ignoreDefaultArgs: ['--enable-unsafe-swiftshader'] });
	const ps = () => execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' }).split('\n').map((l) => l.trim().split(/\s+/));
	const chromePid = Number(ps().find((f) => +f[1] === process.pid && f.slice(2).join(' ').startsWith(CHROME))?.[0]);
	const gpuPid = () => Number(ps().find((f) => +f[1] === chromePid && f.join(' ').includes('--type=gpu-process'))?.[0]);
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
		await page.bringToFront();
		const name = `${c.preset.replace(/\W/g, '')}-${c.w}x${c.h}-${c.tier}-dpr${c.dpr}`;
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
		const trace = `${DIR}/${name}.trace`;
		execFileSync('rm', ['-rf', trace]);
		const note = `svelte-fluid.gpu-capture.${process.pid}.${results.length}`;
		const started = Bun.spawn(['/usr/bin/notifyutil', '-1', note], { stdout: 'ignore' });
		owned.push(started);
		const cmd = ['xcrun', 'xctrace', 'record', '--template', 'Metal System Trace', '--attach', String(pid), '--time-limit', '10s', '--no-prompt', '--notify-tracing-started', note, '--output', trace];
		const rec = Bun.spawn(cmd, { env: XCODE, stdout: 'pipe', stderr: 'pipe' });
		owned.push(rec);
		await Promise.race([started.exited, Bun.sleep(6000)]);
		started.kill();
		await Bun.sleep(300); // quiet lead-in
		// 60 individually paced frames: RAF wait outside the span, one 1/60 s update, then the
		// frame's presentation promise (shared tier: the actual transferFromImageBitmap).
		const run = await page.evaluate(async (FRAMES) => {
			const { e, frame, counts, restore } = globalThis.__cap;
			const before = { ...counts }, marks = [];
			try {
				for (let i = 0; i < FRAMES; i++) {
					await new Promise(requestAnimationFrame);
					const r0 = counts.requested, d0 = counts.delivered, t0 = performance.now();
					frame();
					const cpuMs = performance.now() - t0;
					await e.presented();
					marks.push({ t0, cpuMs });
					if (e.sharedContext && (counts.requested !== r0 + 1 || counts.delivered !== d0 + 1)) throw new Error(`frame ${i}: transfer not delivered`);
				}
				await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
				return { marks, transfers: { requested: counts.requested - before.requested, delivered: counts.delivered - before.delivered }, settled: e.settled };
			} finally { restore(); e.dispose(); document.body.replaceChildren(); delete globalThis.__cap; }
		}, FRAMES);
		await Bun.sleep(300);
		rec.kill('SIGINT'); // early stop; --time-limit 10s is the hard ceiling
		const code = await rec.exited;
		if (code !== 0) throw new Error(`xctrace exit ${code}: ${await new Response(rec.stderr).text()}`);
		const a = analyse(trace, pid, run.marks, setup.backing);
		const { frames, ...summary } = a;
		results.push({ ...c, name, trace, gpuPid: pid, command: cmd.join(' '), ...setup, transfers: run.transfers, settled: run.settled, ...summary, perFrameGpuMs: frames.map((f) => +f.gpuMs.toFixed(4)) });
		await writeFile(`${DIR}/capture.json`, JSON.stringify({ sha, machineDpr, chrome: CHROME, results }, null, 2));
		console.log(JSON.stringify({ name, backing: setup.backing, median: a.medianMs.toFixed(3), p95: a.p95Ms.toFixed(3), max: a.maxMs.toFixed(3), work: a.framesWithWork, presentWrites: a.framesWithPresentWrite, align: a.alignment, transfers: run.transfers, other: a.nonInstanceMedianMs }));
	}
} finally {
	clearTimeout(deadline);
	await browser?.close();
	for (const p of owned.reverse()) { p.kill(); await p.exited; }
}
