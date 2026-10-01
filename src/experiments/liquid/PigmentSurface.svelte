<script lang="ts">
	import { onDestroy } from 'svelte';
	import MaterialSurface from './MaterialSurface.svelte';
	import { createCapillaryPigment, type PigmentExperiment } from './capillary-pigment.js';
	import type { PigmentGeometry, PigmentView } from './capillary-pigment-model.js';
	let { geometry = 'type' }: { geometry?: PigmentGeometry } = $props();
	let surface = $state<{ refresh(): void; reset(): void; wake(): boolean }>();
	let model: PigmentExperiment | undefined;
	let available = $state(false), interactive = $state(false), view = $state<PigmentView>('combined');
	let remaining = $state([3, 3, 3]), mobile = $state(420), attached = $state(0), error = $state('');
	let disposed = false, version = 0, measurementVersion = 0, reading = false, readAgain = false, timer: ReturnType<typeof setTimeout> | undefined;
	const colors = ['Ultramarine', 'Vermilion', 'Saffron'];
	async function measure() {
		if (!model || disposed) return;
		if (reading) { readAgain = true; return; }
		reading = true;
		const measuredVersion = measurementVersion;
		try {
			const state = await model.inspect();
			if (!disposed && measuredVersion === measurementVersion) { mobile = state.details.mobile; attached = state.details.attached; remaining = [...model.remaining]; }
		} catch (reason) { if (!disposed && measuredVersion === measurementVersion) error = String(reason); }
		finally {
			reading = false;
			if (readAgain && !disposed) { readAgain = false; void measure(); }
		}
	}
	function settleReadout() { clearTimeout(timer); timer = setTimeout(() => { void measure(); }, 4550); }
	async function factory(device: GPUDevice, format: GPUTextureFormat) {
		const created = await createCapillaryPigment(device, format, geometry);
		if (disposed) return created;
		model = created; remaining = [...created.remaining];
		const resize = created.resize.bind(created);
		created.resize = (width, height) => {
			resize(width, height); const revision = ++version;
			void created.ready().then(() => { if (!disposed && revision === version) surface?.refresh(); })
				.catch((reason) => { if (!disposed) { error = String(reason); surface?.refresh(); } });
		};
		return created;
	}
	function pour(color: number) {
		if (!model?.pour(color)) return;
		measurementVersion++;
		remaining = [...model.remaining]; surface?.refresh();
		if (surface?.wake()) settleReadout(); else void measure();
	}
	function show(value: PigmentView) { view = value; model?.setView(value); surface?.refresh(); void measure(); }
	function reset() { clearTimeout(timer); measurementVersion++; readAgain = false; surface?.reset(); remaining = [3, 3, 3]; mobile = attached = 0; }
	function pulse() { reset(); pour(0); }
	function comb() { if (surface?.wake()) settleReadout(); }
	onDestroy(() => { disposed = true; version++; clearTimeout(timer); });
</script>

