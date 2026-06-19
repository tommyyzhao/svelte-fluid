<script lang="ts">
	import { Fluid, SvgPathFluid } from '$lib/index.js';

	// Path data is authored in a 0–100 viewBox; the engine fits it to the canvas.
	const STAR =
		'M50,5 L61.8,37.6 L97.6,37.6 L68.8,58.8 L79.4,91.4 L50,72 L20.6,91.4 L31.2,58.8 L2.4,37.6 L38.2,37.6 Z';
	const HEART =
		'M50,90 C25,70 0,50 0,30 C0,10 15,0 30,0 C40,0 48,5 50,15 C52,5 60,0 70,0 C85,0 100,10 100,30 C100,50 75,70 50,90 Z';
</script>

<svelte:head>
	<title>Container shapes — svelte-fluid</title>
	<meta
		name="description"
		content="Confine a svelte-fluid simulation to analytical shapes — circle, rounded rectangle, frame, annulus — or to arbitrary SVG paths and text glyphs."
	/>
</svelte:head>

<main class="page">
	<h1>Container shapes</h1>
	<p class="intro">
		A fluid simulation can be confined to a container. Simple regions are described analytically — a
		circle, a rounded rectangle, a frame, or an annulus — and evaluated as a signed-distance field
		on the GPU. For anything more elaborate, point the simulation at an arbitrary SVG path or a
		string of text and the fluid fills the rasterized glyphs instead.
	</p>

	<section>
		<h2>Analytical shapes</h2>
		<div class="grid">
			<figure class="card">
				<div class="stage">
					<Fluid
						seed={11}
						containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.42 }}
						lazy
						aria-label="Fluid confined to a circle"
					/>
				</div>
				<figcaption>Circle — a single radius around a centre point.</figcaption>
			</figure>

			<figure class="card">
				<div class="stage">
					<Fluid
						seed={22}
						containerShape={{
							type: 'roundedRect',
							cx: 0.5,
							cy: 0.5,
							halfW: 0.42,
							halfH: 0.32,
							cornerRadius: 0.12
						}}
						lazy
						aria-label="Fluid confined to a rounded rectangle"
					/>
				</div>
				<figcaption>Rounded rectangle — soft-cornered panel.</figcaption>
			</figure>

			<figure class="card">
				<div class="stage">
					<Fluid
						seed={33}
						containerShape={{
							type: 'frame',
							cx: 0.5,
							cy: 0.5,
							halfW: 0.42,
							halfH: 0.32,
							outerHalfW: 0.46,
							outerHalfH: 0.36
						}}
						lazy
						aria-label="Fluid confined to a frame"
					/>
				</div>
				<figcaption>Frame — fluid runs the border, the centre stays clear.</figcaption>
			</figure>

			<figure class="card">
				<div class="stage">
					<Fluid
						seed={44}
						containerShape={{
							type: 'annulus',
							cx: 0.5,
							cy: 0.5,
							innerRadius: 0.18,
							outerRadius: 0.42
						}}
						lazy
						aria-label="Fluid confined to an annulus"
					/>
				</div>
				<figcaption>Annulus — a ring between two radii.</figcaption>
			</figure>
		</div>
	</section>

	<section>
		<h2>SVG paths &amp; text</h2>
		<div class="grid">
			<figure class="card">
				<div class="stage">
					<SvgPathFluid seed={42} lazy aria-label="Fluid filling an ampersand glyph" />
				</div>
				<figcaption>
					Text glyph — the <code>SvgPathFluid</code> preset fills an ampersand rasterized from a font.
				</figcaption>
			</figure>

			<figure class="card">
				<div class="stage">
					<Fluid
						seed={123}
						containerShape={{ type: 'svgPath', d: HEART }}
						densityDissipation={0.5}
						curl={25}
						bloom
						sunrays={false}
						autoSplatRate={1}
						autoSplatBandHeight={2.0}
						lazy
						aria-label="Fluid filling a heart-shaped SVG path"
					/>
				</div>
				<figcaption>SVG path — a hand-authored heart outline.</figcaption>
			</figure>

			<figure class="card">
				<div class="stage">
					<Fluid
						seed={789}
						containerShape={{ type: 'svgPath', d: STAR, fillRule: 'evenodd' }}
						densityDissipation={0.5}
						bloom={false}
						sunrays={false}
						autoSplatRate={1}
						autoSplatBandHeight={2.0}
						lazy
						aria-label="Fluid filling a star-shaped SVG path"
					/>
				</div>
				<figcaption>
					SVG path — a five-point star filled with the <code>evenodd</code> rule.
				</figcaption>
			</figure>
		</div>
	</section>
</main>

<style>
	.page {
		max-width: 900px;
		margin: 0 auto;
		padding: 2rem 1rem 4rem;
		font-family: system-ui, -apple-system, sans-serif;
		color: #eee;
	}
	h1 {
		margin: 0.5rem 0 0.75rem;
		font-size: 2rem;
	}
	.intro {
		margin: 0 0 2.5rem;
		max-width: 60ch;
		line-height: 1.55;
		color: #b8b8c4;
	}
	section {
		margin-bottom: 3rem;
	}
	h2 {
		margin: 0 0 1rem;
		font-size: 1.15rem;
		color: #cfcfe0;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1.5rem;
	}
	.card {
		margin: 0;
		background: #111;
		border: 1px solid #2a2a2a;
		border-radius: 8px;
		overflow: hidden;
	}
	.stage {
		aspect-ratio: 4 / 3;
	}
	figcaption {
		padding: 0.6rem 0.75rem;
		font-size: 0.8125rem;
		line-height: 1.4;
		color: #b0b0bc;
		border-top: 1px solid #2a2a2a;
	}
	figcaption code {
		font-size: 0.78rem;
		color: #8be9fd;
	}
</style>
