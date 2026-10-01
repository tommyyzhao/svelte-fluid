<script lang="ts">
	import MaterialSurface from '../../../../experiments/liquid/MaterialSurface.svelte';
	import { createContourWaves, DEFAULT_CONTOUR_OPTIONS, type ContourExperiment } from '../../../../experiments/liquid/contour-waves.js';
	let surface = $state<{ wake: () => boolean; refresh: () => void; reset: () => void }>();
	let available = $state(false), interactive = $state(false), speed = $state(DEFAULT_CONTOUR_OPTIONS.speed), damping = $state(DEFAULT_CONTOUR_OPTIONS.damping), baseline = $state(false);
	let model: ContourExperiment | undefined;
	async function factory(device: GPUDevice, format: GPUTextureFormat) { model = await createContourWaves(device, format); model.setOptions({ speed, damping, baseline }); return model; }
	function change() { model?.setOptions({ speed, damping, baseline }); surface?.refresh(); if (interactive) surface?.wake(); }
	function pulse(contour = 0, fraction = 0.15) {
		if (!available) return;
		model?.pulse(contour, fraction); surface?.refresh(); if (interactive) surface?.wake();
	}
	function demo() {
		// Simultaneous disturbances already produce crossing fronts. No route-
		// owned delayed input can outlive visibility, motion preference or hover.
		surface?.reset(); pulse(0, 0.08); pulse(0, 0.57); pulse(1, 0.2);
	}
	function reset() { surface?.reset(); }
</script>

<svelte:head><title>Contour echoes — a wave takes the long way</title><meta name="robots" content="noindex" /></svelte:head>

<main>
	<header><a href="/lab/interfaces">fluid <span>/ contour studies</span></a><p>THE EDGE REMEMBERS</p></header>
	<section aria-labelledby="title">
		<div class="intro"><div><p class="eyebrow">One touch. Two directions.</p><h1 id="title">The long<br /><em>way around.</em></h1></div><p class="invitation">A pulse follows a perimeter.<br />Another pulse changes the conversation.</p></div>
		<div class="specimen">
			<div class="annotation" aria-hidden="true"><span>CONTOUR ECHOES</span><span>{baseline ? 'CANNED HIGHLIGHT' : 'SUPERPOSED RIM WAVES'}</span></div>
			<MaterialSurface bind:this={surface} bind:available bind:interactive {factory} settleMs={Math.ceil(1000 * Math.log(6000) / damping)} label="Two separate polished closed contours. Sweep near an edge to launch waves in both directions. They travel around the rim, reunite and interfere with later pulses. The small circular contour is independent." />
		</div>
		<div class="controls">
			<div class="buttons"><button onclick={() => pulse() } disabled={!available}>Pulse the loop</button><button onclick={() => pulse(1, 0.15)} disabled={!available}>Pulse the dot</button><button onclick={demo} disabled={!available}>Crossing echoes</button><button onclick={reset} disabled={!available}>Reset</button></div>
			<label class="baseline"><input type="checkbox" checked={baseline} onchange={(event) => { baseline = event.currentTarget.checked; change(); }} disabled={!available} /> Compare canned highlight</label>
		</div>
		<div class="sliders">
			<label for="speed">Travel speed <output>{speed.toFixed(1)}</output><input id="speed" type="range" min="1.2" max="3.5" step="0.1" value={speed} oninput={(event) => { speed = Number(event.currentTarget.value); change(); }} disabled={!available} /></label>
			<label for="damping">Damping <output>{damping.toFixed(1)}</output><input id="damping" type="range" min="0.8" max="1.8" step="0.1" value={damping} oninput={(event) => { damping = Number(event.currentTarget.value); change(); }} disabled={!available} /></label>
		</div>
		<p class="hint">Brush near either edge—no click required. The smaller loop responds more lightly and settles sooner. Lower damping deliberately to explore longer echoes; the two loops never exchange energy.</p>
	</section>
	<div class="notes"><p>A boundary.<br /><em>Not a barrier.</em></p><details><summary>The smallest model that can answer back</summary><p>Twenty-four Fourier modes describe a one-dimensional damped elastic rim. A local displacement divides into waves moving in opposite directions; later inputs add to the existing motion. Speed uses the path’s actual arc length, so bends do not make a pulse accelerate. These are two authored rounded paths, not a general SVG importer or a two-dimensional water simulation.</p><p>Exact modal time evolution avoids finite-step wave dispersion. The periodic field reconstructs a smooth native-pixel beveled edge at your display’s actual resolution. Input strength and displacement limits scale with each contour’s size, and damping is normalized per circuit: the small dot no longer gets the large loop’s shove or rings through many extra laps. These are restrained authored defaults, not a promise that animation is comfortable for everyone.</p><p>The baseline keeps identical geometry but replaces the response with one traveling highlight per contour: each input restarts it. If that simpler version looks just as good, the wave state has not earned its keep. Reduced motion keeps a still, manually adjustable specimen; its pulse buttons do not start animation. Quiet motion sleeps without erasing its state.</p></details></div>
	<footer><a href="/lab/interfaces">All material studies ↗</a><span>Independent contours. Shared light.</span></footer>
