<script lang="ts">
	import { onDestroy } from 'svelte';
	import { FluidEngine } from '$lib/engine/FluidEngine.js';
	import { getFluidEngineDiagnostics } from '$lib/engine/engine-diagnostics.js';
	import type { FluidConfig } from '$lib/engine/types.js';
	import '../lab.css';

	interface Profile {
		name: string;
		intent: string;
		frames: number;
		config: FluidConfig;
	}

	interface Result {
		name: string;
		allocationMs: number;
		frameMs: number;
		velocityRms: number;
		dyePeak: number;
		textures: number;
		buffers: number;
		finite: boolean;
	}

	const profiles: ReadonlyArray<Profile> = [
		{
			name: 'Baseline',
			intent: '96² velocity · 192² dye · first-order advection · no post',
			frames: 30,
			config: { simResolution: 96, dyeResolution: 192, pressureIterations: 12, bloom: false, sunrays: false }
		},
		{
			name: 'Detailed',
			intent: '160² velocity · 320² dye · bloom + sunrays',
			frames: 24,
			config: {
				simResolution: 160,
				dyeResolution: 320,
				pressureIterations: 24,
				bloom: true,
				bloomResolution: 128,
				sunrays: true,
				sunraysResolution: 96
			}
		},
		{
			name: 'Demanding flow',
			intent: '256² velocity · 512² dye · MacCormack · viscosity · scalar buoyancy',
			frames: 16,
			config: {
				simResolution: 256,
				dyeResolution: 512,
				advectionScheme: 'maccormack',
				pressureIterations: 36,
				substeps: 2,
				viscosity: 0.05,
				viscosityIterations: 10,
				bloom: true,
				bloomResolution: 192,
				sunrays: true,
				sunraysResolution: 128,
				flow: {
					boundary: { left: 'open', right: 'open' },
					scalarFields: [{ name: 'temperature', dissipation: 0.01 }],
					sources: [{
						kind: 'line',
						from: { x: 0.04, y: 0.25 },
						to: { x: 0.04, y: 0.75 },
						velocity: { x: 240, y: 0 },
						dye: { r: 0.1, g: 0.45, b: 1 },
						scalars: { temperature: 0.8 },
						profile: 'parabolic'
					}],
					forces: [{ kind: 'buoyancy', scalar: 'temperature', strength: 14 }],
					outlets: [{ edge: 'right', width: 0.08, clearDye: 0, clearVelocity: true }]
				}
			}
		},
		{
			name: 'Extreme',
			intent: '384² velocity · 768² dye · 3 substeps · 48 pressure iterations · post',
			frames: 8,
			config: {
				simResolution: 384,
				dyeResolution: 768,
				advectionScheme: 'maccormack',
				pressureIterations: 48,
				substeps: 3,
				viscosity: 0.08,
				viscosityIterations: 14,
				wallFriction: 0.2,
				bloom: true,
				bloomResolution: 256,
				sunrays: true,
				sunraysResolution: 160
			}
		}
	];

	let canvas: HTMLCanvasElement;
	let running = $state(false);
	let status = $state('Ready. Close other GPU-heavy tabs for less noisy numbers.');
	let results = $state<Result[]>([]);
	let startupMs = $state<number | null>(null);
	let adapter = $state('Not queried');
	let cancelled = false;
	let activeEngine: FluidEngine | null = null;

	onDestroy(() => {
		cancelled = true;
		activeEngine?.dispose();
	});

	function rounded(value: number, digits = 2): number {
		return Number(value.toFixed(digits));
	}

	async function measurePipelineStartup(): Promise<number> {
		canvas.width = 64;
		canvas.height = 64;
		const started = performance.now();
		const engine = await FluidEngine.create({
			canvas,
			autoStart: false,
			config: { simResolution: 16, dyeResolution: 16, initialSplatCount: 0, bloom: false, sunrays: false }
		});
		activeEngine = engine;
		try {
			await getFluidEngineDiagnostics(engine).awaitIdle();
			return rounded(performance.now() - started);
		} finally {
			engine.dispose();
			if (activeEngine === engine) activeEngine = null;
		}
	}

	async function runProfile(profile: Profile): Promise<Result> {
		canvas.width = 640;
		canvas.height = 360;
		const started = performance.now();
		const engine = await FluidEngine.create({
			canvas,
			autoStart: false,
			config: { ...profile.config, seed: 0x5e17c0de, initialSplatCount: 0, densityDissipation: 0.995 }
		});
		activeEngine = engine;
		const diagnostics = getFluidEngineDiagnostics(engine);
		try {
			const allocationMs = performance.now() - started;
			engine.randomSplats(8);
			diagnostics.advanceFrames(5, 1 / 60);
			await diagnostics.awaitIdle();
			const timed = performance.now();
			diagnostics.advanceFrames(profile.frames, 1 / 60);
			await diagnostics.awaitIdle();
			const frameMs = (performance.now() - timed) / profile.frames;
			const [velocity, dye] = await Promise.all([
				diagnostics.readField('velocity'),
				diagnostics.readField('dye')
			]);
			let velocityEnergy = 0;
			let dyePeak = 0;
			let finite = true;
			for (const value of velocity.data) {
				finite &&= Number.isFinite(value);
				velocityEnergy += value * value;
			}
			for (const value of dye.data) {
				finite &&= Number.isFinite(value);
				dyePeak = Math.max(dyePeak, value);
			}
			const resources = diagnostics.resourceSnapshot();
			return {
				name: profile.name,
				allocationMs: rounded(allocationMs),
				frameMs: rounded(frameMs),
				velocityRms: rounded(Math.sqrt(velocityEnergy / Math.max(1, velocity.data.length)), 4),
				dyePeak: rounded(dyePeak, 4),
				textures: resources?.liveTextures ?? 0,
				buffers: resources?.liveBuffers ?? 0,
				finite
			};
		} finally {
			engine.dispose();
			if (activeEngine === engine) activeEngine = null;
		}
	}

	async function runAll() {
		if (running) return;
		running = true;
		results = [];
		startupMs = null;
		cancelled = false;
		try {
			if (!navigator.gpu) throw new Error('This browser does not expose WebGPU.');
			const detected = await navigator.gpu.requestAdapter();
			adapter = detected
				? [detected.info.vendor, detected.info.architecture, detected.info.device, detected.info.description]
					.filter(Boolean)
					.join(' · ') || 'WebGPU adapter (details withheld)'
				: 'No adapter';
			status = 'Measuring adapter/device/pipeline acquisition…';
			startupMs = await measurePipelineStartup();
			for (const profile of profiles) {
				if (cancelled) return;
				status = `Running ${profile.name}…`;
				results = [...results, await runProfile(profile)];
			}
			status = 'Complete. Run again to observe the warm shared-pipeline path.';
		} catch (cause) {
			status = cause instanceof Error ? cause.message : String(cause);
		} finally {
			running = false;
		}
	}
