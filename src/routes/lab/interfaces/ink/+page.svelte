<script lang="ts">
	import MaterialSurface from '../../../../experiments/liquid/MaterialSurface.svelte';
	import { createCombedInk, inkProgram, type CombedInk } from '../../../../experiments/liquid/combed-ink.js';
	let surface = $state<{ refresh: () => void; reset: () => void }>();
	let model = $state<CombedInk>();
	let interactive = $state(false), available = $state(false), count = $state(4), reference = $state(false);
	const factory = async (device: GPUDevice, format: GPUTextureFormat) => {
		model = await createCombedInk(device, format, (value) => { count = value; });
		return model;
	};
	function program(n: number) { model?.setProgram(inkProgram(n)); surface?.refresh(); }
	function undo() { model?.undo(); surface?.refresh(); }
	function accuracy() { reference = !reference; model?.setAccuracy(reference ? 'reference' : 'brush'); surface?.refresh(); }
</script>

<svelte:head><title>Combed ink — material studies</title><meta name="robots" content="noindex" /></svelte:head>
<main>
	<header><a href="/lab/interfaces">fluid / material studies</a><span>08 — A MEMORY OF MOVEMENT</span></header>
	<section aria-labelledby="title">
		<div class="intro"><p class="eyebrow">Indigo. Copper. A little interference.</p><h1 id="title">Leave a<br /><em>lasting impression.</em></h1><p class="invitation">Comb the surface with a passing hand.<br />Nothing fades. Nothing is painted over.</p></div>
		<div class="sheet"><MaterialSurface bind:this={surface} bind:interactive bind:available {factory} settleMs={120} label="Cream, indigo and copper pigment bands. Moving across the sheet combs the existing pattern into marbled folds; marks persist until undone." /><span class="edition" aria-hidden="true">STUDY Nº 08 / COMBED INK</span></div>
		<div class="toolbar"><p aria-live="polite">{count} / 16 brush segments {count === 16 ? '— sheet full; undo or start anew.' : interactive ? '— move across the sheet, no click.' : '— still specimen; try a pass below.'}</p><div><button onclick={undo} disabled={!available || count === 0}>Undo</button><button onclick={() => program(0)} disabled={!available}>New sheet ↗</button></div></div>
		<div class="colophon"><p>Not a trail.<br /><em>A changed material.</em></p><div><p>This pattern is never dragged through an image buffer. Each physical pixel follows the brush history backwards, then finds its original pigment. Fine lines can stretch and fold without accumulating resampling blur.</p><div class="programs" aria-label="Deterministic brush histories">{#each [1, 4, 8, 16] as n}<button onclick={() => program(n)} disabled={!available}>{n} {n === 1 ? 'pass' : 'passes'}</button>{/each}</div><button class="reference" onclick={accuracy} disabled={!available} aria-pressed={reference}>{reference ? 'Tighter integration' : 'Standard integration'} · compare accuracy</button><details><summary>The honest version</summary><p>Mixwell’s adaptive-midpoint brush, adapted from the authors’ MIT-licensed SIGGRAPH 2026 implementation. The current full library selects this same brush; this comparison tightens its integration step fourfold, not a different Newton solver.</p><p>16 explicit operations, 528 bytes of GPU state, native output pixels and a post-warp analytic source footprint. No color-advection textures, automatic history eviction, idle evolution or low-resolution baking. This is a bounded illustrative marbling tool, not a general fluid simulation. Very compressed nonlinear folds may still exceed a local footprint approximation.</p><p>Work grows with pixel count and brush history. A full-width 3× sheet with 16 operations exceeded a 60fps GPU budget in the desktop test; the tighter integration is an accuracy reference, not a performance mode. Smaller component-sized specimens fare better. Neither is phone-performance proof.</p><a href="https://dougjam.github.io/mixwell-2026/">Research and original implementation ↗</a></details></div></div>
	</section>
	<footer><a href="/lab/interfaces">All material studies ↗</a><span>Small history. Lasting change.</span></footer>
</main>

<style>
	:global(body) { margin: 0; background: #f2eee4; color: #253b43; }
	main { max-width: 1220px; margin: auto; padding: 0 36px; font-family: 'Helvetica Neue', Arial, sans-serif; }
	a { color: inherit; text-decoration: none; }
	header, footer { display: flex; justify-content: space-between; gap: 20px; padding: 26px 0; font-size: 10px; border-bottom: 1px solid #253b4329; }
	header span { font-size: 8px; letter-spacing: .13em; color: #9a7760; }
	.intro { position: relative; padding: 38px 0 35px; }
	.eyebrow { color: #a56642; font-size: 9px; letter-spacing: .12em; text-transform: uppercase; }
	h1 { font: 400 clamp(48px, 6vw, 85px)/.98 Georgia, serif; letter-spacing: -.065em; margin: 20px 0 0; }
	h1 em { color: #8c684f; }
	.invitation { position: absolute; bottom: 38px; right: 0; font-size: 11px; line-height: 1.8; color: #7d817c; }
	/* An authored 1.8:1 sheet preserves the brush metric on phones too. */
	.sheet { aspect-ratio: 1.8; position: relative; overflow: hidden; box-shadow: 0 18px 38px #28352616; }
	.sheet :global(.material) { min-height: 0; background: repeating-linear-gradient(8deg, #e5d9b9 0 22px, #486071 28px 45px, #a36c48 53px, #e5d9b9 65px); }
	.sheet :global(.status) { font-size: 8px; }
	.edition { position: absolute; right: 19px; top: 18px; font-size: 7px; letter-spacing: .15em; color: #f4e7cb; background: #253b4380; padding: 8px; pointer-events: none; }
	.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 14px; padding: 19px 0; border-bottom: 1px solid #253b4329; }
	.toolbar p { margin: 0; color: #7d817c; font-size: 10px; }.toolbar div, .programs { display: flex; gap: 8px; }
	button { background: transparent; border: 1px solid #253b4338; padding: 10px 15px; font: inherit; font-size: 10px; color: inherit; cursor: pointer; }
	button:hover:not(:disabled), button[aria-pressed='true'] { background: #253b43; color: #f2eee4; }
	button:disabled { opacity: .4; cursor: default; }
	a:focus-visible, button:focus-visible, summary:focus-visible { outline: 2px solid #a56642; outline-offset: 4px; }
	.colophon { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; padding: 36px 0 44px; }
	.colophon > p { margin: 0; font: 30px/1.2 Georgia, serif; letter-spacing: -.7px; }.colophon em { color: #8c684f; }
	.colophon > div { font-size: 11px; color: #7d817c; line-height: 1.8; }.colophon > div > p { margin-top: 0; }
	.programs { margin-top: 20px; }.reference { margin: 10px 0 18px; width: 100%; }
	summary { cursor: pointer; border-bottom: 1px solid #253b4329; padding-bottom: 8px; }details a { color: #a56642; }
	footer { border-bottom: 0; border-top: 1px solid #253b4329; color: #7d817c; font-size: 9px; }
	@media (max-width: 750px) { main { padding: 0 19px; }.invitation { display: none; }.intro { padding: 28px 0; }.colophon { grid-template-columns: 1fr; gap: 24px; }.toolbar { flex-wrap: wrap; }header span { font-size: 6px; } }
</style>
