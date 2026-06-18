import { describe, expect, it } from 'vitest';
import {
	configAttribute,
	configValueLiteral,
	configToAttributeLines,
	presetConfigSnippet,
	presetUsageSnippet
} from './snippet.js';
import { PRESETS } from './registry.js';

describe('presetUsageSnippet', () => {
	it('imports the wrapper and renders the tag', () => {
		expect(presetUsageSnippet('Karman')).toBe(
			"<script>\n\timport { Karman } from 'svelte-fluid';\n</script>\n\n<Karman />"
		);
	});

	it('works for every preset id', () => {
		for (const p of PRESETS) {
			const snippet = presetUsageSnippet(p.id);
			expect(snippet).toContain(`import { ${p.id} } from 'svelte-fluid';`);
			expect(snippet).toContain(`<${p.id} />`);
		}
	});
});

describe('configAttribute', () => {
	it('uses boolean shorthand for true and ={false} for false', () => {
		expect(configAttribute('glass', true)).toBe('glass');
		expect(configAttribute('bloom', false)).toBe('bloom={false}');
	});

	it('emits numbers and nested objects', () => {
		expect(configAttribute('curl', 10)).toBe('curl={10}');
		expect(configAttribute('backColor', { r: 4, g: 6, b: 14 })).toContain('r: 4');
		expect(configAttribute('backColor', { r: 4, g: 6, b: 14 })).not.toContain('"');
	});
});

describe('configValueLiteral', () => {
	it('unquotes keys and uses single quotes for strings', () => {
		const out = configValueLiteral({ type: 'circle', cx: 0.5 });
		expect(out).toContain('type:');
		expect(out).toContain("'circle'");
		expect(out).not.toContain('"');
	});

	it('safely escapes quotes and apostrophes in string values', () => {
		// A double-quote in a value must not leak a raw " that breaks the literal.
		const dq = configValueLiteral({ font: 'bold 200px "Times New Roman", serif' });
		expect(dq).toContain(`font: 'bold 200px "Times New Roman", serif'`);
		// An apostrophe must be escaped so it can't terminate the single-quoted literal.
		const ap = configValueLiteral({ text: "O'Brien" });
		expect(ap).toContain("text: 'O\\'Brien'");
		// Both must remain syntactically valid JS object literals.
		expect(() => new Function(`return (${dq})`)).not.toThrow();
		expect(() => new Function(`return (${ap})`)).not.toThrow();
	});
});

describe('presetConfigSnippet', () => {
	it('returns empty string for unknown presets', () => {
		expect(presetConfigSnippet('NotAPreset')).toBe('');
	});

	it('wraps the pinned config in a <Fluid> tag for every preset', () => {
		for (const p of PRESETS) {
			const snippet = presetConfigSnippet(p.id);
			expect(snippet.startsWith('<Fluid\n'), p.id).toBe(true);
			expect(snippet.trimEnd().endsWith('/>'), p.id).toBe(true);
			// Never leaks JSON double-quoted keys.
			expect(snippet, p.id).not.toContain('":');
		}
	});

	it('serializes the Venturi flow recipe faithfully', () => {
		const snippet = presetConfigSnippet('Venturi');
		expect(snippet).toContain('curl={0}');
		expect(snippet).toContain('shading={false}');
		expect(snippet).toContain('flow={');
		expect(snippet).toContain("kind: 'pressureGradient'");
		expect(snippet).toContain('backColor={{');
	});

	it('uses boolean shorthand (LavaLamp glass) and ={false} (LavaLamp bloom)', () => {
		const snippet = presetConfigSnippet('LavaLamp');
		expect(snippet).toMatch(/\n\tglass\n/);
		expect(snippet).toContain('bloom={false}');
	});
});

describe('configToAttributeLines', () => {
	it('skips undefined values', () => {
		const lines = configToAttributeLines({ curl: 5, splatForce: undefined });
		expect(lines).toEqual(['curl={5}']);
	});
});
