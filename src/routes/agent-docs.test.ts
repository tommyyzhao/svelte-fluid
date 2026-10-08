import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { compile } from 'svelte/compiler';
import { buildLlmsTxt, buildLlmsFullTxt, buildSkillMd, DEFAULT_SITE } from './agent-docs.js';
import { PRESET_BY_ID, PRESETS } from '$lib/presets/registry.js';
import presetDocs from './docs/presets/+page.svelte?raw';
import landingPage from './+page.svelte?raw';
import readme from '../../README.md?raw';

describe('generated API reference', () => {
	const filename = decodeURIComponent(new URL('../lib/engine/types.ts', import.meta.url).pathname);
	const program = ts.createProgram([filename], { strict: true, skipLibCheck: true });
	const checker = program.getTypeChecker();
	const source = program.getSourceFile(filename)!;
	const types = new Map(source.statements.filter(ts.isInterfaceDeclaration).map((node) => [node.name.text, checker.getTypeAtLocation(node)]));
	const out = buildSkillMd();

	it('documents the generic dye default and explicit legacy override', () => {
		for (const doc of [out, buildLlmsFullTxt()]) {
			expect(doc).toContain('Dye grid resolution. Default 512; set 1024 to restore');
		}
		expect(readme).toContain('| `dyeResolution` | `number` | `512` |');
	});

	it('every table prop exists in its corresponding public type, including inheritance', () => {
		let typeName = '';
		let count = 0;
		for (const line of out.split('\n')) {
			if (line.startsWith('## FluidConfig')) typeName = 'FluidConfig';
			if (line.startsWith('### Shared fallback') || line.startsWith('### Fluid sizing')) typeName = 'FluidProps';
			const heading = /^### (\w+)(?:\s|$)/.exec(line)?.[1];
			if (heading && types.has(heading)) typeName = heading;
			if (line.startsWith('FlowSourceBase fields')) typeName = 'FlowSourceBase';
			const prop = /^\| `([^`]+)`/.exec(line)?.[1];
			if (!prop) continue;
			const type = types.get(typeName);
			expect(type, typeName).toBeDefined();
			expect(checker.getPropertyOfType(type!, prop), `${typeName}.${prop}`).toBeDefined();
			count++;
		}
		expect(count).toBeGreaterThan(200);
	});

	it('shared config and fallback rows remain accepted by every fluid wrapper', () => {
		const configProps = checker.getPropertiesOfType(types.get('FluidConfig')!).map((prop) => prop.name);
		const fallbackProps = ['fallback', 'poster', 'posterAlt', 'fallbackText', 'onReady', 'onError'];
		for (const component of ['Fluid', 'FluidBackground', 'FluidReveal', 'FluidDistortion', 'FluidStick', 'FluidText']) {
			const type = types.get(`${component}Props`)!;
			for (const prop of [...configProps, ...fallbackProps]) {
				expect(checker.getPropertyOfType(type, prop), `${component}Props.${prop}`).toBeDefined();
			}
		}
	});

	it('covers every config and own component prop with its source type', () => {
		for (const node of source.statements.filter(ts.isInterfaceDeclaration)) {
			if (node.name.text !== 'FluidConfig' && !node.name.text.endsWith('Props')) continue;
			// Presets are Pick type aliases; their narrow surface is described separately.
			for (const prop of node.members.filter(ts.isPropertySignature)) {
				const type = prop.type!.getText(source).replace(/\s+/g, ' ').replace(/\|/g, '\\|');
				expect(out, `${node.name.text}.${prop.name.getText(source)}`).toContain(`| \`${prop.name.getText(source)}\``);
				expect(out).toContain(`| \`${type}\` |`);
			}
		}
	});

	it('all full-reference Svelte snippets compile as complete components', () => {
		const snippets = [...buildLlmsFullTxt().matchAll(/```svelte\n([\s\S]*?)\n```/g)];
		expect(snippets.length).toBeGreaterThan(14);
		for (const [index, match] of snippets.entries()) {
			expect(() => compile(match[1], { filename: `agent-docs-${index}.svelte`, generate: 'server' })).not.toThrow();
		}
	});

	it('states wrapper limits, sizing, typed handles and visible background containment', () => {
		expect(out).toContain('do NOT accept `aria-label`');
		expect(out).toContain('Numeric dimensions are CSS pixels');
		expect(out).toContain('$state<{ handle: FluidHandle } | undefined>(undefined)');
		expect(out).not.toContain('\n  let fluid;');
		expect(out).toContain('opaque full-page children hide it');
		expect(out).toContain('exclude` queries ONLY descendants');
	});
});

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
		expect(out).toContain('maxFps');
		expect(out).toContain('Maximum PRESENTED frames per second');
		expect(out).toContain('simulation still advances every animation frame');
		// All thirteen public components must be listed (count must match the prose).
		for (const c of ['Fluid', 'FluidBackground', 'FluidReveal', 'FluidDistortion', 'FluidStick', 'FluidText', 'InkPaper', 'LiquidButton', 'LiquidSegmented', 'LiquidDropZone', 'LiquidCaustics', 'LiquidToggle', 'EnamelText'])
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
