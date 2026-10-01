<script lang="ts">
	import MaterialSurface from '../../../../experiments/liquid/MaterialSurface.svelte';
	import { createVelvet, type VelvetExperiment } from '../../../../experiments/liquid/velvet.js';
	let surface = $state<{ refresh: () => void; reset: () => void }>();
	let specimen = $state<VelvetExperiment>();
	let interactive = $state(false), available = $state(false), light = $state(228), ribbon = 0;
	function brushRibbon(model = specimen) {
		if (!model) return;
		let last = [0.14, 0.5];
		for (let i = 1; i <= 40; i++) {
			const x = 0.14 + i / 40 * 0.72;
			const next = [x, 0.5 + Math.sin((i / 40 * 2 - 1) * Math.PI) * 0.17];
			if (ribbon % 2) model.brush(next, last); else model.brush(last, next);
			last = next;
		}
		ribbon++; surface?.refresh();
	}
	async function factory(device: GPUDevice, format: GPUTextureFormat) {
		const model = await createVelvet(device, format); specimen = model;
		model.setLight(light * Math.PI / 180);
		return model;
	}
	function turnLight(event: Event) {
		light = Number((event.currentTarget as HTMLInputElement).value);
		specimen?.setLight(light * Math.PI / 180); surface?.refresh();
	}
</script>

<svelte:head><title>Against the grain — velvet memory</title><meta name="robots" content="noindex" /></svelte:head>

<main>
	<header><a href="/lab/interfaces">fluid <span>/ material studies</span></a><p>10 — DIRECTION & MEMORY</p></header>
	<section aria-labelledby="title">
		<div class="intro"><p class="eyebrow">Nothing is added. Something is changed.</p><h1 id="title">Against<br /><em>the grain.</em></h1><p class="invitation">Brush one way. Then the other.<br />The surface remembers your hand.</p></div>
		<div class="velvet">
			<div class="annotation" aria-hidden="true"><span>BURGUNDY / POLAR NAP</span><span>LIGHT REVEALS THE MARK</span></div>
			<MaterialSurface bind:this={surface} bind:interactive bind:available {factory} settleMs={120} label="Dark burgundy velvet with directional pile memory. Move without clicking to lay the pile. Opposite strokes reflect light differently. Turn the light to inspect the same unchanged marks." />
			<span class="specimen" aria-hidden="true">01<br /><i>nap study</i></span>
		</div>
		<div class="toolbar"><p>{interactive ? 'No click needed. Brush back across your last mark.' : 'Still material. The controls can change the specimen without animation.'}</p><div><button onclick={() => brushRibbon()} disabled={!available}>Brush a ribbon <span aria-hidden="true">↗</span></button><button onclick={() => surface?.reset()} disabled={!available}>Groom clean <span aria-hidden="true">↺</span></button></div></div>
		<label class="lighting"><span>Turn the light <small>The pile stays exactly where you left it.</small></span><input type="range" min="0" max="360" step="1" bind:value={light} oninput={turnLight} disabled={!available} /><output>{light}°</output></label>
	</section>
	<div class="colophon"><p>Not a trace of color.<br /><em>A change of direction.</em></p><details><summary>Under the surface <span aria-hidden="true">+</span></summary><p>A small persistent field records signed pile lean, not brightness. Native-pixel anisotropic reflection and filtered procedural grain turn that direction into appearance. Reverse a stroke, or turn the light while keeping the state fixed, to see the distinction.</p><p>No individual hairs, color-advection buffer or idle simulation. This is an illustrative velvet-like optical material, not a measured fabric model. The fixed 96 × 64 lean field is independent of the display; presentation uses actual device pixels, including 3×. Unsupported sizes show a fallback.</p></details></div>
	<footer><a href="/lab/interfaces">All material studies <span aria-hidden="true">↗</span></a><p>Same surface. A different light.</p></footer>
</main>

