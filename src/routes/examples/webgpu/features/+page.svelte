<script lang="ts">
	import type { FluidConfig } from '$lib/engine/types.js';
	import Fluid from '$lib/Fluid.svelte';
	import '../lab.css';

	const scenes: ReadonlyArray<{ title: string; proof: string; config: FluidConfig }> = [
		{
			title: 'Second-order contained flow',
			proof: 'MacCormack · implicit viscosity · adaptive vorticity · wall friction · closed circle',
			config: {
				seed: 0x51a7,
				initialSplatCount: 8,
				simResolution: 160,
				dyeResolution: 512,
				advectionScheme: 'maccormack',
				viscosity: 0.08,
				viscosityIterations: 8,
				vorticityAdaptive: 0.55,
				wallFriction: 0.22,
				wallFrictionWidth: 2,
				containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.43 }
			}
		},
		{
			title: 'Visible solid obstruction',
			proof: 'Canonical CPU mask · no-penetration projection · obstruction fill · automatic forcing',
			config: {
				seed: 0xc71d,
				initialSplatCount: 4,
				simResolution: 160,
				dyeResolution: 512,
				autoSplatRate: 3,
				autoSplatCount: 1,
				autoSplatCenterX: 0.2,
				autoSplatBandWidth: 0.04,
				autoSplatVelocityX: 420,
				autoSplatColor: { r: 0.08, g: 0.42, b: 1 },
				obstructions: [
					{
						d: 'M 50 20 A 30 30 0 1 1 49.99 20 Z',
						viewBox: [0, 0, 100, 100],
						scale: 0.52
					}
				],
				obstructionColor: { r: 228, g: 232, b: 242 },
				wallFriction: 0.35
			}
		},
		{
			title: 'Reveal compositing',
			proof: 'Premultiplied surface · cover/accent/fringe curve · pointer input owned by the engine',
			config: {
				seed: 0x7eae,
				initialSplatCount: 5,
				simResolution: 144,
				dyeResolution: 512,
				reveal: true,
				openBoundary: true,
				revealSensitivity: 0.13,
				revealCurve: 0.62,
				revealCoverColor: { r: 0.92, g: 0.95, b: 1 },
				revealFringeColor: { r: 0.35, g: 0.68, b: 1 },
				revealAccentColor: { r: 0.06, g: 0.12, b: 0.28 }
			}
		},
		{
			title: 'Rasterized text vessel',
			proof: 'Canvas2D text raster · one RGBA mask upload · shared solver/display geometry',
			config: {
				seed: 0x6a70,
				initialSplatCount: 14,
				simResolution: 176,
				dyeResolution: 512,
				containerShape: {
					type: 'svgPath',
					text: 'GPU',
					font: '900 88px sans-serif',
					maskResolution: 512
				},
				wallFriction: 0.15
			}
		}
	];
</script>

<svelte:head>
	<title>Native WebGPU feature matrix — svelte-fluid</title>
	<meta name="description" content="Hardware-rendered native WebGPU solver, geometry, input, and compositing proofs." />
</svelte:head>

<main class="webgpu-page">
	<header>
		<span class="eyebrow">Phase 2/3 canary · native production graph</span>
		<h1>Parity features, composed instead of isolated</h1>
		<p class="lede">
			These are production-owned WebGPU passes—not vGPU sketches. Drag on any card. The point is to expose interactions: second-order advection against solid masks, pressure near walls, automatic input, and alpha compositing.
		</p>
	</header>

	<div class="feature-grid">
		{#each scenes as scene (scene.title)}
			<section>
				<div class="feature-head"><strong>{scene.title}</strong><span>{scene.proof}</span></div>
				<div class="stage"><Fluid {...scene.config} aria-label={scene.title} /></div>
			</section>
		{/each}
	</div>

	<section class="lab-note">
		<strong>This matrix is now the solver/geometry baseline.</strong> Bloom, sunrays, glass, sticky, distortion, scalar flow, prescribed grids, state-preserving resize, and device recovery have moved to the real-host canary route so this page stays a stable visual control.
	</section>
</main>

<style>
	.feature-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
	.feature-grid section { overflow: hidden; border: 1px solid rgba(255,255,255,.1); border-radius: .75rem; background: #080a10; }
	.feature-head { display: grid; gap: .25rem; min-height: 4.4rem; padding: .75rem .85rem; }
	.feature-head span { font: .68rem/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; color: #7f8aa1; }
	.stage { height: 420px; }
	@media (max-width: 800px) { .feature-grid { grid-template-columns: 1fr; } }
</style>
