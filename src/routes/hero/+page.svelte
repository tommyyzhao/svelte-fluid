<!--
  /hero — banner capture route.

  Fixed 1280×640 layout, 2×2 grid showcasing the four headline
  capabilities: text-masked fluid, glass refraction, reveal scratch,
  image distortion. Deterministic seeds and auto-* animations so
  the scene records cleanly without pointer input.
-->

<script lang="ts">
	import { Fluid, FluidText, FluidReveal, FluidDistortion } from '$lib/index.js';
	import { base } from '$app/paths';
</script>

<svelte:head>
	<title>svelte-fluid — hero capture</title>
</svelte:head>

<div class="stage">
	<div class="grid">
		<!-- Top-left: text-masked fluid -->
		<div class="cell">
			<FluidText
				text="fluid"
				font="900 220px 'Helvetica Neue', Arial, sans-serif"
				seed={101}
				colorful
				bloom
				sunrays
				densityDissipation={0.6}
				initialSplatCount={18}
				randomSplatRate={2.5}
				randomSplatCount={2}
				randomSplatSpread={2}
			/>
		</div>

		<!-- Top-right: glass orb -->
		<div class="cell">
			<Fluid
				seed={202}
				containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.42 }}
				glass
				glassThickness={0.05}
				glassRefraction={0.55}
				glassReflectivity={0.18}
				glassChromatic={0.25}
				bloom
				sunrays
				colorful
				densityDissipation={0.4}
				initialSplatCount={14}
				randomSplatRate={2}
				randomSplatCount={1}
				randomSplatSwirl={0.6}
			/>
		</div>

		<!-- Bottom-left: reveal scratch over a tagline -->
		<div class="cell reveal-cell">
			<FluidReveal
				seed={303}
				autoReveal
				autoRevealSpeed={1.2}
				sensitivity={0.18}
				curve={0.5}
				fadeBack
				coverColor={{ r: 0.07, g: 0.07, b: 0.08 }}
				fringeColor={{ r: 0.85, g: 0.55, b: 0.95 }}
				accentColor={{ r: 0.25, g: 0.45, b: 0.95 }}
			>
				<div class="reveal-content">
					<div class="kicker">scratch &amp; reveal</div>
					<div class="headline">WebGL fluid<br />for Svelte 5</div>
				</div>
			</FluidReveal>
		</div>

		<!-- Bottom-right: image distortion -->
		<div class="cell">
			<FluidDistortion
				seed={404}
				src="{base}/bosch-garden.jpg"
				autoDistort
				autoDistortSpeed={1.0}
				strength={0.32}
				intensity={18}
				initialSplats={3}
				fit="cover"
				scale={1.15}
			/>
		</div>
	</div>
</div>

<style>
	:global(html, body) {
		background: #0a0a0a;
	}

	.stage {
		width: 1280px;
		height: 640px;
		margin: 0;
		background: #0a0a0a;
		overflow: hidden;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr 1fr;
		width: 100%;
		height: 100%;
		gap: 0;
	}

	.cell {
		position: relative;
		overflow: hidden;
	}

	.reveal-cell {
		background: #0a0a0a;
	}

	.reveal-content {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		text-align: center;
		padding: 24px;
		color: #f5f5f7;
	}

	.kicker {
		font-size: 13px;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: #a8a8b3;
	}

	.headline {
		font-size: 26px;
		font-weight: 700;
		line-height: 1.2;
		letter-spacing: -0.01em;
	}
</style>
