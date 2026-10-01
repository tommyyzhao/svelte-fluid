<script lang="ts">
	import { onMount } from 'svelte';
	import { LabSession, type LabMeasurement, type LabState } from '../../../experiments/liquid/LabSession.js';
	import type { LiquidMode } from '../../../experiments/liquid/types.js';

	let canvas: HTMLCanvasElement;
	let session: LabSession | undefined;
	let mode = $state<LiquidMode>('film');
	let tilt = $state(0);
	let status = $state<LabState | null>(null);
	let error = $state('');
	let measurement = $state<LabMeasurement | null>(null);
	const scenes = {
		film: { title: 'Liquid on a surface.', instruction: 'Drag through the puddles. Tilt the plate and let them flow.',
			material: 'A viscous film', description: 'About 6 mL spreads across a 20 × 14 cm plate. Thickness drives the flow and the light. No airborne splashes, surface tension, or contact-angle model.' },
		vessel: { title: 'Liquid with room to move.', instruction: 'Drag through the water. Release and watch the wave settle.',
			material: 'A metre-scale basin', description: 'Particles move in three dimensions, with gravity, a liquid surface, and solid walls. They can move above and around one another. The drag acts as a submerged force, not a solid finger.' }
	};
	const scene = $derived(scenes[mode]);

	onMount(() => {
		let disposed = false;
		function resize() {
			const { width, height } = canvas.getBoundingClientRect();
			session?.resize(width, height);
		}
		const observer = new ResizeObserver(resize);
		observer.observe(canvas);
		void LabSession.create(canvas, (value) => { status = value; }).then(async (created) => {
			if (disposed) { created.dispose(); return; }
			session = created;
			resize();
			await created.select(mode);
		}).catch((reason) => { if (!disposed) error = reason instanceof Error ? reason.message : String(reason); });
		return () => { disposed = true; observer.disconnect(); session?.dispose(); };
	});

	function select(next: LiquidMode) {
		mode = next;
		measurement = null;
		error = '';
		tilt = 0;
		session?.setTilt(0);
		void session?.select(next);
	}
	function pointer(event: PointerEvent, down: boolean) {
		const rect = canvas.getBoundingClientRect();
		session?.pointer(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
			Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)), down);
	}
	function begin(event: PointerEvent) {
		if (!event.isPrimary || event.button !== 0) return;
		canvas.setPointerCapture(event.pointerId);
		pointer(event, true);
	}
	function move(event: PointerEvent) {
		if (event.isPrimary && canvas.hasPointerCapture(event.pointerId)) pointer(event, true);
	}
	function end(event: PointerEvent) {
		if (!event.isPrimary) return;
		pointer(event, false);
		if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
	}
	async function measure() {
		if (!session) return;
		error = '';
		try { measurement = await session.measure(); }
		catch (reason) { error = reason instanceof Error ? reason.message : String(reason); }
	}
	function reset() { measurement = null; session?.reset(); }
</script>

<svelte:head>
	<title>Liquid studies — cleanroom WebGPU experiments</title>
	<meta name="robots" content="noindex" />
	<meta name="description" content="Two interactive studies in physical liquid: a viscous film and a small three-dimensional vessel." />
</svelte:head>