</main>

<style>
	:global(body) { margin: 0; background: #eaece5; color: #243d3e; }
	main { max-width: 1280px; margin: auto; padding: 0 38px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
	a { color: inherit; text-decoration: none; }
	header { min-height: 84px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #243d3e29; gap: 20px; }
	header a { font-weight: 650; font-size: 21px; letter-spacing: -.8px; } header a span { font-weight: 400; font-size: 11px; color: #7d8e87; letter-spacing: 0; }
	header p, .eyebrow { font-size: 9px; letter-spacing: .12em; text-transform: uppercase; color: #72887d; }
	.intro { display: flex; justify-content: space-between; align-items: end; gap: 25px; padding: 35px 0 30px; }
	.eyebrow { margin: 0 0 17px; } h1 { margin: 0; font: 400 clamp(64px, 7.8vw, 103px)/.96 Georgia, serif; letter-spacing: -.067em; } h1 em { color: #75957f; }
	.invitation { font-size: 12px; line-height: 1.8; color: #7c8c80; margin-bottom: 5px; }
	.specimen { height: clamp(350px, 43vw, 560px); position: relative; overflow: hidden; background: #0c171b; }
	.specimen :global(.material) { background: transparent; }
	.specimen :global(.status) { background: transparent; color: #8baba3; font-size: 8px; padding: 0; left: 24px; bottom: 20px; }
	.annotation { position: absolute; top: 24px; left: 24px; right: 24px; display: flex; justify-content: space-between; z-index: 2; font-size: 7px; letter-spacing: .15em; color: #7d9f94; pointer-events: none; }
	.controls { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 20px 0; border-bottom: 1px solid #243d3e25; }
	.buttons { display: flex; flex-wrap: wrap; gap: 8px; } button { font: inherit; font-size: 10px; padding: 12px 15px; border: 1px solid #243d3e35; color: #36574d; background: transparent; cursor: pointer; }
	button:first-child { background: #315c4c; color: #eef1e7; border-color: #315c4c; } button:hover:not(:disabled) { background: #729b7f; color: #fff; } button:disabled, input:disabled { opacity: .4; cursor: default; }
	.baseline { display: flex; align-items: center; gap: 7px; font-size: 10px; color: #678173; }
	.sliders { display: grid; grid-template-columns: 1fr 1fr; gap: 50px; padding: 20px 0 4px; }
	.sliders label { font-size: 10px; color: #678173; } output { float: right; font-variant-numeric: tabular-nums; } input { accent-color: #4b7a61; } .sliders input { display: block; width: 100%; margin: 13px 0 5px; }
	.hint { font-size: 10px; color: #819183; line-height: 1.7; margin: 13px 0 0; }
	.notes { display: grid; grid-template-columns: 1fr 1fr; gap: 70px; margin: 38px 0; } .notes > p { margin: 0; font: 29px/1.2 Georgia, serif; letter-spacing: -.7px; } .notes em { color: #75957f; }
	details { color: #708376; font-size: 11px; line-height: 1.85; } summary { cursor: pointer; border-bottom: 1px solid #243d3e23; padding-bottom: 10px; }
	footer { display: flex; justify-content: space-between; gap: 20px; border-top: 1px solid #243d3e25; padding: 24px 0 28px; font-size: 9px; color: #7e8f81; }
	a:focus-visible, button:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid #5a896b; outline-offset: 5px; }
	@media (max-width: 780px) { main { padding: 0 20px; } .controls { align-items: start; flex-direction: column; } .sliders, .notes { gap: 25px; } }
	@media (max-width: 480px) { header a span, .invitation { display: none; } header p { font-size: 7px; } .intro { padding: 30px 0; } h1 { font-size: 66px; } .specimen { height: 360px; } .annotation { font-size: 6px; left: 17px; right: 17px; } .notes { grid-template-columns: 1fr; } button { padding: 11px 9px; font-size: 9px; } footer span { max-width: 120px; text-align: right; } }
</style>
