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
	<title>Tesla valve laboratory experiments</title>
	<meta name="robots" content="noindex, nofollow" />
	<meta name="description" content="Laboratory-only Tesla valve flow experiments, not validated real-world predictions." />
</svelte:head>

<main>
	<div class="content">
		<p class="eyebrow">Laboratory only · not a preset change</p>
		<h1>Tesla valve flow experiments</h1>
		<p>These are laboratory-only 2D experiments, not validated real-world predictions or reproductions of a 3D experiment. Forward means left to right through the valve; backward means right to left. The research comparisons study the blue and green dye threads photographed by <a class="citation" href="https://www.nature.com/articles/s41467-021-23009-y">Nguyen et al. (2021), Figs. 3–4</a>. Pressure stays steady, fluid slows to zero at walls, and light shines through the dye. Overlapping dyes absorb more light and look darker. Tinted water fills the channel before blue and green dye enter.</p>
		<p>The lower-speed forward and backward experiments use a 2D flow model with water-storage regions outside the picture. Reynolds number (Re) compares the effects of flow speed and viscosity; measured values are 199.23 and 199.73. A repeatable 1% inlet disturbance represents equipment noise, not added dye stirring. The patent outline has eleven repeated sections but differs from the photo (mean width 0.837 vs 0.9 cm; shape overlap score 0.71, where 1 means identical). The slower backward experiment at Re 50 is steady, but its disturbance measures only 0.77%. At Re 200, flow stays smooth even with 3.53% inlet disturbance. Diodicity compares the backward (reverse) pressure to the forward pressure needed for the same flow rate, not forward and backward flow rates: 1.08 here versus the paper’s 1.59 at matched Reynolds number.</p>
		<p>The higher-speed backward experiment at Re 401 keeps changing for ≤1.5 times the time for fluid to cross the valve when checked with a more accurate pressure calculation, starting from already-changing flow (finer grid at Re 420). Independent software (Basilisk) finds repeating swirls even with zero inlet disturbance. However, flow entering and leaving does not balance at each instant, the first dye-mixing location changes with grid size, and the swirl-frequency comparison is inconclusive: variation between halves of the recording exceeds the change from a finer grid. The model and Basilisk disagree on the frequency relative to flow speed (St 0.92 vs 0.835); this remains unexplained. Upstream changes are largely caused by error in the pressure calculation. The three moving-dye-dot versions show these same flows, not measured dye concentrations; the grid-based dye calculation remains available for measurements.</p>
		<p>The flame-salt jet adds hot copper blue-green, potassium lilac and sodium amber salts. Cold walls remove heat; temperature controls light while salt stays in the flow. No extra fading of speed, dye or temperature, added swirl, wall-friction braking or outlet braking is used.</p>
		<p>Only the inlet push pulses; the amount added stays constant. Salt colours cycle every six active seconds. The eight earlier versions keep their original settings and colours. White walls surround a black channel; the flame-salt version adds a valve-shaped glass cover with beveled edges and a faint skylight sheen. This simplified model keeps density constant and approximates light from hot salts; it is not a calibrated combustion simulation. All three salt colours share one rule for brightness. Downstream arrival and cooling-related fading are measured separately.</p>
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
		<p class="note">Repeatable random pattern 704. Pointer movement does not change the flow. Restart repeats the selected setup. Reduced-motion preferences remain respected.</p>
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
