<script lang="ts">
	import { Fluid, SvgPathFluid } from '$lib/index.js';

	const STAR = 'M50,5 L61.8,37.6 L97.6,37.6 L68.8,58.8 L79.4,91.4 L50,72 L20.6,91.4 L31.2,58.8 L2.4,37.6 L38.2,37.6 Z';
	const HEART = 'M50,90 C25,70 0,50 0,30 C0,10 15,0 30,0 C40,0 48,5 50,15 C52,5 60,0 70,0 C85,0 100,10 100,30 C100,50 75,70 50,90 Z';
	const RECT = 'M10,10 L90,10 L90,90 L10,90 Z';
</script>

<div class="page">
	<h1>SVG Path Container Shape Test</h1>

	<div class="grid">
		<div class="card">
			<h3>Star (SvgPathFluid preset)</h3>
			<div class="canvas-wrap">
				<SvgPathFluid seed={42} aria-label="Star preset" />
			</div>
		</div>

		<div class="card">
			<h3>Heart (raw Fluid + svgPath)</h3>
			<div class="canvas-wrap">
				<Fluid
					seed={123}
					containerShape={{ type: 'svgPath', d: HEART }}
					densityDissipation={0.5}
					curl={25}
					bloom
					sunrays={false}
					randomSplatRate={1}
					randomSplatSpread={2.0}
					aria-label="Heart shape"
				/>
			</div>
		</div>

		<div class="card">
			<h3>CONTROL: No containerShape</h3>
			<div class="canvas-wrap">
				<Fluid
					seed={456}
					densityDissipation={0.8}
					bloom={false}
					sunrays={false}
					aria-label="Control - no shape"
				/>
			</div>
		</div>

		<div class="card">
			<h3>Star (evenodd fill)</h3>
			<div class="canvas-wrap">
				<Fluid
					seed={789}
					containerShape={{ type: 'svgPath', d: STAR, fillRule: 'evenodd' }}
					densityDissipation={0.5}
					bloom={false}
					sunrays={false}
					randomSplatRate={1}
					randomSplatSpread={2.0}
					aria-label="Star evenodd"
				/>
			</div>
		</div>
	</div>
</div>

<style>
	.page {
		max-width: 900px;
		margin: 2rem auto;
		font-family: system-ui, sans-serif;
		color: #eee;
	}
	h1 { text-align: center; margin-bottom: 2rem; }
	.grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.5rem;
	}
	.card {
		background: #111;
		border: 1px solid #333;
		border-radius: 8px;
		overflow: hidden;
	}
	.card h3 {
		padding: 0.75rem 1rem;
		margin: 0;
		font-size: 0.9rem;
		border-bottom: 1px solid #333;
	}
	.canvas-wrap {
		aspect-ratio: 4/3;
	}
</style>
