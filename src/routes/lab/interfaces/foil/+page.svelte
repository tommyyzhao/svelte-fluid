<script lang="ts">
	import MaterialSurface from '../../../../experiments/liquid/MaterialSurface.svelte';
	import { createSnapFoil, FOIL_SNAP_LOAD, type SnapFoilExperiment } from '../../../../experiments/liquid/snap-foil.js';
	let surface = $state<{ wake: () => boolean; refresh: () => void; reset: () => void }>();
	let interactive = $state(false), available = $state(false), load = $state(0);
	let model: SnapFoilExperiment | undefined;
	async function factory(device: GPUDevice, format: GPUTextureFormat) { model = await createSnapFoil(device, format, () => load); return model; }
	function apply(value: number) {
		load = value;
		if (!interactive) { model?.settleLoad(load); surface?.refresh(); } else surface?.wake();
	}
	function reset() { load = 0; surface?.reset(); }
</script>

<svelte:head><title>A change of mind — snap-through foil</title><meta name="robots" content="noindex" /></svelte:head>

<main>
	<header><a href="/lab/interfaces">fluid <span>/ material studies</span></a><p>09 — A SMALL INSTABILITY</p></header>
	<section aria-labelledby="title">
		<div class="intro"><div><p class="eyebrow">Not every response is a return.</p><h1 id="title">A change<br />of <em>mind.</em></h1></div><p class="invitation">A little resistance.<br />Then a different state.</p></div>
		<div class="specimen">
			<div class="annotation" aria-hidden="true"><span>EXCESS LENGTH / TWO EQUILIBRIA</span><span>POLISHED FOIL</span></div>
			<MaterialSurface bind:this={surface} bind:interactive bind:available {factory} label="A polished metallic arch held between two fixed pads. Sweep vertically through its center, or apply a load, to make it snap to its opposite stable curvature." />
		</div>
		<div class="controls">
			<label for="load">Applied load <output for="load">{load.toFixed(1)}</output><input id="load" type="range" min="-30" max="30" step="0.1" value={load} oninput={(event) => apply(Number(event.currentTarget.value))} disabled={!available} /></label>
			<div class="buttons"><button onclick={() => apply(-22)} disabled={!available}>Turn down ↓</button><button onclick={() => apply(22)} disabled={!available}>Turn up ↑</button><button onclick={() => apply(0)} disabled={!available}>Release</button><button onclick={reset} disabled={!available}>Reset</button></div>
		</div>
		<p class="hint">Move the load slowly past ±{FOIL_SNAP_LOAD.toFixed(1)}, then release it. The new curvature remains. Sustained vertical movement through the center can also tip it; a quick brush may only wobble.</p>
	</section>
	<div class="notes"><p>Resistance.<br /><em>Threshold. Memory.</em></p><details><summary>What makes it snap?</summary><p>One amplitude and one velocity move through a double-well energy. The strip has more rest length than the distance between its fixed ends. Opposite curvatures are equally stable; the center is an energy barrier, not a resting place.</p><p>The slowly applied load removes one well at ±{FOIL_SNAP_LOAD.toFixed(2)} in illustrative units. A fast gesture can cross the barrier earlier by adding kinetic energy. Damping removes that energy; idle does not reset the state.</p><p>A reduced, authored buckling model—not a calibrated shell solver. Native-pixel analytic geometry and filtered metallic shading; no intermediate image or simulation grid. Reduced motion shows the settled state immediately when a control changes.</p></details></div>
	<footer><a href="/lab/interfaces">All material studies ↗</a><span>Two state numbers. One decisive pop.</span></footer>
</main>

<style>
	:global(body) { margin: 0; background: #ece5df; color: #3e2b30; }
	main { max-width: 1320px; margin: auto; padding: 0 38px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
	a { color: inherit; text-decoration: none; }
	header { min-height: 85px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #3e2b302b; gap: 20px; }
	header a { font-weight: 650; font-size: 21px; letter-spacing: -.8px; } header a span { font-weight: 400; font-size: 11px; color: #9d8587; letter-spacing: 0; }
	header p, .eyebrow { font-size: 9px; letter-spacing: .12em; text-transform: uppercase; color: #9c767c; }
	.intro { display: flex; justify-content: space-between; align-items: end; gap: 30px; padding: 36px 0 32px; }
	.eyebrow { margin: 0 0 19px; } h1 { margin: 0; font: 400 clamp(62px, 7vw, 96px)/.97 Georgia, serif; letter-spacing: -.067em; } h1 em { color: #9a6068; }
	.invitation { font-size: 12px; line-height: 1.7; color: #9c8284; margin-bottom: 5px; }
	.specimen { height: clamp(330px, 39vw, 540px); position: relative; overflow: hidden; background: #27171d; }
	.specimen :global(.material) { background: transparent; }
	.specimen :global(.status) { background: transparent; color: #b7949a; font-size: 8px; padding: 0; left: 24px; bottom: 20px; }
	.annotation { position: absolute; top: 24px; left: 24px; right: 24px; display: flex; justify-content: space-between; z-index: 2; font-size: 7px; letter-spacing: .14em; color: #b19096; pointer-events: none; }
	.controls { display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 50px; padding: 20px 0 13px; border-bottom: 1px solid #3e2b302b; }
	label { display: block; font-size: 10px; color: #8b6b72; } output { float: right; font-variant-numeric: tabular-nums; } input { display: block; width: 100%; margin: 13px 0 5px; accent-color: #8a4d5b; }
	.buttons { display: flex; gap: 8px; } button { font: inherit; font-size: 10px; padding: 12px 15px; border: 1px solid #3e2b3035; color: #65414a; background: transparent; cursor: pointer; }
	button:first-child { background: #643d48; color: #f8e8e4; border-color: #643d48; } button:hover:not(:disabled) { background: #a56778; color: #fff3ed; } button:disabled, input:disabled { opacity: .4; cursor: default; }
	.hint { font-size: 10px; color: #9c8284; line-height: 1.6; margin: 12px 0 0; }
	.notes { display: grid; grid-template-columns: 1fr 1fr; gap: 70px; margin: 39px 0; } .notes > p { margin: 0; font: 28px/1.22 Georgia, serif; letter-spacing: -.7px; } .notes em { color: #9a6068; }
	details { color: #8d7078; font-size: 11px; line-height: 1.85; } summary { cursor: pointer; border-bottom: 1px solid #3e2b3023; padding-bottom: 10px; }
	footer { display: flex; justify-content: space-between; gap: 20px; border-top: 1px solid #3e2b302b; padding: 24px 0 28px; font-size: 9px; color: #9c8284; }
	a:focus-visible, button:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid #a56778; outline-offset: 5px; }
	@media (max-width: 780px) { main { padding: 0 20px; } .controls { grid-template-columns: 1fr; gap: 15px; } .buttons button { flex: 1; } .notes { gap: 25px; } }
	@media (max-width: 480px) { header a span, .invitation { display: none; } header p { font-size: 7px; } .intro { padding: 30px 0; } h1 { font-size: 69px; } .specimen { height: 320px; } .annotation { font-size: 6px; left: 17px; right: 17px; } .notes { grid-template-columns: 1fr; } button { padding: 11px 8px; font-size: 9px; } footer span { max-width: 120px; text-align: right; } }
</style>
