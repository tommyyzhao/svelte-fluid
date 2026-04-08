<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		description,
		children
	}: {
		title: string;
		description?: string;
		children: Snippet;
	} = $props();
</script>

<figure class="card">
	<div class="canvas-slot">{@render children()}</div>
	<figcaption>
		<h3>{title}</h3>
		{#if description}
			<p>{description}</p>
		{/if}
	</figcaption>
</figure>

<style>
	.card {
		margin: 0;
		display: flex;
		flex-direction: column;
		background: #141414;
		border: 1px solid #222;
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
	}
	.canvas-slot {
		position: relative;
		width: 100%;
		height: 240px;
		background: #000;
	}
	figcaption {
		padding: 14px 18px 18px;
	}
	h3 {
		margin: 0 0 4px;
		font-size: 0.95rem;
		font-weight: 600;
		letter-spacing: 0.01em;
	}
	p {
		margin: 0;
		font-size: 0.8rem;
		color: #888;
		line-height: 1.4;
	}
</style>
