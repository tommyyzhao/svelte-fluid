<script lang="ts">
	import MaterialSurface from '../../../../experiments/liquid/MaterialSurface.svelte';
	import { createWickAndSwell, type WickAndSwellExperiment } from '../../../../experiments/liquid/wick-and-swell.js';
	let surface = $state<{ refresh: () => void; wake: () => boolean; reset: () => void }>();
	let specimen = $state<WickAndSwellExperiment>();
	let available = $state(false), interactive = $state(false), light = $state(228), drops = $state(3);
	let equal = $state(false), colorless = $state(false), baseline = $state(false);
	async function factory(device: GPUDevice, format: GPUTextureFormat) {
		const model = await createWickAndSwell(device, format); specimen = model;
		model.setLight(light * Math.PI / 180); return model;
	}
	function drop() {
		if (!specimen?.drop()) return; drops--;
		// One finite visible uptake snapshot also works with reduced motion.
		specimen.advance(0.75); surface?.refresh(); surface?.wake();
	}
	function advance() { specimen?.advance(4); surface?.refresh(); }
	function reset() { surface?.reset(); drops = 3; equal = false; }
	function turnLight(event: Event) {
		light = Number((event.currentTarget as HTMLInputElement).value);
		specimen?.setLight(light * Math.PI / 180); surface?.refresh();
	}
</script>

<svelte:head><title>Wick & swell — water changes the material</title><meta name="robots" content="noindex" /></svelte:head>

<main>
	<header><a href="/lab/interfaces">fluid <span>/ material studies</span></a><p>WATER / VOLUME / GIVE</p></header>
	<section aria-labelledby="title">
		<div class="intro"><div><p class="eyebrow">Not just a darker patch.</p><h1 id="title">Water changes<br /><em>what gives.</em></h1></div><p class="invitation">A dry sheet. Three drops.<br />First it drinks. Then it softens.</p></div>
		<div class="specimen">
			<div class="annotation" aria-hidden="true"><span>POROUS SHEET / FIXED OUTLINE</span><span>DRY LEFT · WATER RIGHT</span></div>
			<MaterialSurface bind:this={surface} bind:available bind:interactive {factory} settleMs={5000}
				oninterrupt={() => specimen?.endInput?.()}
				label="Matte porous paper. Add a finite drop to the right; absorbed water swells the surface and increases its compliance. Hover to indent, or compare equal pressure on the dry left and wet right." />
		</div>
		<div class="toolbar"><p>{interactive ? 'Move over the paper to feel its give. No click needed.' : 'Still specimen. The native controls also work without animation.'}</p><div><button onclick={drop} disabled={!available || drops === 0}>Add one drop <span>{drops} left</span></button><button onclick={advance} disabled={!available || drops === 3}>Advance wicking <span>+4 s</span></button><button onclick={reset} disabled={!available}>Fresh dry sheet <span>↺</span></button></div></div>
		<div class="switches">
			<button aria-pressed={equal} disabled={!available} onclick={() => { equal = !equal; specimen?.setEqualPressure(equal); surface?.refresh(); }}>Equal pressure <span>{equal ? 'On' : 'Off'}</span></button>
			<button aria-pressed={colorless} disabled={!available} onclick={() => { colorless = !colorless; specimen?.setColorless(colorless); surface?.refresh(); }}>Relief only <span>{colorless ? 'On' : 'Off'}</span></button>
			<button aria-pressed={baseline} disabled={!available} onclick={() => { baseline = !baseline; specimen?.setBaseline(baseline); surface?.refresh(); }}>Dry-material baseline <span>{baseline ? 'On' : 'Off'}</span></button>
		</div>
		<label class="lighting"><span>Rake the light <small>Relight the same raised surface; no water is added.</small></span><input type="range" min="0" max="360" step="1" value={light} oninput={turnLight} disabled={!available} /><output>{light}°</output></label>
	</section>
	<div class="colophon"><p>Moisture is a state.<br /><em>Softness is a consequence.</em></p><details><summary>What is actually being modeled?</summary><p>A finite pipette transfers water into a surface reservoir. That reservoir fills pores with capacity one; absorbed water spreads by conservative no-flux diffusion. Pore water plus surface water plus the remaining pipette is conserved. No animated noise creates the wetting front.</p><p>Saturation changes equilibrium relief and local pressure compliance. Equal pressure compares the same two pressure footprints. “Relief only” removes the wet-darkening cue. Geometry stays fixed: this is a 2.5D, fixed-porosity illustration, not a solid-volume, particle, fracture, or full poro-elasto-capillary solver.</p><p>The causal reduction is inspired by <a href="https://webspace.science.uu.nl/~telea001/uploads/Bibtex/li25_multiphase.pdf">Li et al., SIGGRAPH Asia 2025</a>, especially saturation-dependent stiffness and dilation. A 128 × 80 model is reconstructed smoothly at the actual display density. The specimen rests after interaction; “Advance wicking” explicitly advances its paused time.</p></details></div>
	<footer><a href="/lab/interfaces">All material studies ↗</a><p>Finite water. A different material.</p></footer>