</script>

<svelte:head>
	<title>Native WebGPU performance probe — svelte-fluid</title>
	<meta name="description" content="Reproducible production-engine WebGPU workload probe for svelte-fluid." />
</svelte:head>

<main class="webgpu-page performance-page">
	<header>
		<span class="eyebrow">Production engine · local evidence</span>
		<h1>Measure this GPU, not an old headline</h1>
		<p class="lede">
			This probe runs the shipping <code>FluidEngine</code>, waits for GPU queue completion, then checks live
			fields for finite values. It is deliberately not a synthetic alternate solver and makes no universal
			WebGL speed claim.
		</p>
	</header>

	<section class="controls">
		<button onclick={runAll} disabled={running}>{running ? 'Running…' : 'Run all workloads'}</button>
		<span>{status}</span>
		<small>Adapter: {adapter}</small>
		{#if startupMs !== null}<small>Adapter/device/pipeline acquisition: {startupMs} ms (cold after a fresh reload; cached on rerun)</small>{/if}
	</section>

	<section class="profile-grid">
		{#each profiles as profile}
			<article>
				<strong>{profile.name}</strong>
				<p>{profile.intent}</p>
			</article>
		{/each}
	</section>

	{#if results.length > 0}
		<section class="results" aria-live="polite">
			<table>
				<thead><tr><th>Workload</th><th>Warm allocation</th><th>GPU-complete frame</th><th>Velocity RMS</th><th>Dye peak</th><th>Resources</th><th>Finite</th></tr></thead>
				<tbody>
					{#each results as result}
						<tr>
							<td>{result.name}</td>
							<td>{result.allocationMs} ms</td>
							<td>{result.frameMs} ms</td>
							<td>{result.velocityRms}</td>
							<td>{result.dyePeak}</td>
							<td>{result.textures} tex · {result.buffers} buf</td>
							<td class:pass={result.finite}>{result.finite ? 'yes' : 'NO'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<pre>{JSON.stringify({ adapter, startupMs, canvas: [640, 360], results }, null, 2)}</pre>
		</section>
	{/if}

	<canvas bind:this={canvas} aria-label="Benchmark presentation canvas"></canvas>
</main>

<style>
	.performance-page section { margin-top: 1rem; }
	.controls { display: grid; gap: .6rem; padding: 1rem; border: 1px solid rgba(255,255,255,.1); border-radius: .7rem; background: rgba(255,255,255,.025); }
	button { width: fit-content; padding: .65rem .9rem; border: 0; border-radius: .5rem; color: #08111f; background: #9ec0ff; font-weight: 700; cursor: pointer; }
	button:disabled { opacity: .55; cursor: wait; }
	.controls span, .controls small { color: #aeb8cf; }
	.profile-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: .7rem; }
	.profile-grid article { padding: .85rem; border: 1px solid rgba(255,255,255,.09); border-radius: .6rem; }
	.profile-grid p { margin: .35rem 0 0; color: #98a4ba; font-size: .78rem; }
	.results { overflow-x: auto; }
	table { width: 100%; border-collapse: collapse; font: .76rem/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
	th, td { padding: .65rem; border-bottom: 1px solid rgba(255,255,255,.09); text-align: left; white-space: nowrap; }
	th { color: #8f9bb2; }
	td.pass { color: #8ff0ba; }
	pre { overflow: auto; max-height: 26rem; padding: 1rem; border-radius: .6rem; background: #05070b; color: #a9b8d3; }
	canvas { display: block; width: min(640px, 100%); aspect-ratio: 16 / 9; margin: 1rem auto 0; border: 1px solid rgba(255,255,255,.1); border-radius: .7rem; background: #03050a; }
</style>
