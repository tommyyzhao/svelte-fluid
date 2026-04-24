<script lang="ts">
	import { base } from '$app/paths';
	import FluidBackground from '$lib/FluidBackground.svelte';
	import LavaLamp from '$lib/presets/LavaLamp.svelte';
	import Plasma from '$lib/presets/Plasma.svelte';
	import InkInWater from '$lib/presets/InkInWater.svelte';
	import FrozenSwirl from '$lib/presets/FrozenSwirl.svelte';
	import Aurora from '$lib/presets/Aurora.svelte';

	const cards = [
		{
			title: 'Fluid Simulation',
			body: 'Real-time fluid dynamics on the GPU via WebGL. Velocity, pressure, advection — the full physics pipeline.'
		},
		{
			title: 'Container Shapes',
			body: 'Confine fluid inside circles, frames, rings, rounded rectangles, or custom SVG paths and text.'
		},
		{
			title: 'Glass Effects',
			body: 'Glass lens effect with light bending, reflective highlights, and rainbow color fringing.'
		},
		{
			title: 'Svelte 5 Runes',
			body: 'Reactive props via runes, zero runtime dependencies, and a clean imperative API surface.'
		},
		{
			title: '9 Presets',
			body: 'LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora — drop-in components with curated defaults.'
		},
		{
			title: 'Background Mode',
			body: "Full-viewport fluid with DOM exclusion zones. The fluid physically can't enter these cards."
		}
	];
</script>

<FluidBackground
	exclude=".card, .preset-card"
	splatOnHover
	colorful
	shading
	bloom
	bloomIterations={4}
	bloomIntensity={0.6}
	sunrays={false}
	densityDissipation={0.4}
	velocityDissipation={0.3}
	curl={50}
	splatRadius={0.05}
	splatForce={3000}
>
	<main class="content">
		<header>
			<h1>Background Fluid</h1>
			<p class="sub">
				Full-viewport fluid simulation with DOM element exclusion zones
			</p>
		</header>

		<div class="grid">
			{#each cards as card}
				<div class="card">
					<h2>{card.title}</h2>
					<p>{card.body}</p>
				</div>
			{/each}
		</div>

		<section class="how">
			<h2>How it works</h2>
			<p>
				A single <code>&lt;Fluid&gt;</code> canvas covers the viewport at
				<code>position:&nbsp;fixed</code>. Card bounding rectangles are measured via
				<code>getBoundingClientRect()</code> and encoded as holes in an SVG path
				using <code>fillRule:&nbsp;'evenodd'</code>. The engine rasterizes this path to a
				mask texture via <code>Path2D</code> on an OffscreenCanvas, then multiplies
				velocity and dye fields by the mask every physics step. Fluid genuinely cannot
				enter the exclusion zones — it pools around them and flows through the gaps.
			</p>
		</section>

		<h2 class="section-title">Presets</h2>

		<div class="preset-grid">
			<div class="preset-card">
				<div class="preset-canvas"><LavaLamp lazy /></div>
				<p class="preset-label">LavaLamp</p>
			</div>
			<div class="preset-card">
				<div class="preset-canvas"><Plasma lazy /></div>
				<p class="preset-label">Plasma</p>
			</div>
			<div class="preset-card">
				<div class="preset-canvas"><InkInWater lazy /></div>
				<p class="preset-label">InkInWater</p>
			</div>
			<div class="preset-card">
				<div class="preset-canvas"><FrozenSwirl lazy /></div>
				<p class="preset-label">FrozenSwirl</p>
			</div>
			<div class="preset-card">
				<div class="preset-canvas"><Aurora lazy /></div>
				<p class="preset-label">Aurora</p>
			</div>
		</div>

		<footer class="footer">
			<p>
				<a href="{base}/">Back to main demo</a>
			</p>
		</footer>
	</main>
</FluidBackground>

<style>
	:global(body) {
		margin: 0;
		background: #08080f;
		font-family: system-ui, -apple-system, sans-serif;
	}

	.content {
		max-width: 880px;
		margin: 0 auto;
		padding: 5rem 1.5rem 4rem;
		color: white;
	}

	/* --- Header --- */
	header {
		margin-bottom: 3rem;
	}
	h1 {
		font-size: 3rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		margin: 0 0 0.5rem;
		text-shadow: 0 2px 20px rgba(0, 0, 0, 0.7);
	}
	.sub {
		font-size: 1.15rem;
		color: rgba(255, 255, 255, 0.5);
		margin: 0;
		text-shadow: 0 1px 10px rgba(0, 0, 0, 0.6);
	}

	/* --- Feature card grid --- */
	.grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.25rem;
		margin-bottom: 3rem;
	}

	.card {
		pointer-events: auto;
		background: rgba(12, 12, 22, 0.92);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: 16px;
		padding: 1.5rem;
		transition: border-color 0.2s;
	}
	.card:hover {
		border-color: rgba(255, 255, 255, 0.18);
	}
	.card h2 {
		font-size: 1.15rem;
		font-weight: 600;
		margin: 0 0 0.4rem;
	}
	.card p {
		font-size: 0.9rem;
		color: rgba(255, 255, 255, 0.55);
		line-height: 1.55;
		margin: 0;
	}

	/* --- How it works --- */
	.how {
		pointer-events: auto;
		max-width: 660px;
		margin-bottom: 3rem;
	}
	.how h2 {
		font-size: 1.4rem;
		font-weight: 700;
		margin: 0 0 1rem;
		text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
	}
	.how p {
		font-size: 0.92rem;
		color: rgba(255, 255, 255, 0.5);
		line-height: 1.65;
		margin: 0 0 1rem;
	}
	.how code {
		font-size: 0.85em;
		background: rgba(255, 255, 255, 0.07);
		padding: 0.15em 0.4em;
		border-radius: 4px;
		color: rgba(255, 255, 255, 0.7);
	}

	/* --- Presets --- */
	.section-title {
		font-size: 1.4rem;
		font-weight: 700;
		margin: 0 0 1.25rem;
		text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
	}

	.preset-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.25rem;
		margin-bottom: 4rem;
	}

	.preset-card {
		pointer-events: auto;
		background: rgba(12, 12, 22, 0.92);
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: 16px;
		overflow: hidden;
		transition: border-color 0.2s;
	}
	.preset-card:hover {
		border-color: rgba(255, 255, 255, 0.18);
	}

	.preset-canvas {
		height: 200px;
	}

	.preset-label {
		font-size: 0.95rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.7);
		margin: 0;
		padding: 0.75rem 1.25rem;
	}

	/* --- Footer --- */
	.footer {
		pointer-events: auto;
		text-align: center;
		padding: 2rem 0;
	}
	.footer a {
		color: rgba(255, 255, 255, 0.4);
		text-decoration: none;
		font-size: 0.9rem;
		transition: color 0.2s;
	}
	.footer a:hover {
		color: rgba(255, 255, 255, 0.7);
	}

	@media (max-width: 640px) {
		.grid,
		.preset-grid {
			grid-template-columns: 1fr;
		}
		h1 {
			font-size: 2.2rem;
		}
		.content {
			padding: 3rem 1rem 3rem;
		}
	}
</style>
