<!--
  Demo-site showcase card: fluid canvas + caption row with optional
  "View code" (expandable snippet + copy) and "Playground" (jump to the
  playground with a matching preset) actions. Colors come from the
  theme CSS vars set on .page, so cards follow the active theme.
-->
<script lang="ts">
	import { slide } from 'svelte/transition';
	import type { Snippet } from 'svelte';

	let {
		title,
		blurb,
		snippet,
		fullSnippet,
		height = 300,
		onCustomize,
		children
	}: {
		title: string;
		blurb?: string;
		snippet?: string;
		/** Optional full recreate-from-scratch code shown alongside the quick snippet. */
		fullSnippet?: string;
		/** Canvas height in px (sections use 220–300). */
		height?: number;
		onCustomize?: () => void;
		children: Snippet;
	} = $props();

	let showCode = $state(false);
	let copied = $state<'snippet' | 'full' | null>(null);
	let copyTimer: ReturnType<typeof setTimeout> | undefined;

	function copy(which: 'snippet' | 'full') {
		const text = which === 'snippet' ? snippet : fullSnippet;
		if (!text) return;
		navigator.clipboard.writeText(text);
		copied = which;
		clearTimeout(copyTimer);
		copyTimer = setTimeout(() => (copied = null), 1800);
	}
</script>

<figure class="card">
	<div class="card-fluid" style:height={`${height}px`}>{@render children()}</div>
	<figcaption>
		<div class="caption-row">
			<span class="card-name">{title}</span>
			{#if blurb}
				<span class="card-blurb">{blurb}</span>
			{/if}
			<span class="card-actions">
				{#if onCustomize}
					<button
						class="card-btn"
						onclick={onCustomize}
						aria-label="Open {title} in playground"
						title="Open in playground"
					>Playground</button>
				{/if}
				{#if snippet}
					<button
						class="card-btn"
						class:active={showCode}
						onclick={() => (showCode = !showCode)}
						aria-label={showCode ? 'Hide code' : 'View code'}
					>{showCode ? 'Hide code' : 'View code'}</button>
				{/if}
			</span>
		</div>
		{#if snippet && showCode}
			<div class="snippet-wrap" transition:slide={{ duration: 180 }}>
				{#if fullSnippet}<span class="snippet-label">Use the preset</span>{/if}
				<pre><code>{snippet}</code></pre>
				<button class="copy-btn" onclick={() => copy('snippet')} aria-live="polite">
					{#if copied === 'snippet'}Copied{:else}Copy{/if}
				</button>
			</div>
			{#if fullSnippet}
				<div class="snippet-wrap" transition:slide={{ duration: 180 }}>
					<span class="snippet-label">From scratch with &lt;Fluid&gt;</span>
					<pre><code>{fullSnippet}</code></pre>
					<button class="copy-btn" onclick={() => copy('full')} aria-live="polite">
						{#if copied === 'full'}Copied{:else}Copy{/if}
					</button>
				</div>
			{/if}
		{/if}
	</figcaption>
</figure>

<style>
	.card {
		position: relative;
		margin: 0;
		background: var(--card, #ebe3d2);
		border: 1px solid var(--rule, rgba(26, 24, 20, 0.88));
		border-radius: 8px;
		overflow: hidden;
	}
	.card-fluid {
		position: relative;
		width: 100%;
		display: block;
		background: var(--card, #ebe3d2);
	}
	figcaption {
		border-top: 1px solid var(--rule, rgba(26, 24, 20, 0.88));
		font-size: 13px;
	}
	.caption-row {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 6px 14px;
		padding: 12px 16px 14px;
	}
	.card-name {
		color: var(--ink, #1a1814);
		font-weight: 600;
		letter-spacing: -0.005em;
		white-space: nowrap;
	}
	.card-blurb {
		color: var(--ink-soft, rgba(26, 24, 20, 0.62));
		font-size: 12.5px;
		flex: 1 1 12ch;
		min-width: 0;
	}
	.card-actions {
		display: flex;
		gap: 6px;
		flex-shrink: 0;
		margin-left: auto;
	}
	.card-btn {
		padding: 3px 10px;
		font-size: 11px;
		font-weight: 600;
		font-family: inherit;
		background: transparent;
		border: 1px solid var(--ink-faint, rgba(26, 24, 20, 0.16));
		border-radius: 999px;
		color: var(--ink-soft, rgba(26, 24, 20, 0.62));
		cursor: pointer;
		transition:
			color 0.15s,
			background 0.15s,
			border-color 0.15s;
	}
	.card-btn:hover,
	.card-btn.active {
		background: var(--hover, rgba(26, 24, 20, 0.05));
		border-color: var(--rule, rgba(26, 24, 20, 0.88));
		color: var(--ink, #1a1814);
	}
	.snippet-wrap {
		position: relative;
		border-top: 1px solid var(--rule, rgba(26, 24, 20, 0.88));
	}
	.snippet-label {
		display: block;
		padding: 6px 14px 0;
		font-size: 10.5px;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		opacity: 0.55;
		color: var(--ink, #1a1814);
	}
	pre {
		margin: 0;
		padding: 12px 14px;
		overflow-x: auto;
		font-family: var(--mono, ui-monospace, monospace);
		font-size: 11.5px;
		line-height: 1.55;
		color: var(--ink, #1a1814);
		background: var(--hover, rgba(26, 24, 20, 0.05));
	}
	.copy-btn {
		position: absolute;
		top: 8px;
		right: 8px;
		padding: 2px 9px;
		font-size: 10.5px;
		font-weight: 600;
		font-family: inherit;
		background: var(--card, #ebe3d2);
		border: 1px solid var(--ink-faint, rgba(26, 24, 20, 0.16));
		border-radius: 999px;
		color: var(--ink-soft, rgba(26, 24, 20, 0.62));
		cursor: pointer;
	}
	.copy-btn:hover {
		color: var(--ink, #1a1814);
		border-color: var(--rule, rgba(26, 24, 20, 0.88));
	}

	@media (max-width: 600px) {
		.card-fluid {
			height: 200px !important;
		}
		.card-btn {
			padding: 6px 10px;
		}
	}
</style>
