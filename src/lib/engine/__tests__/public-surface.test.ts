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
import * as experimental from '../../experimental.js';
import experimentalSrc from '../../experimental.ts?raw';
import liquidTypesSrc from '../liquid/types.ts?raw';

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

	it('exports the seeded-RNG and colour helpers at runtime', () => {
		for (const name of ['mulberry32', 'randomSeed', 'generateColor', 'HSVtoRGB', 'normalizeColor', 'isWebGLAvailable'] as const) {
			expect(typeof api[name]).toBe('function');
		}
	});

	it('index.ts does not name removed types', () => {
		expect(leaks(indexSrc)).toEqual([]);
		expect(indexSrc).not.toContain('ToroidalTempest');
	});

	it('engine/types.ts (all public declarations) is GL-type free', () => {
		expect(leaks(typesSrc)).toEqual([]);
	});

	it('experimental entry is GL-type free and stays out of the root', () => {
		expect(leaks(experimentalSrc)).toEqual([]);
		expect(leaks(liquidTypesSrc)).toEqual([]);
		expect('LiquidEngine' in api).toBe(false);
		expect(typeof experimental.LiquidEngine).toBe('function');
		expect(typeof experimental.createSteppedFluidEngine).toBe('function');
	});

	it('experimental terrain constants: neutral Cell, deprecated aliases keep their values', () => {
		expect(experimental.Cell).toEqual({ Air: 0, Solid: 1 });
		const pairs = [
			[experimental.AIR, experimental.Cell.Air],
			[experimental.STONE, experimental.Cell.Solid]
		];
		for (const [alias, neutral] of pairs) expect(alias).toBe(neutral);
		expect([experimental.LOAM, experimental.INK, experimental.GATE, experimental.VINE, experimental.ROOT]).toEqual([2, 3, 4, 5, 6]);
	});

	it('experimental runtime exports are exactly the documented set', () => {
		expect(Object.keys(experimental).sort()).toEqual(
			['AIR', 'Cell', 'GATE', 'INK', 'LOAM', 'LiquidEngine', 'ROOT', 'STONE', 'VINE', 'createSteppedFluidEngine'].sort()
		);
	});

	it('experimental type aliases are declared as deprecated pairs', () => {
		// Type aliases erase at runtime; pin the pairing in source so a rename cannot drift.
		const pairs = {
			Rect: 'CellRect',
			Vec: 'CellVec',
			Counts: 'SpeciesCounts',
			Species: 'LiquidSpecies',
			Wind: 'LiquidWind',
			RenderOptions: 'LiquidRenderOptions'
		};
		for (const [old, neutral] of Object.entries(pairs)) {
			expect(liquidTypesSrc).toContain(`/** @deprecated Use ${neutral}. */\nexport type ${old} = ${neutral};`);
			expect(experimentalSrc).toMatch(new RegExp(`\\b${neutral}\\b`));
			expect(experimentalSrc).toMatch(new RegExp(`\\b${old}\\b`));
		}
		expect(experimentalSrc).not.toContain('export *');
	});
});
