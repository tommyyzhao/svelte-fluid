<script lang="ts">
	import EffectSurface from '../../../../experiments/liquid/EffectSurface.svelte';
	import { createFilament } from '../../../../experiments/liquid/filament.js';
	let surface = $state<{ demo: () => void; reset: () => void }>();
	let interactive = $state(false);
</script>

<svelte:head><title>Still connected — a coherent filament</title><meta name="robots" content="noindex" /></svelte:head>

<main>
	<header><a href="/lab/interfaces">fluid <span>/ material studies</span></a><p>07 — FORM & TENSION</p></header>
	<section aria-labelledby="title">
		<div class="intro"><p class="eyebrow">A line with a little more presence.</p><h1 id="title">Still <em>connected.</em></h1><p class="invitation">Move through it.<br />The line bends. The light follows.</p></div>
		<div class="filament">
			<div class="annotation" aria-hidden="true"><span>ONE CONTINUOUS STRAND</span><span>VOLUME, NOT A STROKE</span></div>
			<EffectSurface bind:this={surface} bind:interactive factory={createFilament} label="A continuous round metallic filament. Pointer movement bends the strand without clicking; overlapping portions have real depth." />
			<span class="registration top" aria-hidden="true">+</span><span class="registration bottom" aria-hidden="true">+</span>
		</div>
		<div class="toolbar"><p>{interactive ? 'Brush past the strand. No click needed.' : 'The material rests when motion is unavailable.'}</p><div><button onclick={() => surface?.demo()} disabled={!interactive}>Send a gesture <span aria-hidden="true">↗</span></button><button onclick={() => surface?.reset()} disabled={!interactive}>Settle <span aria-hidden="true">↺</span></button></div></div>
	</section>
	<div class="colophon"><p>A surface can be quiet<br /><em>and still have depth.</em></p><details><summary>Under the surface <span aria-hidden="true">+</span></summary><p>One elastic closed curve, evaluated as round 3D geometry. Its shape stays connected while bending. Broad studio reflections and depth-tested overlaps reveal the cross-section.</p><p>128 simulation nodes, independently tessellated to the physical display pixels. Native-resolution four-sample edge coverage. No bitmap, particle fragments, or lower-resolution canvas substitution.</p><p>This is an illustrative anchored elastic curve, not an inextensible rope or a collision-solving liquid. The high-resolution renderer has a 256 MiB live budget, including one resolved canvas, and a 384 MiB bound during resize. Unsupported sizes show a fallback.</p></details></div>
	<footer><a href="/lab/interfaces">All material studies <span aria-hidden="true">↗</span></a><p>Small state. A continuous surface.</p></footer>
</main>

<style>
	:global(body) { margin: 0; background: #ede9e0; color: #312d29; }
	main { max-width: 1560px; margin: 0 auto; padding: 0 42px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
	a { color: inherit; text-decoration: none; }
	header { display: flex; justify-content: space-between; align-items: center; gap: 22px; min-height: 88px; border-bottom: 1px solid #312d2929; }
	header a { font-size: 20px; font-weight: 650; letter-spacing: -.75px; }
	header a span { color: #938a80; font-size: 12px; font-weight: 400; letter-spacing: -.1px; margin-left: 5px; }
	header p { font-size: 9px; letter-spacing: .11em; color: #938a80; }
	.intro { position: relative; padding: 40px 0 29px; }
	.eyebrow { color: #a0694b; text-transform: uppercase; font-size: 9px; letter-spacing: .12em; margin: 0 0 16px; }
	h1 { margin: 0; font-family: Georgia, 'Times New Roman', serif; font-weight: 400; font-size: clamp(54px, 6.7vw, 98px); letter-spacing: -.063em; line-height: 1.03; }
	h1 em { font-weight: 400; color: #746c63; }
	.invitation { position: absolute; right: 0; bottom: 35px; font-size: 12px; line-height: 1.7; color: #938a80; margin: 0; }
	.filament { position: relative; height: clamp(410px, 45vw, 660px); background: radial-gradient(ellipse at 52% 52%, #24242a, #111417 60%, #0b0e11); overflow: hidden; }
	.filament :global(.effect) { background: transparent; }
	.filament :global(.status) { font-size: 8px; left: 24px; bottom: 20px; color: #8d969f; background: transparent; padding: 0; }
	.annotation { position: absolute; top: 24px; left: 24px; right: 24px; z-index: 2; display: flex; justify-content: space-between; font-size: 7px; letter-spacing: .13em; color: #767b81; pointer-events: none; }
	.registration { position: absolute; right: 24px; z-index: 2; color: #555e66; font-size: 17px; font-weight: 300; pointer-events: none; }
	.registration.top { top: 48%; }.registration.bottom { bottom: 20px; }
	.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 20px; border-bottom: 1px solid #312d2929; padding: 17px 0; }
	.toolbar p { font-size: 10px; line-height: 1.6; color: #938a80; margin: 0; }
	.toolbar > div { display: flex; gap: 10px; }
	button { padding: 11px 15px; border: 1px solid #312d2938; color: #494039; background: transparent; font: inherit; font-size: 10px; cursor: pointer; }
	button:first-child { background: #39312b; border-color: #39312b; color: #f0e9df; }
	button:hover:not(:disabled) { background: #ab7253; color: #fff1df; border-color: #ab7253; }
	button:disabled { opacity: .4; cursor: default; }
	button span { margin-left: 18px; }
	a:focus-visible, button:focus-visible, summary:focus-visible { outline: 2px solid #ad714e; outline-offset: 5px; }
	.colophon { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; padding: 36px 0 44px; }
	.colophon > p { margin: 0; font: 400 29px/1.23 Georgia, serif; letter-spacing: -.9px; }
	.colophon em { color: #8e8073; }
	details { align-self: start; font-size: 11px; color: #887b6e; line-height: 1.8; }
	summary { display: flex; justify-content: space-between; cursor: pointer; list-style: none; font-size: 10px; color: #675a4f; border-bottom: 1px solid #312d2920; padding-bottom: 9px; }
	summary::-webkit-details-marker { display: none; }
	footer { display: flex; justify-content: space-between; gap: 20px; border-top: 1px solid #312d2929; padding: 22px 0 28px; font-size: 9px; color: #938a80; }
	footer p { margin: 0; }footer a span { margin-left: 12px; }
	@media (max-width: 850px) { main { padding: 0 24px; } .invitation { display: none; } .colophon { gap: 35px; } }
	@media (max-width: 520px) { main { padding: 0 17px; } header { min-height: 75px; } header a span { display: none; } header p { font-size: 7px; } .intro { padding: 31px 0 24px; } h1 { font-size: 52px; } .eyebrow { font-size: 8px; } .filament { height: 410px; } .annotation { left: 17px; right: 17px; top: 19px; font-size: 6px; } .annotation span:last-child { max-width: 67px; text-align: right; line-height: 1.6; } .registration { right: 17px; } .filament :global(.status) { left: 17px; bottom: 17px; font-size: 7px; } .toolbar { display: block; padding: 14px 0 18px; } .toolbar > div { margin-top: 14px; } button { flex: 1; } .colophon { grid-template-columns: 1fr; gap: 23px; padding: 27px 0; } .colophon > p { font-size: 26px; } footer { font-size: 8px; } }
</style>
