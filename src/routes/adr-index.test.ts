import { describe, expect, it } from 'vitest';

// Raw imports keep this Node-API-free so svelte-check needs no node types.
const adrs = import.meta.glob('/dev-docs/decisions/[0-9][0-9][0-9][0-9]-*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const readme = Object.entries(import.meta.glob('/dev-docs/decisions/README.md', { query: '?raw', import: 'default', eager: true }))[0][1] as string;

const files = Object.keys(adrs).map((p) => p.split('/').pop()!);
const rows = [...readme.matchAll(/^\| \[(\d{4})\]\(\.\/([^)]+)\)\s*\| .*? \| (\w[\w-]*)[^|]*\|$/gm)].map((m) => ({ n: m[1], file: m[2], status: m[3] }));

const fileStatus = (f: string) => {
	const t = adrs[`/dev-docs/decisions/${f}`];
	return (/^\*\*Status:\*\*\s*([\w-]+)/m.exec(t) ?? /^## Status\s*\n+([\w-]+)/m.exec(t))?.[1];
};

describe('ADR index', () => {
	it('has a row for every ADR file with a matching status word', () => {
		expect(files.length).toBeGreaterThan(50);
		for (const f of files) {
			const row = rows.find((r) => r.file === f);
			expect(row, `${f} missing from dev-docs/decisions/README.md`).toBeDefined();
			expect(row!.n, f).toBe(f.slice(0, 4));
			expect(row!.status, `${f} status`).toBe(fileStatus(f));
		}
	});

	it('points every row at an existing file, in numeric order', () => {
		for (const r of rows) expect(files, r.file).toContain(r.file);
		expect(rows.map((r) => r.n)).toEqual([...rows.map((r) => r.n)].sort());
	});
});
