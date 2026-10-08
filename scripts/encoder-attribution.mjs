// TRAIN-only diagnostic. Reuses the frozen E1 XML parser without modifying it.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';

export async function exportEncoders({ trace, gpuPid, windows }, output, signal) {
	const source = await readFile(new URL('./energy-capture.mjs', import.meta.url), 'utf8');
	const execAsync = promisify(execFile), XCODE = { ...process.env, DEVELOPER_DIR: '/Applications/Xcode.app/Contents/Developer' };
	const scope = { execAsync, XCODE, EXPORT_LIMIT_MS: 90000 };
	runInNewContext(`${source.slice(source.indexOf('async function exportTable('), source.indexOf('const n ='))}; this.exportTable = exportTable;`, scope);
	const { stdout: toc } = await execAsync('env', [`DEVELOPER_DIR=${XCODE.DEVELOPER_DIR}`, 'xcrun', 'xctrace', 'export', '--input', trace, '--toc'], { timeout: 90000, maxBuffer: 1 << 20, signal });
	const tables = {};
	for (const schema of ['metal-gpu-intervals', 'metal-application-command-buffer-submissions', 'metal-application-encoders-list', 'metal-io-surface-access']) {
		assert.ok(toc.includes(`schema="${schema}"`), `Missing schema ${schema}`);
		const table = await scope.exportTable(trace, schema, signal);
		await writeFile(`${output}.${schema}.xml`, table.xml);
		tables[schema] = { sha256: createHash('sha256').update(table.xml).digest('hex'), rows: table.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value ? { text: value.text, ...value.attrs } : null]))) };
	}
	await writeFile(`${output}.toc.xml`, toc);
	await writeFile(output, JSON.stringify({ gpuPid, windows, origin: Date.parse(toc.match(/<start-date>([^<]+)<\/start-date>/)?.[1]), tables }));
	return { file: output, schemas: Object.fromEntries(Object.entries(tables).map(([key, table]) => [key, { sha256: table.sha256, rows: table.rows.length }])) };
}

const number = (row, key) => Number(row[key]?.text ?? NaN);
const median = (values) => { const v = [...values].sort((a, b) => a - b), i = Math.floor(v.length / 2); return v.length ? v.length % 2 ? v[i] : (v[i - 1] + v[i]) / 2 : null; };
function union(intervals) {
	let total = 0, end = -Infinity;
	for (const [s, e] of [...intervals].sort((a, b) => a[0] - b[0])) { if (e > end) { total += e - Math.max(s, end); end = e; } }
	return total;
}
// Split concurrent Vertex/Fragment execution equally: allocated costs sum to frame union.
function allocate(encoders) {
	const events = encoders.flatMap((e, i) => e.intervals.flatMap(([s, z]) => [[s, i, 1], [z, i, -1]])).sort((a, b) => a[0] - b[0]);
	const counts = new Map(), costs = encoders.map(() => 0); let last = events[0]?.[0] ?? 0;
	for (const [at, i, delta] of events) {
		if (counts.size) for (const index of counts.keys()) costs[index] += (at - last) / counts.size;
		const count = (counts.get(i) ?? 0) + delta;
		if (count) counts.set(i, count); else counts.delete(i);
		last = at;
	}
	return costs;
}
export function analyseEncoders(data, row) {
	const pid = data.gpuPid, owned = (r) => r.process?.fmt?.endsWith(`(${pid})`);
	const { start, end } = data.windows.active, lo = (start - data.origin) * 1e6, hi = (end - data.origin) * 1e6;
	const byEncoder = new Map();
	for (const r of data.tables['metal-gpu-intervals'].rows.filter(owned)) {
		const id = number(r, 'encoder-id'), s = number(r, 'start'), z = s + number(r, 'duration');
		assert.ok(Number.isSafeInteger(id) && Number.isFinite(s) && z >= s);
		if (!byEncoder.has(id)) byEncoder.set(id, { id, cb: number(r, 'cmdbuffer-id'), intervals: [], channels: [], label: r['event-label']?.fmt, writes: [] });
		const e = byEncoder.get(id); e.intervals.push([s, z]); e.channels.push({ channel: r['channel-name']?.text, start: s, end: z });
		if (r['iosurface-accesses']?.fmt) e.writes.push(r['iosurface-accesses'].fmt);
	}
	const encoders = [...byEncoder.values()].filter((e) => e.channels.some((c) => c.channel === 'Fragment')).map((e) => ({ ...e, start: Math.min(...e.channels.filter((c) => c.channel === 'Fragment').map((c) => c.start)), end: Math.max(...e.intervals.map((iv) => iv[1])) })).sort((a, b) => a.start - b.start);
	const frames = [];
	for (const e of encoders) {
		if (!frames.length || e.start - frames.at(-1).at(-1).end > 8e6) frames.push([]);
		frames.at(-1).push(e);
	}
	const active = frames.filter((f) => Math.min(...f.flatMap((e) => e.intervals.map((iv) => iv[0]))) >= lo && Math.max(...f.map((e) => e.end)) < hi);
	const counts = {};
	for (const f of active) counts[f.length] = (counts[f.length] ?? 0) + 1;
	const modalCount = Number(Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0]);
	const steady = active.filter((f) => f.length === modalCount);
	assert.ok(steady.length >= 300, `Only ${steady.length} steady frames`);
	const encodingRows = new Map(data.tables['metal-application-encoders-list']?.rows.filter(owned).map((r) => [number(r, 'encoder-id'), r]) ?? []);
	const orderMismatches = encodingRows.size ? steady.filter((f) => f.some((e, i) => !encodingRows.has(e.id) || i > 0 && number(encodingRows.get(e.id), 'start') < number(encodingRows.get(f[i - 1].id), 'start'))).length : null;
	if (encodingRows.size) for (const f of steady) {
		assert.ok(f.every((e) => encodingRows.has(e.id)), 'Encoder missing CPU encoding identity');
		f.sort((a, b) => number(encodingRows.get(a.id), 'start') - number(encodingRows.get(b.id), 'start'));
	}
	const allocated = steady.map(allocate), frameUs = steady.map((f) => union(f.flatMap((e) => e.intervals)) / 1000);
	const draws = row.snapshot.drawInventory?.filter((d) => d.program !== 'splatProgram');
	if (draws?.length) assert.equal(modalCount, draws.length + 1, 'Steady encoder count differs from engine inventory plus canvas work');
	return {
		preset: row.preset, run: row.run, override: row.override, uptime: row.uptime, adapter: row.adapter, measurementLogicHash: row.measurementLogicHash,
		frames: steady.length, activeFrames: active.length, counts, modalCount, orderMismatches, draws, activeMsPerSecond: row.windows.active.gpuBusyMsPerSecond,
		steadyBusyMsPerSecond: frameUs.reduce((sum, v) => sum + v / 1000, 0) / (steady.length / row.windows.active.engineHz),
		allocatedMsPerSecond: allocated[0].map((_, i) => allocated.reduce((sum, costs) => sum + costs[i] / 1e6, 0) / (steady.length / row.windows.active.engineHz)),
		medianFrameUs: median(frameUs), sumMedianAllocatedUs: allocated[0].reduce((sum, _, i) => sum + median(allocated.map((c) => c[i])) / 1000, 0),
		frameCosts: allocated.map((costs, i) => ({ frameUs: frameUs[i], allocatedUs: costs.map((v) => v / 1000), encoderUs: steady[i].map((e) => union(e.intervals) / 1000) })),
		indices: Array.from({ length: modalCount }, (_, i) => ({ index: i, medianUs: median(steady.map((f) => union(f[i].intervals) / 1000)), allocatedUs: median(allocated.map((c) => c[i] / 1000)), sharePct: median(allocated.map((c, j) => c[i] / 1000 / frameUs[j] * 100)), fragmentUs: median(steady.map((f) => union(f[i].channels.filter((c) => c.channel === 'Fragment').map((c) => [c.start, c.end])) / 1000)), writes: [...new Set(steady.flatMap((f) => f[i].writes))] })),
		unmappedNonRender: [...byEncoder.values()].filter((e) => !e.channels.some((c) => c.channel === 'Fragment') && e.intervals.some(([s, z]) => s < hi && z > lo)).map((e) => ({ id: e.id, cb: e.cb, label: e.label, channels: e.channels, intervals: e.intervals })),
		example: steady[0]
	};
}

