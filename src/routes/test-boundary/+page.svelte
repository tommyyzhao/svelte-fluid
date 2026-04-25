<script lang="ts">
	import FluidReveal from '$lib/FluidReveal.svelte';
	import { base } from '$app/paths';
</script>

<svelte:head>
	<title>Boundary Testing — svelte-fluid</title>
</svelte:head>

<div class="page">
	<a href="{base}/" class="back-link">&larr; Back to demos</a>
	<h1>Open Boundary Testing</h1>
	<p class="subtitle">
		Each row shows the same shape with <code>openBoundary=false</code> (left)
		vs <code>openBoundary=true</code> (right). All use auto-reveal.
	</p>

	<!-- No container shape (full rect) — baseline -->
	<section>
		<h2>No container shape (baseline)</h2>
		<div class="demo-row">
			<div class="demo-col">
				<span class="label">closed</span>
				<FluidReveal
					openBoundary={false}
					autoReveal
					autoRevealSpeed={1.2}
					fadeBack={false}
					class="demo-card"
				>
					<div class="content grad-a"><p>openBoundary=false</p></div>
				</FluidReveal>
			</div>
			<div class="demo-col">
				<span class="label">open</span>
				<FluidReveal
					openBoundary={true}
					autoReveal
					autoRevealSpeed={1.2}
					fadeBack={false}
					class="demo-card"
				>
					<div class="content grad-a"><p>openBoundary=true</p></div>
				</FluidReveal>
			</div>
		</div>
	</section>

	<!-- Circle -->
	<section>
		<h2>Circle</h2>
		<div class="demo-row">
			<div class="demo-col">
				<span class="label">closed</span>
				<FluidReveal
					openBoundary={false}
					containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.4 }}
					autoReveal
					autoRevealSpeed={1.2}
					fadeBack={false}
					class="demo-card"
				>
					<div class="content grad-b"><p>closed + circle</p></div>
				</FluidReveal>
			</div>
			<div class="demo-col">
				<span class="label">open</span>
				<FluidReveal
					openBoundary={true}
					containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.4 }}
					autoReveal
					autoRevealSpeed={1.2}
					fadeBack={false}
					class="demo-card"
				>
					<div class="content grad-b"><p>open + circle</p></div>
				</FluidReveal>
			</div>
		</div>
	</section>

	<!-- Rounded rect -->
	<section>
		<h2>Rounded rect</h2>
		<div class="demo-row">
			<div class="demo-col">
				<span class="label">closed</span>
				<FluidReveal
					openBoundary={false}
					containerShape={{ type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.4, halfH: 0.4, cornerRadius: 0.08 }}
					autoReveal
					autoRevealSpeed={1.2}
					fadeBack={false}
					class="demo-card"
				>
					<div class="content grad-c"><p>closed + roundedRect</p></div>
				</FluidReveal>
			</div>
			<div class="demo-col">
				<span class="label">open</span>
				<FluidReveal
					openBoundary={true}
					containerShape={{ type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.4, halfH: 0.4, cornerRadius: 0.08 }}
					autoReveal
					autoRevealSpeed={1.2}
					fadeBack={false}
					class="demo-card"
				>
					<div class="content grad-c"><p>open + roundedRect</p></div>
				</FluidReveal>
			</div>
		</div>
	</section>

	<!-- SVG path -->
	<section>
		<h2>SVG path (star)</h2>
		<div class="demo-row">
			<div class="demo-col">
				<span class="label">closed</span>
				<FluidReveal
					openBoundary={false}
					containerShape={{ type: 'svgPath', d: 'M50 5 L61 39 L97 39 L68 61 L79 95 L50 73 L21 95 L32 61 L3 39 L39 39 Z' }}
					autoReveal
					autoRevealSpeed={1.2}
					fadeBack={false}
					class="demo-card"
				>
					<div class="content grad-e"><p>closed + svgPath</p></div>
				</FluidReveal>
			</div>
			<div class="demo-col">
				<span class="label">open</span>
				<FluidReveal
					openBoundary={true}
					containerShape={{ type: 'svgPath', d: 'M50 5 L61 39 L97 39 L68 61 L79 95 L50 73 L21 95 L32 61 L3 39 L39 39 Z' }}
					autoReveal
					autoRevealSpeed={1.2}
					fadeBack={false}
					class="demo-card"
				>
					<div class="content grad-e"><p>open + svgPath</p></div>
				</FluidReveal>
			</div>
		</div>
	</section>
</div>

<style>
	.page {
		max-width: 1000px;
		margin: 0 auto;
		padding: 2rem;
		font-family: system-ui, -apple-system, sans-serif;
		color: #eee;
		background: #0a0a1a;
		min-height: 100vh;
	}
	.back-link {
		color: #88f;
		text-decoration: none;
		font-size: 0.9rem;
	}
	.back-link:hover { text-decoration: underline; }
	h1 {
		font-size: 2rem;
		margin: 1rem 0 0.25rem;
	}
	.subtitle {
		color: #999;
		margin-bottom: 2rem;
		line-height: 1.5;
	}
	.subtitle code {
		background: #222;
		padding: 0.15em 0.4em;
		border-radius: 3px;
		font-size: 0.85em;
	}
	section {
		margin-bottom: 2.5rem;
	}
	h2 {
		font-size: 1.1rem;
		color: #aaa;
		margin-bottom: 0.5rem;
	}
	.demo-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.5rem;
	}
	.demo-col {
		position: relative;
	}
	.label {
		position: absolute;
		top: 8px;
		left: 8px;
		z-index: 10;
		background: rgba(0, 0, 0, 0.7);
		color: #fff;
		font-size: 0.7rem;
		padding: 2px 8px;
		border-radius: 4px;
		font-family: monospace;
		pointer-events: none;
	}
	.demo-col :global(.demo-card) {
		width: 100%;
		height: 250px;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.08);
	}
	.content {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 12px;
		color: #fff;
		font-size: 0.85rem;
	}
	.content p { margin: 0; opacity: 0.8; }

	.grad-a { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
	.grad-b { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
	.grad-c { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }
	.grad-e { background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); }
</style>
