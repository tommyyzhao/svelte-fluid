import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dir = `${process.cwd()}/dev-docs/decisions/`;
const rows = [...readFileSync(`${dir}README.md`, 'utf8').matchAll(/^\| \[(\d{4})\]\(\.\/([^)]+)\)\s*\| .*? \| (\w[\w-]*)[^|]*\|$/gm)].map((m) => ({ n: m[1], file: m[2], status: m[3] }));

const fileStatus = (f: string) => {
	const t = readFileSync(dir + f, 'utf8');
	const m = /^\*\*Status:\*\*\s*([\w-]+)/m.exec(t) ?? /^## Status\s*\n+([\w-]+)/m.exec(t);
	return m?.[1];
};

describe('ADR index', () => {
	const files = readdirSync(dir).filter((f) => /^\d{4}-.*\.md$/.test(f));

	it('has a row for every ADR file with a matching status word', () => {
		for (const f of files) {
			const row = rows.find((r) => r.file === f);
			expect(row, `${f} missing from dev-docs/decisions/README.md`).toBeDefined();
			expect(row!.n, f).toBe(f.slice(0, 4));
			expect(row!.status, `${f} status`).toBe(fileStatus(f));
		}
	});

	it('points every row at an existing file, in numeric order', () => {
		for (const r of rows) expect(existsSync(dir + r.file), r.file).toBe(true);
		expect(rows.map((r) => r.n)).toEqual([...rows.map((r) => r.n)].sort());
	});
});