if (process.argv[2] === '--analyse') {
	const row = JSON.parse(await readFile(process.argv[3], 'utf8'));
	const data = JSON.parse(await readFile(row.encoders.file, 'utf8'));
	await writeFile(process.argv[4], JSON.stringify(analyseEncoders(data, row), null, 2));
}
if (process.argv[2] === '--self-check') {
	assert.equal(union([[0, 3], [1, 5], [7, 8]]), 6);
	assert.deepEqual(allocate([{ intervals: [[0, 3]] }, { intervals: [[1, 5]] }]), [2, 3]);
	assert.deepEqual(allocate([{ intervals: [[0, 3], [1, 2]] }, { intervals: [[1, 5]] }]), [2, 3]);
	assert.equal(median([1, 2, 4, 5]), 3);
	const cell = (text) => ({ text: String(text) });
	const rows = Array.from({ length: 302 }, (_, i) => [0, 1].map((index) => ({ process: { fmt: 'Chrome (123)' }, start: cell(i * 16.7e6 + index * 10000), duration: cell(2000), 'encoder-id': cell(i * 2 + index + 1), 'cmdbuffer-id': cell(i + 1), 'channel-name': cell('Fragment') }))).flat();
	const data = { gpuPid: 123, origin: 0, windows: { active: { start: 1, end: 5100 } }, tables: { 'metal-gpu-intervals': { rows } } };
	const result = analyseEncoders(data, { snapshot: { drawInventory: [] }, windows: { active: { gpuBusyMsPerSecond: 0 } } });
	assert.equal(result.modalCount, 2); assert.equal(result.frames, 301); assert.equal(result.medianFrameUs, 4);
	assert.equal(result.indices[0].sharePct, 50);
	assert.throws(() => analyseEncoders({ ...data, windows: { active: { start: 1, end: 100 } } }, { snapshot: {}, windows: { active: {} } }), /steady frames/);
	console.log('Encoder diagnostic self-check passed: overlap allocation, duplicate-channel union, frame grouping, minimum sample gate');
}
