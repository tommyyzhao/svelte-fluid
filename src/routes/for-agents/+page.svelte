<!--
  "For Agents" hub — links the machine-readable agent docs that are
  prerendered from the registry (/llms.txt, /llms-full.txt, /SKILL.md).
-->
<script lang="ts">
	import { base } from '$app/paths';

	const resources = [
		{
			href: `${base}/llms.txt`,
			name: 'llms.txt',
			desc: 'Concise index (llmstxt.org convention): summary, doc links, and the full preset list.'
		},
		{
			href: `${base}/SKILL.md`,
			name: 'SKILL.md',
			desc: 'The agent skill file: engine mental model, components, config groups, imperative API, presets, and gotchas — enough to use the library correctly in one read.'
		},
		{
			href: `${base}/llms-full.txt`,
			name: 'llms-full.txt',
			desc: 'Everything in SKILL.md plus the full forkable <Fluid> recipe for all 14 presets, inlined.'
		}
	];
</script>

<svelte:head>
	<title>For Agents — svelte-fluid</title>
	<meta
		name="description"
		content="Machine-readable docs for AI coding agents: llms.txt, llms-full.txt, and a SKILL.md that teaches the svelte-fluid API and engine model."
	/>
</svelte:head>

<h1>For Agents</h1>
<p class="subtitle">Machine-readable docs for AI coding agents.</p>

<p>
	These plain-text files teach an agent how svelte-fluid works — the engine mental model, the
	component and config surface, the imperative API, and every preset — so it can write correct
	code in one read. They are generated from the same preset registry the components render, so
	they never drift from the library.
</p>

<div class="agent-resources">
	{#each resources as r (r.name)}
		<a class="agent-resource" href={r.href}>
			<span class="agent-resource-name">{r.name} →</span>
			<span class="agent-resource-desc">{r.desc}</span>
		</a>
	{/each}
</div>

<h2>Point your agent at it</h2>
<p>
	Drop the <code>llms.txt</code> URL (or the raw <code>SKILL.md</code>) into your agent's context,
	or fetch it directly:
</p>
<pre><code>curl -s https://tommyyzhao.github.io/svelte-fluid/SKILL.md</code></pre>

<style>
	.agent-resources {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin: 1.5rem 0;
	}
	.agent-resource {
		display: block;
		padding: 1rem 1.2rem;
		border: 1px solid var(--rule, #d0d0d0);
		border-radius: 0.5rem;
		text-decoration: none;
		color: inherit;
		transition: border-color 0.15s, background 0.15s;
	}
	.agent-resource:hover {
		border-color: var(--accent, #6060ff);
		background: color-mix(in srgb, var(--accent, #6060ff) 6%, transparent);
	}
	.agent-resource-name {
		display: block;
		font-family: var(--mono, monospace);
		font-weight: 600;
		margin-bottom: 0.25rem;
	}
	.agent-resource-desc {
		display: block;
		font-size: 0.9rem;
		opacity: 0.8;
		line-height: 1.5;
	}
</style>
