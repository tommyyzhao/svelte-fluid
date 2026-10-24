<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { FlowConfig } from '$lib/engine/types.js';
	import { startJetPulse } from './jet-pulse.js';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import Fluid from '$lib/Fluid.svelte';
	import PaperFlow from './mac/PaperFlow.svelte';
	import { getTuning, TUNINGS } from './tunings.js';
	import { TESLA_VALVE_CONFIG } from '$lib/presets/registry.js';

	// Same path/viewBox the engine rasterizes; `meet` matches its centered contain-fit.
	const valve = TESLA_VALVE_CONFIG.containerShape as { d: string; viewBox: [number, number, number, number] };
	const previewTunings = TUNINGS;
	let ready = $state(false);
	let restartCount = $state(0);
	// Prerender cannot read query parameters; wait before starting the selected engine.
	const tuning = $derived(getTuning(ready ? page.url.searchParams.get('variant') : null));
	const jet = $derived(tuning.id.endsWith('-jet'));
	const paper = $derived(tuning.id.startsWith('paper-'));
	const fixedAspect = $derived(jet || paper);
	// A fresh identity on every selection prevents reusing a revisited variant's old flow.
	const generation = $derived({ id: tuning.id, restartCount });
	let fluid = $state<Fluid>();
	let readyGeneration = $state.raw<object>();
	let pulsed = $state.raw<{ generation: object; flow: FlowConfig }>();
	const flow = $derived(pulsed?.generation === generation ? pulsed.flow : tuning.config.flow);
	const onFluidReady = $derived.by(() => {
		const key = generation;
		return () => { if (key === generation) readyGeneration = key; };
	});

	$effect(() => {
		const key = generation;
		if (!ready || !jet || readyGeneration !== key) return;
		const config = tuning.config.flow;
		const pulse = tuning.pulse;
		if (!pulse) return;
		return untrack(() => {
			if (!fluid) return;
			return startJetPulse(config, pulse.base, pulse.peak, fluid.handle, (next) => {
				if (generation === key) pulsed = { generation: key, flow: next };
			}, pulse.palette ?? false, pulse.clockCap);
		});
	});

	onMount(() => {
		ready = true;
	});
</script>

<svelte:head>
	<title>Tesla valve tuning tests</title>
	<meta name="robots" content="noindex, nofollow" />
	<meta name="description" content="Pulsed fixed-nozzle Tesla valve jets alongside six earlier tuning comparisons." />
</svelte:head>

