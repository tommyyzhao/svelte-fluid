import { describe, it, expect } from 'vitest';
// Import the sources as raw strings (Vite `?raw`) so this stays a pure
// source-level parse with no Node fs dependency.
import typesSrc from '../types.ts?raw';
import fluidSrc from '../../Fluid.svelte?raw';

/*
 * Guard against a real bug we hit: a field was added to `FluidConfig` (and the
 * engine) but never destructured / forwarded in `Fluid.svelte`. Because
 * `FluidProps extends FluidConfig`, passing it still type-checks, so the prop
 * silently fell into `...rest`, got spread onto the <canvas> element, and never
 * reached the engine — the feature did nothing at runtime while every test
 * stayed green. This source-level test asserts every `FluidConfig` field is
 * actually returned by `Fluid.svelte`'s `buildConfig()` (i.e. reaches the
 * engine). It does NOT run the component — it parses the two source files.
 */

/** Slice the body of a `{ ... }` block starting at the first `{` after `from`. */
function braceBody(src: string, from: number): string {
	const open = src.indexOf('{', from);
	let depth = 0;
	for (let i = open; i < src.length; i++) {
		if (src[i] === '{') depth++;
		else if (src[i] === '}') {
			depth--;
			if (depth === 0) return src.slice(open + 1, i);
		}
	}
	throw new Error('unbalanced braces');
}

/** Field names declared on the `FluidConfig` interface. */
function fluidConfigFields(): string[] {
	const body = braceBody(typesSrc, typesSrc.indexOf('export interface FluidConfig'));
	const fields = new Set<string>();
	// Match `name:` / `name?:` at the start of a line; JSDoc/comment lines begin
	// with `*` or `/` and are skipped.
	for (const m of body.matchAll(/^\s*(\w+)\??\s*:/gm)) fields.add(m[1]);
	return [...fields];
}

/** Object keys returned by `Fluid.svelte`'s `buildConfig()`. */
function buildConfigKeys(): Set<string> {
	const fn = fluidSrc.indexOf('function buildConfig');
	const body = braceBody(fluidSrc, fluidSrc.indexOf('return {', fn));
	const keys = new Set<string>();
	for (const part of body.split(',')) {
		const t = part.trim();
		if (!t) continue;
		// `name` (shorthand) or `name: value` → key is `name`.
		const key = t.split(':')[0].trim();
		if (/^\w+$/.test(key)) keys.add(key);
	}
	return keys;
}

describe('Fluid.svelte forwards every FluidConfig field to the engine', () => {
	it('buildConfig() returns a key for every FluidConfig field', () => {
		const fields = fluidConfigFields();
		// Sanity: we actually parsed the interface.
		expect(fields.length).toBeGreaterThan(40);
		expect(fields).toContain('obstructions');

		const keys = buildConfigKeys();
		const missing = fields.filter((f) => !keys.has(f));
		expect(missing).toEqual([]);
	});
});
