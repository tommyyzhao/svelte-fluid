// Native Metal GPU-execution capture of one FluidEngine per page (measurement only;
// no runtime patch, no timer queries). Dev-docs: dev-docs/benchmarks/gpu-budget.md.
// Run: bun scripts/gpu-capture.mjs [--frames N] [--runs R] [--seed N[,N...]]; --legacy = 60 frames / 1 run.
// Defaults: 600 measured frames / 3 independent browser runs / seed 5. Env: GPU_CAPTURE_FRAMES, GPU_CAPTURE_RUNS.
// Env: GPU_CAPTURE_CASES='Karman@1440x900:own:2,...' (preset@CSS:tier:DPR; default = full
// preset matrix at the machine DPR), GPU_CAPTURE_DIR (default /tmp/gpu-capture; traces stay there).
// Hardware Chrome with ordinary flags: Playwright's default --enable-unsafe-swiftshader is removed.
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseArgs, promisify } from 'node:util';
const execAsync = promisify(execFile);
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const XCODE = { ...process.env, DEVELOPER_DIR: '/Applications/Xcode.app/Contents/Developer' };
const DIR = process.env.GPU_CAPTURE_DIR || '/tmp/gpu-capture';
const PORT = 5198, URL = `http://127.0.0.1:${PORT}`;
const WARM = 200, RETRIES = 2, RETRY_WAIT_MS = 30000;
const PRESETS = ['(default)', 'LavaLamp', 'Plasma', 'InkInWater', 'FrozenSwirl', 'Aurora', 'CircularFluid', 'FrameFluid', 'AnnularFluid', 'SvgPathFluid', 'Toroidal', 'GasFlare', 'Venturi', 'Karman', 'TeslaValve'];
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const USAGE = 'bun scripts/gpu-capture.mjs [--frames N] [--runs R] [--seed N[,N...]] [--legacy] | --self-check | --replay capture.json';
async function attemptDeadline(work, cleanup, state, timeoutMs = 90000) {
	const controller = new AbortController();
	let timer;
	try {
		return await Promise.race([work(controller.signal), new Promise((_, reject) => {
			timer = setTimeout(() => { controller.abort(); cleanup(); reject(new Error(`Attempt timeout in ${state.phase}`)); }, timeoutMs);
		})]);
	} finally { clearTimeout(timer); }
}
function positiveInteger(value, label) {
	if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new Error(`${label} requires a positive safe integer`);
	return Number(value);
}
function captureOptions(args, env = process.env) {
	const { values } = parseArgs({ args, options: { frames: { type: 'string' }, runs: { type: 'string' }, seed: { type: 'string' }, legacy: { type: 'boolean' }, help: { type: 'boolean' }, 'self-check': { type: 'boolean' }, replay: { type: 'string' } } });
	if ((values.replay || values['self-check'] || values.help) && Object.keys(values).length !== 1) throw new Error(USAGE);
	if (values.legacy && (values.frames !== undefined || values.runs !== undefined)) throw new Error('--legacy cannot be combined with --frames or --runs');
	return { ...values, frames: positiveInteger(values.legacy ? '60' : values.frames ?? env.GPU_CAPTURE_FRAMES ?? '600', '--frames / GPU_CAPTURE_FRAMES'), runs: positiveInteger(values.legacy ? '1' : values.runs ?? env.GPU_CAPTURE_RUNS ?? '3', '--runs / GPU_CAPTURE_RUNS'), seeds: parseSeeds(values.seed) };
}

function parseSeeds(value = '5') {
	const seeds = value.split(',').map((s) => /^\d+$/.test(s) ? Number(s) : NaN);
	if (!seeds.length || seeds.length > 5 || seeds.some((s) => !Number.isInteger(s) || s < 0 || s > 0xffffffff) || new Set(seeds).size !== seeds.length) {
		throw new Error('--seed requires 1–5 distinct uint32 seeds');
	}
	return seeds;
}
function verdict(r) {
	const incomplete = r.measuredFrames !== undefined && (r.clusters !== r.measuredFrames || r.framesWithPresentWrite !== r.measuredFrames || r.strays !== 0 || r.completedFrames !== undefined && r.completedFrames !== r.measuredFrames);
	return !r.aligned || !Number.isFinite(r.p95Ms) || r.transfersOk === false || incomplete ? 'INCONCLUSIVE' : r.contended ? 'CONTENDED' : r.p95Ms < 2 ? 'PASS' : 'FAIL';
}
function sceneVerdicts(results, requiredRuns = 1) {
	const scenes = new Map();
	for (const r of results) {
		const key = JSON.stringify([r.preset, r.w, r.h, r.tier, r.dpr]);
		if (!scenes.has(key)) scenes.set(key, { preset: r.preset, w: r.w, h: r.h, tier: r.tier, dpr: r.dpr, repeats: [] });
		scenes.get(key).repeats.push({ seed: r.seed, run: r.run, attempt: r.attempt, trace: r.trace, verdict: r.verdict, medianMs: r.medianMs, p95Ms: r.p95Ms, maxMs: r.maxMs });
	}
	return [...scenes.values()].map((s) => {
		const clean = s.repeats.filter((r) => r.verdict === 'PASS' || r.verdict === 'FAIL');
		const complete = [...new Set(s.repeats.map((r) => r.seed))].every((seed) => {
			const repeats = clean.filter((r) => r.seed === seed);
			return new Set(repeats.map((r) => r.run ?? r.trace)).size >= requiredRuns;
		});
		const spread = Object.fromEntries(['medianMs', 'p95Ms', 'maxMs'].map((key) => {
			const v = clean.map((r) => r[key]), min = v.length ? Math.min(...v) : null, max = v.length ? Math.max(...v) : null;
			return [key, { min, max, range: v.length ? max - min : null }];
		}));
		return { ...s, requiredRuns, cleanRepeats: clean.length, complete, spread, verdict: requiredRuns > 1 && !complete ? 'INCOMPLETE' : clean.some((r) => r.verdict === 'FAIL') ? 'FAIL' : complete ? 'PASS' : 'INCONCLUSIVE' };
	});
}
const workerMode = process.argv[2] === '--analyse-worker';
const options = captureOptions(workerMode ? [] : process.argv.slice(2));
if (options.help) { console.log(USAGE); process.exit(0); }
const { frames: FRAMES, runs: RUNS, seeds } = options;
// Three-RAF pacing is 30 s for 600 frames at 60 Hz, not 10 s. Allow 2× that
// duration plus startup/finalisation slack; --window would discard required frames.
const TRACE_LIMIT_S = options.legacy ? 10 : Math.max(10, Math.ceil(FRAMES * 3 / 60 * 2 + 10));
const protocol = { measuredFrames: FRAMES, runs: RUNS, warmupFrames: WARM, p95Index: Math.round(0.95 * (FRAMES - 1)), traceLimitSeconds: TRACE_LIMIT_S, legacy: !!options.legacy };

