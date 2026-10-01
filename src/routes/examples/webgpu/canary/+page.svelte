<script lang="ts">
	import { base } from '$app/paths';
	import Fluid from '$lib/Fluid.svelte';
	import type { FluidConfig, PresetSplat } from '$lib/engine/types.js';
	import '../lab.css';

	// A sticky demo must actually wet the glyph, not hope that random opening
	// splats happen to land on a few letter strokes. These low-velocity impulses
	// cover the text's bounding band; ordinary dye disappears while the shared
	// sticky mask leaves the letterforms behind.
	const stickyGlyphSplats: ReadonlyArray<PresetSplat> = [
		[0.16, 0.38, 90, 35], [0.16, 0.5, -70, 45], [0.16, 0.62, 65, -55],
		[0.34, 0.38, -85, 45], [0.34, 0.5, 80, -35], [0.34, 0.62, -70, 55],
		[0.5, 0.38, 75, 40], [0.5, 0.5, -80, -45], [0.5, 0.62, 70, 50],
		[0.66, 0.38, -65, -50], [0.66, 0.5, 85, 35], [0.66, 0.62, -75, 45],
		[0.84, 0.38, 70, -40], [0.84, 0.5, -85, 50], [0.84, 0.62, 75, -35]
	].map(([x, y, dx, dy], index) => ({
		x,
		y,
		dx,
		dy,
		color: index % 3 === 0 ? { r: 0.15, g: 1.1, b: 0.38 } : index % 3 === 1 ? { r: 0.1, g: 0.55, b: 1.4 } : { r: 0.75, g: 0.16, b: 1.15 }
	}));

	const scenes: ReadonlyArray<{ title: string; proof: string; config: FluidConfig }> = [
		{
			title: 'Demanding channel flow',
			proof: 'Real <Fluid> host · MacCormack · scalar buoyancy · analytic inlet/outlet · CFD transfer',
			config: {
				seed: 0xcfd2026,
				initialSplatCount: 0,
				simResolution: 192,
				dyeResolution: 640,
				advectionScheme: 'maccormack',
				viscosity: 0.035,
				viscosityIterations: 8,
				vorticityAdaptive: 0.75,
				wallFriction: 0.2,
				bloom: false,
				sunrays: false,
				flow: {
					boundary: { left: 'open', right: 'open' },
					scalarFields: [{ name: 'temperature', dissipation: 0.015, range: [0, 1] }],
					sources: [
						{
							kind: 'line',
							from: { x: 0.06, y: 0.28 },
							to: { x: 0.06, y: 0.72 },
							thickness: 1.2,
							profile: 'parabolic',
							velocity: { x: 260, y: 0 },
							dye: { r: 0.05, g: 0.35, b: 1 },
							scalars: { temperature: 0.8 }
						}
					],
					forces: [
						{ kind: 'pressureGradient', vector: { x: 1.5, y: 0 } },
						{ kind: 'buoyancy', scalar: 'temperature', strength: 18 }
					],
					outlets: [{ edge: 'right', width: 0.08, clearVelocity: true, clearDye: 0 }],
					visualization: { colorBy: 'speed', transfer: 'cfd', range: [0, 280], glowBy: 'speed' }
				}
			}
		},
		{
			title: 'Sticky typography',
			proof: 'Shared CPU rasterizer · packed mask channel · targeted wetting · retention · pressure',
			config: {
				seed: 0x571c,
				initialSplatCount: 0,
				presetSplats: stickyGlyphSplats,
				simResolution: 176,
				dyeResolution: 640,
				sticky: true,
				stickyMask: { text: 'STICK', font: '900 72px sans-serif', padding: 0.8, blur: 2 },
				// Match FluidStick's continuous-time equivalent of the prior
				// 0.98/frame recipe so off-mask dye clears at the same pace.
				densityDissipation: 1.2,
				stickyStrength: 0.95,
				stickyPressure: 0.15,
				stickyAmplify: 2,
				splatRadius: 0.075,
				splatForce: 2200,
				bloom: false,
				sunrays: false
			}
		},
		{
			title: 'Glass HDR vessel',
			proof: 'Closed circle · lazy bloom/sunrays · mask-derived refraction · chromatic rim',
			config: {
				seed: 0x61a55,
				initialSplatCount: 10,
				simResolution: 176,
				dyeResolution: 640,
				advectionScheme: 'maccormack',
				containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.43 },
				glass: true,
				glassThickness: 0.025,
				glassRefraction: 0.7,
				glassReflectivity: 0.28,
				glassChromatic: 0.55,
				bloomIntensity: 0.9,
				sunraysWeight: 0.25
			}
		},
		{
			title: 'Async image distortion',
			proof: 'Race-safe image upload · velocity warp · cover fit · asset teardown · no post targets',
			config: {
				seed: 0xd157,
				initialSplatCount: 4,
				simResolution: 192,
				dyeResolution: 384,
				distortion: true,
				distortionImageUrl: `${base}/bosch-garden.jpg`,
				distortionPower: 0.72,
				distortionScale: 1.05,
				distortionFit: 'cover',
				bloom: true,
				sunrays: true,
				pointerInput: true,
				splatOnHover: true
			}
		}
	];
</script>

<svelte:head>
	<title>Real-host WebGPU canary — svelte-fluid</title>
	<meta name="description" content="The public Fluid component running on its production WebGPU engine." />
</svelte:head>

<main class="webgpu-page">
	<header>
		<span class="eyebrow">Production WebGPU · real component canary</span>
		<h1>The actual host, not a parallel demo wrapper</h1>
		<p class="lede">
			Every card below is the public <code>&lt;Fluid&gt;</code> component on the single WebGPU runtime. There is deliberately no backend selector.
		</p>
		<p class="canary-on" data-canary-status="webgpu">WebGPU is the only production backend on this R&amp;D branch.</p>
	</header>

	<div class="canary-grid">
		{#each scenes as scene (scene.title)}
			<section>
				<div class="feature-head"><strong>{scene.title}</strong><span>{scene.proof}</span></div>
				<div class="stage"><Fluid {...scene.config} aria-label={scene.title} /></div>
			</section>
		{/each}
	</div>
</main>

<style>
	.canary-on { width: fit-content; padding: .55rem .7rem; border: 1px solid rgba(255,255,255,.12); border-radius: .5rem; font: .75rem/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
	.canary-on { color: #9ff2c6; background: rgba(20,100,62,.2); }
	.canary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
	.canary-grid section { overflow: hidden; border: 1px solid rgba(255,255,255,.1); border-radius: .75rem; background: #080a10; }
	.feature-head { display: grid; gap: .25rem; min-height: 4.4rem; padding: .75rem .85rem; }
	.feature-head span { font: .68rem/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; color: #7f8aa1; }
	.stage { height: 420px; }
	@media (max-width: 800px) { .canary-grid { grid-template-columns: 1fr; } }
</style>
