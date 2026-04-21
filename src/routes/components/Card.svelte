<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		description,
		snippet,
		children
	}: {
		title: string;
		description?: string;
		snippet?: string;
		children: Snippet;
	} = $props();

	let showCode = $state(false);

	function copySnippet() {
		if (snippet) navigator.clipboard.writeText(snippet);
	}
</script>

<figure class="card">
	<div class="canvas-slot">{@render children()}</div>
	<figcaption>
		<div class="caption-row">
			<div>
				<h3>{title}</h3>
				{#if description}
					<p>{description}</p>
				{/if}
			</div>
			{#if snippet}
				<button
					class="code-toggle"
					class:active={showCode}
					onclick={() => (showCode = !showCode)}
					aria-label="Toggle code snippet">&lt;/&gt;</button
				>
			{/if}
		</div>
		{#if snippet && showCode}
			<div class="snippet-wrap">
				<pre><code>{snippet}</code></pre>
				<button class="copy-btn" onclick={copySnippet}>Copy</button>
			</div>
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
	.caption-row {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 8px;
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
	.code-toggle {
		flex-shrink: 0;
		padding: 2px 8px;
		font-size: 0.75rem;
		font-family: monospace;
		background: transparent;
		border: 1px solid #333;
		border-radius: 4px;
		color: #666;
		cursor: pointer;
	}
	.code-toggle:hover,
	.code-toggle.active {
		color: #cce6ff;
		border-color: #555;
	}
	.snippet-wrap {
		position: relative;
		margin-top: 10px;
	}
	pre {
		margin: 0;
		padding: 10px 12px;
		background: #0d0d0d;
		border: 1px solid #222;
		border-radius: 6px;
		overflow-x: auto;
		font-size: 0.72rem;
		line-height: 1.5;
		color: #b0c4de;
	}
	.copy-btn {
		position: absolute;
		top: 6px;
		right: 6px;
		padding: 2px 8px;
		font-size: 0.65rem;
		background: #222;
		border: 1px solid #333;
		border-radius: 3px;
		color: #888;
		cursor: pointer;
	}
	.copy-btn:hover {
		color: #fff;
		border-color: #555;
	}
</style>
