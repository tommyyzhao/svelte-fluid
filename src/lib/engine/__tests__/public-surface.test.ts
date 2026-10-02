/*
 * Public-surface guard (1.0): no GL / internal types leak through the root
 * entry. Runtime names, `index.ts` source and `engine/types.ts` are checked
 * here. The emitted `dist` declarations are checked against a fresh build by
 * scripts/check-public-declarations.mjs (run by `prepack`); reading `dist`
 * from a unit test would test whatever stale build happens to be on disk.
 */
import { describe, expect, it } from 'vitest';
import * as api from '../../index.js';
import indexSrc from '../../index.ts?raw';
import typesSrc from '../types.ts?raw';

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
});
