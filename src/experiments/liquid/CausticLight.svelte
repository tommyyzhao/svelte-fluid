<script lang="ts">
	import MaterialSurface from './MaterialSurface.svelte';
	import { CAUSTIC_DEFAULTS, createCausticLight, type CausticLight as CausticModel, type PhotonGrid } from './caustic-light.js';
	let surface = $state<{ refresh(): void; suspend(): void; reset(): void }>();
	let model: CausticModel | undefined;
	let ready = $state(false), interactive = $state(false), failure = $state('');
	let relief = $state(CAUSTIC_DEFAULTS.relief), depth = $state(CAUSTIC_DEFAULTS.depth), grid = $state<PhotonGrid>(128), phase = $state(0);
	const available = $derived(ready && !failure);
	async function factory(device: GPUDevice, format: GPUTextureFormat) {
		model = await createCausticLight(device, format, { photonGrid: grid, onError(message) { failure = message; surface?.suspend(); } });
		model.setRelief(relief); model.setDepth(depth); return model;
	}
	function changeRelief(value: number) { relief = value; model?.setRelief(value); surface?.refresh(); }
	function changeDepth(value: number) { depth = value; model?.setDepth(value); surface?.refresh(); }
	function changeGrid(value: PhotonGrid) { grid = value; model?.setPhotonGrid(value); surface?.refresh(); }
	function shift() { phase = (phase + 0.25) % (Math.PI * 20); model?.setPhase(phase); surface?.refresh(); }
	function reset() {
		phase = 0; relief = CAUSTIC_DEFAULTS.relief; depth = CAUSTIC_DEFAULTS.depth; grid = 128;
		model?.setRelief(relief); model?.setDepth(depth); model?.setPhotonGrid(grid);
		surface?.reset();
	}
</script>

<div class="light-study" data-caustic-ready={available}>
	<div class="receiver" class:failed={Boolean(failure)}>
		<MaterialSurface bind:this={surface} bind:available={ready} bind:interactive {factory} settleMs={120} label="Light focused by a rippled water surface onto a flat receiver. Move the pointer without clicking to move the small surface lens. Surface relief and receiver depth also change the light in reduced-motion mode." />
		{#if failure}<div class="failure" role="status">WebGPU light unavailable — the receiver is static. {failure}</div>{/if}
	</div>
	<div class="controls">
		<label>Surface relief <input type="range" min="0" max="1" step="0.01" value={relief} oninput={(event) => changeRelief(+event.currentTarget.value)} disabled={!available} /></label>
		<label>Receiver depth <input type="range" min="0.15" max="1" step="0.01" value={depth} oninput={(event) => changeDepth(+event.currentTarget.value)} disabled={!available} /></label>
		<label>Light samples <select aria-label="Light samples" value={grid} onchange={(event) => changeGrid(+event.currentTarget.value as PhotonGrid)} disabled={!available}><option value={64}>4,096</option><option value={128}>16,384</option><option value={256}>65,536</option></select></label>
		<button onclick={shift} disabled={!available}>Shift surface</button><button onclick={reset} disabled={!available}>Reset</button>
	</div>
	<p class="instruction">{interactive ? 'Move across the pool. The surface changes; its light stays where it lands.' : 'Native controls move a still optical specimen. No animation is required.'} Set relief to zero to flatten the water and remove its focusing.</p>
</div>

<style>
	.receiver { height: clamp(410px, 47vw, 650px); position: relative; overflow: hidden; background: #071f25; border: 1px solid #71baa12b; }
	.receiver :global(.material) { background: #071f25; } .receiver :global(.status) { background: #071f25de; color: #a2d4bb; font-size: 9px; }
	.receiver.failed :global(canvas) { visibility: hidden; } .failure { position: absolute; inset: 0; display: grid; place-items: center; padding: 40px; background: #071f25; color: #dabd9d; font-size: 12px; }
	.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 18px 25px; padding: 22px 0 12px; } label { display: flex; align-items: center; gap: 12px; font-size: 10px; color: #b2cec0; } input { width: 115px; accent-color: #b7dab4; } select, button { padding: 9px 12px; background: #133c3e; border: 1px solid #7cab963b; color: #d5e5c9; font: 10px Arial, sans-serif; } button { cursor: pointer; } button:hover:not(:disabled) { background: #285951; } :is(button,input,select):disabled { opacity: .4; cursor: default; } :is(button,input,select):focus-visible { outline: 2px solid #e2d894; outline-offset: 4px; } .instruction { margin: 8px 0 0; color: #81a996; font-size: 10px; line-height: 1.7; }
	@media(max-width: 650px) { .controls { gap: 15px; } label { flex: 1 1 220px; justify-content: space-between; } input { width: 130px; } .receiver { height: 460px; } }
</style>