<main>
	<header>
		<a class="wordmark" href="/">fluid<span> / studies</span></a>
		<span class="edition">01 & 02 · compute experiments</span>
	</header>
	<div class="intro">
		<p class="eyebrow">A fresh start, from the fluid up.</p>
		<h1>A little liquid.</h1>
		<p class="lede">Push it. Let go. See what stays believable.</p>
	</div>
	<div class="workbench">
		<section class="experiment" aria-label="Interactive liquid experiment">
			<div class="scene-toolbar">
				<div class="tabs" aria-label="Choose an experiment">
					<button class:chosen={mode === 'film'} aria-pressed={mode === 'film'} disabled={status?.busy} onclick={() => select('film')}><span>01</span> Surface</button>
					<button class:chosen={mode === 'vessel'} aria-pressed={mode === 'vessel'} disabled={status?.busy} onclick={() => select('vessel')}><span>02</span> Vessel</button>
				</div>
				<span class="live"><i class:stopped={status?.paused || !status?.ready}></i>{status?.paused ? 'Paused' : status?.ready ? 'Live' : 'Starting'}</span>
			</div>
			<div class="canvas-wrap">
				<canvas bind:this={canvas} aria-label={scene.instruction}
					onpointerdown={begin} onpointermove={move} onpointerup={end} onpointercancel={end}>
					Interactive WebGPU liquid. Use the Sweep button to try a recorded gesture without dragging.
				</canvas>
				{#if error || status?.error}
					<div class="overlay" role="alert"><strong>Couldn’t start this study.</strong><p>{error || status?.error}</p></div>
				{:else if !status?.ready}
					<div class="overlay"><span class="loader"></span><p>Preparing the liquid…</p></div>
				{/if}
				{#if status?.busy}<div class="measuring" role="status">Measuring a short run…</div>{/if}
			</div>
			<div class="controls">
				<div class="actions">
					<button disabled={!status?.ready || status?.busy} onclick={() => session?.nudge()}>Sweep ↗</button>
					<button disabled={!status?.ready || status?.busy} onclick={reset}>Reset</button>
					<button disabled={!status?.ready || status?.busy} onclick={() => session?.pause()}>{status?.paused ? 'Resume' : 'Pause'}</button>
				</div>
				<label class="tilt">Tilt <input type="range" min="-1" max="1" step="0.05" bind:value={tilt} oninput={() => session?.setTilt(tilt)} disabled={status?.busy} /><button class="level" title="Level the surface" onclick={() => { tilt = 0; session?.setTilt(0); }}>Level</button></label>
			</div>
		</section>
		<aside>
			<p class="scene-number">Study {mode === 'film' ? '01' : '02'}</p>
			<h2>{scene.title}</h2>
			<p class="instruction">{scene.instruction}</p>
			<div class="material"><span>{scene.material}</span><p>{scene.description}</p></div>
			<p class="question">Does the motion feel like a material you can touch?</p>
			<p class="note">Two different physical situations. One runs at a time so they don’t compete for the GPU.</p>
		</aside>
	</div>
	<details class="evidence">
		<summary>Under the surface <span>Measurements & limits</span></summary>
		<div class="evidence-content">
			<p>Independent compute prototypes. No old fluid-engine code. Surface uses a reduced viscous model; vessel uses approximate particle density constraints. These are experiments, not a claim of predictive accuracy or measured phone performance.</p>
			<div class="readouts">
				<div><span>Submission interval · median</span><strong>{status?.frameMs ? `${status.frameMs.toFixed(1)} ms` : '—'}</strong></div>
				<div><span>Tracked GPU allocation</span><strong>{status?.memoryBytes ? `${(status.memoryBytes / 1048576).toFixed(1)} MiB` : '—'}</strong></div>
				<div><span>Drawing pixels</span><strong>{status?.pixels ? `${(status.pixels / 1000000).toFixed(2)} M` : '—'}</strong></div>
				<div><span>Simulated time</span><strong>{(status?.seconds ?? 0).toFixed(1)} s</strong></div>
			</div>
			<p class="adapter">{status?.adapter || 'Adapter not queried'}</p>
			<button class="measure" disabled={!status?.ready || status?.busy} onclick={measure}>Reset & measure 30 frames</button>
			<p class="note">This advances a fresh scene and waits for GPU completion. It measures batched throughput, not touch latency. Submission interval includes browser scheduling and skipped frames; it is not GPU time. Slow devices drop simulation time rather than queueing a growing backlog.</p>
			{#if measurement}
				<div class="result" role="status">
					<strong>{measurement.batchFrameMs.toFixed(2)} ms / batched frame</strong>
					<span>Finite state: {measurement.snapshot.finite ? 'yes' : 'NO'}</span>
					<span>Mass drift: {(100 * (measurement.snapshot.mass / measurement.snapshot.initialMass - 1)).toFixed(5)}%</span>
					<p>{mode === 'vessel' ? 'Constant particle mass does not prove constant occupied volume. Compression is measured separately.' : 'Thickness is conserved; that alone does not establish accurate flow.'} Additional diagnostics:</p>
					<dl>{#each Object.entries(measurement.snapshot.details) as [key, value]}<div><dt>{key}</dt><dd>{Number.isInteger(value) ? value : value.toPrecision(4)}</dd></div>{/each}</dl>
				</div>
			{/if}
		</div>
	</details>
	<footer><span>Cleanroom liquid studies</span><span>WebGPU · research in motion</span></footer>
</main>

<style>
	:global(body) { background: #121412; color: #eae8dd; }
	main { max-width: 1312px; padding: 32px 40px 24px; margin: 0 auto; }
	header, footer { display: flex; justify-content: space-between; align-items: center; }
	.wordmark { text-decoration: none; color: #eeeae0; font-weight: 650; font-size: 19px; letter-spacing: -.5px; }
	.wordmark span { color: #8b9288; font-weight: 400; }
	.edition, footer { font-size: 11px; letter-spacing: .05em; color: #8b9288; }
	.intro { margin: 54px 0 36px; }
	.eyebrow { font-size: 11px; letter-spacing: .13em; text-transform: uppercase; color: #a0a78c; }
	h1 { font-family: ui-serif, Georgia, serif; font-weight: 400; font-size: clamp(44px, 6vw, 70px); line-height: 1.08; letter-spacing: -2.5px; margin: 12px 0; }
	.lede { color: #a4aa9e; font-size: 16px; margin: 16px 0 0; }
	.workbench { display: grid; grid-template-columns: minmax(0, 1fr) 250px; gap: 40px; align-items: start; }
	.experiment { min-width: 0; background: #191c18; border: 1px solid #343b2e; border-radius: 16px; overflow: hidden; }
	.scene-toolbar { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; }
	.tabs { display: flex; gap: 5px; }
	button { border: 1px solid #394031; border-radius: 7px; color: #c4cbbb; background: transparent; font: inherit; font-size: 12px; padding: 9px 13px; cursor: pointer; transition: background .15s, color .15s; }
	button:hover:not(:disabled) { background: #343d2e; color: #f1f2e9; }
	button:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid #d3e6a4; outline-offset: 3px; }
	button:disabled { opacity: .45; cursor: default; }
	.tabs button { border-color: transparent; }
	.tabs button span { color: #7f8a72; margin-right: 5px; font-size: 10px; }
	.tabs button.chosen { background: #cddca9; color: #26321d; }
	.tabs button.chosen span { color: #52683c; }
	.live { display: flex; gap: 6px; align-items: center; font-size: 10px; color: #a1ae90; margin-right: 4px; }
	.live i { height: 5px; width: 5px; border-radius: 50%; background: #c3d59c; }
	.live i.stopped { background: #707769; }
	.canvas-wrap { position: relative; background: #101510; }
	canvas { display: block; width: 100%; aspect-ratio: 10 / 7; touch-action: none; cursor: grab; }
	canvas:active { cursor: grabbing; }
	.overlay { position: absolute; inset: 0; background: #171d18ed; display: flex; align-items: center; justify-content: center; flex-direction: column; text-align: center; padding: 36px; }
	.overlay p { color: #a8b39b; max-width: 520px; font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
	.loader { height: 24px; width: 24px; border: 1px solid #48543c; border-top-color: #d7e6b7; border-radius: 50%; animation: turn 1s linear infinite; }
	@keyframes turn { to { transform: rotate(360deg); } }
	.measuring { position: absolute; bottom: 14px; left: 14px; padding: 8px 12px; background: #101510de; border-radius: 5px; font-size: 12px; }
	.controls { padding: 13px 15px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.actions { display: flex; gap: 6px; }
	.tilt { display: flex; align-items: center; gap: 9px; color: #aab39d; font-size: 12px; }
	.tilt input { width: 90px; accent-color: #cddca9; }
	.level { border: 0; color: #a1ae90; padding: 4px; font-size: 10px; }
	aside { padding-top: 26px; }
	.scene-number { color: #a2b28c; text-transform: uppercase; font-size: 10px; letter-spacing: .14em; }
	h2 { font-family: ui-serif, Georgia, serif; font-size: 30px; font-weight: 400; line-height: 1.15; letter-spacing: -.6px; margin: 17px 0; }
	.instruction { font-size: 14px; line-height: 1.7; color: #bcc4b1; }
	.material { border-top: 1px solid #343b2e; margin-top: 28px; padding-top: 22px; }
	.material span { font-size: 12px; color: #d9dfce; }
	.material p, .note { font-size: 12px; line-height: 1.7; color: #8f9a84; }
	.question { font-family: ui-serif, Georgia, serif; font-size: 20px; line-height: 1.45; color: #c8d5b8; margin: 32px 0 14px; }
	.evidence { border-top: 1px solid #333a2e; border-bottom: 1px solid #333a2e; margin-top: 32px; }
	summary { cursor: pointer; font-size: 12px; padding: 18px 0; color: #c0cbb3; }
	summary span { color: #7e8b72; font-size: 11px; margin-left: 12px; }
	.evidence-content { max-width: 880px; padding-bottom: 22px; }
	.evidence-content > p { font-size: 12px; line-height: 1.7; color: #98a38d; }
	.readouts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 24px 0; }
	.readouts div { display: grid; gap: 8px; }
	.readouts span { font-size: 10px; color: #89977c; }
	.readouts strong { font-size: 20px; font-weight: 450; font-variant-numeric: tabular-nums; }
	.adapter { font-family: ui-monospace, monospace; font-size: 10px !important; }
	.measure { margin-top: 10px; }
	.result { background: #1c2318; padding: 20px; border-radius: 8px; margin-top: 20px; font-size: 12px; }
	.result > strong, .result > span { display: block; margin-bottom: 10px; }
	.result p { color: #96a387; margin-top: 20px; }
	dl { display: grid; gap: 6px; max-width: 430px; font-family: ui-monospace, monospace; font-size: 11px; }
	dl div { display: flex; justify-content: space-between; gap: 16px; } dd { margin: 0; }
	footer { padding-top: 24px; font-size: 10px; }
	@media (max-width: 900px) { .workbench { grid-template-columns: minmax(0, 1fr); gap: 10px; } aside { padding: 8px 3px; } aside h2 { font-size: 26px; } .material, .question, aside .note { display: none; } .scene-number { display: none; } }
	@media (max-width: 520px) { main { padding: 22px 16px; } .edition { font-size: 9px; } .intro { margin: 38px 0 26px; } h1 { letter-spacing: -1.7px; } .controls { flex-wrap: wrap; } .tilt { flex: 1; justify-content: flex-end; } .tilt input { width: 65px; } .actions { gap: 3px; } .actions button { padding: 8px 9px; } .readouts { grid-template-columns: repeat(2, 1fr); } }
	@media (prefers-reduced-motion: reduce) { .loader { animation: none; } }
</style>
