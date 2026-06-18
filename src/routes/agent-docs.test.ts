import { describe, expect, it } from 'vitest';
import { buildLlmsTxt, buildLlmsFullTxt, buildSkillMd, DEFAULT_SITE } from './agent-docs.js';
import { PRESETS } from '$lib/presets/registry.js';

describe('buildLlmsTxt', () => {
	const out = buildLlmsTxt();
	it('follows the llms.txt shape (H1 + blockquote summary)', () => {
		expect(out.startsWith('# svelte-fluid\n')).toBe(true);
		expect(out).toContain('\n> WebGL');
	});
	it('lists every preset and links the agent resources', () => {
		for (const p of PRESETS) expect(out, p.id).toContain(`- ${p.id} (${p.category}):`);
		expect(out).toContain(`${DEFAULT_SITE}/SKILL.md`);
		expect(out).toContain(`${DEFAULT_SITE}/llms-full.txt`);
		expect(out).toContain(`${DEFAULT_SITE}/docs/presets`);
	});
	it('uses the provided site origin for links', () => {
		expect(buildLlmsTxt('https://svelte-fluid.dev')).toContain('https://svelte-fluid.dev/docs');
	});
});

describe('buildSkillMd', () => {
	const out = buildSkillMd();
	it('covers engine model, components, config, API, and presets', () => {
		expect(out).toContain('# svelte-fluid — Agent Skill');
		expect(out).toContain('Mental model');
		expect(out).toContain('FluidHandle');
		expect(out).toContain('containerShape');
		// All six public components must be listed (count must match the prose).
		for (const c of ['Fluid', 'FluidBackground', 'FluidReveal', 'FluidDistortion', 'FluidStick', 'FluidText'])
			expect(out, c).toContain(`<${c}>`);
		for (const p of PRESETS) expect(out, p.id).toContain(`**${p.id}**`);
	});
});

describe('buildLlmsFullTxt', () => {
	const out = buildLlmsFullTxt();
	it('embeds the skill plus a forkable recipe per preset', () => {
		expect(out).toContain('# svelte-fluid — Agent Skill');
		expect(out).toContain('Every preset config');
		for (const p of PRESETS) {
			expect(out, p.id).toContain(`### ${p.id} — ${p.name}`);
		}
		// Recipes are real <Fluid> code.
		expect(out).toContain('<Fluid');
		expect(out).not.toContain('":'); // no leaked JSON keys
	});
});