</main>

<style>
	:global(body) { margin: 0; background: #e8e4d9; color: #343f33; }
	main { max-width: 1440px; margin: auto; padding: 0 40px; font-family: 'Helvetica Neue', Arial, sans-serif; } a { color: inherit; text-decoration: none; }
	header, footer { display: flex; justify-content: space-between; align-items: center; gap: 20px; border-bottom: 1px solid #343f3329; min-height: 82px; } header a { font-size: 21px; font-weight: 600; letter-spacing: -.8px; } header a span { font-size: 12px; font-weight: 400; letter-spacing: 0; color: #788174; margin-left: 7px; } header p, footer p { font-size: 9px; letter-spacing: .1em; color: #788174; }
	.intro { display: flex; justify-content: space-between; align-items: end; gap: 20px; padding: 36px 0 32px; } .eyebrow { text-transform: uppercase; letter-spacing: .13em; color: #74816a; font-size: 9px; margin: 0 0 15px; }
	h1 { font: 400 clamp(61px, 7vw, 104px)/.95 Georgia, serif; letter-spacing: -.065em; margin: 0; } h1 em { color: #7d8b69; font-weight: 400; } .invitation { margin: 0 0 6px; font-size: 12px; line-height: 1.7; color: #7b8174; }
	.specimen { position: relative; height: clamp(360px, 39vw, 580px); background: #383e33; overflow: hidden; } .specimen :global(.material) { background: radial-gradient(ellipse at center, #525a46, #30372d); } .specimen :global(.status) { font-size: 8px; background: #263026b8; color: #d2d7c6; }
	.annotation { position: absolute; top: 22px; left: 23px; right: 23px; z-index: 2; display: flex; justify-content: space-between; color: #b9c1aa; font-size: 7px; letter-spacing: .14em; pointer-events: none; }
	.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 17px 0; border-bottom: 1px solid #343f3329; } .toolbar p { margin: 0; color: #788174; font-size: 10px; line-height: 1.6; } .toolbar > div { display: flex; flex-wrap: wrap; gap: 8px; }
	button { border: 1px solid #343f3336; color: #45513c; background: transparent; padding: 12px 15px; font: inherit; font-size: 10px; cursor: pointer; } button span { margin-left: 15px; color: #89917d; } .toolbar button:first-child, button[aria-pressed='true'] { background: #4d6040; color: #eef0e7; border-color: #4d6040; } .toolbar button:first-child span, button[aria-pressed='true'] span { color: #c0cdae; } button:hover:not(:disabled) { border-color: #4d6040; } button:disabled, input:disabled { opacity: .45; cursor: default; }
	.switches { display: flex; gap: 9px; padding: 16px 0; border-bottom: 1px solid #343f3329; }
	.lighting { display: grid; grid-template-columns: 1fr minmax(120px, 310px) 40px; align-items: center; gap: 15px; padding: 19px 0; border-bottom: 1px solid #343f3329; font-size: 11px; } .lighting small { display: block; margin-top: 5px; color: #788174; font-size: 9px; } input { width: 100%; accent-color: #6a8153; } output { text-align: right; color: #788174; font-size: 10px; }
	.colophon { display: grid; grid-template-columns: 1fr 1fr; gap: 75px; padding: 33px 0 40px; } .colophon > p { margin: 0; font: 28px/1.23 Georgia, serif; letter-spacing: -.8px; } .colophon em { color: #869274; } details { font-size: 11px; line-height: 1.8; color: #75816d; } details a { text-decoration: underline; } summary { cursor: pointer; padding-bottom: 9px; border-bottom: 1px solid #343f3320; font-size: 10px; } footer { min-height: 70px; border-top: 1px solid #343f3329; border-bottom: 0; font-size: 9px; color: #788174; }
	a:focus-visible, button:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid #76905e; outline-offset: 4px; }
	@media (max-width: 700px) { main { padding: 0 18px; } header a span { display: none; } header p { font-size: 7px; } .intro { display: block; } .invitation { margin-top: 20px; font-size: 11px; } .specimen { height: 380px; } .annotation { font-size: 6px; left: 17px; right: 17px; } .annotation span:last-child { max-width: 78px; text-align: right; } .toolbar { display: block; } .toolbar > div { margin-top: 13px; } button { padding: 11px 12px; } button span { margin-left: 9px; } .switches { flex-wrap: wrap; } .lighting { grid-template-columns: 1fr 125px 28px; gap: 10px; } .lighting small { max-width: 145px; line-height: 1.5; } .colophon { grid-template-columns: 1fr; gap: 24px; } }
</style>
