/*
 * Public-surface guard (1.0): no GL / internal types leak through the root
 * entry. Runtime names, `index.ts` source, `engine/types.ts` and (when a
 * `bun run prepack` build exists) every `dist/**.d.ts` reachable from the root
 * are checked. The strict consumer compile lives in
 * scripts/check-public-declarations.mjs.
 */
import { describe, expect, it } from 'vitest';
import * as api from '../../index.js';
import indexSrc from '../../index.ts?raw';
import typesSrc from '../types.ts?raw';

// Present only after `bun run prepack`; empty otherwise (the test below then skips).
const dts = import.meta.glob<string>(['/dist/**/*.d.ts', '!/dist/**/__*__/**'], { query: '?raw', import: 'default', eager: true });

const REMOVED = ['FBO', 'DoubleFBO', 'ExtInfo', 'ResolvedConfig', 'ProgramWrap', 'ToroidalTempest'];
const BANNED = /\b(WebGL2?[A-Z]\w*|GPU[A-Z]\w*|ProgramWrap|DoubleFBO|FBO|ExtInfo|ResolvedConfig)\b/g;
// The library's own GL-free names that merely start with "WebGL".
const ALLOWED = new Set(['WebGLUnavailableError', 'WebGLUnavailableReason']);

/** Identifier hits outside comments. */
function leaks(source: string): string[] {
	const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
	return (code.match(BANNED) ?? []).filter((n) => !ALLOWED.has(n));
}

describe('public API surface', () => {
	it('does not export removed GL/internal names at runtime', () => {
		for (const name of REMOVED) expect(name in api).toBe(false);
		expect(typeof api.Toroidal).toBe('function');
		expect(typeof api.isWebGLAvailable).toBe('function');
		expect(typeof api.WebGLUnavailableError).toBe('function');
	});

	it('index.ts does not name removed types', () => {
		expect(leaks(indexSrc)).toEqual([]);
		expect(indexSrc).not.toContain('ToroidalTempest');
	});

	it('engine/types.ts (all public declarations) is GL-type free', () => {
		expect(leaks(typesSrc)).toEqual([]);
	});

	// dist/ exists only after `bun run prepack`; the prepack script enforces the same scan.
	// Only declarations reachable from dist/index.d.ts are public (internal modules also ship).
	it.skipIf(!dts['/dist/index.d.ts'])('dist/*.d.ts reachable from the root is GL-type free', () => {
		const seen = new Set<string>();
		const queue = ['/dist/index.d.ts'];
		while (queue.length) {
			const file = queue.pop()!;
			if (seen.has(file)) continue;
			seen.add(file);
			for (const [, spec] of dts[file].matchAll(/(?:from|import\()\s*'(\.[^']+)'/g)) {
				const base = new URL(spec, `file://${file}`).pathname;
				const next = base.endsWith('.js') ? base.replace(/\.js$/, '.d.ts') : `${base}.d.ts`;
				if (dts[next]) queue.push(next);
			}
		}
		expect(seen.size).toBeGreaterThan(5);
		const hits = [...seen].flatMap((p) => leaks(dts[p]).map((n) => `${p}: ${n}`));
		expect(hits).toEqual([]);
	});
});
