<script lang="ts">
	import MaterialSurface from '../../../../experiments/liquid/MaterialSurface.svelte';
	import { createStressGlass, type StressGlass } from '../../../../experiments/liquid/stress-glass.js';
	let surface = $state<{ demo(): void; reset(): void; refresh(): void }>();
	let model: StressGlass | undefined;
	let available = $state(false), interactive = $state(false), load = $state(0.52);
	async function factory(device: GPUDevice, format: GPUTextureFormat) { model = await createStressGlass(device, format); model.setLoad(load); return model; }
	function changeLoad(value: number) { load = value; model?.setLoad(value); surface?.refresh(); }
</script>

<svelte:head><title>Under pressure — stress-visible glass</title><meta name="robots" content="noindex" /></svelte:head>
<main>
	<header><a href="/lab/interfaces">fluid <span>/ material studies</span></a><span>11 — LIGHT REVEALS FORCE</span></header>
	<section aria-labelledby="title">
		<div class="intro"><p class="eyebrow">What the eye cannot normally see.</p><h1 id="title">Under <em>pressure.</em></h1><p class="invitation">A clear coin. Two quiet forces.<br />The stress becomes the color.</p></div>
		<div class="specimen"><div class="labels" aria-hidden="true"><span>POLARIZED LIGHT / FINITE CONTACT</span><span>SPECIMEN 011</span></div><MaterialSurface bind:this={surface} bind:available bind:interactive {factory} settleMs={1400} label="A glass coin compressed between two visible pads. Move across the coin to change compression; moving away releases it. Colored photoelastic fringes show the stress." /></div>
		<div class="toolbar"><label>Set compression <input type="range" min="0" max="1" step="0.01" value={load} oninput={(event) => changeLoad(+event.currentTarget.value)} disabled={!available} /></label><div><button onclick={() => surface?.demo()} disabled={!interactive}>Apply a gesture ↗</button><button onclick={() => changeLoad(0)} disabled={!available}>Release</button></div></div>
	</section>
	<div class="notes"><p>Not color added to glass.<br /><em>Force, made visible.</em></p><details><summary>Inside the specimen</summary><p>A linear-elastic circular disk under uniform radial compression over two opposing finite arcs. The in-plane principal-stress difference follows Hung &amp; Ma’s closed-form solution (2003, equation 23). More load raises fringe order; release removes the optical bands.</p><p>The illustration uses three wavelengths in a circular dark-field polariscope, with native-pixel fringe filtering. Pad travel and the glass bevel are visual cues, not a solved displacement field. This is not a calibrated material or arbitrary point-force model.</p><p>One 32-byte uniform. No texture, physics grid or compute dispatch. Native output at actual DPR; the same analytic field is evaluated at every pixel. Static slider controls also work with reduced motion.</p><a href="https://scholars.lib.ntu.edu.tw/bitstreams/8d5df83d-88fe-4ef1-bbf1-e244e0f92967/download" target="_blank" rel="noreferrer">Primary stress solution ↗</a></details></div>
	<footer><a href="/lab/interfaces">All material studies ↗</a><span>Small state. Legible laws.</span></footer>
</main>

<style>
	:global(body) { margin: 0; background: #e9e9df; color: #263a3b; }
	main { max-width: 1500px; margin: auto; padding: 0 42px; font-family: 'Helvetica Neue', Arial, sans-serif; }
	a { color: inherit; text-decoration: none; } header, footer { display: flex; justify-content: space-between; gap: 20px; align-items: center; padding: 28px 0; border-bottom: 1px solid #263a3b2c; } header a { font-size: 20px; letter-spacing: -.7px; font-weight: 600; } header a span, header > span { color: #778b87; font-size: 9px; font-weight: 400; letter-spacing: .06em; } header a span { margin-left: 8px; }
	.intro { position: relative; padding: 40px 0 30px; } .eyebrow { text-transform: uppercase; letter-spacing: .12em; color: #7a8c72; font-size: 9px; } h1 { font: 400 clamp(52px, 7vw, 104px)/1.1 Georgia, serif; letter-spacing: -.055em; margin: 10px 0 0; } h1 em { color: #819187; } .invitation { position: absolute; right: 0; bottom: 32px; font-size: 12px; line-height: 1.7; color: #7d8c81; }
	.specimen { height: clamp(440px, 48vw, 700px); position: relative; overflow: hidden; border-radius: 3px; } .labels { position: absolute; inset: 24px 25px auto; display: flex; justify-content: space-between; z-index: 2; pointer-events: none; color: #9faeab; font-size: 8px; letter-spacing: .14em; } .specimen :global(.status) { color: #aab9af; font-size: 9px; background: #0d1a1caa; }
	.toolbar { display: flex; justify-content: space-between; gap: 25px; padding: 20px 0; border-bottom: 1px solid #263a3b2c; } label { display: flex; align-items: center; gap: 20px; font-size: 11px; } input { accent-color: #526e60; width: min(27vw, 270px); } .toolbar > div { display: flex; gap: 10px; } button { padding: 11px 16px; border: 1px solid #637b6960; background: transparent; color: #304b44; font: inherit; font-size: 10px; cursor: pointer; } button:first-child { background: #304b44; color: #ecede4; } button:disabled, input:disabled { opacity: .4; cursor: default; } button:hover:not(:disabled) { background: #849978; color: white; }
	.notes { display: grid; grid-template-columns: 1fr 1fr; gap: 70px; padding: 35px 0 42px; } .notes > p { font: 29px/1.3 Georgia, serif; margin: 0; letter-spacing: -.8px; } .notes em { color: #8a9884; } details { font-size: 11px; color: #738575; line-height: 1.8; } summary { cursor: pointer; border-bottom: 1px solid #263a3b25; padding-bottom: 8px; } details a { text-decoration: underline; } footer { border-top: 1px solid #263a3b2c; border-bottom: 0; font-size: 10px; color: #81917d; } :is(a, button, input, summary):focus-visible { outline: 2px solid #637b69; outline-offset: 5px; }
	@media(max-width: 700px) { main { padding: 0 20px; } .invitation { display: none; } header a span { display: none; } .toolbar { flex-wrap: wrap; } label { width: 100%; } input { flex: 1; } .notes { grid-template-columns: 1fr; gap: 25px; } .labels { font-size: 6px; inset: 20px 18px auto; } .specimen { height: 480px; } .intro { padding-top: 28px; } }
</style>
