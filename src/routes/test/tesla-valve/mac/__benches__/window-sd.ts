// Recomputes ADR 0119 per-unit SD/U over sub-windows of the 30 s step-level Re 400 records.
// Run: bun src/routes/test/tesla-valve/mac/__benches__/window-sd.ts <spectrum128.json> <spectrumexact.json>
// U matches the ADR table: the window's own mean Re * nu / (0.8 * width / 30) (solver cells/s);
// SD is population SD of the transverse probe velocity. Bench-only, never imported by the route.
// @ts-expect-error bench-only, run by bun; the route tsconfig carries no node types.
import { readFileSync } from 'node:fs';

type Row = { re: number; unitProbes: number[] };
type Rec = { rows: Row[]; options: { nu: number; width: number } };

const [a, b] = process.argv.slice(2);
if (!a || !b) throw new Error('usage: window-sd.ts <spectrum128.json> <spectrumexact.json>');
const load = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as Rec;
const it = load(a);
const ex = load(b);

function sdOverU(rec: Rec, from: number, to: number): number[] {
	const rows = rec.rows.slice(from, to);
	const re = rows.reduce((s, r) => s + r.re, 0) / rows.length;
	const U = (re * rec.options.nu) / ((0.8 * rec.options.width) / 30);
	return rows[0].unitProbes.map((_, k) => {
		const m = rows.reduce((s, r) => s + r.unitProbes[k], 0) / rows.length;
		const v = rows.reduce((s, r) => s + (r.unitProbes[k] - m) ** 2, 0) / rows.length;
		return Math.sqrt(v) / U;
	});
}

const n = ex.rows.length;
const f = (x: number) => x.toPrecision(4);
const windows: [string, number, number][] = [
	['full', 0, n],
	['last third', Math.floor((n * 2) / 3), n],
	['last sixth', Math.floor((n * 5) / 6), n]
];
for (const [name, lo, hi] of windows) {
	const i = sdOverU(it, lo, hi);
	const e = sdOverU(ex, lo, hi);
	console.log(`\n== ${name} (rows ${lo}..${hi}) ==`);
	console.log('unit | iter SD/U | exact SD/U | iter/exact');
	i.forEach((v, k) => console.log(`${k + 1} | ${f(v)} | ${f(e[k])} | ${f(v / e[k])}`));
	console.log(`exact unit 1->3 growth: ${f(e[2] / e[0])}; iter unit 1->3: ${f(i[2] / i[0])}`);
	const ds = (x: number[], y: number[], from: number) =>
		Math.max(...x.slice(from).map((v, k) => Math.abs(v / y[from + k] - 1))) * 100;
	console.log(
		`max |iter/exact-1| units 5-11: ${f(ds(i, e, 4))}%; units 6-11: ${f(ds(i, e, 5))}%`
	);
}

console.log('\n== per-sixth SD/U trend (units 1-4 + 5, 9) ==');
for (const [label, rec] of [['iter', it], ['exact', ex]] as const) {
	for (const k of [0, 1, 2, 3, 4, 8]) {
		const row = [0, 1, 2, 3, 4, 5].map((s) =>
			f(sdOverU(rec, Math.floor((n * s) / 6), Math.floor((n * (s + 1)) / 6))[k])
		);
		console.log(`${label} unit ${k + 1}: ${row.join(' ')}`);
	}
}
