<script lang="ts">
	import { base } from '$app/paths';
	import {
		Aurora,
		FrozenSwirl,
		InkInWater,
		LavaLamp,
		Plasma,
		ToroidalTempest
	} from '$lib/index.js';

	let reducedMotion = $state(false);
	$effect(() => {
		if (typeof window === 'undefined') return;
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		reducedMotion = mq.matches;
		const onChange = (e: MediaQueryListEvent) => (reducedMotion = e.matches);
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	});

	const candidates = [
		{
			route: '/design13',
			num: 13,
			label: 'The Benchmark',
			descriptor: 'Cinematic dark, italic-serif emphasis',
			preview: Plasma,
			seed: 1300
		},
		{
			route: '/design1',
			num: 1,
			label: 'Corporate Bento',
			descriptor: 'Taupe minimal, rounded card grid',
			preview: InkInWater,
			seed: 100
		},
		{
			route: '/design2',
			num: 2,
			label: 'Editorial Print',
			descriptor: 'Serif numerals, monospace UI, paper bg',
			preview: InkInWater,
			seed: 200
		},
		{
			route: '/design3',
			num: 3,
			label: 'Glass Morphism',
			descriptor: 'Dark navy, iridescent rims, float anims',
			preview: FrozenSwirl,
			seed: 300
		},
		{
			route: '/design4',
			num: 4,
			label: 'Modern SaaS',
			descriptor: 'Dashboard grids, gradient accents',
			preview: Aurora,
			seed: 400
		},
		{
			route: '/design5',
			num: 5,
			label: 'Warm Pastel',
			descriptor: 'Instrument Serif italics, soft gradients',
			preview: LavaLamp,
			seed: 500
		},
		{
			route: '/design6',
			num: 6,
			label: 'Terminal CLI',
			descriptor: 'Monospace, Unicode borders, blink cursor',
			preview: InkInWater,
			seed: 600
		},
		{
			route: '/design7',
			num: 7,
			label: 'Scroll-Snap Magazine',
			descriptor: 'Split sections, large serif heads',
			preview: Plasma,
			seed: 700
		},
		{
			route: '/design8',
			num: 8,
			label: 'Vercel-Adjacent',
			descriptor: 'Auto-theme, gradient borders, SVG icons',
			preview: Aurora,
			seed: 800
		},
		{
			route: '/design9',
			num: 9,
			label: 'Dark Bento + Warm',
			descriptor: 'Compact grid, yellow accent',
			preview: LavaLamp,
			seed: 900
		},
		{
			route: '/design10',
			num: 10,
			label: 'High-Contrast Light',
			descriptor: 'Gradient pill nav, crisp UI',
			preview: FrozenSwirl,
			seed: 1000
		},
		{
			route: '/design11',
			num: 11,
			label: 'Editorial Dark Orange',
			descriptor: 'Serif numerals, split grids, orange accent',
			preview: ToroidalTempest,
			seed: 1100
		},
		{
			route: '/design12',
			num: 12,
			label: 'Reveal on Scroll',
			descriptor: 'Featured splits, IntersectionObserver',
			preview: Plasma,
			seed: 1200
		},
		{
			route: '/design14',
			num: 14,
			label: 'Full Showcase',
			descriptor: 'Comprehensive, hi-res sticky variant',
			preview: ToroidalTempest,
			seed: 1400
		},
		{
			route: '/design15',
			num: 15,
			label: 'Reveal + Featured',
			descriptor: 'Mixed layouts, scroll-driven anims',
			preview: Aurora,
			seed: 1500
		}
	];
</script>

<svelte:head>
	<title>TZ's Fluid Design Competition</title>
</svelte:head>

