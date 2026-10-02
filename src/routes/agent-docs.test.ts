import { describe, expect, it } from 'vitest';
import { buildLlmsTxt, buildLlmsFullTxt, buildSkillMd, DEFAULT_SITE } from './agent-docs.js';
import { PRESET_BY_ID, PRESETS } from '$lib/presets/registry.js';
import presetDocs from './docs/presets/+page.svelte?raw';
import landingPage from './+page.svelte?raw';
import readme from '../../README.md?raw';

describe('Plasma product language', () => {
	const generated = [buildLlmsTxt(), buildLlmsFullTxt(), buildSkillMd()];
	const publicCopy = [PRESET_BY_ID.Plasma.blurb, presetDocs, landingPage, readme, ...generated];

	it('describes Plasma as a visual fluid effect rather than plasma physics', () => {
		expect(PRESET_BY_ID.Plasma.blurb).toContain('visual fluid preset');
		expect(presetDocs).toContain('not a plasma-physics');
		for (const copy of publicCopy) {
			expect(copy).not.toMatch(/magnetic[- ]pinch|discharge simulation/i);
		}
	});

	it('keeps generated agent descriptions aligned with the registry', () => {
		for (const output of generated) {
			expect(output).toContain(PRESET_BY_ID.Plasma.blurb);
		}
	});
});

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
		expect(out).toContain('autoPerformanceTargetFrameMs');
		expect(out).toContain('maxPixelRatio');
		// All thirteen public components must be listed (count must match the prose).
		for (const c of ['Fluid', 'FluidBackground', 'FluidReveal', 'FluidDistortion', 'FluidStick', 'FluidText', 'InkPaper', 'LiquidButton', 'LiquidSegmented', 'LiquidDropZone', 'LiquidCaustics', 'FoilSwitch', 'EnamelText'])
			expect(out, c).toContain(`<${c}>`);
		for (const p of PRESETS) expect(out, p.id).toContain(`**${p.id}**`);
		expect(out).toContain('EnamelText');
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
