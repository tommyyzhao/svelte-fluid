<script lang="ts">
	import MaterialSurface from '../../../../experiments/liquid/MaterialSurface.svelte';
	import { createCapillaryBridge, BRIDGE_VOLUME, type CapillaryBridgeExperiment } from '../../../../experiments/liquid/capillary-bridge.js';
	let surface = $state<{ wake: () => boolean; refresh: () => void; reset: () => void }>();
	let interactive = $state(false), available = $state(false), gap = $state(0.46);
	let model: CapillaryBridgeExperiment | undefined;
	async function factory(device: GPUDevice, format: GPUTextureFormat) { model = await createCapillaryBridge(device, format, () => gap); return model; }
	function separate(value: number) {
		gap = value;
		if (!interactive) { model?.settleSeparation(gap); surface?.refresh(); } else surface?.wake();
	}
	function reset() { gap = 0.46; surface?.reset(); }
</script>

<svelte:head><title>Until we let go — a liquid bridge</title><meta name="robots" content="noindex" /></svelte:head>

<main>
	<header><a href="/lab/interfaces">fluid <span>/ material studies</span></a><p>12 — HOLDING ON</p></header>
	<section aria-labelledby="title">
		<div class="intro"><p class="eyebrow">A connection with a limit.</p><h1 id="title">Until we<br /><em>let go.</em></h1><p class="invitation">Pull apart. Watch the neck.<br />Then bring it back together.</p></div>
		<div class="specimen">
			<div class="annotation" aria-hidden="true"><span>PINNED CONTACT / FIXED VOLUME</span><span>LIQUID BRIDGE</span></div>
			<MaterialSurface bind:this={surface} bind:interactive bind:available {factory} label="A blue liquid bridge pinned between two wet pads. Increase separation to thin the neck, break the bridge, and let the liquid recoil into two beads. Bring the pads together to reconnect." />
		</div>
		<div class="controls"><label for="separation">Pad separation <output for="separation">{gap.toFixed(2)}</output><input id="separation" type="range" min="0.3" max="1.65" step="0.005" value={gap} oninput={(event) => separate(Number(event.currentTarget.value))} disabled={!available} /></label><div class="buttons"><button onclick={() => separate(1.5)} disabled={!available}>Pull apart ↔</button><button onclick={() => separate(0.42)} disabled={!available}>Bring together →←</button><button onclick={reset} disabled={!available}>Reset</button></div></div>
		<p class="hint">Use the separation slider or buttons below the specimen; hovering does not change the gap. The same {BRIDGE_VOLUME.toFixed(3)} units³ of liquid remain before, during and after the split.</p>
	</section>
	<div class="notes"><p>There is a moment<br /><em>before separation.</em></p><details><summary>What is—and isn't—being simulated?</summary><p>The contact disks have a fixed radius. An axisymmetric radius profile is normalized analytically to a fixed liquid volume. Increasing the distance between disks draws volume from the neck; at zero neck radius it separates continuously into two pointed caps.</p><p>The caps retract into two rounded beads. Closing the gap lets them meet, then a volume-preserving blend grows the new neck. Separation and reconnection happen at different gaps: a small, explicit model of contact history.</p><p>This is a volume-conserving shape and event proxy, not a constant-mean-curvature equilibrium, calibrated surface tension, or universal breakup law. Native-pixel analytic surface shading uses no blurred metaballs or low-resolution image. Reduced motion jumps directly to the settled controlled state.</p></details></div>
	<footer><a href="/lab/interfaces">All material studies ↗</a><span>The shape changes. The amount does not.</span></footer>
</main>

<style>
	:global(body) { margin: 0; background: #e5ece8; color: #23464a; }
	main { max-width: 1320px; margin: auto; padding: 0 38px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
	a { color: inherit; text-decoration: none; }
	header { min-height: 85px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #23464a2b; gap: 20px; }
	header a { font-weight: 650; font-size: 21px; letter-spacing: -.8px; } header a span { font-weight: 400; font-size: 11px; color: #7a9795; letter-spacing: 0; }
	header p, .eyebrow { font-size: 9px; letter-spacing: .12em; text-transform: uppercase; color: #719390; }
	.intro { position: relative; padding: 36px 0 32px; } .eyebrow { margin: 0 0 19px; } h1 { margin: 0; font: 400 clamp(62px, 7vw, 96px)/.97 Georgia, serif; letter-spacing: -.067em; } h1 em { color: #6c9994; }
	.invitation { position: absolute; bottom: 36px; right: 0; font-size: 12px; line-height: 1.7; color: #7d9996; }
	.specimen { height: clamp(330px, 39vw, 540px); position: relative; overflow: hidden; background: #08252d; }
	.specimen :global(.material) { background: transparent; pointer-events: none; }
	.specimen :global(.status:not(.error)) { display: none; }
	.specimen :global(.status) { background: transparent; color: #83b3b6; font-size: 8px; padding: 0; left: 24px; bottom: 20px; }
	.annotation { position: absolute; top: 24px; left: 24px; right: 24px; display: flex; justify-content: space-between; z-index: 2; font-size: 7px; letter-spacing: .14em; color: #78a7ac; pointer-events: none; }
	.controls { display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 50px; padding: 20px 0 13px; border-bottom: 1px solid #23464a2b; }
	label { display: block; font-size: 10px; color: #698c88; } output { float: right; font-variant-numeric: tabular-nums; } input { display: block; width: 100%; margin: 13px 0 5px; accent-color: #376e71; }
	.buttons { display: flex; gap: 8px; } button { font: inherit; font-size: 10px; padding: 12px 15px; border: 1px solid #23464a35; color: #35666a; background: transparent; cursor: pointer; }
	button:first-child { background: #305e65; color: #e7f3ed; border-color: #305e65; } button:hover:not(:disabled) { background: #6c9994; color: #f0fff7; } button:disabled, input:disabled { opacity: .4; cursor: default; }
	.hint { font-size: 10px; color: #7d9996; line-height: 1.6; margin: 12px 0 0; }
	.notes { display: grid; grid-template-columns: 1fr 1fr; gap: 70px; margin: 39px 0; } .notes > p { margin: 0; font: 28px/1.22 Georgia, serif; letter-spacing: -.7px; } .notes em { color: #6c9994; }
	details { color: #698c88; font-size: 11px; line-height: 1.85; } summary { cursor: pointer; border-bottom: 1px solid #23464a23; padding-bottom: 10px; }
	footer { display: flex; justify-content: space-between; gap: 20px; border-top: 1px solid #23464a2b; padding: 24px 0 28px; font-size: 9px; color: #7d9996; }
	a:focus-visible, button:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid #376e71; outline-offset: 5px; }
	@media (max-width: 780px) { main { padding: 0 20px; } .controls { grid-template-columns: 1fr; gap: 15px; } .buttons button { flex: 1; } .notes { gap: 25px; } }
	@media (max-width: 480px) { header a span, .invitation { display: none; } header p { font-size: 7px; } .intro { padding: 30px 0; } h1 { font-size: 69px; } .specimen { height: 320px; } .annotation { font-size: 6px; left: 17px; right: 17px; } .notes { grid-template-columns: 1fr; } button { padding: 11px 8px; font-size: 9px; } footer span { max-width: 120px; text-align: right; } }
</style>
