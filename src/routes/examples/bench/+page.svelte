<script lang="ts">
	import { onMount } from 'svelte';
	import { FluidEngine } from '$lib/engine/FluidEngine.js';
	import type { EngineProfileSnapshot } from '$lib/engine/engine-profiler.js';
	import { fieldEnergy, hasNonFinite } from '$lib/engine/__benches__/reducers.js';
	import { scenes } from '$lib/engine/__benches__/scenes.js';
	import { mulberry32, type Rng } from '$lib/engine/rng.js';

	type BenchSceneKey = keyof typeof scenes;

	type BenchResult = {
		meanMs: number;
		p50: number;
		p95: number;
		fps: number;
		energy: number;
		done: boolean;
		profile: EngineProfileSnapshot | null;
		liveness: {
			finite: boolean;
			nonBlank: boolean;
			contextLost: boolean;
			rejection: string | null;
		};
	};

	const sampleWindowMax = 240;
	const warmupFrames = 120;
	const minSamples = 60;
	const fallbackAlpha = 0.08;
	const sceneKeys: BenchSceneKey[] = ['dipole', 'kelvinHelmholtz', 'rayleighBenard', 'thinWallTeslaValve'];

	let canvas = $state<HTMLCanvasElement | null>(null);
	let selected = $state<BenchSceneKey>(sceneKeys[0]);
	let instrument = $state(false);
	let engine = $state<FluidEngine | null>(null);
	let frame = $state(0);
	let warmup = $state(0);
	let emaMs = $state(0);
	let lastFrame = $state(0);
	// Latched across frames: liveness is only re-checked on readback frames, so
	// resetting it every frame would collapse `done` (and the published metrics)
	// on the 5 of 6 frames that skip the readback.
	let energyGood = $state(false);
	let status = $state('Benchmark running.');
	let rafHandle = $state(0);
	let rng = $state<Rng>(mulberry32(scenes[sceneKeys[0]].seed));
	let fallbackSamples = $state<number[]>([]);
	let sampleSource = $state<'gpu-timer' | 'cpu-submit' | 'raf-ema'>('raf-ema');
	let benchResult = $state<BenchResult>({
		meanMs: 0,
		p50: 0,
		p95: 0,
		fps: 0,
		energy: 0,
		done: false,
		profile: null,
		liveness: { finite: false, nonBlank: false, contextLost: false, rejection: 'warming-up' }
	});

	const clamp = (value: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, value));
	const trimSamples = (values: number[]): void => {
		while (values.length > sampleWindowMax) values.shift();
	};
	const percentile = (values: number[], ratio: number): number => {
		if (values.length === 0) return 0;
		const sorted = [...values].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
		if (sorted.length === 0) return 0;
		const idx = clamp(Math.floor((sorted.length - 1) * ratio), 0, sorted.length - 1);
		return sorted[idx] ?? 0;
	};
	type WindowWithBenchResult = Window & { __benchResult?: BenchResult };

	const summarize = (
		values: number[]
	): Omit<BenchResult, 'energy' | 'done' | 'profile' | 'liveness'> => {
		const filtered = values.filter((value) => Number.isFinite(value) && value > 0);
		if (filtered.length === 0) {
			return {
				meanMs: 0,
				p50: 0,
				p95: 0,
				fps: 0
			};
		}
		const meanMs = filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
		return {
			meanMs,
			p50: percentile(filtered, 0.5),
			p95: percentile(filtered, 0.95),
			fps: meanMs > 0 ? clamp(1000 / meanMs, 0, 9999) : 0
		};
	};
	const publish = (result: BenchResult): void => {
		benchResult = result;
		if (typeof window !== 'undefined') {
			(window as WindowWithBenchResult).__benchResult = { ...benchResult };
		}
	};

	const disposeLoop = (): void => {
		if (rafHandle) {
			cancelAnimationFrame(rafHandle);
			rafHandle = 0;
		}
	};

	const disposeEngine = (): void => {
		if (!engine) return;
		engine.dispose();
		engine = null;
	};

	const step = (now: number): void => {
		if (!engine) {
			rafHandle = requestAnimationFrame(step);
			return;
		}

		const dtMs = Math.max(1, lastFrame ? now - lastFrame : 16.666);
		lastFrame = now;
		const dt = dtMs / 1000;
		const activeScene = scenes[selected];

		// Keep timing always available for non-instrumented runs.
		if (emaMs <= 0) emaMs = dtMs;
		else emaMs += (dtMs - emaMs) * fallbackAlpha;
		fallbackSamples.push(emaMs);
		trimSamples(fallbackSamples);

		const frameIdx = frame;
		frame += 1;
		warmup += 1;
		activeScene.schedule(engine, rng, frameIdx, dt);

		let energy = benchResult.energy;
		if (frameIdx % 6 === 0) {
			try {
				const velocity = engine.readField('velocity');
				energy = fieldEnergy(velocity.data);
				energyGood = !hasNonFinite(velocity.data) && energy > activeScene.thresholdBand[0];
			} catch {
				energy = 0;
				energyGood = false;
			}
		}

		const profile = engine.getBenchProfile();
		const frameSamples = profile?.frames.map((sample) =>
			profile.timingSource === 'gpu' ? (sample.gpuMs ?? sample.cpuMs) : sample.cpuMs
		) ?? null;
		let samples: number[] = frameSamples?.length ? frameSamples : fallbackSamples;
		sampleSource = 'raf-ema';
		if (frameSamples && frameSamples.length > 0) {
			samples = frameSamples;
			sampleSource = profile?.timingSource === 'gpu' ? 'gpu-timer' : 'cpu-submit';
			trimSamples(samples);
		}

		const enoughSamples = samples.length >= minSamples;
		const profileGood = !instrument || !!profile?.valid;
		const ready = warmup >= warmupFrames && enoughSamples && energyGood && profileGood;
		const stats = ready ? summarize(samples) : { meanMs: 0, p50: 0, p95: 0, fps: 0 };
		const finite = Number.isFinite(energy);
		const contextLost = profile?.environment.contextLost ?? false;
		publish({
			meanMs: stats.meanMs,
			p50: stats.p50,
			p95: stats.p95,
			fps: stats.fps,
			energy,
			done: ready,
			profile,
			liveness: {
				finite,
				nonBlank: energyGood,
				contextLost,
				rejection: contextLost
					? 'context-lost'
					: !finite
						? 'non-finite'
						: !energyGood
							? 'blank-field'
							: profile && !profile.valid
								? profile.invalidReasons.join(',') || 'no-valid-profile-samples'
								: null
			}
		});

		if (!ready && engine.isBenchmarkTimed() && !frameSamples?.length) {
			status = 'Waiting for first finished timer query sample.';
		} else if (ready) {
			status = `Active scene: ${(activeScene.config.curl ?? 0) > 0 ? 'curl enabled' : 'curl disabled'}; ${
					sampleSource === 'gpu-timer'
						? 'GPU timer-query path'
						: sampleSource === 'cpu-submit'
							? 'CPU submission path'
							: 'RAF EMA fallback'
			}.`;
		}

		rafHandle = requestAnimationFrame(step);
	};

	const restart = (): void => {
		disposeLoop();
		disposeEngine();
		fallbackSamples = [];
		emaMs = 0;
		frame = 0;
		warmup = 0;
		lastFrame = 0;
		energyGood = false;
		rng = mulberry32(scenes[selected].seed);
		publish({
			meanMs: 0,
			p50: 0,
			p95: 0,
			fps: 0,
			energy: 0,
			done: false,
			profile: null,
			liveness: { finite: false, nonBlank: false, contextLost: false, rejection: 'warming-up' }
		});

		if (!canvas) return;
		const activeScene = scenes[selected];
		try {
			engine = new FluidEngine({
				canvas,
				config: { ...activeScene.config, pointerInput: false },
				instrument
			});
			status = engine.isBenchmarkTimed() ? 'Using EXT_disjoint_timer_query_webgl2.' : 'Using RAF EMA fallback.';
			rafHandle = requestAnimationFrame(step);
		} catch {
			status = 'Could not initialize benchmark engine.';
		}
	};

	const onSceneChange = (event: Event): void => {
		selected = (event.currentTarget as HTMLSelectElement).value as BenchSceneKey;
		restart();
	};

	const onInstrumentChange = (event: Event): void => {
		instrument = (event.currentTarget as HTMLInputElement).checked;
		restart();
	};

	onMount(() => {
		restart();
		return () => {
			disposeLoop();
			disposeEngine();
		};
	});
