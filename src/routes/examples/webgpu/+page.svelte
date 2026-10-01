<script lang="ts">
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import './lab.css';

	let support = $state<'checking' | 'ready' | 'unavailable'>('checking');
	const routes = [
		{
			slug: 'canary',
			title: 'Demanding production canary',
			blurb: 'The public Fluid component running channel flow, high-resolution sticky text, glass, and scoped image distortion.'
		},
		{
			slug: 'performance',
			title: 'Production performance probe',
			blurb: 'GPU-complete timings, field sanity, and resource counts for four escalating workloads on the current machine.'
		},
		{
			slug: 'features',
			title: 'Composed feature matrix',
			blurb: 'MacCormack, viscosity, walls, obstructions, reveal compositing, and text vessels through the same shipped engine.'
		},
		{
			slug: 'replacement',
			title: 'Replacement record',
			blurb: 'The settled architecture, deletion ledger, browser floor, performance evidence, and remaining visual-risk gates.'
		}
	];

	onMount(() => {
		support = 'gpu' in navigator ? 'ready' : 'unavailable';
	});
</script>

<svelte:head>
	<title>WebGPU R&amp;D — svelte-fluid</title>
	<meta name="description" content="Production WebGPU evidence routes for svelte-fluid." />
</svelte:head>

<main class="webgpu-page">
	<header>
		<span class="eyebrow">R&amp;D branch · one production engine</span>
		<h1>WebGPU replacement evidence</h1>
		<p class="lede">
			The exploratory vGPU solver has served its purpose and is gone. These routes exercise the same native WebGPU engine used by <code>&lt;Fluid&gt;</code>; failures, lifecycle behavior, and visual tradeoffs can no longer hide behind a parallel demo implementation.
		</p>
	</header>

	<section class="support" aria-live="polite">
		<strong>Local capability</strong>
		<span class:ready={support === 'ready'} class:error={support === 'unavailable'}>{support}</span>
	</section>

	<div class="lab-grid">
		{#each routes as route (route.slug)}
			<a class="lab-card" href="{base}/examples/webgpu/{route.slug}">
				<strong>{route.title} →</strong>
				<span>{route.blurb}</span>
			</a>
		{/each}
	</div>

	<section class="lab-note">
		<strong>Decision:</strong> native WebGPU ships with zero runtime dependencies. The shared device and shader/pipeline caches are page-scoped; textures, buffers, simulation state, and canvas presentation remain instance-owned.
	</section>
</main>

<style>
	.support { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; padding: .8rem 1rem; border: 1px solid rgba(255,255,255,.1); border-radius: .65rem; background: rgba(255,255,255,.025); }
	.support span { padding: .3rem .5rem; border-radius: 99px; font: 650 .68rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; color: #aeb7c8; background: rgba(255,255,255,.06); }
	.support span.ready { color: #83e6b6; background: rgba(48,160,104,.12); }
	.support span.error { color: #ffaaa3; background: rgba(182,57,50,.12); }
</style>
