<script lang="ts">
	import EffectSurface from '../../../../experiments/liquid/EffectSurface.svelte';
	import { createMembrane } from '../../../../experiments/liquid/membrane.js';
	let surface: { demo(): void; reset(): void };
	let interactive = $state(false);
</script>

<svelte:head><title>Interference — a membrane of light</title><meta name="robots" content="noindex" /></svelte:head>

<main>
	<header><a href="/lab/interfaces">matter / experiments</a><span>OPTICAL STUDY · 04</span><a href="/lab/interfaces/mercury">Next experiment ↗</a></header>
	<section class="intro"><div><p class="eyebrow">A surface, not a color gradient</p><h1>Interference.</h1></div><p>Move your hand.<br />Bend the surface.<br /><em>Let the light disagree.</em></p></section>
	<div class="membrane"><EffectSurface bind:this={surface} bind:interactive factory={createMembrane} label="Iridescent membrane: pointer movement deforms the surface and shifts interference bands" /></div>
	<div class="toolbar"><p>A dark film. Broad reflections. Color that follows the changing optical path.</p><div><button disabled={!interactive} onclick={() => surface?.demo()}>Send a wave <span>↗</span></button><button class="quiet" onclick={() => surface?.reset()}>Still the surface</button></div></div>
	<section class="notes"><h2>Not everything<br />needs to be a button.</h2><p>This experiment asks a smaller question: can a lightweight field feel like a sheet of material, with light that responds to its changing shape? The surface settles when you stop moving. No click or drag required.</p><details><summary>What is actually simulated?</summary><p>A 192 × 192 damped height-and-velocity field. A three-wavelength thin-film approximation changes color with thickness and angle; broad studio reflections reveal the shape. Not a calibrated membrane or a full spectral material model. No image textures or continuous idle animation.</p><p>GPU timing is measured separately at fixed sizes, not inferred from the animation frame rate. Phone battery and thermal behavior are still untested.</p></details></section>
	<footer><a href="/lab/interfaces">All material studies ↗</a><span>Private WebGPU R&D · effect first, integration later</span></footer>
</main>

<style>
	:global(body) { margin: 0; background: #08090d; color: #ecebf2; }
	main { max-width: 1480px; margin: auto; padding: 0 40px; font-family: Arial, sans-serif; }
	a { color: inherit; text-decoration: none; }
	header { display: flex; justify-content: space-between; align-items: center; gap: 25px; border-bottom: 1px solid #33333e; padding: 28px 0; font-size: 11px; }
	header > span { font-size: 9px; letter-spacing: .15em; color: #82818f; }
	.intro { display: flex; justify-content: space-between; align-items: end; gap: 30px; padding: 48px 0 36px; }
	.eyebrow { font-size: 10px; letter-spacing: .1em; color: #9c92c6; text-transform: uppercase; }
	h1 { font: 400 clamp(49px, 8vw, 112px)/1 Georgia, serif; letter-spacing: -.055em; margin: 18px 0 0; }
	.intro > p { font-size: 13px; color: #a4a0b5; line-height: 1.7; padding-bottom: 3px; }
	.intro em { color: #d1bbf4; }
	.membrane { height: clamp(360px, 48vw, 660px); border: 1px solid #44404d; overflow: hidden; border-radius: 3px; }
	.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 25px; padding: 18px 0 34px; border-bottom: 1px solid #33333e; }
	.toolbar p { font-size: 11px; line-height: 1.7; color: #9792aa; }
	.toolbar > div { display: flex; gap: 10px; flex-shrink: 0; }
	button { color: #0c0911; background: #c7b0ef; border: 1px solid #c7b0ef; padding: 12px 17px; font-size: 11px; cursor: pointer; border-radius: 2px; }
	button span { margin-left: 14px; }
	button:disabled { opacity: .4; cursor: default; }
	button.quiet { background: transparent; color: #b0a8c3; border-color: #3c3749; }
	.notes { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 45px; padding: 42px 0; }
	h2 { font: 400 30px/1.15 Georgia, serif; margin: 0; letter-spacing: -.025em; }
	.notes p { margin-top: 0; font-size: 12px; color: #9993ac; line-height: 1.9; }
	summary { color: #cdc2e4; cursor: pointer; font-size: 11px; margin-bottom: 17px; }
	footer { border-top: 1px solid #33333e; padding: 24px 0; display: flex; justify-content: space-between; gap: 25px; color: #8d869d; font-size: 10px; }
	a:focus-visible, button:focus-visible, summary:focus-visible { outline: 2px solid #d9c7fa; outline-offset: 5px; }
	@media(max-width: 720px) { main { padding: 0 19px; } header > span { display: none; } .intro { align-items: start; padding-top: 32px; } .intro > p { display: none; } .membrane { height: 480px; } .toolbar { display: block; } .toolbar > div { margin-top: 18px; } .notes { grid-template-columns: 1fr; gap: 25px; } footer { display: block; } footer span { display: block; margin-top: 12px; } }
</style>