<div class="pigment-proof" class:emblem={geometry === 'emblem'}>
	<div class="plate" onpointermove={comb} role="img" aria-label={geometry === 'type' ? 'INK: finite pigment inside the letterforms' : 'A continuous loop containing three finite pigments'}>
		<MaterialSurface bind:this={surface} bind:available bind:interactive {factory} settleMs={4200}
			label="Move without clicking to pull the ink along with your hand. A passing stroke lifts attached pigment back into motion. The exact shape contains both." />
		<div class="plate-caption" aria-hidden="true"><span>{geometry === 'type' ? 'INK / A FINITE EDITION' : 'COLORWAY / NO TWO ALIKE'}</span><span>{view.toUpperCase()}</span></div>
	</div>
	{#if error}<p role="alert" class="error">Pigment material unavailable. {error}</p>{/if}
	<div class="action-row">
		<p class="invitation">{interactive ? 'Pull the color with your cursor. No click needed.' : 'A still impression. The controls remain available.'}<small>Comb it one way, then back. Your stroke lifts the ink again.</small></p>
		<div class="doses" aria-label="Finite pigment reservoirs">
			{#each colors as name, color}
				<button class="dose" class:blue={color === 0} class:red={color === 1} class:gold={color === 2} disabled={!available || remaining[color] === 0} onclick={() => pour(color)} aria-label={`Pour ${name}, ${remaining[color]} doses remaining`}>
					<span class="swatch" aria-hidden="true"></span>{name}<small>{remaining[color]}/3</small>
				</button>
			{/each}
		</div>
	</div>
	<div class="inspection">
		<div class="views" aria-label="Inspect pigment state">
			{#each ['combined', 'mobile', 'attached'] as name}
				<button aria-pressed={view === name} disabled={!available} onclick={() => show(name as PigmentView)}>{name === 'combined' ? 'The impression' : name === 'mobile' ? 'Only moving ink' : 'Only attached ink'}</button>
			{/each}
		</div>
		<div class="reset"><button disabled={!available} onclick={pulse}>Single pulse ↗</button><button disabled={!available} onclick={reset}>Clean plate ↺</button></div>
	</div>
	<div class="balance" aria-live="polite"><span>Mobile <b>{mobile.toFixed(1)}</b></span><span>Attached <b>{attached.toFixed(1)}</b></span><span>Total <b>{(mobile + attached).toFixed(1)}</b></span><small>Relative pigment units · read after a pour settles or a view changes.</small></div>
</div>

<style>
	.pigment-proof { --ink: #172b46; color: var(--ink); }
	.plate { position: relative; aspect-ratio: 2; background: #e5ddca; isolation: isolate; user-select: none; -webkit-user-select: none; }
	.plate :global(.material) { min-height: 0; background: transparent; }
	.plate :global(.status) { font-size: 8px; color: #526075; background: #e5ddcae8; left: 18px; bottom: 13px; padding: 4px 0; }
	.plate-caption { position: absolute; inset: 19px 22px auto; display: flex; justify-content: space-between; font: 8px/1.5 Arial, sans-serif; letter-spacing: .13em; color: #596877; pointer-events: none; }
	.action-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 22px 0; border-bottom: 1px solid #172b4626; }
	.invitation { margin: 0; font: 12px/1.5 Arial, sans-serif; }.invitation small { display: block; font-size: 10px; color: #73808b; margin-top: 4px; }
	.doses { display: flex; gap: 8px; flex-wrap: wrap; }
	button { font: 10px/1.4 Arial, sans-serif; border: 1px solid #172b4633; background: transparent; padding: 11px 13px; color: inherit; cursor: pointer; }
	button:disabled { opacity: .35; cursor: default; }button:hover:not(:disabled) { border-color: currentColor; background: #ffffff55; }button:focus-visible { outline: 2px solid #184ec4; outline-offset: 4px; }
	.dose { display: flex; align-items: center; gap: 8px; }.dose small { color: #73808b; font-size: 9px; }
	.swatch { width: 10px; height: 10px; border-radius: 50%; background: #193dc1; }.red .swatch { background: #dc4937; }.gold .swatch { background: #d6a529; }
	.inspection { display: flex; justify-content: space-between; gap: 20px; padding: 17px 0; border-bottom: 1px solid #172b4626; }.views, .reset { display: flex; gap: 6px; flex-wrap: wrap; }
	.views button { border-color: transparent; padding: 8px 10px; }.views button[aria-pressed=true] { background: #172b46; color: #f5eee1; }.reset button { font-size: 9px; padding: 8px 10px; }
	.balance { display: flex; flex-wrap: wrap; gap: 16px; padding: 15px 0; color: #73808b; font: 9px/1.5 Arial, sans-serif; }.balance b { margin-left: 5px; font-variant-numeric: tabular-nums; color: #172b46; font-weight: 500; }.balance small { margin-left: auto; font-size: 8px; }
	.error { color: #a22e28; font: 11px/1.5 Arial, sans-serif; }
	@media(max-width: 720px) { .action-row { display: block; }.doses { margin-top: 16px; }.dose { flex: 1; font-size: 9px; padding: 10px; }.inspection { display: block; }.reset { margin-top: 12px; }.balance { gap: 12px; }.balance small { width: 100%; margin-left: 0; }.plate-caption { inset: 11px 13px auto; font-size: 6px; }.plate :global(.status) { font-size: 6px; left: 13px; bottom: 7px; } }
</style>
