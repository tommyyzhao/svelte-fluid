/*
 * Agent-facing docs generators (demo site).
 *
 * Build the real plain-text files served at /llms.txt, /llms-full.txt, and
 * /SKILL.md. The preset sections are generated from the registry + snippet
 * module (ADR-0040), so they never drift from what the components render.
 *
 * Pure string builders → unit-testable and used by prerendered +server routes.
 * Pass `site` (absolute origin incl. base path) so links resolve on whatever
 * host the static build is deployed to.
 */

import { PRESETS } from '$lib/presets/registry.js';
import { presetUsageSnippet, presetConfigSnippet } from '$lib/presets/snippet.js';

/** Default deploy origin (incl. GitHub Pages base path). Swappable per host. */
export const DEFAULT_SITE = 'https://tommyyzhao.github.io/svelte-fluid';

const COMPONENTS: Array<{ name: string; summary: string }> = [
	{ name: 'Fluid', summary: 'Core component. Renders the WebGL fluid sim on a canvas; accepts all FluidConfig props.' },
	{ name: 'FluidBackground', summary: 'Fixed full-viewport fluid behind page content, with DOM exclusion zones.' },
	{ name: 'FluidReveal', summary: 'Uses the fluid as an opacity mask to reveal slotted content underneath.' },
	{ name: 'FluidDistortion', summary: 'Velocity-driven image warping of a supplied src image.' },
	{ name: 'FluidStick', summary: 'Physics-level dye sticking to text/shape masks (e.g. a word).' },
	{ name: 'FluidText', summary: 'Fluid confined inside text letterforms — wraps Fluid with an svgPath text-mode container and auto aspect-ratio via measureText().' }
];

function presetLine(p: (typeof PRESETS)[number]): string {
	return `- ${p.id} (${p.category}): ${p.blurb}`;
}

/** Concise index per the llms.txt convention (llmstxt.org). */
export function buildLlmsTxt(site = DEFAULT_SITE): string {
	const docs = [
		['Getting Started', '/docs', 'install and first component'],
		['Components', '/docs/components', 'all six components, props, examples'],
		['Configuration', '/docs/configuration', 'full FluidConfig prop reference (70+ props)'],
		['Container shapes', '/docs/shapes', 'ContainerShape variants and fields'],
		['Presets', '/docs/presets', 'all 14 presets with configs and playground links'],
		['Imperative API', '/docs/api', 'FluidHandle, RGB, PresetSplat']
	];
	return [
		'# svelte-fluid',
		'',
		'> WebGL Navier–Stokes fluid simulation as a Svelte 5 component library. Multi-instance, resize-stable, deterministic seeding. MIT licensed, zero runtime dependencies.',
		'',
		'svelte-fluid renders interactive fluid on a canvas through a thin Svelte 5 wrapper around a framework-agnostic WebGL engine (a port of Pavel Dobryakov\'s WebGL-Fluid-Simulation). Six components and fourteen zero-config presets. Requires Svelte 5.',
		'',
		'## Docs',
		'',
		...docs.map(([t, u, d]) => `- [${t}](${site}${u}): ${d}`),
		'',
		'## Agent resources',
		'',
		`- [SKILL.md](${site}/SKILL.md): full agent skill — engine mental model, components, config, presets, API`,
		`- [llms-full.txt](${site}/llms-full.txt): the entire reference inlined in one file`,
		'',
		'## Presets',
		'',
		...PRESETS.map(presetLine),
		''
	].join('\n');
}

/** Full single-file reference (llms-full.txt). */
export function buildLlmsFullTxt(site = DEFAULT_SITE): string {
	return [
		buildSkillMd(site),
		'',
		'---',
		'',
		'## Every preset config (forkable <Fluid> recipe)',
		'',
		...PRESETS.flatMap((p) => [
			`### ${p.id} — ${p.name}`,
			'',
			p.blurb,
			'',
			'```svelte',
			presetConfigSnippet(p.id),
			'```',
			''
		])
	].join('\n');
}

