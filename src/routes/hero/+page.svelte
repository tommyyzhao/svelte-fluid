<!--
  /hero — banner capture route.

  Fixed 1280×640 layout, 2×2 grid on a white background (matches npmjs):
  - Top-left: FluidStick "fluid" text, infinite Lissajous cursor
  - Top-right: plain Fluid, delayed auto-splats that "arrive" from left panel
  - Bottom-left: FluidReveal, vigorous auto-reveal, iridescent accents, white cover
  - Bottom-right: FluidText "fluid", correctly centred, vigorous swirling splats
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import { Fluid, FluidStick, FluidReveal, FluidText } from '$lib/index.js';

	// Top-right starts silent, then "arrives" from the left panel 1 s before
	// capture begins (capture script warms up for 2.5 s total).
	let rightSplatRate = $state(0);

	onMount(() => {
		setTimeout(() => {
			rightSplatRate = 4;
		}, 1500);
	});
</script>

<svelte:head>
	<title>svelte-fluid — hero capture</title>
</svelte:head>

<div class="stage">
	<div class="grid">
		<!-- Top-left: sticky "svelte" — Lissajous cursor runs forever -->
		<div class="cell">
			<FluidStick
				text="svelte"
				font="900 180px 'Helvetica Neue', Arial, sans-serif"
				seed={101}
				colorful
				backColor={{ r: 255, g: 255, b: 255 }}
				autoAnimate
				autoAnimateSpeed={2.5}
				autoAnimateDuration={0}
				strength={0.97}
				amplify={3.0}
				densityDissipation={0.97}
				initialSplatCount={5}
			/>
		</div>

		<!-- Top-right: open fluid, splats arrive 1.5 s in with rightward push -->
		<div class="cell">
			<Fluid
				seed={202}
				colorful
				backColor={{ r: 255, g: 255, b: 255 }}
				densityDissipation={0.7}
				velocityDissipation={0.9}
				initialSplatCount={3}
				autoSplatRate={rightSplatRate}
				autoSplatCount={2}
				autoSplatVelocityX={700}
				autoSplatBandHeight={0.6}
				autoSplatCenterY={0.5}
			/>
		</div>

		<!-- Bottom-left: vigorous reveal, iridescent fringes, solid white cover.
		     curve=0.8 gives a wide soft gradient fringe so both teal (outer) and
		     magenta (inner) colours show up against the white cover. sensitivity=0.25
		     saturates the fringe colours so they read as vivid, not blue-gray. -->
		<div class="cell reveal-cell">
			<FluidReveal
				seed={303}
				autoReveal
				autoRevealSpeed={2.5}
				sensitivity={0.25}
				curve={0.8}
				fadeBack
				coverColor={{ r: 1, g: 1, b: 1 }}
				fringeColor={{ r: 0.2, g: 0.95, b: 0.85 }}
				accentColor={{ r: 0.88, g: 0.2, b: 0.95 }}
			>
				<div class="reveal-content">
					<div class="kicker">fluid reveal</div>
					<div class="headline">WebGL fluid components<br />for Svelte 5</div>
				</div>
			</FluidReveal>
		</div>

		<!-- Bottom-right: FluidText "fluid", centred, vigorous splats.
		     densityDissipation=0.7 so dye persists long enough to be visible on
		     the transparent canvas; curl=30 for extra turbulence inside letters. -->
		<div class="cell center-cell">
			<FluidText
				text="fluid"
				font="900 220px 'Helvetica Neue', Arial, sans-serif"
				seed={404}
				colorful
				densityDissipation={0.7}
				velocityDissipation={0.8}
				curl={30}
				initialSplatCount={25}
				autoSplatRate={3}
				autoSplatCount={2}
				autoSplatBandHeight={2}
				autoSplatSwirl={450}
				style="width: 100%"
			/>
		</div>
	</div>
</div>

<style>
	:global(html, body) {
		background: #ffffff;
		margin: 0;
		padding: 0;
	}

	.stage {
		width: 1280px;
		height: 640px;
		margin: 0;
		background: #ffffff;
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
		background: #ffffff;
	}

	/* Vertically centre FluidText within its cell. FluidText is inline-block
	   with a computed aspect-ratio, so flex centering is needed here. */
	.center-cell {
		display: flex;
		align-items: center;
		justify-content: center;
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
		color: #1a1a1a;
	}

	.kicker {
		font-size: 13px;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: #6b6b7b;
	}

	.headline {
		font-size: 26px;
		font-weight: 700;
		line-height: 1.2;
		letter-spacing: -0.01em;
	}
</style>
