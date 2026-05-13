<script lang="ts">
	import { base } from '$app/paths';
	import {
		AnnularFluid,
		Aurora,
		CircularFluid,
		Fluid,
		FluidBackground,
		FluidDistortion,
		FluidStick,
		FluidText,
		FrameFluid,
		FrozenSwirl,
		InkInWater,
		LavaLamp,
		Plasma,
		ToroidalTempest
	} from '$lib/index.js';

	type PM = 'bun' | 'npm' | 'pnpm' | 'yarn';

	const installCmds: Record<PM, string> = {
		bun: 'bun add svelte-fluid',
		npm: 'npm install svelte-fluid',
		pnpm: 'pnpm add svelte-fluid',
		yarn: 'yarn add svelte-fluid'
	};

	const tabs: PM[] = ['bun', 'npm', 'pnpm', 'yarn'];

	let activeTab = $state<PM>('bun');
	let copiedInstall = $state(false);
	let copiedUsage = $state(false);

	const usageSnippet = `<script>
	import { Fluid } from 'svelte-fluid';
<\/script>

<div style="width: 100%; height: 480px;">
	<Fluid seed={42} splatOnHover />
</div>`;

	async function copyInstall() {
		try {
			await navigator.clipboard.writeText(installCmds[activeTab]);
			copiedInstall = true;
			setTimeout(() => (copiedInstall = false), 1200);
		} catch {
			copiedInstall = false;
		}
	}

	async function copyUsage() {
		try {
			await navigator.clipboard.writeText(usageSnippet);
			copiedUsage = true;
			setTimeout(() => (copiedUsage = false), 1200);
		} catch {
			copiedUsage = false;
		}
	}

	const presetCells = [
		{ id: 'lavalamp', name: 'LAVA LAMP', tag: '<LavaLamp />', component: LavaLamp, seed: 11 },
		{ id: 'plasma', name: 'PLASMA', tag: '<Plasma />', component: Plasma, seed: 22 },
		{ id: 'inkinwater', name: 'INK IN WATER', tag: '<InkInWater />', component: InkInWater, seed: 33 },
		{ id: 'frozenswirl', name: 'FROZEN SWIRL', tag: '<FrozenSwirl />', component: FrozenSwirl, seed: 44 },
		{ id: 'aurora', name: 'AURORA', tag: '<Aurora />', component: Aurora, seed: 55 },
		{
			id: 'toroidaltempest',
			name: 'TOROIDAL TEMPEST',
			tag: '<ToroidalTempest />',
			component: ToroidalTempest,
			seed: 66
		}
	];

	const stickyCells = [
		{
			text: 'FLUID',
			font: '900 100px Geist, Inter, sans-serif',
			seed: 211,
			caption: 'Geist · 900'
		},
		{
			text: '∞',
			font: '200px Georgia, serif',
			seed: 222,
			caption: 'Georgia · ∞'
		}
	];

	const distortCells = [
		{
			seed: 311,
			src: 'bosch-garden.jpg',
			strength: 0.3,
			intensity: 20,
			scale: 1.0,
			caption: 'SUBTLE · STRENGTH 0.3'
		},
		{
			seed: 322,
			src: 'hero.webp',
			strength: 0.45,
			intensity: 28,
			scale: 1.0,
			caption: 'STRONG · STRENGTH 0.45'
		}
	];

	const lightning = 'M 55 5 L 25 55 L 45 55 L 35 95 L 75 40 L 55 40 L 70 5 Z';

	const manifest = [
		'multi-instance.',
		'resize-stable.',
		'deterministic seeding.',
		'MIT licensed.',
		'sticky text masks.',
		'image distortion.'
	];

	let revealEls: HTMLElement[] = $state([]);
	let reducedMotion = $state(false);

	$effect(() => {
		if (typeof window === 'undefined') return;
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		reducedMotion = mq.matches;
		const onChange = (e: MediaQueryListEvent) => (reducedMotion = e.matches);
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	});

	$effect(() => {
		if (typeof IntersectionObserver === 'undefined') return;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						(entry.target as HTMLElement).classList.add('is-visible');
						observer.unobserve(entry.target);
					}
				}
			},
			{ threshold: 0.15 }
		);
		for (const el of revealEls) if (el) observer.observe(el);
		return () => observer.disconnect();
	});

	function pad(n: number) {
		return n.toString().padStart(2, '0');
	}

	const titleAutoSplatRate = $derived(reducedMotion ? 0 : 0.5);
	const stickyAutoAnimate = $derived(!reducedMotion);