<main>
	<div class="content">
		<p class="eyebrow">Test route · not a preset change</p>
		<h1>Tesla valve flow studies</h1>
		<p>Paper variants study the adjacent blue/green filaments photographed by <a class="citation" href="https://www.nature.com/articles/s41467-021-23009-y">Nguyen et al. (2021), Figs. 3–4</a>: steady pressure, no-slip walls, transmitted backlight. Overlapping dyes darken by Beer–Lambert absorption. Carrier tint pre-fills the water; blue and green enter upstream. The forward and reverse Re 200 variants use a conservative staggered 2D solver with off-screen reservoirs; measured Re is 199.23 and 199.73 respectively. A seeded 1% ambient inlet disturbance represents rig noise, not artificial dye stirring. The patent trace has eleven units but differs from the photo (mean width 0.837 vs 0.9 cm; overlap 0.71). Reverse Re 50 is stable but its measured disturbance is only 0.77%. Reverse Re 401 unsteadiness persists for ≤1.5 flow-through times under exact projection, from an unsteady start (fine grid at Re 420); an independent code (Basilisk) shows shedding is self-excited with zero inlet disturbance. Its instantaneous flux balance and dye-onset convergence fail, frequency grid-convergence is unresolved (half-window scatter exceeds the fine-grid shift), the MAC–Basilisk gap (St 0.92 vs 0.835) remains unexplained, and its upstream fluctuations are largely a projection-leak artifact. Re 200 stays laminar even with 3.53% inlet disturbance; matched-Re diodicity is 1.08 versus the paper’s 1.59. These are 2D experiments, not accepted 3D paper reproductions. The three tracer variants visualise the same flows with passive GPU dye streaks and optical-depth splats, not concentration measurements; the Eulerian dye remains available for metrics.</p>
		<p>Flame-salt jet injects hot copper blue-green, potassium lilac and sodium amber salts. Cold walls conduct heat away; temperature controls light, while salt remains in the flow. No artificial velocity, dye or temperature dissipation, vorticity confinement, wall-friction damping or outlet drain is used.</p>
		<p>Only source momentum pulses; source rate stays constant. Salt colours cycle every six active seconds. The eight earlier variants keep their original physics and colours. White walls surround a black channel; the flame-salt variant places the fluid behind a valve-shaped glass cover with beveled edges and a faint skylight sheen. This constant-density, reduced thermal-emission model is not calibrated combustion CFD; RGB salts share one effective excitation law. Downstream arrival and the physical fade are measured separately.</p>
		<nav aria-label="Tesla valve variants">
			{#each previewTunings as variant (variant.id)}
				<a
					href={`${base}/test/tesla-valve?variant=${variant.id}`}
					aria-current={tuning.id === variant.id ? 'page' : undefined}
				>
					<strong>{variant.label}</strong>
					<span>{variant.description}</span>
				</a>
			{/each}
		</nav>
		<div class="controls">
			<h2>{tuning.label}</h2>
			<button type="button" onclick={() => restartCount++} disabled={!ready}>Restart</button>
		</div>
		<div class="stage" class:jet={fixedAspect} class:paper class:mac={!!tuning.mac} aria-label={`${tuning.label} Tesla valve simulation`}>
			{#if !tuning.mac}
			<!-- Fixed white walls on a black channel, independent of site theme; sized like the Fluid box. -->
			<svg
				class="valve"
				style:height={fixedAspect ? '100%' : '320px'}
				viewBox={valve.viewBox.join(' ')}
				preserveAspectRatio="xMidYMid meet"
				aria-hidden="true"
			>
				{#if paper}
					{#each valve.d.trim().split(/(?=M\s)/).slice(1) as island}
						<path d={island} fill="#e7ecec" />
					{/each}
				{/if}
				<path d={valve.d} fill={paper ? '#fff' : '#000'} fill-rule="evenodd" stroke={paper ? '#99aaaa' : 'none'} stroke-width={paper ? 1.5 : 0} vector-effect="non-scaling-stroke" />
			</svg>
			{/if}
			{#if ready}
				{#key generation}
					{#if tuning.mac}
						<PaperFlow options={tuning.mac} stepsPerFrame={tuning.stepsPerFrame ?? 4} prerollSeconds={tuning.prerollSeconds ?? 20} dyePrerollSeconds={tuning.dyePrerollSeconds ?? 0} />
					{:else}
					<Fluid
						{...tuning.config}
						{flow}
						bind:this={fluid}
						onReady={onFluidReady}
						pointerInput={false}
						splatOnHover={false}
						seed={704}
						transparent={!paper}
						height={fixedAspect ? undefined : 320}
						lazy={false}
					/>
					{/if}
				{/key}
			{:else}
				<p>Loading selected variant…</p>
			{/if}
		</div>
		<p class="note">Fixed seed 704. Pointer input off. Restart repeats the selected setup. Reduced-motion preferences remain respected.</p>
	</div>
</main>

<style>
	main {
		min-height: 100vh;
		padding: 3rem 1rem;
		background: #080e14;
		color: #e7edf3;
		font-family: system-ui, sans-serif;
	}
	.content {
		max-width: 960px;
		margin: 0 auto;
	}
	h1, h2, p {
		margin: 0 0 1rem;
	}
	h1 {
		font-size: clamp(1.8rem, 4vw, 2.8rem);
	}
	p {
		line-height: 1.6;
		color: #b5c4d2;
	}
	.eyebrow, .note {
		font-size: 0.875rem;
	}
	nav {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 0.75rem;
		margin: 1.5rem 0;
	}
	a, button {
		border: 1px solid #42566b;
		border-radius: 0.5rem;
		background: #111e2a;
		color: inherit;
		padding: 0.85rem;
	}
	a {
		text-decoration: none;
	}
	a.citation {
		padding: 0;
		border: 0;
		background: none;
		color: #80d6ff;
		text-decoration: underline;
	}
	a[aria-current='page'] {
		border-color: #80d6ff;
		background: #173247;
	}
	a:focus-visible, button:focus-visible {
		outline: 2px solid #80d6ff;
		outline-offset: 3px;
	}
	strong, span {
		display: block;
	}
	span {
		margin-top: 0.5rem;
		color: #b5c4d2;
		font-size: 0.875rem;
		line-height: 1.5;
	}
	.controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}
	.controls h2 {
		margin: 0;
	}
	button {
		font: inherit;
		cursor: pointer;
	}
	.stage.jet {
		height: auto;
		aspect-ratio: 3 / 1;
		box-sizing: content-box;
		border: 0;
		outline: 1px solid #42566b;
	}
	.stage.paper {
		background: #fff;
		isolation: isolate;
	}
	.stage.mac { aspect-ratio: 29.973013 / 3.508246; border-radius: 0; }
	.stage.paper:not(.mac) :global(canvas) {
		mix-blend-mode: multiply;
	}
	.valve {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		background: #fff;
		pointer-events: none;
	}
	/* Positioned so the loading note paints above the backdrop, readable on the white wall. */
	.stage > p {
		position: relative;
		margin: 0;
		padding: 0.5rem;
		color: #000;
	}
	.stage {
		position: relative;
		height: 320px;
		overflow: hidden;
		border: 1px solid #42566b;
		border-radius: 0.75rem;
		background: #05090c;
		margin-bottom: 1rem;
	}
</style>