</script>

<svelte:head>
	<title>Benchmark profiler — svelte-fluid</title>
	<meta name="robots" content="noindex" />
	<meta
		name="description"
		content="Interactive fluid benchmark page with whole-frame GPU/CPU timing, lifecycle and resource telemetry, and liveness checks."
	/>
</svelte:head>

<main class="bench-page">
	<header>
		<h1>Benchmark profiler</h1>
		<p>Pick a scene, optionally enable whole-frame instrumentation, and watch the profile update in `window.__benchResult`.</p>
	</header>

	<div class="controls">
		<label for="bench-scene">Scene</label>
		<select id="bench-scene" onchange={onSceneChange} value={selected}>
			{#each sceneKeys as sceneKey}
				<option value={sceneKey}>{sceneKey}</option>
			{/each}
		</select>
		<label class="inline-toggle">
			<input type="checkbox" onchange={onInstrumentChange} bind:checked={instrument} />
			Enable whole-frame instrumentation
		</label>
	</div>

		<canvas bind:this={canvas} class="bench-canvas" width="960" height="540" aria-label="Benchmark canvas"></canvas>

	<section class="stats" aria-live="polite">
		<p>{status}</p>
		<p>sample-source: <strong>{sampleSource}</strong> · ready: <strong>{benchResult.done ? 'yes' : 'no'}</strong></p>
		<dl>
			<div>
				<dt>meanMs</dt>
				<dd>{benchResult.meanMs.toFixed(2)}</dd>
			</div>
			<div>
				<dt>p50</dt>
				<dd>{benchResult.p50.toFixed(2)}</dd>
			</div>
			<div>
				<dt>p95</dt>
				<dd>{benchResult.p95.toFixed(2)}</dd>
			</div>
			<div>
				<dt>fps (from sample mean)</dt>
				<dd>{benchResult.fps.toFixed(1)}</dd>
			</div>
			<div>
				<dt>energy</dt>
				<dd>{benchResult.energy.toFixed(5)}</dd>
			</div>
			<div>
				<dt>draws / submitted pixels</dt>
				<dd>
					{benchResult.profile?.frames.at(-1)?.draws ?? 0} /
					{(benchResult.profile?.frames.at(-1)?.pixels ?? 0).toLocaleString()}
				</dd>
			</div>
			<div>
				<dt>estimated texture bytes</dt>
				<dd>{(benchResult.profile?.resources.estimatedTextureBytes ?? 0).toLocaleString()}</dd>
			</div>
			<div>
				<dt>renderer / DPR</dt>
				<dd>
					{benchResult.profile?.environment.renderer ?? 'instrumentation disabled'} /
					{benchResult.profile?.environment.devicePixelRatio ?? 0}
				</dd>
			</div>
		</dl>
	</section>

	<footer class="note">
		<p>
			Liveness guard: the page only marks <code>done</code> when energy is above the scene floor and the field is fully
			finite.
		</p>
	</footer>
</main>

<style>
	.bench-page {
		max-width: 980px;
		margin: 0 auto;
		padding: 1.5rem;
		color: #e8e8f0;
	}
	h1 {
		margin: 0 0 0.25rem;
	}
	.controls {
		display: grid;
		grid-template-columns: auto auto;
		align-items: center;
		gap: 0.6rem 0.8rem;
		margin-bottom: 1rem;
	}
	select,
	input {
		background: #151521;
		color: #e8e8f0;
		border: 1px solid rgba(255, 255, 255, 0.18);
		border-radius: 0.35rem;
	}
	select {
		padding: 0.35rem 0.5rem;
		width: 220px;
	}
	.inline-toggle {
		grid-column: span 2;
		display: flex;
		gap: 0.45rem;
		align-items: center;
	}
	.bench-canvas {
		display: block;
		width: 100%;
		max-width: 960px;
		height: auto;
		aspect-ratio: 16 / 9;
		background: #08080f;
		border: 1px solid rgba(255, 255, 255, 0.18);
	}
	.stats {
		margin-top: 1rem;
		padding: 0.8rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 0.45rem;
	}
	.stats p {
		margin: 0 0 0.5rem;
		opacity: 0.9;
	}
	dl {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.4rem 1rem;
		margin: 0;
	}
	dt,
	dd {
		margin: 0;
	}
	dt {
		color: rgba(255, 255, 255, 0.7);
	}
	dd {
		font-variant-numeric: tabular-nums;
	}
	.note {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.92rem;
		line-height: 1.45;
	}
</style>
