<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { FluidEngine, type DistortionField } from '$lib/engine/FluidEngine.js';
	import { canvasPixelSize } from '$lib/engine/resolution.js';

	// Local preview of an INTERNAL engine knob (acceleration-warped distortion).
	const MODES: { id: DistortionField; label: string; caption: string; softness: number }[] = [
		{
			id: 'velocity',
			label: 'velocity',
			caption: 'Today’s behaviour: the image slides along the local flow direction wherever dye is present.',
			softness: 1
		},
		{
			id: 'acceleration',
			label: 'acceleration',
			caption: 'Change in velocity between presented frames. Steady flow does nothing; the image only moves where the flow speeds up, slows or turns.',
			softness: 60
		},
		{
			id: 'pressure-gradient',
			label: 'pressure-gradient',
			caption: 'Pressure part of the acceleration, −∇p. The push that keeps the flow incompressible, without the carried-along part.',
			softness: 60
		}
	];
	const SOFT_MIN = 0.1;
	const SOFT_MAX = 10000;

	let canvas = $state<HTMLCanvasElement>();
	let engine = $state.raw<FluidEngine>();
	let error = $state('');

	let mode = $state<DistortionField>('acceleration');
	let power = $state(0.06);
	// Slider position 0..1 maps log-wise onto [SOFT_MIN, SOFT_MAX].
	const toPos = (k: number) => Math.log(k / SOFT_MIN) / Math.log(SOFT_MAX / SOFT_MIN);
	const fromPos = (p: number) => SOFT_MIN * Math.pow(SOFT_MAX / SOFT_MIN, p);
	let softPos = $state(toPos(60));
	const softness = $derived(fromPos(softPos));
	let splatRadius = $state(0.6);
	let velocityDissipation = $state(0.4);
	let autoStir = $state(true);
	let imageUrl = $state(`${base}/bosch-garden.jpg`);
	let customUrl: string | undefined;

	const current = $derived(MODES.find((m) => m.id === mode)!);
	// Per-mode softness defaults; a user drag overrides until the next mode change.
	function pickMode(id: DistortionField) {
		mode = id;
		softPos = toPos(MODES.find((m) => m.id === id)!.softness);
	}

	function onFile(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		const url = URL.createObjectURL(file);
		if (customUrl) URL.revokeObjectURL(customUrl);
		customUrl = url;
		imageUrl = url;
	}

	// Offset (dye r) is what the shader scales the warp by; matches FluidDistortion.
	const INTENSITY = 24;
	const DYE = { r: INTENSITY * 0.001, g: 0, b: 0 };

	onMount(() => {
		const el = canvas!;
		const size = () => {
			const r = el.getBoundingClientRect();
			return canvasPixelSize(r.width, r.height, window.devicePixelRatio || 1);
		};
		const s = size();
		el.width = s.width;
		el.height = s.height;
		try {
			engine = new FluidEngine({
				canvas: el,
				config: {
					distortion: true,
					distortionImageUrl: imageUrl,
					distortionPower: power,
					distortionFit: 'cover',
					pointerInput: false,
					initialSplatCount: 0,
					autoSplatRate: 0,
					densityDissipation: 0.98,
					velocityDissipation,
					splatRadius,
					curl: 0,
					pressure: 0,
					bloom: false,
					sunrays: false,
					shading: false,
					backColor: { r: 0, g: 0, b: 0 }
				}
			});
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			return;
		}

		const ro = new ResizeObserver(() => {
			const n = size();
			engine?.resize(n.width, n.height);
		});
		ro.observe(el);

		// Pointer stirring, same force scale as FluidDistortion.
		let px = -1;
		let py = -1;
		const move = (e: PointerEvent) => {
			const r = el.getBoundingClientRect();
			if (px >= 0) {
				const force = e.pointerType === 'touch' ? 8 : 5;
				engine?.splat(
					(e.clientX - r.left) / r.width,
					1 - (e.clientY - r.top) / r.height,
					(e.clientX - px) * force,
					-(e.clientY - py) * force,
					DYE
				);
			}
			px = e.clientX;
			py = e.clientY;
		};
		const leave = () => (px = py = -1);
		el.addEventListener('pointermove', move);
		el.addEventListener('pointerleave', leave);

		// Lissajous auto-stir (FluidDistortion's curve); time only accrues while on.
		let raf = 0;
		let prev = 0;
		let t = 0;
		let lx = 0.5;
		let ly = 0.5;
		const tick = (now: number) => {
			raf = requestAnimationFrame(tick);
			const dtMs = prev ? now - prev : 0;
			prev = now;
			if (!autoStir || !engine) return;
			t += dtMs * 0.001;
			const x = 0.5 + 0.3 * Math.sin(2 * t - Math.PI);
			const y = 0.5 + 0.2 * Math.sin(5 * t) * Math.cos(2 * t);
			engine.splat(x, y, 800 * (x - lx), 800 * (y - ly), DYE);
			lx = x;
			ly = y;
		};
		raf = requestAnimationFrame(tick);

		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
			el.removeEventListener('pointermove', move);
			el.removeEventListener('pointerleave', leave);
			engine?.dispose();
			engine = undefined;
			if (customUrl) URL.revokeObjectURL(customUrl);
		};
	});

	$effect(() => {
		engine?.setConfig({ distortionImageUrl: imageUrl, distortionPower: power, splatRadius, velocityDissipation });
	});
	$effect(() => {
		engine?.previewDistortionField(mode, softness);
	});