// --- xctrace export parsing (id/ref-deduplicated XML rows) -------------------------------
async function exportTable(trace, schema, signal) {
	const { stdout: xml } = await execAsync('env', [`DEVELOPER_DIR=${XCODE.DEVELOPER_DIR}`, 'xcrun', 'xctrace', 'export', '--input', trace, '--xpath', `/trace-toc/run[@number="1"]/data/table[@schema="${schema}"]`], { env: XCODE, encoding: 'utf8', maxBuffer: 1 << 30, timeout: 15000, signal });
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
const clusterGap = (marks) => Math.max(10.75, marks.length > 1 ? 0.4 * rank(marks.slice(1).map((m, i) => m.t0 - marks[i].t0), 0.5) : 10.75);

async function analyse(trace, gpuPid, marks, backing, signal) {
	const gpu = await exportTable(trace, 'metal-gpu-intervals', signal);
	const subs = await exportTable(trace, 'metal-application-command-buffer-submissions', signal);
	const io = await exportTable(trace, 'metal-io-surface-access', signal);
	const hashes = { 'metal-gpu-intervals': sha256(gpu.xml), 'metal-application-command-buffer-submissions': sha256(subs.xml), 'metal-io-surface-access': sha256(io.xml) };
	const exportBytes = { 'metal-gpu-intervals': Buffer.byteLength(gpu.xml), 'metal-application-command-buffer-submissions': Buffer.byteLength(subs.xml), 'metal-io-surface-access': Buffer.byteLength(io.xml) };
	const exec = new Map(); // cmdbuffer-id -> [start,end] ns, Chrome GPU process only
	const browserOs = []; // measured Chrome GPU process + WindowServer, not foreign Chrome clients
	const other = []; // [start,end,label] for non-instance processes
	for (const r of gpu.rows) {
		const s = n(r.start), e = s + n(r.duration), pid = pidOf(r.process);
		if (pid === gpuPid || /^WindowServer \(/.test(r.process?.attrs.fmt ?? '')) browserOs.push([s, e]);
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
	const clusterGapMs = clusterGap(marks);
	const GAP = clusterGapMs * 1e6; // tolerate submit stalls, remain below paced frame spacing
	const idleGapBursts = commits.filter((c) => c.enc > 0).reduce((s, c, i, a) => s + (!i || c.t - a[i - 1].t >= 6e6 ? 1 : 0), 0);
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
		// Ceiling: all measured Chrome GPU-process + WindowServer execution in this frame window,
		// including execution beyond the next commit if this instance has not completed yet.
		const windowEnd = Math.max(run[i + 1]?.start ?? e + 25e6, e);
		const browserOsMs = union(browserOs.filter((x) => x[1] > b.start && x[0] < windowEnd).map(([a, z]) => [Math.max(a, b.start), Math.min(z, windowEnd)])) / 1e6;
		const by = {};
		for (const x of other) for (const [a, z] of iv) if (x[1] > a && x[0] < z) (by[x[2]] ??= []).push([Math.max(x[0], a), Math.min(x[1], z)]);
		return {
			gpuMs: union(iv) / 1e6, browserOsMs, firstToLastMs: (e - s) / 1e6, commitOffsetMs: (b.start - run[0].start - (t0[i] - t0[0])) / 1e6,
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
		aligned, alignErrMs: best.err / 1e6, clusterGapMs, idleGapBursts, clusterDisagreements: idleGapBursts - bursts.length, bursts: bursts.length, clusters: run.length, strays, spanMs,
		medianMs: g.length ? rank(g, 0.5) : NaN, p95Ms: g.length ? rank(g, 0.95) : NaN, maxMs: g.length ? Math.max(...g) : NaN,
		framesWithPresentWrite: frames.filter((f) => f.presentWrite).length,
		browserOsMedianMs: g.length ? rank(frames.map((f) => f.browserOsMs), 0.5) : NaN,
		browserOsP95Ms: g.length ? rank(frames.map((f) => f.browserOsMs), 0.95) : NaN,
		browserOsMaxMs: g.length ? Math.max(...frames.map((f) => f.browserOsMs)) : NaN,
		otherClients, hashes, exportBytes, frames
	};
}

if (workerMode) {
	const input = JSON.parse(await readFile(process.argv[3], 'utf8'));
	await writeFile(process.argv[4], JSON.stringify(await analyse(input.trace, input.pid, input.marks, input.backing)));
	process.exit(0);
}
async function analyseWorker(trace, pid, marks, backing, signal) {
	const input = `${trace}.analysis-input.json`, output = `${trace}.analysis.json`;
	await writeFile(input, JSON.stringify({ trace, pid, marks, backing }));
	await execAsync(process.execPath, [process.argv[1], '--analyse-worker', input, output], { timeout: 60000, signal, maxBuffer: 1 << 20 });
	return JSON.parse(await readFile(output, 'utf8'));
}

// Runnable self-check; replay permits metadata/ceiling derivation from existing /tmp traces.
if (options['self-check']) {
	assert.equal(union([[0, 3], [1, 2], [2, 5], [7, 8]]), 6);
	assert.equal(rank(Array.from({ length: 60 }, (_, i) => i), 0.5), 30);
	assert.equal(rank(Array.from({ length: 60 }, (_, i) => i), 0.95), 56);
	assert.equal(rank(Array.from({ length: 600 }, (_, i) => i), 0.95), 569);
	assert.equal(clusterGap([{ t0: 0 }, { t0: 25 }, { t0: 50 }]), 10.75);
	assert.equal(clusterGap([{ t0: 0 }, { t0: 50 }, { t0: 100 }]), 20);
	assert.equal(captureOptions([], {}).frames, 600);
	assert.equal(captureOptions([], {}).runs, 3);
	assert.equal(captureOptions([], { GPU_CAPTURE_FRAMES: '1200', GPU_CAPTURE_RUNS: '4' }).frames, 1200);
	assert.equal(captureOptions(['--frames', '600', '--runs', '2'], { GPU_CAPTURE_FRAMES: '1200' }).runs, 2);
	assert.equal(captureOptions(['--frames', '600'], { GPU_CAPTURE_FRAMES: '1200' }).frames, 600);
	assert.equal(captureOptions(['--legacy'], {}).frames, 60);
	assert.equal(captureOptions(['--legacy'], {}).runs, 1);
	for (const value of ['', '0', '-1', '1.5', 'Infinity', '9007199254740992']) assert.throws(() => captureOptions(['--frames', value], {}));
	assert.throws(() => captureOptions(['--runs', '0'], {}));
	assert.throws(() => captureOptions(['--legacy', '--frames', '600'], {}));
	assert.throws(() => captureOptions(['--replay', 'capture.json', '--runs', '3'], {}));
	assert.deepEqual(parseSeeds(), [5]);
	assert.deepEqual(parseSeeds('0,5,4294967295'), [0, 5, 4294967295]);
	for (const value of ['', '-1', '1.5', '4294967296', '5,5', '1,2,3,4,5,6']) assert.throws(() => parseSeeds(value));
	const clean = { aligned: true, p95Ms: 1.9, maxMs: 3, transfersOk: true, contended: false };
	assert.equal(verdict(clean), 'PASS');
	assert.equal(verdict({ ...clean, p95Ms: 2 }), 'FAIL');
	assert.equal(verdict({ ...clean, p95Ms: NaN }), 'INCONCLUSIVE');
	assert.equal(verdict({ ...clean, contended: true }), 'CONTENDED');
	assert.equal(verdict({ ...clean, transfersOk: false }), 'INCONCLUSIVE');
	assert.equal(sceneVerdicts([{ ...clean, verdict: 'FAIL' }, { ...clean, verdict: 'PASS' }])[0].verdict, 'FAIL');
	assert.equal(sceneVerdicts([{ ...clean, verdict: 'PASS' }, { ...clean, verdict: 'CONTENDED' }])[0].cleanRepeats, 1);
	assert.equal(sceneVerdicts([{ ...clean, verdict: 'INCONCLUSIVE' }])[0].verdict, 'INCONCLUSIVE');
	const repeats = [1, 2, 3].map((run) => ({ ...clean, seed: 5, run, verdict: 'PASS', medianMs: 1 + run / 10, p95Ms: 1.5 + run / 10, maxMs: 3 + run / 10 }));
	assert.equal(sceneVerdicts(repeats, 3)[0].verdict, 'PASS');
	assert.equal(sceneVerdicts(repeats.slice(0, 2), 3)[0].verdict, 'INCOMPLETE');
	assert.equal(sceneVerdicts([...repeats, { ...repeats[0], verdict: 'FAIL', p95Ms: 2 }], 3)[0].verdict, 'FAIL');
	assert.equal(sceneVerdicts([...repeats, { ...repeats[0], seed: 42 }], 3)[0].verdict, 'INCOMPLETE');
	assert.equal(sceneVerdicts([repeats[0], repeats[0], repeats[0]], 3)[0].verdict, 'INCOMPLETE');
	assert.ok(Math.abs(sceneVerdicts(repeats, 3)[0].spread.p95Ms.range - 0.2) < 1e-12);
	const complete = { ...clean, measuredFrames: 600, clusters: 600, framesWithPresentWrite: 600, strays: 0 };
	assert.equal(verdict(complete), 'PASS');
	assert.equal(verdict({ ...complete, framesWithPresentWrite: 599 }), 'INCONCLUSIVE');
	assert.equal(verdict({ ...complete, clusters: 599 }), 'INCONCLUSIVE');
	assert.equal(verdict({ ...complete, strays: 1 }), 'INCONCLUSIVE');
	assert.equal(verdict({ ...complete, completedFrames: 75 }), 'INCONCLUSIVE');
	let cleaned = false;
	await assert.rejects(attemptDeadline(() => new Promise(() => {}), () => { cleaned = true; }, { phase: 'simulated hang' }, 10), /Attempt timeout in simulated hang/);
	assert.equal(cleaned, true);
	console.log('GPU capture self-check passed'); process.exit(0);
}
if (options.replay) {
	const d = JSON.parse(await readFile(options.replay, 'utf8'));
	for (const r of d.results) {
		r.seed ??= 'unseeded (historical)';
		if (!r.marks) {
			// Older captures preserved frame->command-buffer ownership, not the JS marks. Reuse that
			// mapping only; the original capture's alignErrMs remains the JS-spacing validation.
			const frames = JSON.parse(await readFile(`${r.trace.replace(/\.trace$/, '')}.frames.json`, 'utf8'));
			const subs = (await exportTable(r.trace, 'metal-application-command-buffer-submissions')).rows;
			const times = new Map(subs.map((s) => [n(s['cmdbuffer-id']), n(s.start)]));
			r.marks = frames.map((f) => ({ t0: times.get(parseInt(f.cbs[0].split(':')[0], 16)) / 1e6 }));
			r.originalAlignErrMs = r.alignErrMs;
		}
		if (r.measuredFrames !== undefined && r.marks.length !== r.measuredFrames) { r.verdict = 'INCONCLUSIVE'; continue; }
		const a = await analyseWorker(r.trace, r.gpuPid, r.marks, r.backing);
		const { frames, ...summary } = a;
		Object.assign(r, summary);
		r.foreignOverlapMs = frames.reduce((s, f) => s + Object.entries(f.overlap).filter(([k]) => !/^WindowServer \(/.test(k)).reduce((t, [, v]) => t + v, 0), 0);
		r.foreignOverlapPct = +(100 * r.foreignOverlapMs / frames.reduce((s, f) => s + f.gpuMs, 0)).toFixed(3);
		r.contended = r.foreignOverlapPct >= 5;
		r.verdict = verdict(r);
		await writeFile(`${r.trace}.frames.json`, JSON.stringify(frames, null, 1));
	}
	d.scenes = sceneVerdicts(d.results, d.protocol?.runs ?? 1);
	await writeFile(options.replay, JSON.stringify(d, null, 2)); process.exit(0);
}

// --- capture --------------------------------------------------------------------------------
await mkdir(DIR, { recursive: true });
const owned = [], results = [];
const census = () => execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' }).split('\n').map((l) => { const m = l.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/); return m && { pid: +m[1], ppid: +m[2], command: m[3] }; }).filter(Boolean);
let browser, gpuPid, server, machineDpr;
const save = () => writeFileSync(`${DIR}/capture.json`, JSON.stringify({ sha, machineDpr, chrome: CHROME, seeds, protocol, results, scenes: sceneVerdicts(results, RUNS) }, null, 2));
const exactOwned = new Map();
function rememberOwned() {
	const rows = census(), ids = new Set([process.pid]);
	for (let changed = true; changed;) { changed = false; for (const r of rows) if (ids.has(r.ppid) && !ids.has(r.pid)) { ids.add(r.pid); changed = true; } }
	for (const r of rows) if (ids.has(r.pid) && r.pid !== process.pid) exactOwned.set(r.pid, r.command);
}
function cleanupOwned() {
	rememberOwned();
	for (const r of census().reverse()) if (exactOwned.get(r.pid) === r.command) {
		try { process.kill(r.pid, 'SIGTERM'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
	}
	browser = null; server = null;
}
let watchdog = setTimeout(stalled, 5 * 60 * 1000);
function stalled() { save(); cleanupOwned(); process.exit(2); }
function completed() { clearTimeout(watchdog); watchdog = setTimeout(stalled, 5 * 60 * 1000); }
async function startServer(phase) {
	if (server) return;
	phase('server startup');
	server = Bun.spawn(['bun', 'run', 'dev', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdout: 'ignore', stderr: 'inherit' }); owned.push(server);
	for (let i = 0; i < 100 && !(await fetch(URL, { signal: AbortSignal.timeout(1000) }).then((r) => r.ok, () => false)); i++) await Bun.sleep(100);
	rememberOwned();
}
try {
	let CASES;
	for (let run = 1; run <= RUNS; run++) {
		const bootstrap = { phase: 'browser launch' };
		const bootstrapPhase = (p) => { bootstrap.phase = p; writeFileSync(`${DIR}/run${run}.progress.json`, JSON.stringify(bootstrap)); };
		try {
			await attemptDeadline(async () => {
				await startServer(bootstrapPhase);
				bootstrap.parentRssBytes = process.memoryUsage().rss;
				bootstrapPhase('browser launch');
				console.log(JSON.stringify({ run, phase: 'browser launch', parentRssBytes: bootstrap.parentRssBytes }));
				browser = await chromium.launch({ executablePath: CHROME, headless: false, ignoreDefaultArgs: ['--enable-unsafe-swiftshader'], args: ['--enable-logging=stderr', '--v=0'], timeout: 30000 }); rememberOwned();
				const chromePid = census().find((r) => r.ppid === process.pid && r.command.startsWith(CHROME))?.pid;
				gpuPid = () => census().find((r) => r.ppid === chromePid && r.command.includes('--type=gpu-process'))?.pid;
				bootstrapPhase('DPR probe');
				const context = await browser.newContext({ viewport: null }), probe = await context.newPage();
				machineDpr = await probe.evaluate(() => devicePixelRatio); await context.close();
			}, cleanupOwned, bootstrap);
		} catch (error) {
			cleanupOwned();
			if (!CASES) throw error;
			for (const c of CASES) results.push({ ...c, run, attempt: 1, error: String(error.message), phase: bootstrap.phase, verdict: 'INCONCLUSIVE', aligned: false, p95Ms: NaN });
			save(); completed(); continue;
		}
		CASES ??= (process.env.GPU_CAPTURE_CASES || PRESETS.flatMap((p) => [`${p}@1440x900:own:${machineDpr}`, `${p}@800x500:own:${machineDpr}`]).join(','))
			.split(',').map((s) => { const match = s.match(/^(.+)@([\d.]+)x([\d.]+):(own|shared):([\d.]+)$/); if (!match) throw new Error(`Invalid GPU_CAPTURE_CASES: ${s}`); const [, preset, w, h, tier, dpr] = match; return { preset, w: +w, h: +h, tier, dpr: +dpr }; })
			.flatMap((c) => c.preset.startsWith('model-') ? [{ ...c, seed: c.preset === 'model-inkpaper' ? 5 : 'not applicable (model)' }] : seeds.map((seed) => ({ ...c, seed })));
		let page, pageDpr;
		for (const c of CASES) {
			const name = `${c.preset.replace(/\W/g, '')}-${c.w}x${c.h}-${c.tier}-dpr${c.dpr}${c.preset.startsWith('model-') ? '' : `-seed${c.seed}`}${options.legacy ? '' : `-r${run}`}`;
			for (let attempt = 1; attempt <= 3; attempt++) {
				const state = { phase: 'page setup', marks: [], visibility: [] };
				const phase = (p) => { state.phase = p; writeFileSync(`${DIR}/${name}-a${attempt}.progress.json`, JSON.stringify(state)); };
				let r;
				try {
					r = await attemptDeadline(async (signal) => {
						await startServer(phase);
						if (!browser) {
							state.parentRssBytes = process.memoryUsage().rss; phase('browser relaunch'); console.log(JSON.stringify({ run, phase: 'browser relaunch', parentRssBytes: state.parentRssBytes })); browser = await chromium.launch({ executablePath: CHROME, headless: false, ignoreDefaultArgs: ['--enable-unsafe-swiftshader'], args: ['--enable-logging=stderr', '--v=0'], timeout: 30000 }); rememberOwned();
							const chromePid = census().find((r) => r.ppid === process.pid && r.command.startsWith(CHROME))?.pid;
							gpuPid = () => census().find((r) => r.ppid === chromePid && r.command.includes('--type=gpu-process'))?.pid;
						}
						if (pageDpr !== c.dpr || !page || page.isClosed()) {
							phase('page navigation'); await page?.context().close();
							page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: c.dpr })).newPage();
							await page.route('**/__gpu_capture__', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="margin:0;overflow:hidden;background:#000"></body></html>' }));
							await page.goto(`${URL}/__gpu_capture__`, { timeout: 15000 }); pageDpr = c.dpr;
						}
						const result = await capture(page, c, name, attempt, phase, signal, state);
						phase('attempt browser cleanup'); await browser?.close(); browser = null; page = null; pageDpr = null;
						Bun.gc(true);
						return result;
					}, cleanupOwned, state);
				} catch (error) {
					cleanupOwned(); page = null; pageDpr = null; Bun.gc(true);
					r = { ...c, name, trace: `${DIR}/${name}-a${attempt}.trace`, measuredFrames: FRAMES, completedFrames: state.marks.length, marks: state.marks, visibility: state.visibility, error: state.error ?? String(error.message), phase: state.phase, aligned: false, clusters: 0, framesWithPresentWrite: 0, p95Ms: NaN, medianMs: NaN, maxMs: NaN, frameDetail: [], perFrameGpuMs: [], transfersOk: false };
				}
				const overlapMs = r.frameDetail.reduce((s, f) => s + Object.entries(f.overlap).filter(([k]) => !/^WindowServer \(/.test(k)).reduce((t, [, v]) => t + v, 0), 0);
				const gpuSum = r.perFrameGpuMs.reduce((s, v) => s + v, 0);
				r.foreignOverlapMs = +overlapMs.toFixed(3); r.foreignOverlapPct = gpuSum ? +(100 * overlapMs / gpuSum).toFixed(3) : 0; r.contended = r.foreignOverlapPct >= 5; r.verdict = verdict(r);
				const { frameDetail, ...row } = r; results.push({ ...row, run, attempt }); save(); completed();
				writeFileSync(`${DIR}/${name}-a${attempt}.frames.json`, JSON.stringify(frameDetail, null, 1));
				console.log(JSON.stringify({ name, run, attempt, verdict: r.verdict, error: r.error, phase: r.phase, p95: r.p95Ms, aligned: r.aligned, alignErrMs: r.alignErrMs, clusters: r.clusters, presentWrites: r.framesWithPresentWrite, completedFrames: r.completedFrames }));
				const gpuExit = /GPU process exited/.test(r.error ?? '');
				if (!(gpuExit && attempt < 3 || r.verdict === 'CONTENDED' && attempt < RETRIES)) break;
				await Bun.sleep(RETRY_WAIT_MS);
			}
		}
		const closing = { phase: 'browser cleanup' };
		try { await attemptDeadline(async () => { await browser?.close(); browser = null; }, cleanupOwned, closing, 10000); } catch { cleanupOwned(); }
	}
} finally {
	clearTimeout(watchdog); save(); cleanupOwned();
}
process.exit(0); // terminated Playwright transports must not retain a completed driver


async function capture(page, c, name, attempt, phase, signal, state) {
		phase('warm-up');
		signal.throwIfAborted();
		await page.bringToFront();
		await page.evaluate((v) => { globalThis.__passLog = v; }, process.env.GPU_CAPTURE_PASS_LOG === '1');
		const setup = await page.evaluate(async ({ preset, w, h, tier, seed, warmupFrames }) => {
			if (document.visibilityState !== 'visible') throw new Error('Foreground visibility required');
			if (preset.startsWith('model-')) {
				const { acquireGlHost } = await import('/src/lib/engine/gl-host.ts');
				const { SurfaceEngine } = await import('/src/lib/engine/surface/SurfaceEngine.ts');
				const { EnamelEngine } = await import('/src/lib/engine/enamel/EnamelEngine.ts');
				const canvas = document.createElement('canvas');
				canvas.style.cssText = `display:block;width:${w}px;height:${h}px`;
				let e;
				if (preset === 'model-inkpaper') {
					const { PigmentEngine } = await import('/src/lib/engine/pigment/PigmentEngine.ts');
					document.body.append(canvas);
					e = new PigmentEngine({ canvas, paper: '#f4ecdc', seed: 5, openingWash: false });
					e.resize(w, h, devicePixelRatio);
					e.setResist([{ x: 340, y: 200, w: 120, h: 100 }]);
					e.paint([{ x: 200, y: 250, r: 200, water: 1, pigment: [0.4, 0.2, 0.1, 0] }]);
					e.sleep(); e.wake = () => {};
					// ADR0090 workload: one full solver step and display, held wet, one resist.
					e.busyFrames = (frames) => { for (let i = 0; i < frames; i++) { e.queue.wetSteps = 600; e.host.run(e, (gl) => e.step(gl)); e.host.run(e, (gl) => e.display(gl)); } };
				} else if (preset.startsWith('model-enamel')) {
					const host = document.createElement('div'), source = document.createElement('span');
					host.style.cssText = `position:relative;display:inline-block;font:${preset.endsWith('96') ? '700 96px/1.1 system-ui' : '700 64px/1.1 system-ui'}`;
					source.textContent = preset.endsWith('96') ? 'Enamel' : 'Soft enamel';
					canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
					host.append(source, canvas); document.body.append(host);
					e = new EnamelEngine({ canvas, source });
					const r = host.getBoundingClientRect(); w = r.width; h = r.height;
				} else {
					document.body.append(canvas);
					const key = preset.slice(6);
					const config = key === 'button' ? { control: 'button', tone: 'light', rect: { x: 6, y: 6, width: 220, height: 56 }, radius: 28 }
						: key === 'wide-button' ? { control: 'button', tone: 'dark', rect: { x: 6, y: 6, width: 480, height: 64 }, radius: 32, focus: true }
						: key === 'segmented' ? { control: 'segmented', tone: 'dark', rect: { x: 6, y: 6, width: 360, height: 56 }, radius: 28, lens: { x: 6, y: 6, width: 120, height: 56 }, labels: [{ x: 40, y: 24, width: 50, height: 20 }, { x: 160, y: 24, width: 50, height: 20 }, { x: 280, y: 24, width: 50, height: 20 }] }
						: key === 'dropzone' ? { control: 'dropzone', tone: 'dark', rect: { x: 6, y: 6, width: 480, height: 200 }, radius: 18, drag: { x: -10, y: 100 }, labels: [{ x: 160, y: 96, width: 170, height: 20 }] }
						: key === 'caustics' ? { control: 'overlay', tone: 'dark', rect: { x: 0, y: 0, width: 720, height: 400 }, radius: 16, overlay: 0.3 }
						: null;
					if (!config) throw new Error('Unknown model case');
					e = new SurfaceEngine({ canvas, config });
				}
				e.resize(w, h, devicePixelRatio);
				// Bench busyFrames drives the documented worst-case workload; suppress automatic RAF.
				e.unsubscribe?.(); e.unsubscribe = null; e.schedule = () => {};
				const host = acquireGlHost(e), gl = host.gl;
				const counts = { requested: 0, delivered: 0 };
				const snap = globalThis.createImageBitmap, transfer = ImageBitmapRenderingContext.prototype.transferFromImageBitmap;
				globalThis.createImageBitmap = function (...a) { counts.requested++; return snap.apply(this, a); };
				ImageBitmapRenderingContext.prototype.transferFromImageBitmap = function (b) { transfer.call(this, b); if (this.canvas === canvas) counts.delivered++; };
				let pending;
				const frame = () => { e.busyFrames(1); pending = host.present(e); };
				for (let i = 0; i < warmupFrames; i++) e.busyFrames(1);
				pending = host.present(e); await pending;
				gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
				const dbg = gl.getExtension('WEBGL_debug_renderer_info');
				const wrapper = { sharedContext: true, presented: () => pending, dispose: () => e.dispose(), settled: false };
				globalThis.__cap = { e: wrapper, frame, counts, restore: () => { globalThis.createImageBitmap = snap; ImageBitmapRenderingContext.prototype.transferFromImageBitmap = transfer; } };
				return { dprActual: devicePixelRatio, cssActual: [w, h], backing: [canvas.width, canvas.height], adapter: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown', ua: navigator.userAgent, config: { model: preset } };
			}
			const { FluidEngine, _setContextTier } = await import('/src/lib/engine/FluidEngine.ts');
			const { PRESETS } = await import('/src/lib/presets/registry.ts');
			const { cssQualityPolicy, canvasPixelSize } = await import('/src/lib/engine/resolution.ts');
			const canvas = document.createElement('canvas');
			const size = canvasPixelSize(w, h, devicePixelRatio); // Fluid.svelte native-DPR backing
			canvas.width = size.width; canvas.height = size.height;
			canvas.style.cssText = `display:block;width:${w}px;height:${h}px`;
			document.body.append(canvas);
			// Config derivation identical to gpu-budget.browser.test.ts / paced-presentation.mjs.
			const cfg = { ...(preset === '(default)' ? {} : PRESETS.find((p) => p.id === preset).config), pointerInput: false, seed };
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
			const draws = []; let label = 'unlabelled';
			if (globalThis.__passLog) {
				for (const [name, value] of Object.entries(e)) if (value && typeof value.bind === 'function' && /Program|Material/.test(name)) {
					const bind = value.bind; value.bind = function (...args) { label = name; return bind.apply(this, args); };
				}
				const draw = e.gl.drawElements;
				e.gl.drawElements = function (...args) { draws.push(label); return draw.apply(this, args); };
			}
			const px = new Uint8Array(4);
			const drain = () => e.withGl(() => { const gl = e.gl; gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); });
			for (let i = 0; i < warmupFrames; i++) frame();
			await e.presented(); drain();
			const dbg = e.gl.getExtension('WEBGL_debug_renderer_info');
			globalThis.__cap = { e, frame, counts, draws, restore: () => { globalThis.createImageBitmap = snap; ImageBitmapRenderingContext.prototype.transferFromImageBitmap = transfer; } };
			return { dprActual: devicePixelRatio, backing: [canvas.width, canvas.height], adapter: dbg ? String(e.gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown', ua: navigator.userAgent, config: { sim: cfg.simResolution ?? 128, dye: cfg.dyeResolution, pressureIterations: cfg.pressureIterations ?? null, bloom: cfg.bloom ?? null, sunrays: cfg.sunrays ?? null } };
		}, { ...c, warmupFrames: WARM });
		signal.throwIfAborted();
		phase('recorder startup');
		const pid = gpuPid();
		const trace = `${DIR}/${name}-a${attempt}.trace`;
		execFileSync('rm', ['-rf', trace]);
		const note = `svelte-fluid.gpu-capture.${process.pid}.${name}.${attempt}`;
		const started = Bun.spawn(['/usr/bin/notifyutil', '-1', note], { stdout: 'ignore' });
		owned.push(started);
		const cmd = ['xcrun', 'xctrace', 'record', '--template', 'Metal System Trace', '--attach', String(pid), '--time-limit', `${TRACE_LIMIT_S}s`, '--no-prompt', '--notify-tracing-started', note, '--output', trace];
		const recordingStarted = performance.now();
		const rec = Bun.spawn(['env', `DEVELOPER_DIR=${XCODE.DEVELOPER_DIR}`, ...cmd], { env: XCODE, stdout: 'pipe', stderr: 'pipe' });
		owned.push(rec);
		await Promise.race([started.exited, Bun.sleep(6000)]);
		started.kill();
		phase('quiet lead-in');
		await Bun.sleep(300); // quiet lead-in
		signal.throwIfAborted();
		if (!census().some((r) => r.pid === pid)) throw new Error('GPU process exited during recorder startup');
	// Individually paced frames: three RAFs apart so each frame's GPU burst is
	// isolated in the trace; presentation verified per frame (transferFromImageBitmap).
	phase('measurement');
	const progress = { marks: state.marks, visibility: state.visibility, transfers: { requested: 0, delivered: 0 }, transfersOk: false };
	await page.exposeFunction(`__captureProgress${attempt}${name.replace(/\W/g, '')}`, (event) => {
		if (event.mark) progress.marks.push(event.mark);
		if (event.visibility) progress.visibility.push(event.visibility);
		if (event.transfers) progress.transfers = event.transfers;
		if (event.visibility || progress.marks.length % 50 === 0) phase(state.phase);
	});
	await page.evaluate((key) => { globalThis.__captureProgress = globalThis[key]; }, `__captureProgress${attempt}${name.replace(/\W/g, '')}`);
	let timer;
	let gpuWatch;
	const gpuExited = new Promise((_, reject) => { gpuWatch = setInterval(() => { if (!census().some((r) => r.pid === pid)) reject(new Error('GPU process exited during recording')); }, 250); });
	const run = await Promise.race([
		gpuExited,
		page.evaluate(async ({ FRAMES, timeoutMs }) => {
			const { e, frame, counts, restore, draws } = globalThis.__cap;
			const before = { ...counts }, marks = [], visibility = [];
			const event = () => ({ t: performance.now(), state: document.visibilityState, focus: document.hasFocus() });
			const changed = () => { const v = event(); visibility.push(v); void globalThis.__captureProgress({ visibility: v }); };
			document.addEventListener('visibilitychange', changed); window.addEventListener('blur', changed); window.addEventListener('focus', changed); changed();
			const deadline = performance.now() + timeoutMs;
			async function bounded(promise, label) {
				let timer;
				try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timeout; visibility=${document.visibilityState}; focus=${document.hasFocus()}`)), Math.max(1, Math.min(2000, deadline - performance.now()))); })]); }
				finally { clearTimeout(timer); }
			}
			let error;
			try {
				for (let i = 0; i < FRAMES; i++) {
					if (document.visibilityState !== 'visible') throw new Error('Foreground visibility lost');
					for (let raf = 0; raf < 3; raf++) await bounded(new Promise(requestAnimationFrame), `frame ${i} RAF ${raf}`);
					const shared = !!e.sharedContext;
					const r0 = counts.requested, d0 = counts.delivered, t0 = performance.now();
					if (draws) draws.length = 0;
					frame();
					const mark = { t0, cpuMs: performance.now() - t0, draws: draws ? [...draws] : undefined };
					marks.push(mark);
					await bounded(globalThis.__captureProgress({ mark, transfers: { requested: counts.requested - before.requested, delivered: counts.delivered - before.delivered } }), `frame ${i} progress`);
					await bounded(e.presented(), `frame ${i} presentation`);
					if (shared && (counts.requested !== r0 + 1 || counts.delivered !== d0 + 1)) throw new Error(`frame ${i}: transfer not delivered`);
				}
			} catch (e) { error = String(e.message ?? e); }
			finally { restore(); document.removeEventListener('visibilitychange', changed); window.removeEventListener('blur', changed); window.removeEventListener('focus', changed); }
			return { marks, visibility, error, transfers: { requested: counts.requested - before.requested, delivered: counts.delivered - before.delivered }, settled: e.settled, transfersOk: !error && (!e.sharedContext || (counts.requested - before.requested === FRAMES && counts.delivered - before.delivered === FRAMES)) };
		}, { FRAMES, timeoutMs: (TRACE_LIMIT_S - (options.legacy ? 3 : 10)) * 1000 }),
		new Promise((resolve) => { timer = setTimeout(() => resolve({ ...progress, error: 'Page evaluation timeout before recorder ceiling', transfersOk: false }), (TRACE_LIMIT_S - (options.legacy ? 1 : 8)) * 1000); })
	]).catch((e) => ({ ...progress, error: String(e.message ?? e), transfersOk: false }));
	clearTimeout(timer); clearInterval(gpuWatch);
	await writeFile(`${trace}.progress.json`, JSON.stringify(progress, null, 2));
	signal.throwIfAborted();
	phase('recorder finalisation');
	await Bun.sleep(500); // let the last frame's GPU execution and display dependencies complete
	rec.kill('SIGINT'); // early stop; --time-limit is the hard ceiling
	const code = await rec.exited;
	const recordingWallMs = performance.now() - recordingStarted;
	if (code !== 0) throw new Error(`xctrace exit ${code}: ${await new Response(rec.stderr).text()}`);
	signal.throwIfAborted();
	phase('page cleanup');
	if (run.error) {
		state.error = run.error;
		cleanupOwned();
	}
	else await page.evaluate(() => { globalThis.__cap.e.dispose(); document.body.replaceChildren(); delete globalThis.__cap; });
	signal.throwIfAborted();
	phase('trace export');
	const a = run.marks.length === FRAMES ? await analyseWorker(trace, pid, run.marks, setup.backing, signal) : { aligned: false, clusters: 0, framesWithPresentWrite: 0, strays: null, medianMs: NaN, p95Ms: NaN, maxMs: NaN, frames: [], error: run.error };
	const { frames, ...summary } = a;
	return { ...c, name, trace, gpuPid: pid, command: `env DEVELOPER_DIR=${XCODE.DEVELOPER_DIR} ${cmd.join(' ')}`, measuredFrames: FRAMES, warmupFrames: WARM, recordingWallMs, ...setup, error: run.error, visibility: run.visibility, completedFrames: run.marks.length, transfers: run.transfers, settled: run.settled, transfersOk: run.transfersOk, marks: run.marks, ...summary, frameDetail: frames, perFrameGpuMs: frames.map((f) => +f.gpuMs.toFixed(4)) };
}
