// ADR 0107 E1. Real <Fluid>, normal RAF; headed requires explicit lane approval.
// Historical headed120Hz results stay separate; headless60Hz is not comparable.
// bun scripts/energy-capture.mjs --label baseline [--split train|test|all] [--subset Preset,...]
// --cases 'Preset@1440x900:2:5,...' selects only members of the frozen matrix.
// --runs 3 --run-start 1 --override '{"pressureIterations":26}' (or ENERGY_CAPTURE_OVERRIDE).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rm, readdir, stat, mkdtemp } from 'node:fs/promises';
import { writeFileSync, readFileSync, rmSync, realpathSync, existsSync, lstatSync } from 'node:fs';
const directChildAlive = (child) => child.exitCode === null && (child.signalCode ?? null) === null;
async function enterQuiet(state, ack) {
	state.quiet = true;
	await state.scanning?.catch((error) => { state.teardownError = String(error); });
	ack();
}
async function quietWorker(row) {
	if (!process.send) return;
	let timer, listener;
	try {
		await new Promise((resolve) => {
			listener = (message) => { if (message === 'quiet-ack') resolve(); };
			process.on('message', listener);
			timer = setTimeout(() => { row.quietAckTimeout = true; resolve(); }, 10000);
			process.send('quiet');
		});
	} finally { clearTimeout(timer); process.off('message', listener); }
}
function deleteProvenScratch(proof) {
	if (realpathSync(proof.lsofPath) !== proof.path) return false;
	const current = lstatSync(proof.lsofPath);
	if (current.dev !== proof.dev || current.ino !== proof.ino) return false;
	rmSync(proof.lsofPath); return true;
}
async function postAcquireLoad(load, release) {
	if (load < 15) return true;
	await release(); return false;
}
const inMeasuredWindow = (window, now = Date.now()) => !!window && now >= window.start && now < window.end;
function informationalProbe(state, probe, window) {
	if (inMeasuredWindow(window)) return undefined;
	try { return probe(); } catch (error) { state.teardownError = String(error); return undefined; }
}
function gateReady(state, locked, load, now = Date.now()) {
	if (locked) state.freeSince = now;
	if (load >= 15) state.lowSince = now;
	return !locked && load < 15 && now - state.freeSince >= 300000 && now - state.lowSince >= 300000;
}
import { parseArgs, promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { loadavg, tmpdir } from 'node:os';
import { hasContinuousDriver } from '../src/lib/engine/settle.js';
const execAsync = promisify(execFile);
const ROOT = process.cwd(), PORT = process.argv.includes('--headed') ? 5202 : 5201, URL = `http://127.0.0.1:${PORT}`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const XCODE = { ...process.env, DEVELOPER_DIR: '/Applications/Xcode.app/Contents/Developer' };
const EXPORT_LIMIT_MS = 90000, LOCK = '/tmp/svelte-fluid-gpu.lock';
const TRAIN = ['(default)', 'LavaLamp', 'Plasma', 'InkInWater', 'Aurora', 'CircularFluid', 'SvgPathFluid', 'Toroidal', 'GasFlare', 'Venturi', 'Karman'];
const TEST = ['FrozenSwirl', 'AnnularFluid', 'FrameFluid', 'TeslaValve'];
const matrix = [
	...TRAIN.flatMap((preset) => [[1440, 900], [800, 500]].map(([w, h]) => ({ split: 'train', preset, w, h, dpr: 2, seed: 5 }))),
	...TEST.flatMap((preset) => [2, 1].flatMap((dpr) => [11, 23].map((seed) => ({ split: 'test', preset, w: 1024, h: 640, dpr, seed }))))
];
const key = (c) => `${c.preset}@${c.w}x${c.h}:${c.dpr}:${c.seed}${c.arm ? `:${c.arm}` : ''}`;
const fileKey = (c) => `${c.preset.replace(/\W/g, '') || 'default'}-${c.w}x${c.h}-dpr${c.dpr}-seed${c.seed}${c.arm ? `-${c.arm}` : ''}`;
const median = (values) => {
	const v = [...values].sort((a, b) => a - b), i = Math.floor(v.length / 2);
	return v.length ? v.length % 2 ? v[i] : (v[i - 1] + v[i]) / 2 : null;
};
function slice(intervals, lo, hi) {
	assert.ok(Number.isFinite(lo) && Number.isFinite(hi) && hi > lo);
	return intervals.filter(([s, e]) => e > lo && s < hi).map(([s, e]) => [Math.max(s, lo), Math.min(e, hi)]);
}
const busy = (intervals, lo, hi) => union(slice(intervals, lo, hi)) / (hi - lo) * 1000;
const noise = (values) => {
	if (values.length !== 3 || values.some((v) => !Number.isFinite(v))) return null;
	const m = median(values), range = Math.max(...values) - Math.min(...values);
	return m === 0 ? range === 0 ? 0 : null : range / m;
};
// Same id/ref XML parser and Metal execution interval union as gpu-capture.mjs.
async function exportTable(trace, schema, signal) {
	signal?.throwIfAborted();
	const { stdout: xml } = await execAsync('env', [`DEVELOPER_DIR=${XCODE.DEVELOPER_DIR}`, 'xcrun', 'xctrace', 'export', '--input', trace, '--xpath', `/trace-toc/run[@number="1"]/data/table[@schema="${schema}"]`], { env: XCODE, encoding: 'utf8', maxBuffer: 1 << 30, timeout: EXPORT_LIMIT_MS, signal });
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
const pidOf = (el) => Number(el?.attrs.fmt?.match(/\((\d+)\)$/)?.[1] ?? NaN);
function union(intervals) {
	let total = 0, end = -Infinity;
	for (const [s, e] of intervals.sort((a, b) => a[0] - b[0])) {
		if (e <= end) continue;
		total += e - Math.max(s, end);
		end = e;
	}
	return total;
}
async function analyse(input) {
	const { trace, gpuPid, windows } = input;
	const { stdout: toc } = await execAsync('env', [`DEVELOPER_DIR=${XCODE.DEVELOPER_DIR}`, 'xcrun', 'xctrace', 'export', '--input', trace, '--toc'], { env: XCODE, timeout: EXPORT_LIMIT_MS, maxBuffer: 1 << 20 });
	const origin = Date.parse(toc.match(/<start-date>([^<]+)<\/start-date>/)?.[1]);
	const duration = Number(toc.match(/<duration>([^<]+)<\/duration>/)?.[1]);
	assert.ok(Number.isFinite(origin) && duration > 0, 'Missing trace clock/duration');
	if (/Target app exited|Target process exited/.test(toc)) throw new Error('GPU process exited during recording');
	const gpu = await exportTable(trace, 'metal-gpu-intervals');
	const subs = await exportTable(trace, 'metal-application-command-buffer-submissions');
	const intervals = [], byCb = new Map(), foreign = [];
	for (const r of gpu.rows) {
		const s = n(r.start), e = s + n(r.duration), pid = pidOf(r.process);
		assert.ok(Number.isFinite(s) && Number.isFinite(e) && e >= s, 'Invalid Metal execution interval');
		if (pid === gpuPid) {
			intervals.push([s, e]);
			const cb = n(r['cmdbuffer-id']);
			if (!byCb.has(cb)) byCb.set(cb, []);
			byCb.get(cb).push([s, e]);
		} else if (!/^WindowServer \(/.test(r.process?.attrs.fmt ?? '')) foreign.push([s, e, r.process?.attrs.fmt ?? 'unattributed']);
	}
	assert.ok(intervals.length > 0, 'No owned GPU execution in trace; cannot infer idle');
	const result = {};
	for (const [name, w] of Object.entries(windows)) {
		if (w.unavailable) { result[name] = w; continue; }
		const lo = (w.start - origin) * 1e6, hi = (w.end - origin) * 1e6;
		assert.ok(lo >= 0 && hi <= duration * 1e9, `${name}: window outside trace`);
		const missing = subs.rows.filter((r) => pidOf(r.process) === gpuPid && n(r['num-encoders']) > 0 && n(r.start) >= lo && n(r.start) < hi && !(byCb.get(n(r['cmdbuffer-id'])) ?? []).some(([s, e]) => e > s));
		assert.equal(missing.length, 0, `${name}: missing execution coverage`);
		const clipped = slice(intervals, lo, hi), foreignByProcess = {};
		for (const [s, e, label] of foreign) if (s < hi && e > lo) (foreignByProcess[label] ??= []).push([Math.max(s, lo), Math.min(e, hi)]);
		result[name] = {
			...w, gpuBusyMsPerSecond: busy(intervals, lo, hi), gpuBusyMs: union(clipped) / 1e6,
			foreignBusyMsPerSecond: Object.fromEntries(Object.entries(foreignByProcess).map(([label, iv]) => [label, union(iv) / (hi - lo) * 1000]))
		};
	}
	return {
		traceOriginEpochMs: origin, traceDurationSeconds: duration, clockPrecisionMs: 1,
		hashes: Object.fromEntries([['metal-gpu-intervals', gpu.xml], ['metal-application-command-buffer-submissions', subs.xml]].map(([k, v]) => [k, createHash('sha256').update(v).digest('hex')])),
		exportBytes: { gpu: Buffer.byteLength(gpu.xml), submissions: Buffer.byteLength(subs.xml) }, windows: result
	};
}
if (process.argv[2] === '--analyse-worker') {
	await writeFile(process.argv[4], JSON.stringify(await analyse(JSON.parse(await readFile(process.argv[3], 'utf8')))));
	process.exit(0);
}
const { values: options } = parseArgs({ options: {
	label: { type: 'string', default: 'baseline' }, split: { type: 'string', default: 'all' }, subset: { type: 'string' }, cases: { type: 'string' }, 'source-root': { type: 'string' }, 'engine-sha': { type: 'string' },
	runs: { type: 'string', default: '3' }, 'run-start': { type: 'string', default: '1' }, override: { type: 'string' },
	'paired-max-fps': { type: 'boolean' }, headed: { type: 'boolean' }, 'self-check': { type: 'boolean' }, 'per-encoder-export': { type: 'boolean' }, 'summary-only': { type: 'boolean' }, 'attempt-worker': { type: 'string' }, resume: { type: 'boolean' }, help: { type: 'boolean' }
} });
if (options.help) { console.log('bun scripts/energy-capture.mjs --label NAME [--split train|test|all] [--subset ID,...] [--cases ID@WxH:DPR:seed,...] [--runs 3] [--run-start 1] [--override JSON] [--per-encoder-export] [--resume] | --self-check | --summary-only'); process.exit(0); }
assert.match(options.label, /^[A-Za-z0-9_-]+$/, 'Invalid label');
assert.ok(['all', 'train', 'test'].includes(options.split), 'Invalid split');
const positive = (s) => { assert.match(s, /^\d+$/); const n = Number(s); assert.ok(Number.isSafeInteger(n) && n > 0); return n; };
const RUNS = positive(options.runs), RUN_START = positive(options['run-start']);
assert.ok(Number.isSafeInteger(RUN_START + RUNS), 'Run range exceeds safe integers');
const parsedOverride = JSON.parse(options.override ?? process.env.ENERGY_CAPTURE_OVERRIDE ?? '{}');
assert.ok(parsedOverride && typeof parsedOverride === 'object' && !Array.isArray(parsedOverride), 'Override requires a JSON object');
let override = Object.fromEntries(Object.entries(parsedOverride).sort(([a], [b]) => a.localeCompare(b)));
assert.ok(!options['paired-max-fps'] || (options.headed && Object.keys(override).length === 0), 'Paired maxFps requires headed and no other overrides');
const armOverride = (arm) => ({ maxFps: arm === 'candidate' ? 60 : 0 });
for (const reserved of ['width', 'height', 'seed', 'onReady', 'onError']) assert.ok(!(reserved in override), `Frozen field ${reserved} cannot be overridden`);
const subset = options.subset?.split(','), requested = options.cases?.split(',');
if (subset) for (const p of subset) assert.ok([...TRAIN, ...TEST].includes(p), `Unknown preset ${p}`);
if (requested) for (const k of requested) assert.ok(matrix.some((c) => key(c) === k), `Scene outside frozen matrix ${k}`);
const selectedCases = matrix.filter((c) => (options.split === 'all' || c.split === options.split) && (!subset || subset.includes(c.preset)) && (!requested || requested.includes(key(c))));
const cases = options['paired-max-fps'] ? selectedCases.flatMap((c) => ['baseline', 'candidate'].map((arm) => ({ ...c, arm }))) : selectedCases;
assert.ok(cases.length);
const orderedCases = (run) => options['paired-max-fps'] && run % 2 === 0 ? selectedCases.flatMap((c) => ['candidate', 'baseline'].map((arm) => ({ ...c, arm }))) : cases;
if (options['per-encoder-export']) assert.ok(cases.length === 1 && ['Plasma', 'Karman'].includes(cases[0].preset) && key(cases[0]) === `${cases[0].preset}@1440x900:2:5`, 'Encoder attribution is one TRAIN preset at 1440x900 DPR2 seed5');
const DIR = `/tmp/energy-eval/${options.label}`, harnessSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const sourceRoot = options['source-root'] ?? ROOT;
assert.ok(sourceRoot.startsWith('/'), '--source-root requires an absolute directory');
const baselineSha = options['engine-sha'] ?? (options.headed ? '9984ca1' : options['per-encoder-export'] ? '29065ca' : '37bbe851c0d52c86241f6964c3b443f17e95611b');
const engineSourceSha = sourceRoot === ROOT ? baselineSha : options['engine-sha'];
assert.match(engineSourceSha ?? '', /^[a-f0-9]{7,40}$/, '--source-root requires supplied --engine-sha; no cross-worktree Git operations');
const engineFileHash = createHash('sha256').update(await readFile(`${sourceRoot}/src/lib/engine/FluidEngine.ts`)).digest('hex');
if (sourceRoot === ROOT && !options['self-check']) assert.equal(execFileSync('git', ['diff', baselineSha, '--', 'src/lib'], { encoding: 'utf8' }), '', 'Baseline engine source changed');
const sha = engineSourceSha;
const source = await readFile(process.argv[1], 'utf8');
// Amendment 3 changes only the separate post-trace diagnostic; energy windows/parser stay frozen.
const measurementParts = (s) => s.slice(s.indexOf('function slice('), s.indexOf("const { values: options }")) + s.slice(s.indexOf("\t\tprogress('mount');"), s.indexOf('\t\t// Diagnostic run is separate;'));
const frozenSource = execFileSync('git', ['show', 'e4be335:scripts/energy-capture.mjs'], { cwd: ROOT, encoding: 'utf8' });
assert.equal(measurementParts(source), measurementParts(frozenSource), 'Frozen window/parser/metric logic changed');
const measurementLogicHash = createHash('sha256').update(measurementParts(source)).update(await readFile(`${ROOT}/src/energy-capture.js`, 'utf8')).digest('hex');
const browserMode = options.headed ? 'headed' : 'headless';
const lane = options.headed ? 'E1-120hz' : process.env.ENERGY_CAPTURE_LANE ?? (options['per-encoder-export'] ? 'E1-attrib' : 'E1');
const metadata = { sha, harnessSha, engineSourceSha, engineFileHash, measurementLogicHash, browserMode, root: ROOT, sourceRoot, chrome: CHROME, driver: `${browserMode} installed Chrome + CDP noDefaults:true; ordinary hardware flags, CDP device metrics`, override, protocol: 'ADR 0107 E1', requestedRuns: RUNS, runStart: RUN_START, requestedScenes: cases, refresh: options.headed ? 'native 120 Hz; ADR 0107 Amendment 5' : 'headless 60 Hz; ADR 0107 Amendment 3' };
function summaries(rows) {
	const scenes = cases.map((c) => {
		const repeats = rows.filter((r) => key(r) === key(c) && (r.status === 'OK' || r.status === 'PARTIAL'));
		return {
			...c, complete: Array.from({ length: RUNS }, (_, i) => RUN_START + i).every((run) => repeats.some((r) => r.run === run)),
			runs: repeats.length, failed: rows.filter((r) => key(r) === key(c) && r.status !== 'OK').map((r) => ({ run: r.run, error: r.error })),
			windows: Object.fromEntries(['active', 'untouched', 'offscreen', 'hidden', 'control'].map((name) => {
				const available = repeats.filter((r) => r.windows[name] && !r.windows[name].unavailable);
				return [name, {
					measuredRuns: available.length,
					gpuBusyMsPerSecond: median(available.map((r) => r.windows[name].gpuBusyMsPerSecond)),
					min: available.length ? Math.min(...available.map((r) => r.windows[name].gpuBusyMsPerSecond)) : null,
					max: available.length ? Math.max(...available.map((r) => r.windows[name].gpuBusyMsPerSecond)) : null,
					rafHz: median(available.map((r) => r.windows[name].rafHz).filter(Number.isFinite)), engineHz: median(available.map((r) => r.windows[name].engineHz).filter(Number.isFinite))
				}];
			})),
			idleWithinControlNoise: Object.fromEntries(['offscreen', 'hidden'].map((name) => [name, repeats.length === 3 && repeats.every((r) => r.windows[name] && !r.windows[name].unavailable && r.windows.control) ? Math.max(...repeats.map((r) => r.windows[name].gpuBusyMsPerSecond)) <= Math.max(...repeats.map((r) => r.windows.control.gpuBusyMsPerSecond)) : null])),
			noiseFloor: noise(repeats.map((r) => r.windows.active.gpuBusyMsPerSecond)),
			settledRuns: repeats.filter((r) => Number.isFinite(r.settleTimeSeconds)).length,
			settleTimeSeconds: median(repeats.map((r) => r.settleTimeSeconds).filter(Number.isFinite)),
			diagnostic: repeats.find((r) => r.diagnostic)?.diagnostic ?? null
		};
	});
	const held = scenes.filter((s) => s.split === 'test' && s.complete);
	const controls = rows.filter((r) => r.status === 'OK').map((r) => r.windows.control.gpuBusyMsPerSecond);
	return {
		...metadata, results: rows, scenes, headline: {
			heldOutScenes: held.length, expectedHeldOutScenes: cases.filter((c) => c.split === 'test').length,
			activeMsPerSecond: median(held.map((s) => s.windows.active.gpuBusyMsPerSecond)),
			untouchedMsPerSecond: median(held.map((s) => s.windows.untouched.gpuBusyMsPerSecond)),
			controlMedianMsPerSecond: median(controls), controlRange: controls.length ? [Math.min(...controls), Math.max(...controls)] : null
		}
	};
}
// Bun 1.3.11 GC drops unreferenced AbortSignal.reason
// ponytail: retain per-invocation abort entries; prune after shared finalization if this becomes long-lived.
const abortReasons = new Map(), abortControllers = new Map();
if (options['self-check']) {
	assert.equal(union([[0, 3], [1, 2], [2, 5], [7, 8]]), 6);
	assert.deepEqual(slice([[-2, 2], [1, 4], [4, 9], [10, 11]], 0, 8), [[0, 2], [1, 4], [4, 8]]);
	assert.equal(busy([[0, 1e9], [0.5e9, 2e9], [9e9, 12e9]], 0, 10e9), 300);
	assert.equal(busy([], 0, 10e9), 0);
	assert.equal(noise([100, 110, 120]), 20 / 110);
	assert.equal(noise([0, 0, 0]), 0); assert.equal(noise([1, 2]), null);
	assert.equal(median([1, 2, 4, 5]), 3); assert.equal(matrix.length, 38);
	if (options['paired-max-fps']) {
		assert.deepEqual(orderedCases(1).slice(0, 2).map((c) => c.arm), ['baseline', 'candidate']);
		assert.deepEqual(orderedCases(2).slice(0, 2).map((c) => c.arm), ['candidate', 'baseline']);
		assert.deepEqual(orderedCases(3).slice(0, 2).map((c) => c.arm), ['baseline', 'candidate']);
		assert.deepEqual(armOverride('candidate'), { maxFps: 60 });
		assert.notEqual(key(cases[0]), key(cases[1]));
	}
	assert.equal(matrix.filter((c) => c.split === 'train').length, 22);
	assert.equal(matrix.filter((c) => c.split === 'test').length, 16);
	assert.throws(() => slice([], 10, 10));
	const entry = await readFile(`${ROOT}/src/energy-capture.js`, 'utf8');
	const motionCode = entry.slice(entry.indexOf('const motion ='), entry.indexOf('const ticks ='));
	const scope = { at: 30001, mountedAt: 1, diagnosticMount: true, epoch: () => scope.at };
	runInNewContext(`let { mountedAt, diagnosticMount } = scope; const epoch = scope.epoch; ${motionCode}; scope.sample = sampleMotion; scope.motion = motion;`, { scope });
	let dye = 1;
	const e = { gl: { NO_ERROR: 0, getError: () => 0 }, readField: (field) => ({ width: 1, height: 1, data: field === 'velocity' ? [3, 4] : [dye, 0, 0, 100] }) };
	scope.sample(e); scope.at += 1000 / 60; dye = 1.25; scope.sample(e);
	assert.equal(scope.motion.samples.length, 1);
	assert.equal(scope.motion.samples[0].maxVelocityTexelsPerSecond, 5);
	assert.equal(scope.motion.samples[0].maxPerFrameDyeChange, 0.25);
	scope.at = 31000; scope.sample(e); assert.equal(scope.motion.samples.length, 1);
	scope.at = 32001; e.gl.getError = () => 1282; scope.sample(e); assert.equal(scope.motion.errors.length, 1);
	const controller = new AbortController();
	class PendingCDP { evaluate() { return new Promise(() => {}); } pages() { return [this]; } }
	const guarded = abortableCDP(new PendingCDP(), controller.signal);
	const pending = guarded.pages()[0].evaluate();
	abortWith(controller, livenessReason());
	await assert.rejects(pending, /attempt timeout \(liveness\)/);
	assert.throws(() => guarded.evaluate(), /attempt timeout \(liveness\)/);
	const midWrite = new AbortController(), row = { status: 'OK', windows: { active: 1 } };
	await Promise.resolve().then(() => abortWith(midWrite, livenessReason()));
	livenessFailure(row, midWrite.signal);
	assert.equal(row.status, 'FAILED'); assert.equal(row.error, 'attempt timeout (liveness)'); assert.deepEqual(row.windows, {});
	row.status = 'PARTIAL'; row.error = 'GPU process exited during recording';
	livenessFailure(row, midWrite.signal); assert.equal(row.status, 'FAILED'); assert.equal(row.error, 'attempt timeout (liveness)');
	await assert.rejects(boundedExit(new Promise(() => {}), midWrite.signal), /attempt timeout \(liveness\)/);
	const watchdog = new AbortController(), watchdogRow = { status: 'FAILED', error: 'Trace size watchdog: 11 bytes exceeds 10 GiB' };
	abortWith(watchdog, new Error(watchdogRow.error)); Bun.gc(true);
	abortWith(watchdog, livenessReason());
	livenessFailure(watchdogRow, watchdog.signal);
	assert.equal(abortReason(watchdog.signal).message, watchdogRow.error);
	assert.match(watchdogRow.error, /Trace size watchdog/); assert.equal(watchdogRow.status, 'FAILED');
	assert.doesNotMatch(row.error, /Trace size watchdog|missing execution coverage|GPU process exited|ENOSPC|incorrect visibility|visibility changed/);
	const events = [];
	await terminateAndRelease(() => events.push('term'), () => events.push('kill'), async () => events.push('release'), 1);
	assert.deepEqual(events, ['term', 'kill', 'release']);
	assert.equal(sameProcess({ command: 'Chrome', start: 'old' }, { command: 'Chrome', start: 'new' }), false);
	let releases = 0;
	const releaseOnce = singleFlight(async () => { releases++; });
	await Promise.all([releaseOnce(), releaseOnce()]); assert.equal(releases, 1);
	const temp = await mkdtemp(`${tmpdir()}/energy-liveness-check-`), tempLock = `${temp}/lock`;
	await mkdir(tempLock); await writeFile(`${tempLock}/owner`, 'sibling');
	await assert.rejects(ownerCheckedRelease(tempLock, 'ours'), /ownership changed/);
	assert.equal(await readFile(`${tempLock}/owner`, 'utf8'), 'sibling');
	await writeFile(`${tempLock}/owner`, 'ours');
	const dummy = Bun.spawn([process.execPath, '-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { stdout: 'ignore', stderr: 'ignore' });
	await Bun.sleep(200);
	const failed = { status: 'OK', windows: { active: 1 } }, timerAbort = new AbortController(); abortWith(timerAbort, livenessReason());
	const persisted = `${temp}/failed.json`, ownedFile = `${temp}/owned-scratch`, siblingFile = `${temp}/sibling-scratch`;
	await writeFile(ownedFile, 'owned');
	await terminateAndRelease(() => dummy.kill('SIGTERM'), () => dummy.kill('SIGKILL'), async () => {
		Bun.gc(true); livenessFailure(failed, timerAbort.signal); await writeFile(persisted, JSON.stringify(failed));
		await boundedFS(new Promise(() => {}), 1).catch(() => {});
		await rm(ownedFile); await ownerCheckedRelease(tempLock, 'ours'); await writeFile(siblingFile, 'sibling');
	}, 1000, () => { try { process.kill(dummy.pid, 0); return [dummy.pid]; } catch { return []; } });
	await dummy.exited;
	assert.equal(JSON.parse(await readFile(persisted, 'utf8')).status, 'FAILED');
	assert.equal(await Bun.file(`${tempLock}/owner`).exists(), false);
	assert.equal(await readFile(siblingFile, 'utf8'), 'sibling');
	await rm(temp, { recursive: true });
	assert.deepEqual(supervisorRow({ status: 'OK', windows: { active: 1 } }, true, {}), { status: 'FAILED', error: 'attempt timeout (liveness)' });
	assert.equal(validGroup(10, 10, 10), false); assert.equal(validGroup(10, 11, 12), false);
	const batchTemp = await mkdtemp(`${tmpdir()}/energy-supervisor-check-`);
	for (let slot = 1; slot <= 2; slot++) {
		const out = `${batchTemp}/${slot}.json`;
		const worker = spawn(process.execPath, ['-e', `await Bun.write(${JSON.stringify(out)}, JSON.stringify({status:'OK'}))`], { detached: true, env: process.env, stdio: 'ignore' });
		await new Promise((resolve) => worker.once('exit', resolve));
		assert.equal(JSON.parse(await readFile(out, 'utf8')).status, 'OK');
	}
	const hangingPath = `${batchTemp}/hang.json`;
	const hanging = spawn(process.execPath, ['-e', `await Bun.write(${JSON.stringify(hangingPath)},JSON.stringify({status:'OK',windows:{active:1}}));setInterval(()=>{},1000)`], { detached: true, stdio: 'ignore' });
	await Bun.sleep(200); hanging.groupVerified = groupSafe(hanging.pid);
	await stopGroup(hanging, 100);
	const overridden = supervisorRow(JSON.parse(await readFile(hangingPath, 'utf8')), true, {});
	await writeFile(hangingPath, JSON.stringify(overridden));
	assert.equal(JSON.parse(await readFile(hangingPath, 'utf8')).status, 'FAILED');
	const escapedPath = `${batchTemp}/escaped.pid`;
	const forkCode = `const {spawn}=await import('node:child_process');const p=spawn(process.execPath,['-e',"setInterval(()=>{},1000)"],{detached:true,stdio:'ignore'});await Bun.write(${JSON.stringify(escapedPath)},String(p.pid));setTimeout(()=>process.exit(0),700);`;
	const fork = spawn(process.execPath, ['-e', forkCode], { detached: true, stdio: 'ignore' });
	await Bun.sleep(200);
	const escapedPid = Number(await readFile(escapedPath, 'utf8'));
	const escapedIdentity = census().find((r) => r.pid === escapedPid && r.ppid === fork.pid);
	assert.ok(escapedIdentity);
	await Bun.sleep(800);
	assert.equal(census().find((r) => r.pid === escapedPid)?.ppid, 1);
	const escapedGroup = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { detached: true, stdio: 'ignore' });
	await Bun.sleep(100); escapedGroup.groupVerified = groupSafe(escapedGroup.pid);
	await stopGroup(escapedGroup, 100, new Map([[escapedPid, escapedIdentity]]));
	assert.equal(census().some((r) => sameProcess(escapedIdentity, r)), false);
	const tinyLock = `${batchTemp}/tiny-lock`, tinyRow = `${batchTemp}/tiny-row.json`;
	await mkdir(tinyLock); await writeFile(`${tinyLock}/owner`, 'test-owner');
	const hardCode = `const {spawn,execFileSync}=await import('node:child_process');const fs=await import('node:fs');${census.toString()};${sameProcess.toString()};${groupRows.toString()};${reapGroupSync.toString()};const p=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});const escaped=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setTimeout(()=>process.exit(0),1200)"],{detached:true,stdio:'ignore'});setTimeout(()=>{const identity=census().find(r=>r.pid===escaped.pid);if(!identity)process.exit(2);process.kill(-p.pid,'SIGKILL');/* Slow KILL simulation: escaped dummy exits through its independent sleep wrapper. */const start=Date.now();const residual=reapGroupSync(p,new Map([[escaped.pid,identity]]));const lockPreserved=residual.group.length+residual.escaped.length>0;fs.writeFileSync(${JSON.stringify(tinyRow)},JSON.stringify({status:'FAILED',error:'attempt timeout (liveness)',residual,lockPreserved,reapMs:Date.now()-start}));if(!lockPreserved&&fs.readFileSync(${JSON.stringify(`${tinyLock}/owner`)},'utf8')==='test-owner')fs.rmSync(${JSON.stringify(tinyLock)},{recursive:true});process.exit(1);},200);`;
	const tiny = spawn(process.execPath, ['-e', hardCode], { stdio: 'ignore' });
	const tinyExit = await new Promise((resolve) => tiny.once('exit', resolve));
	assert.equal(tinyExit, 1); assert.equal(await Bun.file(`${tinyLock}/owner`).exists(), false);
	const tinyResult = JSON.parse(await readFile(tinyRow, 'utf8'));
	assert.equal(tinyResult.status, 'FAILED'); assert.equal(tinyResult.lockPreserved, false);
	assert.deepEqual(tinyResult.residual.group, []); assert.deepEqual(tinyResult.residual.escaped, []);
	assert.ok(Array.isArray(tinyResult.residual.zombiePids));
	assert.ok(tinyResult.reapMs >= 900 && tinyResult.reapMs < 5500);
	await mkdir(tinyLock); await writeFile(`${tinyLock}/owner`, 'test-owner');
	const signalCode = `const {spawn,execFileSync}=await import('node:child_process');const {writeFileSync,readFileSync,rmSync,existsSync}=await import('node:fs');${census.toString()};${sameProcess.toString()};${groupRows.toString()};${reapGroupSync.toString()};${suspectHubsSync.toString()};${persistRowSync.toString()};${deleteProvenScratch.toString()};${finalizeSupervisorSync.toString()};const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{detached:true,stdio:'ignore'});child.groupVerified=true;process.on('SIGTERM',()=>finalizeSupervisorSync({child,escaped:new Map(),rowPath:${JSON.stringify(tinyRow)},row:{}},${JSON.stringify(tinyLock)},'test-owner',undefined,true));setTimeout(()=>process.kill(process.pid,'SIGTERM'),200);`;
	const signaled = spawn(process.execPath, ['-e', signalCode], { stdio: 'ignore' });
	assert.equal(await new Promise((resolve) => signaled.once('exit', resolve)), 1);
	assert.equal(await Bun.file(`${tinyLock}/owner`).exists(), false);
	const signalResult = JSON.parse(await readFile(tinyRow, 'utf8'));
	assert.equal(signalResult.lockPreserved, false); assert.deepEqual(signalResult.residualOwnedProcesses, []); assert.deepEqual(signalResult.escapedOwnedProcesses, []);
	for (const suspect of [false, true]) {
		await mkdir(tinyLock); await writeFile(`${tinyLock}/owner`, 'test-owner');
		const failureCode = `const {spawn,execFileSync}=await import('node:child_process');const {writeFileSync,readFileSync,rmSync,symlinkSync,existsSync}=await import('node:fs');${census.toString()};${sameProcess.toString()};${groupRows.toString()};${reapGroupSync.toString()};${suspectHubsSync.toString()};${persistRowSync.toString()};${deleteProvenScratch.toString()};${finalizeSupervisorSync.toString()};const state={escaped:new Map(),rowPath:${JSON.stringify(tinyRow)},row:{},startedAt:Date.now()-1000};try{state.child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});await Bun.sleep(200);state.child.groupVerified=true;if(${suspect}){symlinkSync('/bin/sleep',${JSON.stringify(`${batchTemp}/DTServiceHub`)});spawn(${JSON.stringify(`${batchTemp}/DTServiceHub`)},['20'],{detached:true,stdio:'ignore'});process.kill(-state.child.pid,'SIGKILL');reapGroupSync(state.child,state.escaped);await Bun.sleep(200);JSON.parse('{');}throw new Error('after spawn');}finally{finalizeSupervisorSync(state,${JSON.stringify(tinyLock)},'test-owner');process.exit(1);}`;
		const failed = spawn(process.execPath, ['-e', failureCode], { stdio: 'ignore' });
		assert.equal(await new Promise((resolve) => failed.once('exit', resolve)), 1);
		const failureRow = JSON.parse(await readFile(tinyRow, 'utf8'));
		assert.deepEqual(failureRow.residualOwnedProcesses, []);
		assert.equal(failureRow.lockPreserved, suspect); assert.equal(await Bun.file(`${tinyLock}/owner`).exists(), suspect);
		if (suspect) {
			assert.equal(failureRow.suspectUnowned.length, 1);
			for (const identity of failureRow.suspectUnowned) if (sameProcess(identity, census().find((r) => r.pid === identity.pid))) process.kill(identity.pid, 'SIGKILL');
			await ownerCheckedRelease(tinyLock, 'test-owner');
		}
	}
	await mkdir(tinyLock); await writeFile(`${tinyLock}/owner`, 'test-owner');
	const zombieCode = `const {spawn,execFileSync}=await import('node:child_process');const {writeFileSync,readFileSync,rmSync,existsSync}=await import('node:fs');${census.toString()};${sameProcess.toString()};${groupRows.toString()};${reapGroupSync.toString()};${suspectHubsSync.toString()};${persistRowSync.toString()};${deleteProvenScratch.toString()};${finalizeSupervisorSync.toString()};${stopGroup.toString()};const assert=(await import('node:assert/strict')).default;const child=spawn(process.execPath,['-e','process.exit(0)'],{detached:true,stdio:'ignore'});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,500);child.groupVerified=true;const live=reapGroupSync(child,new Map(),0);if(!live.zombiePids.includes(child.pid))process.exit(3);await stopGroup(child,100);finalizeSupervisorSync({child,escaped:new Map(),teardownError:'prior teardown failure',rowPath:${JSON.stringify(tinyRow)},row:{}},${JSON.stringify(tinyLock)},'test-owner');process.exit(1);`;
	const zombie = spawn(process.execPath, ['-e', zombieCode], { stdio: 'ignore' });
	assert.equal(await new Promise((resolve) => zombie.once('exit', resolve)), 1);
	const zombieRow = JSON.parse(await readFile(tinyRow, 'utf8'));
	assert.equal(zombieRow.lockPreserved, false); assert.equal(zombieRow.probeError, undefined); assert.equal(zombieRow.teardownError, 'prior teardown failure');
	assert.equal(await Bun.file(`${tinyLock}/owner`).exists(), false);
	assert.equal(sameProcess({ command: 'owner', start: 'birth' }, undefined), false);
	assert.equal(sameProcess(undefined, { command: 'owner', start: 'birth' }), false);
	for (let slot = 1; slot <= 2; slot++) {
		await mkdir(tinyLock); await writeFile(`${tinyLock}/owner`, 'test-owner');
		const natural = { status: 'OK', windows: { active: { gpuBusyMsPerSecond: slot } } };
		await writeFile(tinyRow, JSON.stringify(natural));
		const kept = finalizeSupervisorSync({ escaped: new Map(), rowPath: tinyRow, row: {}, teardownError: 'proof owner disappeared' }, tinyLock, 'test-owner');
		assert.equal(kept.status, 'OK'); assert.deepEqual(kept.windows, natural.windows); assert.equal(kept.teardownError, 'proof owner disappeared');
		assert.equal(await Bun.file(`${tinyLock}/owner`).exists(), false);
	}
	assert.equal(supervisorRow({ status: 'OK' }, true, {}).error, 'attempt timeout (liveness)');
	await mkdir(tinyLock); await writeFile(`${tinyLock}/owner`, 'test-owner');
	await writeFile(tinyRow, JSON.stringify({ status: 'OK', windows: { active: 1 } }));
	let attempts = 0;
	assert.throws(() => persistRowSync(tinyRow, { status: 'FAILED' }, () => { attempts++; throw new Error('injected persist failure'); }));
	assert.equal(attempts, 2);
	let transient = 0;
	persistRowSync(`${batchTemp}/retry.json`, { status: 'FAILED' }, (path, data) => { if (!transient++) throw new Error('transient write'); writeFileSync(path, data); });
	assert.equal(transient, 2); assert.equal(JSON.parse(await readFile(`${batchTemp}/retry.json`, 'utf8')).status, 'FAILED');
	const quietState = { scanning: Bun.sleep(2000), quiet: false };
	const quietStart = Date.now(); let quietAck = false, quietSpawns = 0;
	const quietPromise = enterQuiet(quietState, () => { quietAck = true; });
	assert.equal(quietState.quiet, true); assert.equal(quietAck, false);
	if (!quietState.quiet) quietSpawns++;
	await quietPromise; assert.ok(Date.now() - quietStart >= 1900); assert.equal(quietAck, true); assert.equal(quietSpawns, 0);
	assert.equal(directChildAlive({ exitCode: null, signalCode: null }), true);
	assert.equal(directChildAlive({ exitCode: 0, signalCode: null }), false);
	let gateReleased = false;
	assert.equal(await postAcquireLoad(15, async () => { gateReleased = true; }), false); assert.equal(gateReleased, true);
	const trustPath = `${batchTemp}/trust.ktrace`; await writeFile(trustPath, 'keep');
	const trust = lstatSync(trustPath);
	assert.equal(deleteProvenScratch({ lsofPath: trustPath, path: realpathSync(trustPath), dev: trust.dev, ino: trust.ino + 1 }), false);
	assert.equal(await Bun.file(trustPath).exists(), true);
	const probeRow = { status: 'OK' };
	informationalProbe(probeRow, () => { throw new Error('spawnSync ps ETIMEDOUT'); });
	assert.equal(probeRow.status, 'OK'); assert.match(probeRow.teardownError, /ps ETIMEDOUT/);
	let probeSpawns = 0;
	informationalProbe(probeRow, () => { probeSpawns++; }, { start: Date.now() - 1000, end: Date.now() + 10000 });
	assert.equal(probeSpawns, 0);
	const gate = { freeSince: 0, lowSince: 0 };
	assert.equal(gateReady(gate, false, 15, 300001), false);
	assert.equal(gateReady(gate, false, 14, 300002), false);
	assert.equal(gateReady(gate, false, 14, 600001), true);
	const timeoutState = { escaped: new Map(), rowPath: tinyRow, row: {}, timedOut: true };
	const timedRow = finalizeSupervisorSync(timeoutState, tinyLock, 'test-owner');
	assert.equal(timedRow.error, 'attempt timeout (liveness)'); assert.equal(timedRow.windows, undefined);
	assert.equal(JSON.parse(await readFile(tinyRow, 'utf8')).status, 'FAILED');
	const proofs = new Map(), unprovedPath = `${batchTemp}/unproved.ktrace`;
	await writeFile(unprovedPath, 'keep');
	assert.throws(() => persistProof(proofs, unprovedPath, { path: unprovedPath }, tinyRow, () => { throw new Error('proof write failed'); }));
	assert.equal(proofs.has(unprovedPath), false); assert.equal(await Bun.file(unprovedPath).exists(), true);
	for (const code of ["process.on('SIGTERM',()=>{});setInterval(()=>{},1000)", "process.on('SIGTERM',()=>setTimeout(()=>process.exit(0),200));setInterval(()=>{},1000)"]) {
		const group = spawn(process.execPath, ['-e', code], { detached: true, stdio: 'ignore' });
		await Bun.sleep(200); group.groupVerified = groupSafe(group.pid); assert.equal(group.groupVerified, true); await stopGroup(group, 300); assert.equal(reapGroupSync(group, new Map(), 0).group.length, 0);
		await mkdir(tinyLock); await writeFile(`${tinyLock}/owner`, 'test-owner');
		const released = finalizeSupervisorSync({ child: group, escaped: new Map(), rowPath: tinyRow, row: {} }, tinyLock, 'test-owner', { status: 'OK' });
		assert.equal(released.lockPreserved, false); assert.equal(released.probeError, undefined); assert.equal(await Bun.file(`${tinyLock}/owner`).exists(), false);
	}
	await rm(batchTemp, { recursive: true, force: true });
	console.log('Energy self-check passed: slicing, overlap union, ns/ms/s, median, R3 noise floor, frozen matrix, diagnostic motion pair, invalid-readback rejection, stalled CDP abort'); process.exit(0);
}
await mkdir(DIR, { recursive: true });
const results = [];
if (options.resume || options['summary-only']) for (const f of await readdir(DIR)) if (/^.*-r\d+(?:-infra-retry)?\.json$/.test(f)) {
	const row = JSON.parse(await readFile(`${DIR}/${f}`, 'utf8'));
	if (!options['summary-only']) assert.equal(row.browserMode ?? 'headed', browserMode, 'Cannot mix headed and headless captures');
	assert.equal(row.engineSourceSha ?? row.sha, engineSourceSha, 'Cannot mix captures from different engine commits');
	if (row.measurementLogicHash) assert.equal(row.measurementLogicHash, measurementLogicHash, 'Cannot mix measurement logic');
	if (row.engineFileHash) assert.equal(row.engineFileHash, engineFileHash, 'Engine source-file hash changed');
	assert.deepEqual(row.override, options['paired-max-fps'] ? armOverride(row.arm) : override, 'Cannot mix candidate overrides');
	results.push(row);
}
if (!options['attempt-worker'] && !options.resume && !options['summary-only']) for (let run = RUN_START; run < RUN_START + RUNS; run++) for (const c of cases) {
	assert.ok(!await Bun.file(`${DIR}/${fileKey(c)}-r${run}.json`).exists(), 'Existing results: use another --label or --resume');
}
const save = () => writeFileSync(`${DIR}/summary.json`, JSON.stringify(summaries(results), null, 2));
if (options['summary-only']) { save(); console.log(JSON.stringify(summaries(results).headline)); process.exit(0); }
function census() { return execFileSync('ps', ['-axo', 'pid=,ppid=,lstart=,command='], { encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL' }).split('\n').map((l) => { const m = l.match(/^\s*(\d+)\s+(\d+)\s+(.{24})\s+(.*)$/); return m && { pid: +m[1], ppid: +m[2], start: m[3], command: m[4] }; }).filter(Boolean); }
function sameProcess(a, b) { return !!a && !!b && a.command === b.command && a.start === b.start; }
async function boundedExit(promise, signal) {
	let timer;
	try {
		return await abortRace(Promise.race([promise, new Promise((_, reject) => {
			timer = setTimeout(() => reject(livenessReason()), 10000);
		})]), signal);
	} finally { clearTimeout(timer); }
}
function abortWith(controller, reason) {
	if (controller.signal.aborted) return;
	abortReasons.set(controller, reason); abortControllers.set(controller.signal, controller);
	controller.abort(reason);
}
function abortReason(signal) { return abortReasons.get(abortControllers.get(signal)); }
function livenessReason() { return Object.assign(new Error('attempt timeout (liveness)'), { liveness: true }); }
function livenessFailure(row, signal) {
	if (!signal.aborted || !abortReason(signal)?.liveness) return;
	row.status = 'FAILED'; row.error = 'attempt timeout (liveness)';
	row.windows = {}; delete row.hashes; delete row.snapshot; delete row.encoders;
}
async function terminateAndRelease(term, kill, releaseLock, grace = 10000, remaining = () => [], residual = () => {}) {
	term(); await Bun.sleep(grace); kill();
	const until = Date.now() + grace;
	let live = remaining();
	while (live.length && Date.now() < until) { await Bun.sleep(Math.min(100, grace)); live = remaining(); }
	if (live.length) { residual(live); console.error(JSON.stringify({ phase: 'owned reap timeout; lock preserved', remaining: live })); throw new Error('Owned reap timeout; lock preserved'); }
	await releaseLock();
}
async function boundedFS(promise, timeout = 10000) {
	let timer;
	try { return await Promise.race([promise, new Promise((_, reject) => {
		timer = setTimeout(() => reject(new Error('Lock filesystem timeout; ownership unresolved')), timeout);
	})]); } finally { clearTimeout(timer); }
}
// Abort CDP waits without changing the frozen measurement statements.
function abortRace(promise, signal) {
	if (signal.aborted) return Promise.reject(abortReason(signal));
	return new Promise((resolve, reject) => {
		const abort = () => reject(abortReason(signal));
		signal.addEventListener('abort', abort, { once: true });
		Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
	});
}
function abortableCDP(value, signal, cache = new WeakMap()) {
	if (Array.isArray(value)) return value.map((v) => abortableCDP(v, signal, cache));
	if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) === Object.prototype) return value;
	if (cache.has(value)) return cache.get(value);
	const proxy = new Proxy(value, { get(target, key) {
		const member = Reflect.get(target, key, target);
		if (typeof member !== 'function') return member;
		return (...args) => {
			signal.throwIfAborted();
			const result = member.apply(target, args);
			return result?.then ? abortRace(result, signal).then((v) => abortableCDP(v, signal, cache)) : abortableCDP(result, signal, cache);
		};
	} });
	cache.set(value, proxy);
	return proxy;
}
const owned = new Map(); let browser, chrome, profile, server, recording, notifier, lockOwned = false, lastReleasedAt = 0, lockedAt = 0;
let holdTimer, activeController, holdExpired = false, emergencyRelease, activeScratchCleanup, activePersistFailure, activeResidual;
function preserveResidual(live) { holdExpired = true; activeResidual?.(live); }
const remainingOwned = () => census().filter((r) => sameProcess(owned.get(r.pid), r));
async function emergencyCleanupRelease() {
	activePersistFailure?.();
	if (activeScratchCleanup) await boundedFS(activeScratchCleanup()).catch((error) => console.error(error));
	await release();
}
function trackedProcess(child) {
	remember();
	child.exited.then(() => owned.delete(child.pid));
	return new Proxy(child, { get(target, key) {
		if (key === 'kill') return (signal) => {
			const current = census().find((r) => r.pid === target.pid);
			if (current && sameProcess(owned.get(target.pid), current)) target.kill(signal);
		};
		return Reflect.get(target, key, target);
	} });
}
function killOwned() {
	for (const r of census()) if (sameProcess(owned.get(r.pid), r)) {
		try { process.kill(r.pid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
	}
}
const ownerText = JSON.stringify({ lane, purpose: `${browserMode} energy ${options.label} ${options.split}`, start: new Date().toISOString(), worktree: ROOT, sha, pid: process.pid });
function remember() {
	const rows = census(), ids = new Set([process.pid]);
	for (const [pid, identity] of owned) if (!rows.some((r) => r.pid === pid && sameProcess(identity, r))) owned.delete(pid);
	for (let changed = true; changed;) { changed = false; for (const r of rows) if (ids.has(r.ppid) && !ids.has(r.pid)) { ids.add(r.pid); changed = true; } }
	for (const r of rows) if (r.pid !== process.pid && ids.has(r.pid)) if (!owned.has(r.pid)) owned.set(r.pid, r);
}
function cleanup() {
	remember();
	for (const r of census().reverse()) if (sameProcess(owned.get(r.pid), r)) { try { process.kill(r.pid, 'SIGTERM'); } catch (e) { if (e.code !== 'ESRCH') throw e; } }
	browser = null; server = null; recording = null; notifier = null;
}
async function ownerCheckedRelease(lock, owner) {
	assert.equal(await boundedFS(readFile(`${lock}/owner`, 'utf8')), owner, 'GPU lock ownership changed');
	await boundedFS(rm(lock, { recursive: true }));
}
function singleFlight(action) {
	let promise;
	return () => promise ??= Promise.resolve().then(action);
}
let releasePromise, gateExpired = false;
function release() {
	assert.ok(!supervisorState, 'Active supervisor must verify ownership before release');
	if (releasePromise) return releasePromise;
	if (!lockOwned) return Promise.resolve();
	releasePromise = singleFlight(async () => {
		await ownerCheckedRelease(LOCK, ownerText).catch((error) => { console.error(error); throw error; });
		clearTimeout(holdTimer);
		lockOwned = false; lastReleasedAt = Date.now();
		console.log(JSON.stringify({ phase: 'disk accounting', energyEvalBytes: await boundedFS(bytes('/tmp/energy-eval')).catch(() => null) }));
		console.log(JSON.stringify({ phase: 'GPU lock released', pid: process.pid }));
	})();
	return releasePromise;
}
async function acquire() {
	if (holdExpired) throw new Error('GPU hold cap reached (liveness)');
	if (lockOwned) return;
	const end = Date.now() + 85 * 60000;
	const gate = { freeSince: Date.now(), lowSince: Date.now() };
	while (Date.now() < end) {
		const locked = existsSync(LOCK), load = loadavg()[1];
		if (gateReady(gate, locked, load)) {
			try {
				await mkdir(LOCK); releasePromise = null; emergencyRelease = null; lockOwned = true; lockedAt = Date.now();
				await writeFile(`${LOCK}/owner`, ownerText); await writeFile(`${LOCK}/acquired-at`, new Date(lockedAt).toISOString());
				if (await postAcquireLoad(loadavg()[1], release)) return;
			} catch (error) { if (error.code !== 'EEXIST') throw error; }
			gate.freeSince = gate.lowSince = Date.now();
		}
		console.log(JSON.stringify({ phase: 'attempt free/load gate', locked, load5: load }));
		await Bun.sleep(Math.min(5000, end - Date.now()));
	}
	gateExpired = true;
	console.log(JSON.stringify({ phase: 'attempt gate timeout; no row, lock untouched' }));
	return false;
}
let shuttingDown = false, supervisorState;
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => {
	if (shuttingDown) return; shuttingDown = true;
	if (lockOwned) finalizeSupervisorSync(supervisorState ?? { rowPath: `${DIR}/interrupted.json`, row: {}, escaped: new Map() }, LOCK, ownerText, undefined, true);
	process.exit(1);
});
async function startServer() {
	if (server) return;
	server = Bun.spawn(['bun', 'run', 'dev', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: sourceRoot, stdout: 'ignore', stderr: 'inherit' }); server = trackedProcess(server);
	for (let i = 0; i < 150; i++) {
		if (await fetch(URL, { signal: AbortSignal.timeout(1000) }).then((r) => r.ok, () => false)) return;
		if (server.exitCode !== null) throw new Error('Owned dev server exited');
		await Bun.sleep(200);
	}
	throw new Error('Dev server startup timeout');
}
const HTML = '<!doctype html><html><head><style>html{scrollbar-width:none}body{margin:0;background:#000}#target{width:max-content}</style></head><body><div id="target"></div><script type="module" src="/src/energy-capture.js"></script></body></html>';
async function pageFor(context, dpr) {
	const page = await context.newPage();
	page.__energyErrors = [];
	page.on('console', (event) => { if (event.type() === 'error' || event.type() === 'warning') page.__energyErrors.push({ type: event.type(), text: event.text() }); });
	page.on('pageerror', (error) => page.__energyErrors.push({ type: 'pageerror', text: String(error) }));
	const session = await context.newCDPSession(page);
	await session.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: dpr, mobile: false });
	await session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
	page.setDefaultTimeout(15000);
	await page.route('**/__energy_capture__', (r) => r.fulfill({ contentType: 'text/html', body: HTML }));
	// Transform the unchanged measurement entry in the selected Vite root, without writing there.
	if (sourceRoot !== ROOT) {
		const entry = await readFile(`${ROOT}/src/energy-capture.js`, 'utf8');
		const transformed = await fetch(`${URL}/src/lib/Fluid.svelte`).then((r) => r.text());
		const svelteUrl = transformed.match(/from\s+["']([^"']*\/svelte\.js[^"']*)["']/)?.[1];
		assert.ok(svelteUrl, 'Cannot resolve source-root Svelte browser runtime');
		await page.route('**/src/energy-capture.js', (r) => r.fulfill({ contentType: 'text/javascript', body: entry.replace("from 'svelte'", `from '${svelteUrl}'`).replace('./lib/engine/FluidEngine.js', './lib/engine/FluidEngine.ts').replace('./lib/presets/registry.js', './lib/presets/registry.ts') }));
	}
	await page.goto(`${URL}/__energy_capture__`); await page.waitForFunction(() => !!window.__energy);
	await page.evaluate(async () => {
		const { FluidEngine } = await import('/src/lib/engine/FluidEngine.ts');
		const original = FluidEngine.prototype.renderCore;
		window.__energyPresentations = [];
		const snapshot = window.__energy.snapshot.bind(window.__energy);
		window.__energy.snapshot = () => ({ ...snapshot(), presentations: window.__energyPresentations });
		FluidEngine.prototype.renderCore = function (...args) { window.__energyPresentations.push(performance.timeOrigin + performance.now()); return original.apply(this, args); };
	});
	if (options['per-encoder-export']) await page.evaluate(async () => {
		const snapshot = window.__energy.snapshot.bind(window.__energy);
		window.__energy.snapshot = () => ({ ...snapshot(), drawInventory: window.__encoderDraws });
		await import('/src/lib/engine/FluidEngine.ts').then(({ FluidEngine }) => {
			const update = FluidEngine.prototype.update;
			FluidEngine.prototype.update = function (...args) {
				if (window.__encoderDraws || !this.dye || performance.timeOrigin + performance.now() < snapshot().mountedAt + 3000) return update.apply(this, args);
				let label = 'unknown'; const restores = [], draws = [];
				for (const [name, value] of Object.entries(this)) if (value && typeof value.bind === 'function' && /Program|Material/.test(name)) {
					const bind = value.bind; value.bind = function (...args) { label = name; return bind.apply(this, args); }; restores.push(() => { value.bind = bind; });
				}
				const blit = this.blit;
				this.blit = (target, ...rest) => { draws.push({ program: label, width: target?.width ?? this.canvas.width, height: target?.height ?? this.canvas.height }); return blit(target, ...rest); };
				try { return update.apply(this, args); }
				finally { this.blit = blit; for (const restore of restores) restore(); window.__encoderDraws = draws; }
			};
		});
	});
	return page;
}
async function bytes(path) {
	try { const s = await stat(path); return s.isDirectory() ? (await Promise.all((await readdir(path)).map((f) => bytes(`${path}/${f}`)))).reduce((a, b) => a + b, 0) : s.size; }
	catch (e) { if (e.code === 'ENOENT') return 0; throw e; }
}
async function captureWorker(c, run) {
	if (options['paired-max-fps']) override = armOverride(c.arm);
	const name = `${fileKey(c)}-r${run}${c.infraRetry ? '-infra-retry' : ''}`, trace = `${DIR}/${name}.trace`, windows = {}, states = {};
	const disk = execFileSync('df', ['-k', DIR], { encoding: 'utf8' }).trim().split('\n').at(-1).trim().split(/\s+/);
	assert.ok(Number(disk[3]) * 1024 >= 15 * 1024 ** 3, 'Disk free below 15 GiB; stop captures');
	const row = { ...c, run, sha, harnessSha, engineSourceSha, engineFileHash, measurementLogicHash, browserMode, override, trace, loadAverage: loadavg(), uptime: execFileSync('uptime', { encoding: 'utf8' }).trim(), recorderStartTimeoutSeconds: 45, startedAt: new Date().toISOString(), status: 'FAILED' };
	let gpuPid, phase = 'browser launch', stopped = false, sizeWatch, scratchBefore, page;
	const scratchNames = async () => (await readdir(tmpdir())).filter((name) => /^instruments.*\.ktrace$/.test(name));
	const ownedScratch = new Set();
	const scratchNew = async () => {
		// Global scratch ownership is established only by the supervisor's lsof census.
		return [...ownedScratch];
	};
	const cleanScratch = singleFlight(async () => {
		for (const name of ownedScratch) {
			const path = `${tmpdir()}/${name}`, s = await stat(path).catch((e) => { if (e.code !== 'ENOENT') throw e; });
			if (!s) continue;
			assert.equal(s.uid, process.getuid(), 'Foreign scratch owner'); await rm(path);
		}
	});
	activeScratchCleanup = cleanScratch;
	const traceTmp = `${DIR}/${name}-tmp`;
	await mkdir(traceTmp);
	const progress = (p) => { phase = p; writeFileSync(`${DIR}/${name}.progress.json`, JSON.stringify({ ...row, phase, windows, states })); console.log(JSON.stringify({ name, phase })); };
	const controller = new AbortController(), deadline = setTimeout(() => {
		abortWith(controller, livenessReason());
		emergencyRelease ??= terminateAndRelease(cleanup, killOwned, emergencyCleanupRelease, 10000, remainingOwned, preserveResidual);
		emergencyRelease.catch((error) => { console.error(error); process.exitCode = 1; });
	}, 600000);
	activeController = controller;
	const signal = controller.signal;
	activeResidual = (live) => { row.residualOwnedProcesses = live; row.lockPreserved = true; activePersistFailure(); };
	activePersistFailure = () => {
		livenessFailure(row, signal);
		if (abortReason(signal)?.liveness) writeFileSync(`${DIR}/${name}.json`, JSON.stringify(row, null, 2));
	};
	try {
		await startServer(); signal.throwIfAborted();
		profile = await mkdtemp('/tmp/svelte-fluid-energy-chrome-');
		chrome = Bun.spawn([CHROME, ...(options.headed ? [] : ['--headless=new']), `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdout: 'ignore', stderr: 'ignore' }); chrome = trackedProcess(chrome);
		let endpoint;
		for (let i = 0; i < 100; i++) {
			signal.throwIfAborted();
			try { const lines = (await readFile(`${profile}/DevToolsActivePort`, 'utf8')).trim().split('\n'); endpoint = `ws://127.0.0.1:${lines[0]}${lines[1]}`; break; } catch {}
			await Bun.sleep(100);
		}
		assert.ok(endpoint, 'Owned Chrome CDP endpoint unavailable');
		// Bun's WebSocket avoids Playwright's Node transport handshake on this machine.
		const socket = new WebSocket(endpoint);
		await abortRace(new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; }), signal);
		const transport = { send(message) { socket.send(JSON.stringify(message)); }, close() { socket.close(); } };
		socket.onmessage = (event) => transport.onmessage?.(JSON.parse(event.data));
		socket.onclose = () => transport.onclose?.();
		browser = abortableCDP(await abortRace(chromium.connectOverCDP(transport, { noDefaults: true, timeout: 30000 }), signal), signal);
		const chromePid = chrome.pid;
		const context = browser.contexts()[0];
		for (const blank of context.pages()) await blank.close();
		page = await pageFor(context, c.dpr); await page.bringToFront();
		for (let i = 0; i < 40; i++) { gpuPid = census().find((r) => r.ppid === chromePid && r.command.includes('--type=gpu-process'))?.pid; if (gpuPid) break; await Bun.sleep(100); }
		assert.ok(gpuPid, 'Owned Chrome GPU PID unavailable'); row.gpuPid = gpuPid;
		const alive = () => {
			signal.throwIfAborted();
			assert.ok(directChildAlive(chrome), 'Owned Chrome exited during recording');
		};
		const waitUntil = async (epochMs) => {
			while (Date.now() < epochMs) { alive(); await Bun.sleep(Math.min(500, epochMs - Date.now())); }
			alive();
		};
		progress('recorder startup');
		const note = `svelte-fluid.energy.E1.${process.pid}.${name}`;
		notifier = trackedProcess(Bun.spawn(['/usr/bin/notifyutil', '-1', note], { stdout: 'ignore' }));
		scratchBefore = new Set(await readdir(execFileSync('getconf', ['DARWIN_USER_TEMP_DIR'], { encoding: 'utf8' }).trim()));
		recording = Bun.spawn(['env', `DEVELOPER_DIR=${XCODE.DEVELOPER_DIR}`, 'xcrun', 'xctrace', 'record', '--template', 'Metal System Trace', '--attach', String(gpuPid), '--time-limit', '110s', '--no-prompt', '--notify-tracing-started', note, '--output', trace], { env: { ...XCODE, TMPDIR: traceTmp }, stdout: 'pipe', stderr: 'pipe' }); recording = trackedProcess(recording);
		let checkingSize = false;
		sizeWatch = setInterval(async () => {
			if (checkingSize || signal.aborted) return; checkingSize = true;
			try {
				const globalTmp = systemTmp;
				const names = (await readdir(globalTmp)).filter((name) => /^instruments.*\.ktrace$/.test(name) && !scratchBefore.has(name));
				const sizes = await Promise.all(names.map((name) => bytes(`${globalTmp}/${name}`)));
				const largest = Math.max(0, ...sizes);
				if (largest > 10 * 1024 ** 3) { abortWith(controller, new Error(`Trace size watchdog: ${largest} bytes exceeds 10 GiB`)); cleanup(); }
			} finally { checkingSize = false; }
		}, 1000);
		const notified = await Promise.race([notifier.exited.then(() => true), Bun.sleep(45000).then(() => false)]); notifier.kill(); notifier = null;
		assert.ok(notified, 'Recorder tracing-started notification timeout'); await Bun.sleep(300); alive();
		await quietWorker(row);
		progress('mount'); Object.assign(row, await page.evaluate((c) => window.__energy.mount(c), { ...c, override }));
		assert.deepEqual(row.cssActual, [c.w, c.h]); assert.equal(row.dprActual, c.dpr);
		assert.deepEqual(row.backing, [c.w * c.dpr, c.h * c.dpr]); assert.ok(!/SwiftShader|Software/i.test(row.adapter), 'Hardware adapter required');
		const measured = async (name, start, visibility) => {
			await waitUntil(start); progress(name);
			const before = await page.evaluate(() => window.__energy.state()); assert.equal(before.visibility, visibility, `${name}: incorrect visibility`);
			await waitUntil(start + 10000);
			const after = await page.evaluate(() => window.__energy.state()); assert.equal(after.visibility, visibility, `${name}: visibility changed`);
			assert.deepEqual(after.errors, [], 'Component error'); windows[name] = { start, end: start + 10000, seconds: 10 }; states[name] = { before, after };
		};
		await measured('active', row.mountedAt + 5000, 'visible');
		await measured('untouched', row.mountedAt + 30000, 'visible');
		const scrollAt = await page.evaluate(() => { scrollTo(0, document.querySelector('canvas').getBoundingClientRect().height + 100); return performance.timeOrigin + performance.now(); });
		await measured('offscreen', scrollAt + 5000, 'visible');
		const offscreen = await page.evaluate(() => document.querySelector('canvas').getBoundingClientRect().bottom < -50); assert.ok(offscreen, 'Canvas did not scroll beyond autoPause root margin');
		// Restore viewport first: hidden tests tab visibility independently of scroll pause.
		await page.evaluate(() => scrollTo(0, 0)); await Bun.sleep(500);
		const session = await context.newCDPSession(page);
		const target = await session.send('Target.createTarget', { url: 'about:blank', newWindow: false, background: false });
		await session.send('Target.activateTarget', { targetId: target.targetId });
		await page.waitForFunction(() => document.visibilityState === 'hidden', undefined, { polling: 100 });
		const hideAt = await page.evaluate(() => performance.timeOrigin + performance.now());
		await measured('hidden', hideAt + 5000, 'hidden'); row.hiddenMode = 'native background tab';
		const cover = context.pages().find((p) => p !== page); assert.ok(cover, 'Foreground control tab unavailable');
		const snapshot = await page.evaluate(() => window.__energy.snapshot());
		row.settleTimeSeconds = snapshot.settledAt === null ? null : (snapshot.settledAt - row.mountedAt) / 1000;
		row.snapshot = snapshot;
		await page.evaluate(() => window.__energy.dispose()); await page.goto('about:blank'); await cover.close(); await page.bringToFront();
		await page.evaluate(() => { window.__blankRaf = []; function tick() { window.__blankRaf.push(performance.timeOrigin + performance.now()); requestAnimationFrame(tick); } requestAnimationFrame(tick); });
		const controlAt = Date.now() + 5000; await waitUntil(controlAt); progress('control'); await waitUntil(controlAt + 10000);
		windows.control = { start: controlAt, end: controlAt + 10000, seconds: 10 };
		const controlRaf = await page.evaluate(() => window.__blankRaf);
		for (const [name, w] of Object.entries(windows)) {
			if (w.unavailable) continue;
			const raf = name === 'control' ? controlRaf : snapshot.raf;
			w.rafHz = raf.filter((t) => t >= w.start && t < w.end).length / w.seconds;
			w.engineHz = name === 'control' ? 0 : snapshot.ticks.filter((t) => t >= w.start && t < w.end).length / w.seconds;
		}
		progress('recorder finalisation'); recording.kill('SIGINT');
		const exit = await Promise.race([recording.exited, Bun.sleep(180000).then(() => { throw new Error('Recorder finalisation timeout'); })]);
		alive(); stopped = true;
		if (exit !== 0) throw new Error(`xctrace exit ${exit}: ${await new Response(recording.stderr).text()}`);
		recording = null;
		row.states = states;
		assert.ok(snapshot.visibility.filter((v) => v.at >= windows.active.start && v.at < windows.untouched.end).every((v) => v.state === 'visible'), 'Foreground visibility lost during visible windows');
		assert.ok(snapshot.visibility.filter((v) => v.at >= windows.hidden.start && v.at < windows.hidden.end).every((v) => v.state === 'hidden'), 'Background visibility lost during hidden window');
		// Diagnostic run is separate; field readbacks never enter the energy trace.
		process.send?.('resume');
		if (run === 1) {
			const continuous = hasContinuousDriver(row.config, 40);
			if (!continuous) {
				progress('separate settle diagnostic'); const diag = await pageFor(context, c.dpr); await diag.bringToFront();
				const setup = await diag.evaluate((c) => window.__energy.mount({ ...c, diagnostic: true }), { ...c, override });
				let state;
				for (let i = 0; i < 80; i++) { signal.throwIfAborted(); state = await diag.evaluate(() => window.__energy.state()); if (state.settledAt !== null || state.errors.length) break; await Bun.sleep(500); }
				row.diagnostic = { firstQuietSeconds: state.firstQuietAt === null ? null : (state.firstQuietAt - setup.mountedAt) / 1000, settleSeconds: state.settledAt === null ? null : (state.settledAt - setup.mountedAt) / 1000, latencySeconds: state.firstQuietAt === null || state.settledAt === null ? null : (state.settledAt - state.firstQuietAt) / 1000, observationSeconds: (state.at - setup.mountedAt) / 1000, errors: state.errors, motion: state.motion, rafHz: (await diag.evaluate(() => window.__energy.snapshot())).raf.filter((t) => t >= setup.mountedAt + 30000 && t < setup.mountedAt + 40000).length / 10, engineHz: (await diag.evaluate(() => window.__energy.snapshot())).ticks.filter((t) => t >= setup.mountedAt + 30000 && t < setup.mountedAt + 40000).length / 10 };
				await diag.close();
			}
		}
		progress('browser cleanup');
		const closeSession = await browser.newBrowserCDPSession(); await closeSession.send('Browser.close').catch(() => {});
		await boundedExit(chrome.exited, signal); chrome = null; await browser.close(); browser = null;
		await rm(profile, { recursive: true }); profile = null; Bun.gc(true);
		progress('trace export');
		const input = `${DIR}/${name}.analysis-input.json`, output = `${DIR}/${name}.analysis.json`;
		await writeFile(input, JSON.stringify({ trace, gpuPid, windows }));
		await execAsync(process.execPath, [process.argv[1], '--analyse-worker', input, output], { timeout: 210000, signal, maxBuffer: 1 << 20 });
		Object.assign(row, JSON.parse(await readFile(output, 'utf8'))); signal.throwIfAborted();
		if (options.headed) {
			assert.match(row.adapter, /ANGLE Metal Renderer: Apple M1 Max/, 'Expected Apple M1 Max Metal renderer');
			for (const name of ['active', 'untouched', 'offscreen', 'control']) assert.ok(row.windows[name].rafHz >= 114 && row.windows[name].rafHz <= 126, `${name}: incorrect visibility/refresh; RAF ${row.windows[name].rafHz} Hz, expected approximately 120 Hz`);
		}
		// Additional read-only presentation counter; frozen metric/windows/parser remain identical.
		const presentations = row.snapshot.presentations ?? [];
		for (const w of Object.values(row.windows)) w.presentHz = presentations.filter((t) => t >= w.start && t < w.end).length / w.seconds;
		if (options['per-encoder-export']) {
			assert.match(row.adapter, /ANGLE Metal Renderer: Apple M1 Max/, 'Expected Apple M1 Max Metal renderer');
			progress('per-encoder export');
			const { exportEncoders } = await import('./encoder-attribution.mjs'); signal.throwIfAborted();
			row.encoders = await exportEncoders({ trace, gpuPid, windows }, `${DIR}/${name}.encoders.json`, signal); signal.throwIfAborted();
		}
		row.traceBytes = await bytes(trace); signal.throwIfAborted();
		row.status = 'OK';
		await writeFile(`${DIR}/${name}.json`, JSON.stringify(row, null, 2)); signal.throwIfAborted();
		await rm(trace, { recursive: true }); row.traceDeleted = true; signal.throwIfAborted();
		await rm(input); signal.throwIfAborted(); await rm(output); signal.throwIfAborted();
	} catch (error) {
		process.send?.('resume');
		row.status = 'FAILED';
		row.error = String(abortReason(signal)?.message ?? error.message ?? error); row.phase = phase; row.windows = windows; row.traceDeleted = false;
		livenessFailure(row, signal);
		row.browserErrors = page?.__energyErrors ?? [];
		if (recording && !stopped && !signal.aborted) { try { recording.kill('SIGINT'); await Promise.race([recording.exited, Bun.sleep(180000)]); } catch {} }
		// Per-window control failure: preserve already-completed correctly-visible windows.
		if (c.infraRetry && /hidden: incorrect visibility|hidden: visibility changed/.test(row.error) && windows.active && windows.untouched) {
			try {
				const input = `${DIR}/${name}.partial-input.json`, output = `${DIR}/${name}.partial-analysis.json`;
				await writeFile(input, JSON.stringify({ trace, gpuPid, windows }));
				await execAsync(process.execPath, [process.argv[1], '--analyse-worker', input, output], { timeout: 210000, maxBuffer: 1 << 20 });
				Object.assign(row, JSON.parse(await readFile(output, 'utf8')));
				row.status = 'PARTIAL'; row.incompleteWindows = ['hidden', 'control'];
			} catch (partialError) { row.partialParseError = String(partialError.message); }
		}
		row.traceBytes = await bytes(trace); livenessFailure(row, signal);
		await writeFile(`${DIR}/${name}.parse-failure.json`, JSON.stringify({ error: row.error, traceBytes: row.traceBytes, windows, gpuPid }, null, 2));
		await rm(trace, { recursive: true, force: true }); row.traceDeleted = true;
		cleanup();
	} finally {
		clearInterval(sizeWatch);
		activePersistFailure?.();
		if (signal.aborted) {
			cleanup(); await Bun.sleep(1000); killOwned();
		}
		await scratchNew();
		row.scratchDeleted = [...ownedScratch];
		await cleanScratch();
		if (emergencyRelease) await emergencyRelease;
		row.traceTmpBytes = await bytes(traceTmp);
		row.traceTmpFiles = await readdir(traceTmp).catch(() => []);
		await rm(traceTmp, { recursive: true, force: true });
		row.traceTmpDeleted = true;
		if (browser) { await browser.close().catch(() => {}); browser = null; }
		if (chrome) { chrome.kill(); await boundedExit(chrome.exited, signal).catch(() => killOwned()); chrome = null; }
		if (profile) { await rm(profile, { recursive: true }); profile = null; }
		if (notifier) { notifier.kill(); notifier = null; }
	}
	livenessFailure(row, signal);
	row.endedAt = new Date().toISOString(); row.loadAverageEnd = loadavg();
	await writeFile(`${DIR}/${name}.json`, JSON.stringify(row, null, 2));
	if (signal.aborted) {
		livenessFailure(row, signal);
		await writeFile(`${DIR}/${name}.json`, JSON.stringify(row, null, 2));
		if (emergencyRelease) await emergencyRelease; else await release();
	}
	clearTimeout(deadline); activeController = null; activePersistFailure = null; activeScratchCleanup = null;
	console.log(JSON.stringify({ name, status: row.status, error: row.error, active: row.windows?.active?.gpuBusyMsPerSecond, untouched: row.windows?.untouched?.gpuBusyMsPerSecond, traceBytes: row.traceBytes, traceDeleted: row.traceDeleted }));
	return row;
}
if (options['attempt-worker']) {
	const { c, run } = JSON.parse(options['attempt-worker']);
	await captureWorker(c, run);
	cleanup(); process.exit(0);
}
function groupRows(pgid) { return execFileSync('ps', ['-axo', 'pid=,pgid=,command='], { encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL' }).split('\n').filter((l) => Number(l.trim().split(/\s+/)[1]) === pgid); }
function supervisorRow(workerRow, timedOut, fallback) {
	return timedOut ? { ...fallback, status: 'FAILED', error: 'attempt timeout (liveness)' } : workerRow ?? { ...fallback, status: 'FAILED', error: 'worker row unreadable' };
}
function validGroup(pid, pgid, self) { return pgid === pid && pgid !== self; }
function groupSafe(pid) {
	const pgid = Number(execFileSync('ps', ['-p', String(pid), '-o', 'pgid='], { encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL' }).trim());
	const self = Number(execFileSync('ps', ['-p', String(process.pid), '-o', 'pgid='], { encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL' }).trim());
	return validGroup(pid, pgid, self);
}
function reapGroupSync(child, escaped, grace = 5000) {
	const until = Date.now() + grace;
	const sleep = new Int32Array(new SharedArrayBuffer(4));
	let residual;
	const zombiePids = new Set();
	do {
		// Sync polling blocks child exit callbacks; zombies cannot execute or retain the GPU lock.
		const states = new Map(execFileSync('ps', ['-axo', 'pid=,stat='], { encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL' }).split('\n').map((line) => { const [pid, stat] = line.trim().split(/\s+/); return [Number(pid), stat]; }));
		const group = child ? groupRows(child.pid) : [], identities = census().filter((r) => sameProcess(escaped.get(r.pid), r));
		for (const pid of [...group.map((line) => Number(line.trim().split(/\s+/)[0])), ...identities.map((r) => r.pid)]) if (states.get(pid)?.startsWith('Z')) zombiePids.add(pid);
		residual = { group: group.filter((line) => !states.get(Number(line.trim().split(/\s+/)[0]))?.startsWith('Z')), escaped: identities.filter((r) => !states.get(r.pid)?.startsWith('Z')), zombiePids: [...zombiePids] };
		if (!residual.group.length && !residual.escaped.length) break;
		if (Date.now() >= until) break;
		Atomics.wait(sleep, 0, 0, Math.min(100, until - Date.now()));
	} while (true);
	return residual;
}
function suspectHubsSync(since) {
	return execFileSync('ps', ['-axo', 'pid=,uid=,stat=,lstart=,command='], { encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL' }).split('\n').flatMap((line) => {
		const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.{24})\s+(.*)$/);
		if (!m || +m[2] !== process.getuid() || m[3].startsWith('Z') || Date.parse(m[4]) < since || !/(?:^|\/)DTServiceHub(?:\s|$)/.test(m[5])) return [];
		return [{ pid: +m[1], command: m[5], start: m[4] }];
	});
}
function persistProof(proofs, path, proof, record, persist = writeFileSync) {
	const next = new Map(proofs); next.set(path, proof);
	persist(record, JSON.stringify([...next.values()], null, 2));
	proofs.set(path, proof);
}
function persistRowSync(path, row, persist = writeFileSync) {
	try { persist(path, JSON.stringify(row)); }
	catch { persist(path, JSON.stringify(row)); }
}
function finalizeSupervisorSync(state, lock, owner, completedRow, emergency = false) {
	let residual = { group: [], escaped: [], zombiePids: [] }, suspectUnowned = [], probeError;
	try {
		const live = reapGroupSync(state.child, state.escaped, 0);
		if (state.child) { try { if (state.child.groupVerified) { if (live.group.length) process.kill(-state.child.pid, 'SIGKILL'); } else state.child.kill('SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') throw e; } }
		for (const r of live.escaped) { try { process.kill(r.pid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') throw e; } }
		residual = reapGroupSync(state.child, state.escaped);
		residual.zombiePids = [...new Set([...live.zombiePids, ...residual.zombiePids])];
		if (state.startedAt) suspectUnowned = suspectHubsSync(state.xctraceBirth ?? state.startedAt);
	} catch (error) { probeError = String(error); }
	const lockPreserved = !!probeError || residual.group.length + residual.escaped.length + suspectUnowned.length > 0;
	const cleanupResidual = [], scratchDeleted = [];
	const unprovenPaths = [];
	for (const proof of state.provenScratch?.values() ?? []) {
		const path = proof.lsofPath;
		if (lockPreserved || state.stopFailed) cleanupResidual.push(path);
		else {
			try { if (deleteProvenScratch(proof)) scratchDeleted.push(path); else { cleanupResidual.push(path); unprovenPaths.push(path); } }
			catch (error) { if (error.code !== 'ENOENT') { cleanupResidual.push(path); unprovenPaths.push(path); } }
		}
	}
	if (state.timedOut) completedRow = { ...state.row, status: 'FAILED', error: 'attempt timeout (liveness)' };
	if (!completedRow && !emergency) {
		try { completedRow = JSON.parse(readFileSync(state.rowPath, 'utf8')); }
		catch { completedRow = { ...state.row, status: 'FAILED', error: 'worker row unreadable' }; }
	}
	const row = { ...(completedRow ?? { ...state.row, status: 'FAILED', error: 'attempt timeout (liveness)' }), residualOwnedProcesses: residual.group, escapedOwnedProcesses: residual.escaped, zombiePids: residual.zombiePids, suspectUnowned, probeError, teardownError: state.teardownError ?? completedRow?.teardownError, cleanupResidual, scratchDeleted, unprovenScratch: [...new Set([...(completedRow?.unprovenScratch ?? []), ...unprovenPaths])], lockPreserved };
	try { persistRowSync(state.rowPath, row); }
	catch (error) {
		row.lockPreserved = true; row.persistError = 'row persist failed';
		console.error(JSON.stringify({ ...row, persistDetail: String(error) }));
		process.exit(1);
	}
	if (!lockPreserved && readFileSync(`${lock}/owner`, 'utf8') === owner) rmSync(lock, { recursive: true });
	if (emergency || lockPreserved) process.exit(1);
	return row;
}
async function stopGroup(child, grace = 10000, escaped = new Map()) {
	assert.equal(child.groupVerified, true, 'Unverified process group; negative signal prohibited');
	const live = () => reapGroupSync(child, escaped, 0);
	const signal = (s) => {
		const residual = live();
		if (residual.group.length) { try { process.kill(-child.pid, s); } catch (e) { if (e.code !== 'ESRCH') throw e; } }
		for (const r of residual.escaped) { try { process.kill(r.pid, s); } catch (e) { if (e.code !== 'ESRCH') throw e; } }
	};
	const wait = async () => {
		const until = Date.now() + grace;
		while (Date.now() < until) { const residual = live(); if (!residual.group.length && !residual.escaped.length) return; await Bun.sleep(100); }
	};
	signal('SIGTERM'); await wait();
	signal('SIGKILL'); await wait();
	const residual = live();
	assert.equal(residual.group.length + residual.escaped.length, 0, 'Owned attempt group survived bounded reap; lock preserved');
}
const systemTmp = realpathSync(execFileSync('getconf', ['DARWIN_USER_TEMP_DIR'], { encoding: 'utf8' }).trim());
const unprovenScratch = new Set();
async function capture(c, run) {
	const name = `${fileKey(c)}-r${run}${c.infraRetry ? '-infra-retry' : ''}`;
	const rowPath = `${DIR}/${name}.json`;
	supervisorState = { rowPath, row: { ...c, run, sha, engineSourceSha, harnessSha, engineFileHash, measurementLogicHash, browserMode, override: c.arm ? armOverride(c.arm) : override }, escaped: new Map(), startedAt: Date.now() - 1000 };
	const hardDeadline = setTimeout(() => finalizeSupervisorSync(supervisorState, LOCK, ownerText, undefined, true), Math.max(0, lockedAt + 25 * 60000 - Date.now()));
	try {
	const scratch = await mkdtemp(`${DIR}/${name}-owned-`);
	const args = ['--label', options.label, '--split', c.split, '--cases', `${c.preset}@${c.w}x${c.h}:${c.dpr}:${c.seed}`, '--runs', '1', '--run-start', String(run), '--attempt-worker', JSON.stringify({ c, run })];
	for (const flag of ['headed', 'paired-max-fps', 'per-encoder-export']) if (options[flag]) args.push(`--${flag}`);
	for (const flag of ['source-root', 'engine-sha', 'override']) if (options[flag]) args.push(`--${flag}`, options[flag]);
	const child = spawn(process.execPath, [process.argv[1], ...args], { cwd: ROOT, detached: true, env: process.env, stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
	child.on('message', (message) => {
		if (message === 'quiet') enterQuiet(supervisorState, () => { if (child.connected) child.send('quiet-ack'); }).catch((error) => { supervisorState.teardownError = String(error); });
		else if (message === 'resume') supervisorState.quiet = false;
	});
	supervisorState.child = child;
	child.groupVerified = groupSafe(child.pid);
	if (!child.groupVerified) { child.kill('SIGKILL'); throw new Error('Attempt process group guard failed; exact child stopped'); }
	const exited = new Promise((resolve) => { child.once('exit', resolve); child.once('error', resolve); });
	const escaped = new Map(), provenScratch = new Map(), outsideBefore = new Set(await readdir(systemTmp));
	supervisorState.escaped = escaped; supervisorState.provenScratch = provenScratch;
	let scanning;
	const scan = () => {
		if (supervisorState.quiet) return Promise.resolve();
		if (scanning) return scanning;
		scanning = (async () => {
			const rows = census(), ids = new Set([child.pid]);
			for (let changed = true; changed;) { changed = false; for (const r of rows) if (r.ppid !== 1 && ids.has(r.ppid) && !ids.has(r.pid)) { ids.add(r.pid); changed = true; } }
			for (const r of rows.filter((r) => ids.has(r.pid))) {
				if (/DTServiceHub/.test(r.command)) escaped.set(r.pid, r);
				if (/xctrace/.test(r.command)) supervisorState.xctraceBirth ??= Date.parse(r.start);
				if (/xctrace|DTServiceHub/.test(r.command)) {
					const paused = () => supervisorState.quiet;
					if (paused()) break;
					const output = await execAsync('lsof', ['-n', '-p', String(r.pid), '-Fn'], { timeout: 5000, maxBuffer: 1 << 20 }).then((r) => r.stdout, (error) => { supervisorState.teardownError = String(error); return ''; });
					if (paused()) break;
					if (sameProcess(r, census().find((p) => p.pid === r.pid))) {
						for (const line of output.split('\n')) if (/^n\/.*\/instruments[^/]*\.ktrace$/.test(line)) {
							const lsofPath = line.slice(1), path = realpathSync(lsofPath), identity = lstatSync(lsofPath);
							const proof = { lsofPath, path, dev: identity.dev, ino: identity.ino, size: identity.size, owner: r, provedAt: new Date().toISOString() };
							persistProof(provenScratch, path, proof, `${DIR}/${name}.scratch-proofs.json`);
						}
					}
				}
			}
		})().finally(() => { scanning = null; supervisorState.scanning = null; });
		supervisorState.scanning = scanning;
		return scanning;
	};
	const monitor = setInterval(() => scan().catch((error) => { supervisorState.teardownError = String(error); }), 1000);
	let deadline;
	const timedOut = await Promise.race([exited.then(() => false), new Promise((resolve) => { deadline = setTimeout(() => { supervisorState.timedOut = true; resolve(true); }, Math.min(600000, Math.max(0, lockedAt + 25 * 60000 - Date.now()))); })]);
	clearTimeout(deadline); clearInterval(monitor);
	try { await scan(); await stopGroup(child, 10000, escaped); }
	catch (error) { supervisorState.teardownError = String(error); supervisorState.stopFailed = true; }
	const fallback = { ...c, run, sha, engineSourceSha, harnessSha, engineFileHash, measurementLogicHash, browserMode, override: c.arm ? armOverride(c.arm) : override };
	let workerRow;
	try { workerRow = !timedOut && await Bun.file(rowPath).exists() ? JSON.parse(await readFile(rowPath, 'utf8')) : null; }
	catch { workerRow = { ...fallback, status: 'FAILED', error: 'worker row unreadable' }; }
	const row = supervisorRow(workerRow, timedOut, fallback);
	writeFileSync(rowPath, JSON.stringify(row, null, 2));
	row.unprovenScratch = (await readdir(systemTmp)).filter((name) => /^instruments.*\.ktrace$/.test(name) && !outsideBefore.has(name) && !provenScratch.has(`${systemTmp}/${name}`)).map((name) => `${systemTmp}/${name}`);
	for (const path of row.unprovenScratch) unprovenScratch.add(path);
	await writeFile(rowPath, JSON.stringify(row, null, 2));
	await writeFile(`${DIR}/unproven-scratch.json`, JSON.stringify([...unprovenScratch], null, 2));
	await boundedFS(rm(scratch, { recursive: true }));
	const finalized = finalizeSupervisorSync(supervisorState, LOCK, ownerText, row);
	lockOwned = false; lastReleasedAt = Date.now(); clearTimeout(hardDeadline); supervisorState = null;
	return finalized;
	} finally {
		if (supervisorState) {
			const finalized = finalizeSupervisorSync(supervisorState, LOCK, ownerText);
			lockOwned = false; lastReleasedAt = Date.now(); clearTimeout(hardDeadline); supervisorState = null;
			return finalized;
		}
	}
}
try {
	for (let run = RUN_START; run < RUN_START + RUNS; run++) for (const c of orderedCases(run)) {
		if (options.resume && results.some((r) => key(r) === key(c) && r.run === run)) continue;
		// Reserve the full 10-minute attempt ceiling before the 25-minute batch limit.
		if (lockOwned && Date.now() - lockedAt >= 15 * 60000) await release();
		if (gateExpired || await acquire() === false) break;
		const r = await capture(c, run); results.push(r); save();
		if (holdExpired) throw new Error('GPU hold cap reached (liveness)');
		if (r.status !== 'OK') { await release(); await Bun.sleep(60000); }
	}
	// Exactly one end-of-run retry for recorder infrastructure timeout, never a clean metric.
	for (const failed of results.filter((r) => (['Recorder tracing-started notification timeout', 'Recorder finalisation timeout', 'Outer background task ceiling interrupted recorder finalisation'].includes(r.error) || /missing execution coverage|GPU process exited|No space left on device|ENOSPC|Trace size watchdog|incorrect visibility|visibility changed/.test(r.error ?? '')) && !r.infraRetry && cases.some((c) => key(c) === key(r)) && r.run >= RUN_START && r.run < RUN_START + RUNS)) {
		if (results.some((r) => key(r) === key(failed) && r.run === failed.run && r.infraRetry)) continue;
		if (lockOwned && Date.now() - lockedAt >= 15 * 60000) await release();
		if (gateExpired || await acquire() === false) break;
		const retry = await capture({ ...cases.find((c) => key(c) === key(failed)), infraRetry: true }, failed.run);
		results.push(retry); save();
		if (holdExpired) throw new Error('GPU hold cap reached (liveness)');
		if (retry.status !== 'OK') await release();
	}
} finally {
	if (supervisorState) finalizeSupervisorSync(supervisorState, LOCK, ownerText);
	save(); cleanup(); if (!remainingOwned().length) await release();
	const remaining = census().filter((r) => sameProcess(owned.get(r.pid), r));
	await writeFile(`${DIR}/cleanup.json`, JSON.stringify({ checkedPids: [...owned.keys()], remaining, lockReleased: !lockOwned }, null, 2));
	console.log(JSON.stringify({ phase: 'cleanup', checkedPids: [...owned.keys()], remaining }));
}
process.exit(results.some((r) => r.status !== 'OK') ? 1 : 0);