</script>

<svelte:head>
	<title>svelte-fluid — WebGL fluid as a Svelte 5 component</title>
</svelte:head>

<div class="page">
	<header class="nav-bar">
		<div class="nav-inner">
			<a class="wordmark" href="{base}/">svelte<span class="dash">—</span>fluid</a>
			<nav class="nav-links">
				<a href="{base}/docs">Docs</a>
				<a href="{base}/docs/presets">Presets</a>
				<a href="https://github.com/tommyyzhao/svelte-fluid" target="_blank" rel="noreferrer">
					GitHub
				</a>
			</nav>
		</div>
	</header>

	<section class="hero">
		<div class="hero-bg">
			<FluidBackground
				seed={2026}
				colorful
				shading
				bloom
				bloomIntensity={0.3}
				sunrays={false}
				densityDissipation={0.96}
				velocityDissipation={0.55}
				curl={36}
				splatRadius={0.05}
				splatForce={3200}
				initialSplatCount={15}
				exclude=".card, .nav-bar, .footer-bar"
				excludeRadius={20}
			/>
		</div>
		<div class="hero-scrim" aria-hidden="true"></div>
		<div class="hero-content">
			<div class="eyebrow">WebGL · Svelte 5 · MIT</div>
			<div class="hero-title">
				<FluidText
					text="FLUID"
					seed={7}
					colorful
					shading
					bloom
					splatOnHover
					initialSplatCount={20}
					autoSplatRate={titleAutoSplatRate}
					autoSplatCount={1}
					autoSplatSwirl={100}
					densityDissipation={0.01}
					velocityDissipation={0.01}
					splatRadius={0.6}
					splatForce={8000}
				/>
			</div>
			<p class="tagline">
				WebGL fluid simulation as a Svelte 5 component.
				<span class="italic-accent">Multi-instance</span>, resize-stable, deterministic seeding.
			</p>
			<div class="cta-row">
				<a class="cta primary" href="{base}/docs">Read the docs</a>
				<a
					class="cta ghost"
					href="https://github.com/tommyyzhao/svelte-fluid"
					target="_blank"
					rel="noreferrer"
				>
					GitHub
				</a>
			</div>
		</div>
		<div class="scroll-cue" aria-hidden="true">
			<span>scroll</span>
			<span class="chevron">↓</span>
		</div>
	</section>

	<section class="install-section reveal" bind:this={revealEls[0]}>
		<div class="install-inner">
			<div class="eyebrow centered">§ 01 · Install</div>
			<h2 class="display">
				Drop it <span class="italic">in</span>.
			</h2>
			<div class="install-card card">
				<div class="install-tabs" role="tablist">
					{#each tabs as t (t)}
						<button
							role="tab"
							class="install-tab"
							class:active={activeTab === t}
							aria-selected={activeTab === t}
							onclick={() => (activeTab = t)}
						>
							{t}
						</button>
					{/each}
				</div>
				<div class="code-row">
					<code class="install-code">$ {installCmds[activeTab]}</code>
					<button class="copy-btn" onclick={copyInstall} aria-label="Copy install command">
						{copiedInstall ? 'Copied!' : 'Copy'}
					</button>
				</div>
				<div class="divider"></div>
				<div class="usage-head">
					<span>minimal usage</span>
					<button class="copy-btn small" onclick={copyUsage} aria-label="Copy usage snippet">
						{copiedUsage ? 'Copied!' : 'Copy'}
					</button>
				</div>
				<pre class="usage-code"><code>{usageSnippet}</code></pre>
			</div>
		</div>
	</section>

	<section class="featured bleed reveal" bind:this={revealEls[1]}>
		<div class="bleed-canvas">
			<Plasma seed={303} splatOnHover lazy aria-label="Plasma preset" />
		</div>
		<aside class="glass-caption">
			<div class="eyebrow muted">§ 02 · Preset · electric</div>
			<h3 class="display small">
				<span class="italic">Plasma</span>.
			</h3>
			<p class="body-copy small">
				High-frequency curl, saturated to the edge of the gamut. Best deployed sparingly — a
				single fluorescent accent across an otherwise muted page.
			</p>
			<a class="source-link" href="{base}/docs/presets#plasma">→ View source</a>
		</aside>
	</section>

	<section class="editorial-presets reveal" bind:this={revealEls[2]}>
		<div class="ed-head">
			<div class="eyebrow">§ 03</div>
			<h2 class="display center">
				<span class="italic">Presets</span>.
			</h2>
			<p class="muted center small-copy">
				Six stylistic presets. Each fills its parent. Hover any cell to splat.
			</p>
		</div>
		<div class="ed-grid">
			{#each presetCells as p (p.id)}
				{@const C = p.component}
				<article class="ed-cell">
					<div class="ed-label">{p.name}</div>
					<div class="ed-canvas">
						<C seed={p.seed} splatOnHover lazy aria-label="{p.name} preset" />
					</div>
					<a
						class="ed-source"
						href="{base}/docs/presets#{p.id}"
						aria-label="View source for {p.name}"
					>
						View source →
					</a>
					<code class="preset-snippet">{p.tag}</code>
				</article>
			{/each}
		</div>
	</section>

	<section class="shape-section reveal" bind:this={revealEls[3]}>
		<div class="shape-inner">
			<div class="eyebrow">§ 04</div>
			<h2 class="display center">
				Confine fluid to <span class="italic">any shape</span>.
			</h2>
			<p class="muted center small-copy">
				Six primitives — circle, rounded rect, frame, annulus, SVG path, and text glyph. Hover to splat.
			</p>
			<div class="shape-grid">
				<figure class="shape-cell">
					<div class="shape-canvas">
						<CircularFluid seed={601} lazy aria-label="Circle container" />
					</div>
					<figcaption>CIRCLE</figcaption>
				</figure>
				<figure class="shape-cell">
					<div class="shape-canvas">
						<Fluid
							seed={602}
							colorful
							shading
							bloom
							splatOnHover
							initialSplatCount={15}
							containerShape={{
								type: 'roundedRect',
								cx: 0.5,
								cy: 0.5,
								halfW: 0.42,
								halfH: 0.42,
								cornerRadius: 0.08
							}}
							lazy
							aria-label="Rounded rect container"
						/>
					</div>
					<figcaption>ROUNDED RECT</figcaption>
				</figure>
				<figure class="shape-cell">
					<div class="shape-canvas">
						<FrameFluid seed={603} lazy aria-label="Frame container" />
					</div>
					<figcaption>FRAME</figcaption>
				</figure>
				<figure class="shape-cell">
					<div class="shape-canvas">
						<AnnularFluid seed={604} lazy aria-label="Annulus container" />
					</div>
					<figcaption>ANNULUS</figcaption>
				</figure>
				<figure class="shape-cell">
					<div class="shape-canvas">
						<Fluid
							seed={605}
							colorful
							shading
							bloom
							splatOnHover
							initialSplatCount={15}
							containerShape={{ type: 'svgPath', d: lightning, viewBox: [0, 0, 100, 100] }}
							lazy
							aria-label="SVG path container"
						/>
					</div>
					<figcaption>SVG PATH</figcaption>
				</figure>
				<figure class="shape-cell">
					<div class="shape-canvas">
						<Fluid
							seed={606}
							colorful
							shading
							bloom
							splatOnHover
							initialSplatCount={15}
							containerShape={{
								type: 'svgPath',
								text: '&',
								font: '900 280px Georgia, serif'
							}}
							lazy
							aria-label="Text glyph container"
						/>
					</div>
					<figcaption>TEXT GLYPH</figcaption>
				</figure>
			</div>
		</div>
	</section>

	<section class="sticky-section reveal" bind:this={revealEls[4]}>
		<div class="sticky-inner">
			<div class="eyebrow">§ 05</div>
			<h2 class="display center">
				Make dye cling to <span class="italic">letterforms</span>.
			</h2>
			<p class="muted center small-copy">FluidStick masks the simulation with text or SVG paths. Hover to engage.</p>
			<div class="sticky-grid">
				{#each stickyCells as s (s.text)}
					<figure class="sticky-cell">
						<div class="sticky-canvas">
							<FluidStick
								text={s.text}
								font={s.font}
								seed={s.seed}
								autoAnimate={stickyAutoAnimate}
								autoAnimateDuration={6}
								colorful
								shading
								bloom
								lazy
							/>
						</div>
						<figcaption>{s.caption}</figcaption>
					</figure>
				{/each}
			</div>
		</div>
	</section>

	<section class="distort-section reveal" bind:this={revealEls[5]}>
		<div class="distort-inner">
			<div class="eyebrow">§ 06</div>
			<h2 class="display center">
				Distort an <span class="italic">image</span>.
			</h2>
			<p class="muted center small-copy">
				FluidDistortion warps any source with the velocity field. Hover to engage.
			</p>
			<div class="distort-grid">
				{#each distortCells as d (d.seed)}
					<figure class="distort-cell">
						<div class="distort-canvas">
							<FluidDistortion
								src={`${base}/${d.src}`}
								seed={d.seed}
								strength={d.strength}
								intensity={d.intensity}
								scale={d.scale}
								fit="cover"
								initialSplats={6}
								lazy
							/>
						</div>
						<figcaption>{d.caption}</figcaption>
					</figure>
				{/each}
			</div>
		</div>
	</section>

	<section class="manifest-section reveal" bind:this={revealEls[6]}>
		<div class="manifest-inner">
			<div class="eyebrow">§ 07 · Manifest</div>
			<ol class="manifest-list">
				{#each manifest as f, i (f)}
					<li>
						<span class="m-num">{pad(i + 1)}</span>
						<span class="m-dash">—</span>
						<span class="m-text">{f}</span>
					</li>
				{/each}
			</ol>
		</div>
	</section>

	<footer class="footer-bar">
		<div class="footer-inner">
			<div class="footer-row top">
				<div class="footer-mark">svelte<span class="dash">—</span>fluid</div>
				<div class="footer-version">v0.2.2</div>
			</div>
			<div class="footer-divider"></div>
			<div class="footer-row cols">
				<div class="footer-col">
					<div class="footer-col-title">Library</div>
					<a href="https://github.com/tommyyzhao/svelte-fluid" target="_blank" rel="noreferrer">
						GitHub
					</a>
					<a href="{base}/docs">Docs</a>
					<a
						href="https://github.com/tommyyzhao/svelte-fluid/issues"
						target="_blank"
						rel="noreferrer"
					>
						Issues
					</a>
					<a
						href="https://github.com/tommyyzhao/svelte-fluid/blob/main/LICENSE"
						target="_blank"
						rel="noreferrer"
					>
						MIT License
					</a>
				</div>
				<div class="footer-col">
					<div class="footer-col-title">Project</div>
					<a
						href="https://github.com/tommyyzhao/svelte-fluid/blob/main/CONTRIBUTING.md"
						target="_blank"
						rel="noreferrer"
					>
						Contributing
					</a>
					<a
						href="https://github.com/tommyyzhao/svelte-fluid/blob/main/CHANGELOG.md"
						target="_blank"
						rel="noreferrer"
					>
						Changelog
					</a>
					<a
						href="https://github.com/tommyyzhao/svelte-fluid/discussions"
						target="_blank"
						rel="noreferrer"
					>
						Discussions
					</a>
				</div>
				<div class="footer-col">
					<div class="footer-col-title">Credit</div>
					<p class="footer-credit-text">
						Derivative work of PavelDoGreat/WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017.
					</p>
				</div>
			</div>
			<div class="footer-divider"></div>
			<div class="footer-row bottom">
				<div class="footer-copy">© 2026 svelte-fluid contributors · MIT</div>
			</div>
		</div>
	</footer>
</div>

<style>
	:global(html) {
		scroll-behavior: smooth;
	}

	:global(html, body) {
		margin: 0;
		padding: 0;
		background: #0a0a0a;
	}

	.page {
		min-height: 100vh;
		background: #0a0a0a;
		color: #fafafa;
		font-family: 'Geist', 'Inter', system-ui, -apple-system, sans-serif;
		font-feature-settings: 'ss01', 'cv11';
		-webkit-font-smoothing: antialiased;
		letter-spacing: -0.005em;
	}

	.nav-bar {
		position: sticky;
		top: 0;
		z-index: 50;
		height: 56px;
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		background: rgba(10, 10, 10, 0.6);
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.nav-inner {
		max-width: 1200px;
		height: 100%;
		margin: 0 auto;
		padding: 0 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.wordmark {
		color: #fafafa;
		text-decoration: none;
		font-size: 0.92rem;
		font-weight: 500;
		letter-spacing: -0.01em;
	}

	.dash {
		opacity: 0.55;
		margin: 0 0.05em;
	}

	.nav-links {
		display: flex;
		align-items: center;
		gap: 1.75rem;
	}

	.nav-links a {
		color: rgba(255, 255, 255, 0.6);
		text-decoration: none;
		font-size: 0.86rem;
		font-weight: 500;
		transition: color 0.18s ease;
	}

	.nav-links a:hover {
		color: #fff8e7;
	}

	.hero {
		position: relative;
		min-height: 95vh;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		background: #050505;
	}

	.hero-bg {
		position: absolute;
		inset: 0;
		z-index: 0;
	}

	.hero-scrim {
		position: absolute;
		inset: 0;
		z-index: 1;
		background: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.55) 100%);
		pointer-events: none;
	}

	.hero-content {
		position: relative;
		z-index: 2;
		max-width: 960px;
		padding: 6rem 1.5rem 4rem;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		pointer-events: none;
	}

	.hero-content .cta {
		pointer-events: auto;
	}

	.eyebrow {
		font-family: ui-monospace, 'Geist Mono', 'JetBrains Mono', Menlo, monospace;
		font-size: 0.7rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.6);
		margin-bottom: 1.4rem;
	}

	.eyebrow.muted {
		color: rgba(250, 250, 250, 0.55);
	}

	.eyebrow.centered {
		display: block;
		text-align: center;
	}

	.hero-title {
		width: clamp(280px, 60vw, 720px);
		height: clamp(5rem, 13vw, 11rem);
		margin: 0.4rem 0 1.8rem;
	}

	.tagline {
		font-size: clamp(1rem, 1.3vw, 1.18rem);
		max-width: 50ch;
		line-height: 1.55;
		color: rgba(255, 255, 255, 0.78);
		margin: 0 0 2.2rem;
	}

	.italic-accent {
		font-family: 'Instrument Serif', 'EB Garamond', Georgia, serif;
		font-style: italic;
		font-weight: 400;
		color: #fafafa;
		font-size: 1.08em;
	}

	.cta-row {
		display: flex;
		gap: 0.8rem;
		flex-wrap: wrap;
		justify-content: center;
	}

	.cta {
		display: inline-flex;
		align-items: center;
		padding: 0.78rem 1.5rem;
		border-radius: 999px;
		font-size: 0.88rem;
		font-weight: 500;
		text-decoration: none;
		letter-spacing: 0.01em;
		transition:
			background 0.18s ease,
			border-color 0.18s ease,
			color 0.18s ease,
			transform 0.18s ease;
	}

	.cta.primary {
		background: #fafafa;
		color: #0a0a0a;
	}

	.cta.primary:hover {
		background: #fff8e7;
		transform: translateY(-1px);
	}

	.cta.ghost {
		color: #fafafa;
		border: 1px solid rgba(250, 250, 250, 0.18);
	}

	.cta.ghost:hover {
		border-color: #fff8e7;
		color: #fff8e7;
	}

	.scroll-cue {
		position: absolute;
		bottom: 1.8rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 2;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: rgba(250, 250, 250, 0.5);
	}

	.scroll-cue .chevron {
		font-size: 1rem;
		animation: bob 2.2s ease-in-out infinite;
	}

	@keyframes bob {
		0%,
		100% {
			transform: translateY(0);
			opacity: 0.55;
		}
		50% {
			transform: translateY(6px);
			opacity: 1;
		}
	}

	.display {
		font-family: 'Geist', 'Inter', system-ui, -apple-system, sans-serif;
		font-weight: 600;
		font-size: clamp(2.4rem, 5.2vw, 4.2rem);
		line-height: 1.04;
		letter-spacing: -0.03em;
		margin: 0 0 1.4rem;
		color: #fafafa;
	}

	.display.small {
		font-size: clamp(1.6rem, 2.6vw, 2.2rem);
		margin-bottom: 0.8rem;
	}

	.display.center {
		text-align: center;
	}

	.italic {
		font-family: 'Instrument Serif', 'EB Garamond', Georgia, serif;
		font-style: italic;
		font-weight: 400;
		letter-spacing: -0.015em;
	}

	.body-copy {
		font-size: 1rem;
		line-height: 1.65;
		color: rgba(255, 255, 255, 0.7);
		max-width: 42ch;
		margin: 0 0 1.6rem;
	}

	.body-copy.small {
		font-size: 0.9rem;
		margin-bottom: 1rem;
	}

	.muted {
		color: rgba(255, 255, 255, 0.6);
	}

	.center {
		text-align: center;
	}

	.small-copy {
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.78rem;
		letter-spacing: 0.05em;
		max-width: 48ch;
		margin: 0 auto 2.5rem;
		line-height: 1.6;
	}

	.source-link {
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.78rem;
		letter-spacing: 0.1em;
		text-transform: lowercase;
		color: #fafafa;
		text-decoration: none;
		border-bottom: 1px solid rgba(250, 250, 250, 0.3);
		padding-bottom: 0.2rem;
		transition:
			color 0.18s ease,
			border-color 0.18s ease;
		align-self: flex-start;
	}

	.source-link:hover {
		color: #fff8e7;
		border-bottom-color: #fff8e7;
	}

	.card {
		background: rgba(14, 14, 14, 0.92);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
	}

	.install-section {
		padding-block: 7rem;
		padding-inline: 1.5rem;
		display: flex;
		justify-content: center;
		background: #0a0a0a;
	}

	.install-inner {
		width: 100%;
		max-width: 720px;
		text-align: center;
	}

	.install-inner .eyebrow {
		margin-bottom: 1rem;
	}

	.install-inner .display {
		text-align: center;
		margin-bottom: 2.6rem;
	}

	.install-card {
		overflow: hidden;
		text-align: left;
		box-shadow: 0 12px 40px -16px rgba(0, 0, 0, 0.6);
	}

	.install-tabs {
		display: flex;
		gap: 0;
		padding: 0.45rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		background: rgba(255, 255, 255, 0.015);
	}

	.install-tab {
		flex: 1;
		padding: 0.55rem 0.6rem;
		background: transparent;
		border: 0;
		color: rgba(255, 255, 255, 0.55);
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.8rem;
		letter-spacing: 0.05em;
		border-radius: 8px;
		cursor: pointer;
		transition:
			color 0.18s ease,
			background 0.18s ease;
	}

	.install-tab:hover {
		color: #fafafa;
	}

	.install-tab.active {
		background: rgba(255, 255, 255, 0.07);
		color: #fafafa;
	}

	.code-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.15rem 1.3rem;
		gap: 1rem;
		background: #050505;
	}

	.install-code {
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.95rem;
		color: #fafafa;
		flex: 1;
		overflow-x: auto;
		white-space: nowrap;
	}

	.copy-btn {
		padding: 0.42rem 0.9rem;
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.12);
		color: rgba(255, 255, 255, 0.7);
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.7rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		border-radius: 6px;
		cursor: pointer;
		transition:
			border-color 0.18s ease,
			color 0.18s ease,
			background 0.18s ease;
		min-width: 4.5rem;
		text-align: center;
	}

	.copy-btn:hover {
		border-color: #fff8e7;
		color: #fff8e7;
	}

	.copy-btn.small {
		padding: 0.28rem 0.65rem;
		font-size: 0.66rem;
		min-width: 4rem;
	}

	.divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.06);
	}

	.usage-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.7rem 1rem;
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.7rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.5);
		border-bottom: 1px solid rgba(255, 255, 255, 0.04);
		background: rgba(255, 255, 255, 0.015);
	}

	.usage-code {
		margin: 0;
		padding: 1rem 1.25rem 1.2rem;
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.82rem;
		line-height: 1.65;
		color: rgba(255, 255, 255, 0.88);
		background: #050505;
		overflow-x: auto;
		white-space: pre;
	}

	.featured.bleed {
		display: block;
		position: relative;
		background: #000;
		min-height: 80vh;
		overflow: hidden;
	}

	.bleed-canvas {
		position: absolute;
		inset: 0;
		cursor: crosshair;
	}

	.glass-caption {
		position: absolute;
		left: clamp(1.25rem, 4vw, 3rem);
		bottom: clamp(1.5rem, 5vw, 3rem);
		max-width: 36ch;
		padding: 1.4rem 1.5rem 1.5rem;
		background: rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		z-index: 2;
	}

	.editorial-presets {
		background: #0a0a0a;
		padding-block: 7rem 0;
	}

	.ed-head {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 1.5rem 3rem;
		text-align: center;
	}

	.ed-head .eyebrow {
		margin-bottom: 1rem;
	}

	.ed-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		border-left: 1px solid rgba(255, 255, 255, 0.08);
	}

	.ed-cell {
		position: relative;
		border-right: 1px solid rgba(255, 255, 255, 0.08);
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		min-height: 380px;
		overflow: hidden;
	}

	.ed-label {
		position: absolute;
		top: 12px;
		left: 14px;
		z-index: 2;
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.65rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.75);
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.7);
	}

	.ed-canvas {
		position: absolute;
		inset: 0;
		background: #050505;
		cursor: crosshair;
	}

	.ed-source {
		position: absolute;
		right: 14px;
		bottom: 12px;
		z-index: 3;
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.7rem;
		letter-spacing: 0.08em;
		color: rgba(255, 255, 255, 0.78);
		text-decoration: none;
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.7);
		transition:
			color 0.18s ease,
			opacity 0.18s ease;
	}

	.ed-cell:hover .ed-source {
		opacity: 0;
	}

	.ed-source:hover {
		color: #fff8e7;
	}

	.preset-snippet {
		position: absolute;
		right: 14px;
		bottom: 12px;
		z-index: 3;
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.74rem;
		letter-spacing: 0.04em;
		color: #fff8e7;
		background: rgba(0, 0, 0, 0.55);
		padding: 0.28rem 0.55rem;
		border-radius: 4px;
		opacity: 0;
		transition: opacity 0.22s ease;
		pointer-events: none;
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
	}

	.ed-cell:hover .preset-snippet {
		opacity: 1;
	}

	.shape-section,
	.sticky-section,
	.distort-section {
		padding-block: 7rem;
		padding-inline: 1.5rem;
		background: #0a0a0a;
	}

	.shape-inner,
	.sticky-inner,
	.distort-inner {
		max-width: 1200px;
		margin: 0 auto;
		text-align: center;
	}

	.shape-inner .eyebrow,
	.sticky-inner .eyebrow,
	.distort-inner .eyebrow {
		margin-bottom: 1rem;
		text-align: center;
		display: block;
	}

	.shape-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1.25rem;
	}

	.shape-cell {
		margin: 0;
		text-align: left;
		min-width: 280px;
	}

	.shape-canvas {
		position: relative;
		aspect-ratio: 1 / 1;
		background: #050505;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		overflow: hidden;
		cursor: crosshair;
	}

	.shape-cell figcaption,
	.sticky-cell figcaption,
	.distort-cell figcaption {
		margin-top: 0.7rem;
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.2em;
		color: rgba(255, 255, 255, 0.55);
		text-align: center;
	}

	.sticky-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.25rem;
	}

	.sticky-cell {
		margin: 0;
	}

	.sticky-canvas {
		position: relative;
		height: 320px;
		background: #050505;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		overflow: hidden;
		cursor: crosshair;
	}

	.distort-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.25rem;
	}

	.distort-cell {
		margin: 0;
	}

	.distort-canvas {
		position: relative;
		height: 480px;
		background: #050505;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		overflow: hidden;
		cursor: crosshair;
	}

	.manifest-section {
		padding-block: 9rem;
		padding-inline: 1.5rem;
		display: flex;
		justify-content: center;
		background: #0a0a0a;
	}

	.manifest-inner {
		width: 100%;
		max-width: 720px;
	}

	.manifest-inner .eyebrow {
		margin-bottom: 3rem;
	}

	.manifest-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.manifest-list li {
		display: flex;
		align-items: baseline;
		gap: 0.6em;
		font-family: 'Instrument Serif', 'EB Garamond', Georgia, serif;
		font-style: italic;
		font-weight: 400;
		font-size: clamp(1.6rem, 3.6vw, 2.6rem);
		line-height: 1.2;
		letter-spacing: -0.01em;
		color: #fafafa;
	}

	.m-num {
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-style: normal;
		font-size: 0.38em;
		letter-spacing: 0.18em;
		color: rgba(255, 255, 255, 0.55);
		min-width: 2.5em;
	}

	.m-dash {
		opacity: 0.45;
		font-style: normal;
	}

	.footer-bar {
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		padding-block: 3rem;
		padding-inline: 1.5rem;
		background: #0a0a0a;
	}

	.footer-inner {
		max-width: 1200px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1.6rem;
	}

	.footer-row.top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
	}

	.footer-mark {
		font-size: 0.95rem;
		color: #fafafa;
		letter-spacing: -0.01em;
	}

	.footer-version {
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.78rem;
		color: rgba(255, 255, 255, 0.5);
		letter-spacing: 0.08em;
	}

	.footer-divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.08);
	}

	.footer-row.cols {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 2.5rem;
	}

	.footer-col {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}

	.footer-col-title {
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.55);
		margin-bottom: 0.4rem;
	}

	.footer-col a {
		color: rgba(255, 255, 255, 0.72);
		text-decoration: none;
		font-size: 0.86rem;
		transition: color 0.18s ease;
	}

	.footer-col a:hover {
		color: #fff8e7;
	}

	.footer-credit-text {
		margin: 0;
		font-size: 0.8rem;
		line-height: 1.6;
		color: rgba(255, 255, 255, 0.55);
	}

	.footer-row.bottom {
		display: flex;
		justify-content: space-between;
	}

	.footer-copy {
		font-size: 0.74rem;
		color: rgba(255, 255, 255, 0.45);
		letter-spacing: 0.02em;
	}

	.reveal {
		opacity: 0;
		transform: translateY(12px);
		transition:
			opacity 0.7s ease,
			transform 0.7s ease;
	}

	:global(.reveal.is-visible) {
		opacity: 1;
		transform: translateY(0);
	}

	@media (max-width: 960px) {
		.ed-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.shape-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.footer-row.cols {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 720px) {
		.shape-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 640px) {
		.ed-grid {
			grid-template-columns: 1fr;
		}
		.sticky-grid {
			grid-template-columns: 1fr;
		}
		.distort-grid {
			grid-template-columns: 1fr;
		}
		.distort-canvas {
			height: 380px;
		}
		.featured.bleed {
			min-height: 70vh;
		}
		.glass-caption {
			left: 1rem;
			right: 1rem;
			max-width: none;
		}
		.footer-row.cols {
			grid-template-columns: 1fr;
			gap: 1.6rem;
		}
	}

	@media (max-width: 560px) {
		.nav-links {
			gap: 1.1rem;
		}
		.nav-links a {
			font-size: 0.8rem;
		}
		.install-section,
		.shape-section,
		.sticky-section,
		.distort-section {
			padding-block: 5rem;
		}
		.manifest-section {
			padding-block: 6rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.scroll-cue {
			animation: none;
		}
		.reveal {
			opacity: 1 !important;
			transform: none !important;
		}
	}
</style>