</script>

<svelte:head>
	<title>Acceleration distortion preview</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main>
	<h1>Acceleration distortion preview</h1>
	<p class="note">Dev-only. Internal engine knob, not a public feature.</p>
	<div class="stage">
		<canvas bind:this={canvas} aria-label="Distorted image"></canvas>
	</div>
	{#if error}<p role="alert">{error}</p>{/if}

	<div class="controls">
		<fieldset>
			<legend>Field</legend>
			{#each MODES as m (m.id)}
				<label><input type="radio" name="mode" checked={mode === m.id} onchange={() => pickMode(m.id)} /> {m.label}</label>
			{/each}
		</fieldset>
		<p class="caption">{current.caption}</p>
		<label>Power {power.toFixed(3)}
			<input type="range" min="0" max="0.3" step="0.005" bind:value={power} />
		</label>
		<label>Softness k {softness.toPrecision(3)} (log)
			<input type="range" min="0" max="1" step="0.001" bind:value={softPos} disabled={mode === 'velocity'} />
		</label>
		<label>Splat radius {splatRadius.toFixed(2)}
			<input type="range" min="0.1" max="2" step="0.05" bind:value={splatRadius} />
		</label>
		<label>Velocity dissipation {velocityDissipation.toFixed(2)}
			<input type="range" min="0" max="2" step="0.05" bind:value={velocityDissipation} />
		</label>
		<label><input type="checkbox" bind:checked={autoStir} /> Auto-stir</label>
		<label>Image <input type="file" accept="image/*" onchange={onFile} /></label>
	</div>
</main>

<style>
	main {
		min-height: 100vh;
		padding: 1.5rem 1rem 3rem;
		background: #080e14;
		color: #e7edf3;
		font-family: system-ui, sans-serif;
	}
	h1 {
		margin: 0 0 0.25rem;
		font-size: 1.5rem;
	}
	.note,
	.caption {
		margin: 0 0 1rem;
		color: #b5c4d2;
		font-size: 0.875rem;
		line-height: 1.5;
	}
	.stage {
		width: 100%;
		height: 70vh;
		border: 1px solid #42566b;
		border-radius: 0.5rem;
		overflow: hidden;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
		touch-action: none;
	}
	.controls {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 0.75rem 1.5rem;
		margin-top: 1rem;
	}
	.controls label,
	fieldset {
		display: grid;
		gap: 0.25rem;
		font-size: 0.875rem;
	}
	fieldset {
		display: flex;
		gap: 1rem;
		border: 1px solid #42566b;
		border-radius: 0.5rem;
		grid-column: 1 / -1;
	}
	.caption {
		grid-column: 1 / -1;
	}
	input:focus-visible {
		outline: 2px solid #80d6ff;
		outline-offset: 3px;
	}
</style>
