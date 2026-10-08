<script lang="ts">
	import { onMount } from 'svelte';
	import { FluidEngine } from '$lib/engine/FluidEngine.js';
	import { registerImageConvergence } from '$lib/engine/image-convergence.js';
	import { images, fidelity } from './metrics.js';
	let canvas: HTMLCanvasElement;
	let selected = $state(images[0]);
	let status = $state('Loading');
	let engine: FluidEngine | undefined;
	let release: (() => void) | undefined;
	let localUrl: string | undefined;
	let mounted = false;
	let retained: HTMLCanvasElement;
	let frames: { seconds: number; wallMs: number; png: string }[] = [];
	let draws = 0, pixels = 0, frameCount = 0, seconds = 0, start = 0, settledAt = 0;
	let alive = true, generation = 0;
	let drawOffset = 0, pixelOffset = 0, dyeFormat = 'unknown', velocityMax = 0, targetErrorMax = 0;
	function beginDisturbance() {
		drawOffset += draws; pixelOffset += pixels;
		draws = 0; pixels = 0; frameCount = 0; frames = []; settledAt = 0; start = performance.now();
	}
	async function startImage(url = `/lab/image-convergence/${selected}`) {
		const id = ++generation;
		engine?.dispose(); release?.(); engine = undefined;
		status = 'Loading';
		const image = new Image(); image.crossOrigin = 'anonymous'; image.src = url;
		try { await image.decode(); } catch { if (alive && id === generation) status = 'Image unavailable'; return; }
		if (!alive || id !== generation) return;
		if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 32_000_000) { status = 'Image exceeds the lab 32 megapixel limit'; return; }
		const scale = 512 / Math.max(image.naturalWidth, image.naturalHeight);
		canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
		canvas.style.backgroundImage = `url(${JSON.stringify(url)})`; canvas.style.backgroundSize = '100% 100%';
		retained = document.createElement('canvas'); retained.width = canvas.width; retained.height = canvas.height;
		const target = document.createElement('canvas'); target.width = canvas.width; target.height = canvas.height;
		target.getContext('2d')!.drawImage(image, 0, 0, target.width, target.height);
		const targetPixels = target.getContext('2d')!.getImageData(0, 0, target.width, target.height).data;
		frames = []; draws = 0; pixels = 0; frameCount = 0; seconds = 0; settledAt = 0; drawOffset = 0; pixelOffset = 0; start = performance.now();
		const params = new URLSearchParams(location.search);
		release = registerImageConvergence(canvas, { variant: params.get('variant') === '1' ? 1 : 0, onFrame: (state) => {
			draws = state.draws - drawOffset; pixels = state.pixels - pixelOffset; dyeFormat = state.dyeFormat; seconds = state.seconds; velocityMax = state.velocityMax; targetErrorMax = state.targetErrorMax; frameCount++;
			if (state.final && !settledAt) settledAt = performance.now() - start;
			const capture = state.final || [0.5, 1, 2, 4][frames.length] <= seconds;
			if (capture) {
				retained.getContext('2d')!.drawImage(canvas, 0, 0);
				if (!state.final) frames.push({ seconds, wallMs: performance.now() - start, png: retained.toDataURL() });
			}
		}});
		try {
			engine = new FluidEngine({ canvas, config: { seed: Number(params.get('seed') ?? 5), simResolution: 128, dyeResolution: 512, pressureIterations: 20, curl: 10, densityDissipation: 0, velocityDissipation: 4, initialSplatCount: 8, shading: false, bloom: false, sunrays: false, distortionImageUrl: url }, onFrameError: (error) => { status = String(error); } });
			status = `Drag to disturb. Experimental ${params.get('variant') === '1' ? 'V1 reference map' : 'V0 dye nudging'}.`;
			Object.assign(window, { __e5: {
				ready: true,
				beginDisturbance,
				intermediate: () => retained.toDataURL(),
				state: () => ({ settled: engine?.isSettled, paused: engine?.isPaused, seconds, draws, pixels, frameCount, velocityMax, targetErrorMax }),
				result: () => ({ ...fidelity(retained.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data, targetPixels, canvas.width, canvas.height), seconds, wallMs: settledAt || performance.now() - start, draws, pixels, dyeFormat, frameCount, frames, width: canvas.width, height: canvas.height, final: retained.toDataURL() }),
				dispose: () => { engine?.dispose(); release?.(); }
			} });
		} catch (error) { status = `Static fallback: ${String(error)}`; }
	}
	function upload(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file || !file.type.startsWith('image/')) return;
		if (localUrl) URL.revokeObjectURL(localUrl);
		localUrl = URL.createObjectURL(file); void startImage(localUrl);
	}
	onMount(() => {
		mounted = true;
		const requested = new URLSearchParams(location.search).get('image');
		if (requested && images.includes(requested)) selected = requested;
		void startImage();
		return () => { alive = false; generation++; engine?.dispose(); release?.(); if (localUrl) URL.revokeObjectURL(localUrl); };
	});
</script>

<svelte:head><title>Image convergence lab</title></svelte:head>
<main>
	<h1>Image convergence lab</h1>
	<p>Experimental. No public API changes. The image stops rendering at rest; drag to disturb it.</p>
	<label>Frozen image <select bind:value={selected} onchange={() => mounted && startImage()}>{#each images as image}<option value={image}>{image}</option>{/each}</select></label>
	<label>Try an image <input type="file" accept="image/*" onchange={upload} /></label>
	<p role="status">{status}</p>
	<canvas bind:this={canvas} aria-label="Interactive fluid image"></canvas>
	<button onclick={() => startImage()}>Replay</button>
	<button onclick={() => engine?.splat(.5, .5, 180, -120, { r: .1, g: .2, b: .3 })}>Disturb image</button>
</main>
<style>
	main { max-width: 60rem; margin: 2rem auto; padding: 1rem; }
	label { display: block; margin: 1rem 0; }
	canvas { display: block; max-width: 100%; background: white; }
	button { margin-top: 1rem; }
</style>
