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
import { presetUsageSnippet, presetScaffoldSnippet } from '$lib/presets/snippet.js';
import ts from 'typescript';
import typesSource from '$lib/engine/types.ts?raw';

// Site/build-only metadata. Public types stay the single source; nothing ships in dist.
const declarations = ts.createSourceFile('types.ts', typesSource, ts.ScriptTarget.Latest, true);
const interfaces = new Map(declarations.statements.filter(ts.isInterfaceDeclaration).map((node) => [node.name.text, node]));

function propTable(typeName: string, names?: string[]): string[] {
	const declaration = interfaces.get(typeName);
	if (!declaration) throw new Error(`Unknown props type: ${typeName}`);
	return [
		'| Prop | Type | Meaning / defaults |',
		'| --- | --- | --- |',
		...declaration.members.filter(ts.isPropertySignature).filter((member) => !names || names.includes(member.name.getText(declarations))).map((member) => {
			const name = member.name.getText(declarations);
			const type = member.type?.getText(declarations).replace(/\s+/g, ' ').replace(/\|/g, '\\|') ?? 'unknown';
			const comment = ts.getJSDocCommentsAndTags(member).map((doc) => doc.getText(declarations)).join(' ')
				.replace(/\/\*\*|\*\//g, '').replace(/^\s*\* ?/gm, '')
				.replace(/\{@link ([^}]+)\}/g, '`$1`').replace(/See ADR[^.]*\./g, '')
				.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
			return `| \`${name}\`${member.questionToken ? '' : ' **required**'} | \`${type}\` | ${comment} |`;
		}),
		''
	];
}

const FALLBACK_PROPS = ['fallback', 'poster', 'posterAlt', 'fallbackText', 'onReady', 'onError'];
const SIZING_PROPS = ['width', 'height', 'class', 'style', 'maxPixelRatio', 'lazy', 'autoPause'];
const FLUID_COMPONENTS = ['Fluid', 'FluidBackground', 'FluidReveal', 'FluidDistortion', 'FluidStick', 'FluidText'];

