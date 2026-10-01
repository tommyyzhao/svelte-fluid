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
export const DEFAULT_SITE = 'https://svelte-fluid.dev';

const COMPONENTS: Array<{ name: string; summary: string }> = [
	{ name: 'Fluid', summary: 'Core component. Renders the native WebGPU fluid sim on a canvas; accepts all FluidConfig props.' },
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
		['Components', '/docs/components', 'six fluid components and three experimental material treatments, props, examples'],
		['Configuration', '/docs/configuration', 'full FluidConfig prop reference (70+ props)'],
		['Container shapes', '/docs/shapes', 'ContainerShape variants and fields'],
		['Presets', '/docs/presets', 'all 14 presets with configs and playground links'],
		['Imperative API', '/docs/api', 'FluidHandle, RGB, PresetSplat'],
		['Splash cursor recipe', '/docs/recipes/splash-cursor', 'full-viewport pointer-following fluid cursor; copy-paste snippet or `npx shadcn-svelte@latest add ' + site + '/r/splash-cursor.json`']
	];
	return [
		'# svelte-fluid',
		'',
		'> Native WebGPU Navier–Stokes fluid simulation as a Svelte 5 component library. Shared-device, resize-stable, deterministic seeding. MIT licensed, zero runtime dependencies.',
		'',
		'svelte-fluid renders interactive fluid on a canvas through a thin Svelte 5 wrapper around a framework-agnostic native WebGPU engine derived from Pavel Dobryakov\'s WebGL-Fluid-Simulation. Six components and fourteen zero-config presets. Requires Svelte 5 and a usable WebGPU adapter.',
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
		'> Native WebGPU Navier–Stokes fluid simulation as a Svelte 5 component library.',
		'> Shared-device, resize-stable, deterministic seeding. MIT, zero runtime deps.',
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
		'- A thin Svelte 5 component (`<Fluid>`) hands a `<canvas>` to a framework-agnostic `FluidEngine`. The engine never imports Svelte.',
		'- Live components share one WebGPU device, WGSL module cache, pipeline cache, and RAF scheduler. Each instance owns only fields, masks, uniforms, bind groups, input, and its canvas context.',
		'- The sim is a real incompressible fluid solver: advection → (viscosity) → divergence → pressure (Jacobi) → gradient subtract, then dye advection, vorticity confinement (`curl`), bloom/sunrays/shading display.',
		'- Determinism and resize: pass `seed` for reproducible opening splats. Resize preserves dye/velocity/pressure and rebuilds fields only when their computed extents change; `maxPixelRatio` caps physical DPR at 2 by default (`null` opts into native DPR).',
		'- Lifecycle: WebGPU acquisition is deferred to `onMount` (SSR-safe) and exposed by `onReady`. `autoPause` stops offscreen work; `lazy` releases per-instance fields while the shared device/pipelines stay warm.',
		'- Resilience: device loss reconstructs every affected instance on a fresh shared generation. If WebGPU is unavailable, `<Fluid>` renders a `fallback`, `poster`, or accessible `backColor` fill. Use async `isFluidGpuAvailable()` for your own gate; `requireHardwareAcceleration` rejects software adapters.',
		'- Runtime prop changes go through `setConfig`. Scalar coefficients and advection-scheme changes are hot; structural bursts coalesce behind one in-flight transition. Resolution changes preserve fields, scalar-layout changes clear scalar state, and geometry-topology changes reset the simulation so walls cannot retain hidden fluid. Late scoped WebGPU validation/OOM errors fail that instance closed; seed and opening splats are construct-only.',
		'- `autoPerformance` is opt-in. Under sustained live-frame load above `autoPerformanceTargetFrameMs` (default 1000/60), it lowers pressure iterations and then substeps; it never auto-restores, and deterministic internal measurement runs ignore it.',
		"- `advectionScheme: 'maccormack'` is hot, velocity-only, and best for flow/structured scenes; diffuse decorative dye can look angular. Default is `'semilagrangian'`.",
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
		'- Physics: `curl`, `densityDissipation`, `velocityDissipation`, `advectionScheme`, `pressure`, `pressureIterations`, `viscosity`, `splatRadius`, `splatForce`, `maxTimeStep`, `substeps`, `autoPerformance`, `autoPerformanceTargetFrameMs`.',
		'- Auto splats: `autoSplatRate`, `autoSplatCount`, `autoSplatVelocityX/Y`, `autoSplatCenterX/Y`, `autoSplatBandWidth/Height`, `autoSplatSwirl`.',
		'- Visuals: `shading`, `colorful`, `bloom` (+`bloomIntensity`/`bloomThreshold`), `sunrays` (+`sunraysWeight`), `backColor` ({r,g,b} 0–255), `transparent`; component-level `maxPixelRatio` defaults to 2 and accepts `null` for native DPR.',
		'- Shapes: `containerShape` — `circle`, `roundedRect`, `frame`, `annulus`, or `svgPath`/text. Geometry is packed into physics and visual masks; `glass` adds fluid-gated refraction.',
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
		'<!-- fluid.handle.splat(x, y, dx, dy, color) | randomSplats(n) | pause() | resume() | isPaused | getPerformanceState() -->',
		'```',
		'',
		'## Presets (zero-config wrappers)',
		'',
		'Import and drop in — each pins a tuned `<Fluid>` config. Forwarded props: `width`, `height`, `class`, `style`, `seed`, `lazy`, `maxPixelRatio`, `splatOnHover`, `aria-label`, `backColor` (flow presets also `pointerInput`).',
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
		'- Dense pages: set `lazy` to release offscreen per-instance textures while retaining the shared device and warm pipelines.',
		'- Accessibility: respect `prefers-reduced-motion` in your own auto-animation triggers; pass `aria-label`. WebGPU-unavailable fallback exposes a visually-hidden message by default; override with `fallback`/`poster`/`fallbackText`.',
		'- Colors: `backColor` is 0–255 RGB; splat/dye colors in `presetSplats` are 0–1 (HDR, can exceed 1).',
		''
	);
	return lines.join('\n');
}