<style>
	:global(body) { margin: 0; background: #eae3d9; color: #3e272c; }
	main { max-width: 1500px; margin: 0 auto; padding: 0 42px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
	a { color: inherit; text-decoration: none; }
	header { display: flex; justify-content: space-between; align-items: center; gap: 22px; min-height: 86px; border-bottom: 1px solid #3e272c26; }
	header a { font-size: 20px; font-weight: 650; letter-spacing: -.7px; }
	header a span { color: #92787c; font-size: 12px; font-weight: 400; letter-spacing: 0; margin-left: 5px; }
	header p { font-size: 9px; letter-spacing: .11em; color: #92787c; }
	.intro { position: relative; padding: 37px 0 29px; }
	.eyebrow { color: #9d5665; text-transform: uppercase; font-size: 9px; letter-spacing: .12em; margin: 0 0 17px; }
	h1 { margin: 0; font-family: Georgia, 'Times New Roman', serif; font-weight: 400; font-size: clamp(65px, 7vw, 108px); letter-spacing: -.068em; line-height: .92; }
	h1 br { display: none; } h1 em { font-weight: 400; color: #8b5b66; }
	.invitation { position: absolute; right: 0; bottom: 33px; font-size: 12px; line-height: 1.7; color: #92787c; margin: 0; }
	.velvet { position: relative; height: clamp(400px, 39vw, 600px); overflow: hidden; background: #5b1d2c; }
	.velvet :global(.material) { background: radial-gradient(ellipse at 40% 40%, #78283f, #3a1420); }
	.velvet :global(.status) { font-size: 8px; bottom: 19px; left: 23px; color: #e5aebf; background: #37071966; }
	.annotation { position: absolute; inset: 23px 24px auto; z-index: 2; display: flex; justify-content: space-between; font-size: 7px; letter-spacing: .14em; color: #e4a9b8; pointer-events: none; }
	.specimen { position: absolute; bottom: 23px; right: 24px; text-align: right; pointer-events: none; color: #e4a9b8; font-size: 16px; line-height: 1.25; font-family: Georgia, serif; }
	.specimen i { font-size: 11px; }
	.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 18px 0; border-bottom: 1px solid #3e272c26; }
	.toolbar p { font-size: 10px; line-height: 1.6; color: #92787c; margin: 0; }
	.toolbar > div { display: flex; gap: 9px; }
	button { padding: 11px 15px; border: 1px solid #3e272c38; color: #51373d; background: transparent; font: inherit; font-size: 10px; cursor: pointer; }
	button:first-child { background: #56333d; color: #f6e1e6; border-color: #56333d; }
	button:hover:not(:disabled) { background: #945366; border-color: #945366; color: white; }
	button:disabled, input:disabled { opacity: .4; cursor: default; } button span { margin-left: 18px; }
	.lighting { display: grid; grid-template-columns: 1fr minmax(120px, 310px) 38px; align-items: center; gap: 15px; padding: 19px 0; border-bottom: 1px solid #3e272c26; font-size: 11px; }
	.lighting small { display: block; margin-top: 5px; color: #92787c; font-size: 9px; } input { width: 100%; accent-color: #824555; } output { text-align: right; color: #92787c; font-size: 10px; }
	a:focus-visible, button:focus-visible, summary:focus-visible, input:focus-visible { outline: 2px solid #ac5a73; outline-offset: 5px; }
	.colophon { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; padding: 33px 0 41px; }
	.colophon > p { margin: 0; font: 400 28px/1.23 Georgia, serif; letter-spacing: -.9px; } .colophon em { color: #967c81; }
	details { font-size: 11px; color: #88727a; line-height: 1.8; } summary { display: flex; justify-content: space-between; cursor: pointer; list-style: none; font-size: 10px; border-bottom: 1px solid #3e272c20; padding-bottom: 9px; } summary::-webkit-details-marker { display: none; }
	footer { display: flex; justify-content: space-between; gap: 20px; border-top: 1px solid #3e272c26; padding: 22px 0 28px; font-size: 9px; color: #92787c; } footer p { margin: 0; } footer a span { margin-left: 12px; }
	@media (max-width: 1150px) { h1 br { display: block; } }
	@media (max-width: 650px) { main { padding: 0 18px; } header a span { display: none; } header p { font-size: 7px; } .intro { padding: 32px 0 26px; } h1 { font-size: 66px; } .invitation { position: static; margin-top: 20px; font-size: 11px; } .velvet { height: 420px; } .annotation { inset: 20px 18px auto; font-size: 6px; } .annotation span:last-child { max-width: 80px; text-align: right; line-height: 1.5; } .toolbar { display: block; } .toolbar > div { margin-top: 14px; } button { flex: 1; } .lighting { grid-template-columns: 1fr 130px 28px; gap: 10px; } .lighting small { max-width: 130px; line-height: 1.5; } .colophon { grid-template-columns: 1fr; gap: 24px; } }
</style>