function componentPropReference(): string[] {
	return [
		'## Component prop reference', '',
		'Component props are not arbitrary HTML attributes. All six fluid components accept the FluidConfig table below; wrappers add only the props listed here. Use wrapper aliases instead of their equivalent low-level config fields; do not supply both. The seven interface primitives accept NO FluidConfig props.', '',
		'### Shared fallback props — all six fluid components', '',
		...propTable('FluidProps', FALLBACK_PROPS),
		'### Fluid sizing and lifecycle props', '',
		...propTable('FluidProps', SIZING_PROPS),
		'Numeric dimensions are CSS pixels: use `width={640}` / `height={360}`, not string values. For percentages, viewport units or responsive sizes, omit numeric dimensions and size the parent with CSS. FluidText has only numeric `height`, not `width`; FluidBackground has neither (its canvas is fixed to the viewport).', '',
		...FLUID_COMPONENTS.flatMap((name) => [
			`### ${name}Props`, '',
			...(name === 'Fluid' ? [
				'Fluid accepts all FluidConfig, fallback, sizing and lifecycle rows above, plus HTML canvas attributes such as `aria-label`, `aria-labelledby`, `aria-hidden`, `role`, `id` and event handlers. `class` / `style` apply to the wrapper, other HTML attributes to the canvas. Decorative canvas is aria-hidden by default.', ''
			] : [
				'Accepts all FluidConfig and shared fallback rows, plus ONLY these own props (no HTML attribute forwarding):', '',
				...propTable(`${name}Props`)
			])
		]),
		'### Wrapper behaviour and accessibility', '',
		'- FluidBackground, FluidReveal, FluidDistortion, FluidStick and FluidText do NOT accept `aria-label`, `aria-hidden`, `role`, `id` or arbitrary DOM events. Put additional semantics/events on a real outer DOM element, never spread HTML attributes into these wrappers.',
		'- FluidBackground is decorative by default. Keep meaningful page content inside it; do not aria-hide the whole wrapper including that content. `posterAlt` describes the unavailable-WebGL poster, not the live background.',
		'- FluidDistortion uses `posterAlt` as the live image accessible name AND fallback image alt; its fallback poster defaults to `src`. `src` is required; use a served URL, e.g. a file in SvelteKit `static/`. There is no `alt` prop. Use `strength` for warp amount, `intensity` for injected dye. `distortion` is a boolean mode flag, NOT a numeric strength.',
		'- FluidReveal already enables reveal mode. Use `sensitivity`, `curve`, `coverColor`, `accentColor`, `fringeColor`; no `mode` or `revealMode` selector. Unset cover/accent/fringe inherit engine defaults (white / deep navy / soft blue). Fade precedence: `fadeSpeed`, then `densityDissipation`, then `fadeBack` (true = 0.995, false = 1).',
		'- FluidReveal and FluidDistortion put the canvas ABOVE children; children are decorative visual content, not clickable controls. FluidReveal has its own pointer-move handler even with `pointerInput={false}`; that prop disables the inner Fluid input, not the wrapper handler. Reduced motion hides the reveal cover entirely. Reveal is not a security/privacy boundary: children remain in the DOM.',
		'- `autoReveal` / `autoDistort` enable a built-in path animation; speed uses `autoRevealSpeed` / `autoDistortSpeed`. They stop on first pointer-down/touch interaction. Do not build a second RAF loop for this. Distortion `initialSplats={0}` starts undistorted; `initialSplatCount` is a different inner-engine control.',
		'- FluidStick takes `text` or SVG path `d` (d wins), never image `src`. Its `text` supplies the live accessible name. `strength`, `stickyPressureAmount`, `amplify` map to sticky physics. `autoAnimate` stops on pointer activity or after `autoAnimateDuration` seconds (0 = until interaction).',
		'- FluidText requires `text`; it supplies role="img" and its accessible name, computes aspect ratio, builds its text container and defaults to a 4.5:1 outline halo. It is not native selectable heading text: keep document headings in the DOM. Supply `contrastColor` for gradients or changing page colours.', '',
		...COMPONENTS.filter((c) => !FLUID_COMPONENTS.includes(c.name)).flatMap((c) => [
			`### ${c.name}Props`, '', ...propTable(`${c.name}Props`),
			c.name === 'LiquidSegmented'
				? 'Only these props are accepted. `legend` names the group; `name` must be unique. `value` is bindable.'
				: 'Also accepts native attributes from its declared element type: InkPaper/LiquidCaustics = div; LiquidButton = button; LiquidDropZone = label (not the file input); LiquidToggle = input; EnamelText = span. Prefer visible native labels; decorative canvases are hidden from assistive tech.', ''
		])
	];
}

function structuredTypeReference(): string[] {
	const names = ['RGB', 'Vec2', 'PresetSplat', 'FlowConfig', 'FlowBoundary', 'FlowOutlet', 'FlowScalarField', 'FlowGridField', 'FlowVisualization', 'Obstruction', 'StickyMask', 'InkBrush', 'LiquidSegmentedOption'];
	const aliases = ['ToneMapping', 'LiquidTone', 'FlowMode', 'FlowBoundaryKind', 'FlowProfile', 'FlowScalarName', 'FlowAdvection', 'FlowVisualizationField', 'FlowTransfer', 'ContainerShape', 'FlowSource', 'FlowForce', 'PrescribedFlowField'];
	return [
		'## Structured values (nested config types)', '',
		'Coordinates are normalized x left→right, y bottom→top; DOM y must be flipped once. `backColor`, `contrastColor`, `obstructionColor` use RGB 0–255; splats, flow dye, reveal colours and autoSplatColor use 0–1 linear/HDR. `autoSplatColor` receives an engine 10× multiplier. RGB is an object, not a CSS colour string or array.', '',
		...names.flatMap((name) => [`### ${name}`, '', ...propTable(name)]),
		'### Discriminated shapes, sources and forces', '',
		'Optional fields use `?`. Required discriminants and fields must match a single variant. `ContainerShape.svgPath` needs `d` or `text`; `StickyMask` and `Obstruction` also use path/text, not an image URL. `fit` exists on Obstruction, NOT ContainerShape or StickyMask. `viewBox` is a four-number tuple, not a string.', '',
		...aliases.flatMap((name) => {
			const declaration = declarations.statements.find((node): node is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(node) && node.name.text === name);
			if (!declaration) throw new Error(`Unknown value type: ${name}`);
			const definition = declaration.type.getText(declarations).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
			return [`- \`${name}\`: \`${definition}\``, ''];
		}),
		'FlowSourceBase fields (shared by point/line/rect):', '', ...propTable('FlowSourceBase')
	];
}