<main class="page">
	<div class="header">
		<p class="eyebrow">svelte-fluid</p>
		<h1 class="title">TZ's Fluid Design <em>Competition</em></h1>
		<p class="subtitle">
			Fifteen redesign passes of the svelte-fluid main page. Pick your favorite.
		</p>
	</div>

	<div class="grid">
		{#each candidates as c (c.num)}
			<a
				class="card"
				href="{base}{c.route}"
				aria-label="Open {c.label} — {c.descriptor}"
			>
				<div class="preview" aria-hidden="true">
					{#if !reducedMotion}
						{@const PreviewComp = c.preview}
						<PreviewComp
							seed={c.seed}
							lazy
							splatOnHover
							aria-label="{c.label} fluid preview"
						/>
					{:else}
						<div class="preview-static"></div>
					{/if}
				</div>
				<div class="card-body">
					<span class="card-num">design{c.num}</span>
					<span class="card-label">{c.label}</span>
					<span class="card-descriptor">{c.descriptor}</span>
				</div>
				<span class="card-open" aria-hidden="true">Open →</span>
			</a>
		{/each}
	</div>

	<footer class="footer">
		<a href="{base}/" class="home-link">← svelte-fluid home</a>
	</footer>
</main>

<style>
	:global(body) {
		margin: 0;
		background: #080810;
		color: #e8e8f0;
		font-family: 'Geist', 'Inter', system-ui, sans-serif;
		-webkit-font-smoothing: antialiased;
	}

	.page {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		padding: 0 2rem 4rem;
		max-width: 1440px;
		margin: 0 auto;
	}

	.header {
		padding: 6rem 0 4rem;
		max-width: 640px;
	}

	.eyebrow {
		margin: 0 0 1rem;
		font-size: 0.75rem;
		font-weight: 500;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #6b6b88;
	}

	.title {
		margin: 0 0 1.2rem;
		font-size: clamp(2rem, 5vw, 3.5rem);
		font-weight: 700;
		line-height: 1.1;
		letter-spacing: -0.02em;
		color: #f0f0fa;
	}

	.title em {
		font-style: italic;
		color: #9988ee;
	}

	.subtitle {
		margin: 0;
		font-size: 1.05rem;
		line-height: 1.6;
		color: #8888a8;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1.2rem;
		flex: 1;
	}

	.card {
		display: flex;
		flex-direction: column;
		border-radius: 10px;
		border: 1px solid rgba(255, 255, 255, 0.07);
		background: rgba(255, 255, 255, 0.03);
		overflow: hidden;
		text-decoration: none;
		color: inherit;
		transition: border-color 0.2s, background 0.2s;
		cursor: pointer;
	}

	.card:hover {
		border-color: rgba(153, 136, 238, 0.35);
		background: rgba(255, 255, 255, 0.06);
	}

	.card:focus-visible {
		outline: 2px solid #9988ee;
		outline-offset: 2px;
	}

	.preview {
		width: 100%;
		aspect-ratio: 16 / 9;
		position: relative;
		overflow: hidden;
		background: #0d0d1a;
	}

	.preview :global(.fluid-root) {
		width: 100%;
		height: 100%;
	}

	.preview-static {
		width: 100%;
		height: 100%;
		background: linear-gradient(135deg, #0d0d1a 0%, #1a1a2e 100%);
	}

	.card-body {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.9rem 1rem 0.5rem;
		flex: 1;
	}

	.card-num {
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #6b6b88;
	}

	.card-label {
		font-size: 0.92rem;
		font-weight: 600;
		color: #d8d8f0;
		line-height: 1.2;
	}

	.card-descriptor {
		font-size: 0.78rem;
		line-height: 1.4;
		color: #888899;
	}

	.card-open {
		display: block;
		padding: 0.6rem 1rem;
		font-size: 0.78rem;
		font-weight: 500;
		color: #6b6b88;
		transition: color 0.15s;
	}

	.card:hover .card-open {
		color: #9988ee;
	}

	.footer {
		margin-top: 4rem;
		padding-top: 2rem;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}

	.home-link {
		font-size: 0.85rem;
		color: #6b6b88;
		text-decoration: none;
		transition: color 0.15s;
	}

	.home-link:hover {
		color: #b8b8d8;
	}

	@media (max-width: 1100px) {
		.grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	@media (max-width: 780px) {
		.page {
			padding: 0 1.25rem 3rem;
		}

		.grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.header {
			padding: 4rem 0 3rem;
		}
	}

	@media (max-width: 480px) {
		.grid {
			grid-template-columns: 1fr;
		}

		.header {
			padding: 3rem 0 2rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.card {
			transition: none;
		}

		.card-open {
			transition: none;
		}

		.home-link {
			transition: none;
		}
	}
</style>
