<!--
  Registry-driven reference block for a single preset on /docs/presets.

  Generates the pinned-prop table from the registry (so it can never drift from
  what `<Preset />` renders — ADR-0040), plus a Show Code action (wrapper usage
  + expandable <Fluid> recipe) and an Open-in-Playground link. The page keeps
  its hand-authored prose; this owns the table + actions.
-->
<script lang="ts">
	import { base } from '$app/paths';
	import { slide } from 'svelte/transition';
	import { PRESET_BY_ID } from '$lib/presets/registry.js';
	import { presetUsageSnippet, presetConfigSnippet } from '$lib/presets/snippet.js';

	let { id }: { id: string } = $props();

	const def = $derived(PRESET_BY_ID[id]);
	const usage = $derived(presetUsageSnippet(id));
	const recipe = $derived(presetConfigSnippet(id));

	let showCode = $state(false);
	let showRecipe = $state(false);
	let copied = $state<'usage' | 'recipe' | null>(null);
	let copyTimer: ReturnType<typeof setTimeout> | undefined;

	function copy(which: 'usage' | 'recipe') {
		navigator.clipboard.writeText(which === 'usage' ? usage : recipe);
		copied = which;
		clearTimeout(copyTimer);
		copyTimer = setTimeout(() => (copied = null), 1600);
	}

	type Row = { key: string; value: string };

	/** Render a config value as a compact table cell; complex props point to the code. */
	function cell(key: string, value: unknown): string {
		if (value === null || value === undefined) return '—';
		if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string')
			return String(value);
		if (key === 'backColor' || key === 'obstructionColor') {
			const c = value as { r: number; g: number; b: number };
			return `{ r: ${c.r}, g: ${c.g}, b: ${c.b} }`;
		}
		if (key === 'containerShape') return (value as { type: string }).type;
		if (key === 'flow') return 'FlowConfig — see code';
		if (Array.isArray(value)) {
			const noun = key === 'presetSplats' ? 'splat' : key === 'obstructions' ? 'obstruction' : 'item';
			return `${value.length} ${noun}${value.length === 1 ? '' : 's'}`;
		}
		return 'see code';
	}

	const rows = $derived<Row[]>(
		Object.entries(def.config)
			.filter(([, v]) => v !== undefined)
			.map(([key, value]) => ({ key, value: cell(key, value) }))
	);
</script>

<div class="preset-ref">
	<div class="preset-ref-actions">
		<a class="preset-ref-btn" href="{base}/?preset={id}#playground">Open in Playground →</a>
		<button type="button" class="preset-ref-btn" class:active={showCode} onclick={() => (showCode = !showCode)}>
			{showCode ? 'Hide code' : 'Show code'}
		</button>
	</div>

	{#if showCode}
		<div class="preset-ref-code" transition:slide={{ duration: 160 }}>
			<div class="code-head">
				<span>Usage</span>
				<button type="button" class="copy" onclick={() => copy('usage')}>
					{copied === 'usage' ? 'Copied' : 'Copy'}
				</button>
			</div>
			<pre><code>{usage}</code></pre>

			<button type="button" class="recipe-toggle" onclick={() => (showRecipe = !showRecipe)}>
				{showRecipe ? '▾' : '▸'} {showRecipe ? 'Hide' : 'Show'} the full &lt;Fluid&gt; recipe (to fork)
			</button>
			{#if showRecipe}
				<div transition:slide={{ duration: 160 }}>
					<div class="code-head">
						<span>Recipe</span>
						<button type="button" class="copy" onclick={() => copy('recipe')}>
							{copied === 'recipe' ? 'Copied' : 'Copy'}
						</button>
					</div>
					<pre><code>{recipe}</code></pre>
				</div>
			{/if}
		</div>
	{/if}

	<table class="preset-ref-table">
		<thead>
			<tr><th>Prop</th><th>Value</th></tr>
		</thead>
		<tbody>
			{#each rows as row (row.key)}
				<tr><td><code>{row.key}</code></td><td>{row.value}</td></tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.preset-ref {
		margin: 1rem 0 2rem;
	}
	.preset-ref-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-bottom: 0.75rem;
	}
	.preset-ref-btn {
		font: inherit;
		font-size: 0.85rem;
		padding: 0.35rem 0.7rem;
		border: 1px solid var(--border, #d0d0d0);
		border-radius: 0.4rem;
		background: var(--card, #fff);
		color: inherit;
		cursor: pointer;
		text-decoration: none;
		transition: background 0.15s, border-color 0.15s;
	}
	.preset-ref-btn:hover,
	.preset-ref-btn.active {
		border-color: var(--accent, #6060ff);
		background: color-mix(in srgb, var(--accent, #6060ff) 8%, transparent);
	}
	.preset-ref-code {
		margin-bottom: 0.75rem;
	}
	.code-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.78rem;
		opacity: 0.7;
		margin: 0.5rem 0 0.2rem;
	}
	.copy {
		font: inherit;
		font-size: 0.75rem;
		padding: 0.15rem 0.5rem;
		border: 1px solid var(--border, #d0d0d0);
		border-radius: 0.3rem;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}
	.recipe-toggle {
		font: inherit;
		font-size: 0.8rem;
		padding: 0.3rem 0;
		border: none;
		background: transparent;
		color: var(--accent, #6060ff);
		cursor: pointer;
	}
	.preset-ref-table {
		width: 100%;
	}
</style>