/** Default deploy origin (incl. GitHub Pages base path). Swappable per host. */
export const DEFAULT_SITE = 'https://svelte-fluid.dev';

const COMPONENTS: Array<{ name: string; summary: string }> = [
	{ name: 'Fluid', summary: 'Core component. Renders the WebGL fluid sim on a canvas; accepts all FluidConfig props.' },
	{ name: 'FluidBackground', summary: 'Fixed full-viewport fluid behind page content, with DOM exclusion zones.' },
	{ name: 'FluidReveal', summary: 'Uses the fluid as an opacity mask to reveal slotted content underneath.' },
	{ name: 'FluidDistortion', summary: 'Velocity-driven image warping of a supplied src image.' },
	{ name: 'FluidStick', summary: 'Physics-level dye sticking to text/shape masks (e.g. a word).' },
	{ name: 'FluidText', summary: 'Fluid confined inside text letterforms — wraps Fluid with an svgPath text-mode container and auto aspect-ratio via measureText().' },
	{ name: 'InkPaper', summary: 'Interface primitive. A div whose background is paper taking watercolour from pointer/touch/pen strokes; children render above (`data-ink-resist` keeps a box dry, `data-ink-wick` blooms pigment on focus/hover). Props: paper, pigments, brush, seed.' },
	{ name: 'LiquidButton', summary: 'Interface primitive. Native <button> with a lit liquid surface that ripples on press. Props: tone, plus every button attribute.' },
	{ name: 'LiquidSegmented', summary: 'Interface primitive. Native radio group (fieldset/legend) whose selected option sits on a liquid lens. Props: options, bind:value, name, legend, tone, disabled.' },
	{ name: 'LiquidDropZone', summary: 'Interface primitive. Native file picker (label + hidden input) and drop target with a meniscus along its edge. Props: accept, multiple, label, onfiles, announce, tone, disabled, name.' },
	{ name: 'LiquidCaustics', summary: 'Interface primitive. Wrapper that lays caustic light over live content where the user acts; text stays crisp and 4.5:1. Props: tone, intensity.' },
	{ name: 'LiquidToggle', summary: 'Interface primitive. Native checkbox role="switch" with a sliding height-field liquid lens. Props: bind:checked, onchange, tone, disabled; label as children.' },
	{ name: 'EnamelText', summary: 'Interface primitive. Display text (a native <span>, place it inside your own <h2>) shaded as glazed enamel whose relief gives under a press; text stays selectable. Props: text, tone, color.' }
];

function presetLine(p: (typeof PRESETS)[number]): string {
	return `- ${p.id} (${p.category}): ${p.blurb}`;
}

