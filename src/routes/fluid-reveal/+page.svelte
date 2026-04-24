<script lang="ts">
	import { base } from '$app/paths';
	import FluidReveal from '$lib/FluidReveal.svelte';
</script>

<svelte:head>
	<title>FluidReveal — svelte-fluid</title>
</svelte:head>

<div class="page">
	<a href="{base}/" class="back-link">&larr; Back to demos</a>
	<h1>FluidReveal</h1>
	<p class="subtitle">Fluid simulation as an opacity mask. Move your cursor to reveal content below.</p>

	<section>
		<h2>Default (fade-back)</h2>
		<div class="demo-row">
			<FluidReveal class="demo-card">
				<div class="content gradient-content">
					<h3>Hello, World!</h3>
					<p>This content is hidden behind a fluid mask. Move your cursor to reveal it. The reveal fades back over time.</p>
				</div>
			</FluidReveal>
		</div>
	</section>

	<section>
		<h2>Permanent reveal</h2>
		<div class="demo-row">
			<FluidReveal
				fadeBack={false}
				class="demo-card"
			>
				<div class="content image-content">
					<div class="color-grid">
						<div class="color-block" style:background="#e74c3c"></div>
						<div class="color-block" style:background="#3498db"></div>
						<div class="color-block" style:background="#2ecc71"></div>
						<div class="color-block" style:background="#f1c40f"></div>
						<div class="color-block" style:background="#9b59b6"></div>
						<div class="color-block" style:background="#1abc9c"></div>
						<div class="color-block" style:background="#e67e22"></div>
						<div class="color-block" style:background="#ecf0f1"></div>
						<div class="color-block" style:background="#e91e63"></div>
					</div>
				</div>
			</FluidReveal>
		</div>
	</section>

	<section>
		<h2>Auto-reveal animation</h2>
		<div class="demo-row">
			<FluidReveal
				autoReveal
				autoRevealSpeed={0.8}
				fadeBack={false}
				sensitivity={0.15}
				class="demo-card"
			>
				<div class="content auto-content">
					<h3>Automatic Reveal</h3>
					<p>An automated cursor traces a pattern to reveal content. Touch or click to take over.</p>
					<div class="sparkle-grid">
						{#each Array(16) as _, i}
							<div class="sparkle" style:background="hsl({i * 22.5}, 70%, 60%)"></div>
						{/each}
					</div>
				</div>
			</FluidReveal>
		</div>
	</section>

	<section>
		<h2>Soft reveal (high curve)</h2>
		<div class="demo-row">
			<FluidReveal
				curve={0.5}
				sensitivity={0.2}
				splatRadius={0.3}
				class="demo-card"
			>
				<div class="content gradient-content-2">
					<h3>Soft Edges</h3>
					<p>Higher curve values create a softer, more gradual reveal transition.</p>
				</div>
			</FluidReveal>
		</div>
	</section>

	<section>
		<h2>With container shape (circular reveal zone)</h2>
		<div class="demo-row">
			<FluidReveal
				containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.4 }}
				fadeBack={false}
				class="demo-card"
			>
				<div class="content shape-content">
					<h3>Circular Zone</h3>
					<p>The reveal only works inside the circle. Outside is transparent.</p>
				</div>
			</FluidReveal>
		</div>
	</section>
</div>

<style>
	.page {
		max-width: 900px;
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
		font-size: 2.5rem;
		margin: 1rem 0 0.25rem;
	}
	.subtitle {
		color: #999;
		margin-bottom: 2rem;
	}
	section {
		margin-bottom: 3rem;
	}
	h2 {
		font-size: 1.2rem;
		color: #aaa;
		margin-bottom: 0.75rem;
	}
	.demo-row {
		display: flex;
		gap: 1.5rem;
	}
	.demo-row :global(.demo-card) {
		width: 100%;
		height: 300px;
		border-radius: 12px;
	}
	.content {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		box-sizing: border-box;
		text-align: center;
		border-radius: 12px;
	}
	.content h3 {
		margin: 0 0 0.5rem;
		font-size: 1.5rem;
	}
	.content p {
		margin: 0;
		font-size: 0.95rem;
		line-height: 1.5;
		max-width: 400px;
	}

	/* Visual content styles */
	.gradient-content {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: #fff;
	}
	.gradient-content-2 {
		background: linear-gradient(135deg, #f093fb 0%, #f5576c 50%, #4facfe 100%);
		color: #fff;
	}
	.image-content {
		background: #1a1a2e;
		padding: 1.5rem;
	}
	.color-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
		width: 100%;
		max-width: 280px;
	}
	.color-block {
		aspect-ratio: 1;
		border-radius: 8px;
	}
	.auto-content {
		background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
		color: #fff;
	}
	.sparkle-grid {
		display: grid;
		grid-template-columns: repeat(8, 1fr);
		gap: 0.5rem;
		margin-top: 1rem;
		width: 100%;
		max-width: 320px;
	}
	.sparkle {
		aspect-ratio: 1;
		border-radius: 50%;
	}
	.shape-content {
		background: linear-gradient(135deg, #11998e, #38ef7d);
		color: #fff;
	}
</style>
