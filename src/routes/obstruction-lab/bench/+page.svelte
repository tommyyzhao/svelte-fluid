<!--
  svelte-fluid — Phase 1 benchmark page (DEV-ONLY, see epic 0001 §4)

  Mounts a deliberately GPU-bound Karman-style scene (high sim/dye resolution,
  high iteration counts, fixed seed, fixed canvas size) and records rAF frame
  deltas: 120 warmup frames, then 600 measured frames. Results are rendered
  on-page and exposed at `window.__benchResult` for automation.

  The stress settings exist so the scene runs *below* vsync rate — at 60 fps
  flat, rAF deltas measure the compositor, not the solver. Relative
  improvement at GPU-bound settings is the metric the epic's Phase 1 target
  is judged against.
-->
<script lang="ts">
	import Fluid from '$lib/Fluid.svelte';
	import type { FlowConfig, Obstruction } from '$lib/engine/types.js';

	const WARMUP_FRAMES = 120;
	const MEASURE_FRAMES = 600;

	// URL knobs for bottleneck characterization, e.g. ?pi=10&sub=2&sim=256&dye=1024
	const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
	const knob = (name: string, fallback: number) => {
		const v = params?.get(name);
		return v ? Number(v) : fallback;
	};
	const PRESSURE_ITERATIONS = knob('pi', 110);
	const SUBSTEPS = knob('sub', 4);
	const SIM_RES = knob('sim', 512);
	const DYE_RES = knob('dye', 2048);
	const VISC_ITERATIONS = knob('vi', 20);
	const CURL = knob('curl', 18);
	const COLOR_BY = (params?.get('vis') ?? 'dye') as 'dye' | 'speed' | 'pressure';

	const CYLINDER: Obstruction = {
		d: 'M 25 52 A 10 10 0 1 0 45 52 A 10 10 0 1 0 25 52 Z',
		viewBox: [0, 0, 100, 100],
		fit: 'fill'
	};

	const FLOW: FlowConfig = {
		mode: 'live',
		boundary: { left: 'open', right: 'open', top: 'open', bottom: 'open' },
		forces: [{ kind: 'pressureGradient', vector: { x: 56, y: 0 } }],
		outlets: [
			{ edge: 'right', from: 0, to: 1, width: 0.075, clearDye: 0.08, clearScalars: true, clearVelocity: true },
			{ edge: 'top', from: 0, to: 1, width: 0.045, clearDye: 0.12, clearScalars: true, clearVelocity: false },
			{ edge: 'bottom', from: 0, to: 1, width: 0.045, clearDye: 0.12, clearScalars: true, clearVelocity: false },
			{ edge: 'left', from: 0, to: 1, width: 0.02, clearDye: 0.45, clearScalars: true, clearVelocity: false }
		],
		visualization: { colorBy: COLOR_BY, transfer: 'cfd' }
	};

	interface BenchResult {
		done: boolean;
		frames: number;
		meanMs: number;
		p50Ms: number;
		p95Ms: number;
		fps: number;
	}

	let status = $state('warming up…');
	let result = $state<BenchResult | null>(null);

	$effect(() => {
		let raf = 0;
		let last = performance.now();
		let warmupLeft = WARMUP_FRAMES;
		const deltas: number[] = [];

		const tick = () => {
			const now = performance.now();
			const dt = now - last;
			last = now;
			if (warmupLeft > 0) {
				warmupLeft--;
			} else if (deltas.length < MEASURE_FRAMES) {
				deltas.push(dt);
				if (deltas.length % 100 === 0) status = `measuring ${deltas.length}/${MEASURE_FRAMES}`;
			} else {
				const sorted = [...deltas].sort((a, b) => a - b);
				const mean = deltas.reduce((s, v) => s + v, 0) / deltas.length;
				const r: BenchResult = {
					done: true,
					frames: deltas.length,
					meanMs: Math.round(mean * 100) / 100,
					p50Ms: Math.round(sorted[Math.floor(sorted.length * 0.5)] * 100) / 100,
					p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 100) / 100,
					fps: Math.round((1000 / mean) * 10) / 10
				};
				result = r;
				status = 'done';
				(window as unknown as { __benchResult: BenchResult }).__benchResult = r;
				return;
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	});
</script>

<svelte:head><title>bench — svelte-fluid</title></svelte:head>

<main>
	<h1>Phase 1 benchmark (stressed Karman)</h1>
	<p data-status>{status}</p>
	{#if result}
		<pre data-result>{JSON.stringify(result, null, 2)}</pre>
	{/if}
	<div class="stage">
		<Fluid
			width={1280}
			height={720}
			seed={1234}
			pointerInput={false}
			obstructions={[CYLINDER]}
			flow={FLOW}
			openBoundary
			curl={CURL}
			densityDissipation={0.9}
			velocityDissipation={0.075}
			maxTimeStep={1 / 120}
			substeps={SUBSTEPS}
			viscosity={0.014}
			viscosityIterations={VISC_ITERATIONS}
			wallFriction={0.16}
			wallFrictionWidth={2}
			pressure={0.9}
			pressureIterations={PRESSURE_ITERATIONS}
			splatRadius={0.06}
			splatForce={6000}
			autoSplatRate={5.5}
			autoSplatCount={3}
			autoSplatVelocityX={750}
			autoSplatVelocityY={0}
			autoSplatCenterX={0.035}
			autoSplatBandWidth={0.025}
			autoSplatCenterY={0.52}
			autoSplatBandHeight={0.9}
			shading={false}
			colorful={false}
			bloom={false}
			sunrays={false}
			simResolution={SIM_RES}
			dyeResolution={DYE_RES}
			initialSplatCount={0}
			backColor={{ r: 4, g: 6, b: 14 }}
		/>
	</div>
</main>

<style>
	main {
		padding: 1rem;
		font-family: monospace;
		background: #0a0c12;
		color: #cfd8e3;
		min-height: 100vh;
	}
	.stage {
		width: 1280px;
		height: 720px;
	}
	pre {
		background: #11141c;
		padding: 0.5rem;
		display: inline-block;
	}
</style>