/** Concise index per the llms.txt convention (llmstxt.org). */
export function buildLlmsTxt(site = DEFAULT_SITE): string {
	const docs = [
		['Getting Started', '/docs', 'install and first component'],
		['Components', '/docs/components', 'all thirteen components, props, examples, keyboard and reduced-motion behaviour'],
		['Configuration', '/docs/configuration', 'full FluidConfig prop reference (70+ props)'],
		['Container shapes', '/docs/shapes', 'ContainerShape variants and fields'],
		['Presets', '/docs/presets', 'all 14 presets with configs and playground links'],
		['Imperative API', '/docs/api', 'FluidHandle, RGB, PresetSplat'],
		['Splash cursor recipe', '/docs/recipes/splash-cursor', 'full-viewport pointer-following fluid cursor; copy-paste snippet or `npx shadcn-svelte@latest add ' + site + '/r/splash-cursor.json`']
	];
	return [
		'# svelte-fluid',
		'',
		'> WebGL Navier–Stokes fluid simulation as a Svelte 5 component library. Multi-instance, resize-stable, deterministic seeding. MIT licensed, zero runtime dependencies.',
		'',
		'svelte-fluid renders interactive fluid on a canvas through a thin Svelte 5 wrapper around a framework-agnostic WebGL engine (a port of Pavel Dobryakov\'s WebGL-Fluid-Simulation). Six fluid components, seven interface primitives (InkPaper, LiquidButton, LiquidSegmented, LiquidDropZone, LiquidCaustics, LiquidToggle, EnamelText) and fourteen zero-config presets. Requires Svelte 5.',
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
			presetScaffoldSnippet(p.id),
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
		'- Each fluid instance owns its fields and input. The first eight eligible Fluid canvases own contexts; later WebGL2 canvases share the host context/program cache with the interface primitives. WebGL1 and hardware-required instances own contexts. Use `lazy` on dense pages to release offscreen resources.',
		'- The interface primitives (`InkPaper`, `Liquid*`, `LiquidToggle`, `EnamelText`) are not `<Fluid>` wrappers: they render native elements with a decorative WebGL2 surface and share ONE WebGL2 context per page, so they do not count against the context cap. Without WebGL2 they fall back to plain native controls. They take no FluidConfig props.',
		'- The sim is a real incompressible fluid solver: advection → (viscosity) → divergence → pressure (Jacobi) → gradient subtract, then dye advection, vorticity confinement (`curl`), bloom/sunrays/shading display.',
		'- Determinism and resize: pass `seed` for reproducible initial splats. Resize preserves the live context, programs, dye, and velocity; rendering uses native DPR by default (`maxPixelRatio={2}` caps it).',
		'- Lifecycle: all WebGL access is deferred to `onMount` (SSR-safe). `autoPause` (default true) stops the RAF loop when offscreen/hidden; `lazy` defers engine creation until in view.',
		'- Resilience: if WebGL is permanently unavailable, `<Fluid>` never crashes — it renders a `fallback` snippet, else a `poster` image, else fills `backColor` + a visually-hidden message. `isWebGLAvailable({ failIfMajorPerformanceCaveat? })` is exported; `requireHardwareAcceleration` treats a software-only renderer as unavailable.',
		'- The public API is GL-type-neutral (1.0): `FBO`, `DoubleFBO`, `ExtInfo` and `ResolvedConfig` are not exported and no public signature mentions a `WebGL*` DOM type.',
		'- Runtime prop changes go through `setConfig`, which classifies each field: hot scalars (next frame), keyword recompiles (shading/bloom/sunrays/reveal/distortion), FBO rebuilds (resolutions), or construct-only (seed, initial splat counts).',
		'- `autoPerformance` is opt-in. Under sustained live-frame load above `autoPerformanceTargetFrameMs` (default 1000/60), it lowers effective Bucket-A quality only (`pressureIterations`, then `substeps`) and never auto-restores; deterministic `advance()` runs ignore it.',
		"- `advectionScheme: 'maccormack'` is construct-only, velocity-only, and best for flow/structured scenes; diffuse decorative dye can look angular. Default is `'semilagrangian'`, and no-linear-filtering devices fall back to it.",
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
		'Interface primitives (each is one native element; tone defaults to `\'auto\'`):',
		'',
		'```svelte',
		'<script>',
		"  import { InkPaper, LiquidButton, LiquidSegmented, LiquidDropZone, LiquidCaustics, LiquidToggle, EnamelText } from 'svelte-fluid';",
		"  let range = $state('week');",
		'  let on = $state(false);',
		"  let status = $state('');",
		"  const save = () => { status = 'Saved'; };",
		"  /** @param {File[]} files */",
		"  const upload = (files) => { status = `${files.length} files selected`; };",
		'</script>',
		'',
		'<InkPaper style="height: 240px; padding: 1.5rem"><h3>Notes</h3></InkPaper>',
		'<LiquidButton onclick={save}>Save</LiquidButton>',
		`<LiquidSegmented name="range" legend="Time range" options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }]} bind:value={range} />`,
		'<LiquidDropZone accept="image/*" onfiles={(files) => upload(files)} />',
		'<LiquidCaustics tone="dark"><p>Content</p></LiquidCaustics>',
		'<LiquidToggle bind:checked={on}>Notifications</LiquidToggle>',
		'<h2><EnamelText text="Harbour" /></h2>',
		'<p role="status">{status}</p>',
		'```',
		'',
		'All seven honour `prefers-reduced-motion` (stills) and keep native keyboard, touch and pen behaviour. Details: ' + `${site}/docs/components`,
		'',
		...componentPropReference(),
		'## FluidConfig — complete shared config prop table',
		'',
		'All fields optional. Engine defaults below can be tuned by wrapper/preset defaults and canvas-size/capability policy. Numeric values need braces, booleans use shorthand or `{false}`, enums use their exact string literals. Props update reactively, except fields documented construct-only. `lazy`, `autoPause`, `maxPixelRatio` also latch at mount. `paused` is a reactive simulation-step flag; `handle.pause()` stops the animation loop.',
		'',
		...propTable('FluidConfig'),
		...structuredTypeReference(),
		'## Strict TypeScript and JavaScript integrations',
		'',
		'Use `<script lang="ts">` with imported public types, or JSDoc in plain `<script>` under strict checkJs. Unannotated `let fluid;`, DOM refs and empty arrays become implicit any; object discriminants widen to string and viewBox arrays lose tuple length. Annotate at declaration, not by casting at the component call.',
		'',
		'```svelte',
		'<script lang="ts">',
		"  import { Fluid, type FluidHandle, type FlowConfig, type ContainerShape, type FluidConfig } from 'svelte-fluid';",
		'  let fluid = $state<{ handle: FluidHandle } | undefined>(undefined);',
		'  let panel = $state<HTMLDivElement | undefined>(undefined);',
		'  const panels: HTMLElement[] = [];',
		"  const obstructions: NonNullable<FluidConfig['obstructions']> = [];",
		"  const flow: FlowConfig = { mode: 'live' };",
		"  const shape: ContainerShape = { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.4 };",
		'</script>',
		'',
		'<div bind:this={panel} style="height: 320px">',
		'  <Fluid bind:this={fluid} {flow} {obstructions} containerShape={shape} />',
		'</div>',
		'<button onclick={() => fluid?.handle.randomSplats(3)}>Add colour</button>',
		'```',
		'',
		'JavaScript equivalents (inside a plain `<script>`):',
		'',
		'```js',
		"/** @type {{ handle: import('svelte-fluid').FluidHandle } | undefined} */",
		'let fluid = $state(undefined);',
		'/** @type {HTMLDivElement | undefined} */',
		'let panel = $state(undefined);',
		'/** @type {HTMLElement[]} */',
		'const panels = [];',
		"/** @type {NonNullable<import('svelte-fluid').FluidConfig['obstructions']>} */",
		'const obstructions = [];',
		"/** @type {import('svelte-fluid').FlowConfig} */",
		"const flow = { mode: 'live' };",
		"/** @type {import('svelte-fluid').ContainerShape} */",
		"const shape = { type: 'svgPath', text: 'A', font: 'bold 96px sans-serif' };",
		'```',
		'',
		'Prefer built-in `lazy` / `autoPause` to custom visibility observers. If measuring DOM yourself, guard undefined refs and do browser-only work in onMount; return observer/listener cleanup. For reactive typed arrays use `$state<NonNullable<FluidConfig[\'obstructions\']>>([])` or a JSDoc annotation on the variable. Obstruction is not a root export; reference it through `FluidConfig[\'obstructions\']`. The other named public types used in the examples are root exports.',
		'',
		'## Imperative API (FluidHandle via bind:this)',
		'',
		'`bind:this` binds the component exports object `{ handle: FluidHandle }`, NOT a FluidHandle itself and NOT a legacy Svelte class instance. All six fluid components export `handle`. Guard the component ref while unbound, before mount and during teardown. Calls before the inner engine exists silently no-op; use `onReady` for startup injections (fires again after lazy reconstruction).',
		'',
		'```svelte',
		'<script lang="ts">',
		"  import { Fluid, type FluidHandle } from 'svelte-fluid';",
		'  let fluid = $state<{ handle: FluidHandle } | undefined>(undefined);',
		'</script>',
		'',
		'<div style="height: 320px">',
		'  <Fluid bind:this={fluid} onReady={() => fluid?.handle.splat(0.5, 0.5, 100, 0, { r: 0.2, g: 0.5, b: 1 })} />',
		'</div>',
		'<button onclick={() => fluid?.handle.pause()}>Pause</button>',
		'<button onclick={() => fluid?.handle.resume()}>Resume</button>',
		'```',
		'',
		'FluidHandle methods: `splat(x: number, y: number, dx: number, dy: number, color: RGB): void`, `randomSplats(count: number): void`, `pause(): void`, `resume(): void`, readonly `isPaused: boolean`, `getPerformanceState(): PerformanceState`. No handle setter or `bind:handle`. `getPerformanceState()` is pull-based; `isPaused` is not a Svelte reactive store. dx/dy are raw velocity, not multiplied by splatForce.',
		'',
		'## FluidBackground containment and layering',
		'',
		'Wrap page content, rather than placing a self-closing background behind an opaque page. The canvas is fixed at z-index 0; its content wrapper is relative at z-index 1. Keep the content surface transparent wherever fluid should remain visible; opaque full-page children hide it. Never give the canvas a negative z-index behind the body, and avoid a transformed ancestor that traps fixed positioning.',
		'',
		'`exclude` queries ONLY descendants in the children content, not siblings or the whole document. Use a CSS selector, not manually measured obstructions, for DOM exclusion. The mask updates on scroll, resize and content mutation. Exclusions paint backColor (or transparency), not DOM erasure. Background defaults contain no initial/automatic splats: pointer motion drives it unless you supply those controls.',
		'',
		'```svelte',
		'<script>',
		"  import { FluidBackground } from 'svelte-fluid';",
		'</script>',
		'',
		'<FluidBackground exclude="[data-fluid-exclude]" style="color: white" minContrast={4.5}>',
		'  <main style="min-height: 100vh; padding: 2rem; background: transparent">',
		'    <h1>Moving colour, still content</h1>',
		'    <a data-fluid-exclude href="/" style="pointer-events: auto">Home</a>',
		'  </main>',
		'</FluidBackground>',
		'```',
		'',
		'The content wrapper has `pointer-events: none` so open space feeds the canvas. Restore `pointer-events: auto` on links/buttons/forms or a containing panel; preserve focus rings. The default pointerTarget is window, default splatOnHover true. FluidBackground constructs its own containerShape from exclude; use Fluid for a manually shaped canvas.',
		'',
		'Input limits: non-finite `splat()` arguments are ignored (one-time warning); `randomSplats(n)` backlog caps at 64 (16 consumed per frame), non-finite/negative `n` ignored; `initialSplatCount*` clamp 0–64, `autoSplatCount` 0–16; non-finite top-level numeric config values are ignored (previous value kept).',
		'',
		'## Presets (zero-config wrappers)',
		'',
		'Import and drop in — each pins a tuned `<Fluid>` config. Presets accept ONLY their narrow common props, NOT all FluidConfig, fallback or lifecycle props. Common: `width?: number`, `height?: number` (CSS pixels, braces, never CSS strings), `class?: string`, `style?: string`, `seed?: number`, `lazy?: boolean`, `maxPixelRatio?: number | null`, `maxFps?: number | null` (presentation only; solver keeps RAF cadence), `splatOnHover?: boolean`, `aria-label?: string`, `backColor?: RGB`. GasFlare/Venturi/TeslaValve/Karman additionally accept `pointerInput?: boolean`; FrameFluid additionally accepts `innerCornerRadius?: number` and `outerCornerRadius?: number`. Fork a raw Fluid recipe below when you need other controls.',
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
		'- Accessibility: all fluid components honour reduced motion; custom animation triggers must too. Only Fluid and preset wrappers accept `aria-label`; see the component-specific guidance above. WebGL-unavailable fallback exposes a visually-hidden message by default; all six fluid components accept `fallback`/`poster`/`posterAlt`/`fallbackText`, presets do not.',
		'- Colors: `backColor` is 0–255 RGB; splat/dye colors in `presetSplats` are 0–1 (HDR, can exceed 1).',
		''
	);
	return lines.join('\n');
}