/** The agent skill file (/SKILL.md): mental model + API + presets. */
export function buildSkillMd(site = DEFAULT_SITE): string {
	const lines: string[] = [];
	const push = (...l: string[]) => lines.push(...l);

	push(
		'# svelte-fluid — Agent Skill',
		'',
		'> WebGL Navier–Stokes fluid simulation as a Svelte 5 component library.',
		'> Multi-instance, resize-stable, deterministic seeding. MIT, zero runtime deps.',
		'',
		`Package: \`svelte-fluid\` · Requires Svelte 5 · Homepage: ${site}`,
		'',
		'## Install',
		'',
		'```sh',
		'npm install svelte-fluid   # or: bun add svelte-fluid',
		'```',
		'',
		'## Mental model (engine background)',
		'',
		'- A thin Svelte 5 component (`<Fluid>`) hands a `<canvas>` to a framework-agnostic `FluidEngine` (WebGL2/WebGL1). The engine never imports Svelte.',
		'- Each component instance owns its own GL context, FBOs, programs — many instances coexist on a page. Browsers cap WebGL contexts (~8–16/tab), so use `lazy` on dense pages.',
		'- The sim is a real incompressible fluid solver: advection → (viscosity) → divergence → pressure (Jacobi) → gradient subtract, then dye advection, vorticity confinement (`curl`), bloom/sunrays/shading display.',
		'- Determinism: pass `seed` for reproducible initial splats; the seed survives resize (the engine tears down + rebuilds on resize but keeps the seed).',
		'- Lifecycle: all WebGL access is deferred to `onMount` (SSR-safe). `autoPause` (default true) stops the RAF loop when offscreen/hidden; `lazy` defers engine creation until in view.',
		'- Runtime prop changes go through `setConfig`, which classifies each field: hot scalars (next frame), keyword recompiles (shading/bloom/sunrays/reveal/distortion), FBO rebuilds (resolutions), or construct-only (seed, initial splat counts).',
		'',
		'## Components',
		'',
		...COMPONENTS.map((c) => `- \`<${c.name}>\` — ${c.summary}`),
		'',
		'Minimal usage:',
		'',
		'```svelte',
		'<script>',
		"  import { Fluid } from 'svelte-fluid';",
		'</script>',
		'',
		'<div style="width: 100%; height: 420px">',
		'  <Fluid />',
		'</div>',
		'```',
		'',
		'`<Fluid>` fills its parent; no props are required. Give the parent a size.',
		'',
		'## Key config groups',
		'',
		'- Physics: `curl`, `densityDissipation`, `velocityDissipation`, `pressure`, `pressureIterations`, `viscosity`, `splatRadius`, `splatForce`, `maxTimeStep`, `substeps`.',
		'- Auto splats: `autoSplatRate`, `autoSplatCount`, `autoSplatVelocityX/Y`, `autoSplatCenterX/Y`, `autoSplatBandWidth/Height`, `autoSplatSwirl`.',
		'- Visuals: `shading`, `colorful`, `bloom` (+`bloomIntensity`/`bloomThreshold`), `sunrays` (+`sunraysWeight`), `backColor` ({r,g,b} 0–255), `transparent`.',
		'- Shapes: `containerShape` — `circle`, `roundedRect`, `frame`, `annulus` (analytical SDF) or `svgPath` (text/path rasterized to a mask). `glass` adds refraction.',
		'- Flow scenes: `flow` (FlowConfig) for solver-native sources/outlets/forces/scalar fields + `obstructions` the fluid flows around (`obstructionColor` paints them).',
		'- Presetting: `presetSplats` (construct-only initial splats), `seed`.',
		'',
		'See the full prop reference: ' + `${site}/docs/configuration`,
		'',
		'## Imperative API (FluidHandle via bind:this)',
		'',
		'```svelte',
		'<script>',
		'  let fluid;',
		'</script>',
		'<Fluid bind:this={fluid} />',
		'<!-- fluid.handle.splat(x, y, dx, dy, color) | randomSplats(n) | pause() | resume() | isPaused -->',
		'```',
		'',
		'## Presets (zero-config wrappers)',
		'',
		'Import and drop in — each pins a tuned `<Fluid>` config. Forwarded props: `width`, `height`, `class`, `style`, `seed`, `lazy`, `splatOnHover`, `aria-label`, `backColor` (flow presets also `pointerInput`).',
		'',
		...PRESETS.map((p) => `- **${p.id}** (${p.category}) — ${p.blurb}`),
		'',
		'```svelte',
		presetUsageSnippet('LavaLamp'),
		'```',
		'',
		'Full forkable recipes for every preset: ' + `${site}/llms-full.txt`,
		'',
		'## Gotchas',
		'',
		'- SSR: components are SSR-safe (engine starts in `onMount`); nothing renders fluid on the server.',
		'- Dense pages: set `lazy` to stay under the WebGL context cap.',
		'- Accessibility: respect `prefers-reduced-motion` in your own auto-animation triggers; pass `aria-label`.',
		'- Colors: `backColor` is 0–255 RGB; splat/dye colors in `presetSplats` are 0–1 (HDR, can exceed 1).',
		''
	);
	return lines.join('\n');
}
