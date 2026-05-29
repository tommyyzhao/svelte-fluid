<script lang="ts">
	import { base } from '$app/paths';
	import {
		AnnularFluid,
		Aurora,
		CircularFluid,
		Fluid,
		FluidBackground,
		FluidDistortion,
		FluidReveal,
		FluidStick,
		FluidText,
		FrameFluid,
		FrozenSwirl,
		InkInWater,
		LavaLamp,
		Plasma,
		ToroidalTempest,
		type RGB
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
			src: 'bosch-garden.jpg',
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


	const PLAYGROUND_DEFAULTS = {
		curl: 30,
		splatRadius: 0.25,
		splatForce: 6000,
		densityDissipation: 1.0,
		velocityDissipation: 0.2,
		bloom: true,
		shading: true,
		colorful: true,
		backColor: { r: 0, g: 0, b: 0 } as RGB
	};

	const PLAYGROUND_PRESETS: Record<string, Partial<typeof PLAYGROUND_DEFAULTS>> = {
		'LavaLamp':         { curl: 8,  splatRadius: 0.55, splatForce: 4800, densityDissipation: 0.18, velocityDissipation: 0.08, bloom: true,  shading: true,  colorful: false, backColor: { r: 8, g: 4, b: 14 } },
		'Plasma':           { curl: 50, splatRadius: 0.22, splatForce: 7500, densityDissipation: 0.6,  velocityDissipation: 0.15, bloom: true,  shading: true,  colorful: true,  backColor: { r: 4, g: 2, b: 12 } },
		'Ink in Water':     { curl: 12, splatRadius: 0.32, splatForce: 5200, densityDissipation: 0.4,  velocityDissipation: 0.1,  bloom: false, shading: true,  colorful: false, backColor: { r: 244, g: 240, b: 232 } },
		'Frozen Swirl':     { curl: 35, splatRadius: 0.28, splatForce: 5800, densityDissipation: 0.2,  velocityDissipation: 0.05, bloom: true,  shading: true,  colorful: false, backColor: { r: 2, g: 8, b: 18 } },
		'Aurora':           { curl: 22, splatRadius: 0.38, splatForce: 6200, densityDissipation: 0.15, velocityDissipation: 0.08, bloom: true,  shading: true,  colorful: true,  backColor: { r: 0, g: 4, b: 14 } },
		'Toroidal Tempest': { curl: 45, splatRadius: 0.3,  splatForce: 7000, densityDissipation: 0.25, velocityDissipation: 0.1,  bloom: true,  shading: false, colorful: true,  backColor: { r: 6, g: 2, b: 16 } }
	};

	const presetNames = Object.keys(PLAYGROUND_PRESETS);

	let pgCurl = $state(PLAYGROUND_DEFAULTS.curl);
	let pgSplatRadius = $state(PLAYGROUND_DEFAULTS.splatRadius);
	let pgSplatForce = $state(PLAYGROUND_DEFAULTS.splatForce);
	let pgDensityDissipation = $state(PLAYGROUND_DEFAULTS.densityDissipation);
	let pgVelocityDissipation = $state(PLAYGROUND_DEFAULTS.velocityDissipation);
	let pgBloom = $state(PLAYGROUND_DEFAULTS.bloom);
	let pgShading = $state(PLAYGROUND_DEFAULTS.shading);
	let pgColorful = $state(PLAYGROUND_DEFAULTS.colorful);
	let pgBackColor = $state<RGB>({ ...PLAYGROUND_DEFAULTS.backColor });
	let activePreset = $state<string | null>(null);
	let copiedSnippet = $state(false);

	function resetPlayground() {
		pgCurl = PLAYGROUND_DEFAULTS.curl;
		pgSplatRadius = PLAYGROUND_DEFAULTS.splatRadius;
		pgSplatForce = PLAYGROUND_DEFAULTS.splatForce;
		pgDensityDissipation = PLAYGROUND_DEFAULTS.densityDissipation;
		pgVelocityDissipation = PLAYGROUND_DEFAULTS.velocityDissipation;
		pgBloom = PLAYGROUND_DEFAULTS.bloom;
		pgShading = PLAYGROUND_DEFAULTS.shading;
		pgColorful = PLAYGROUND_DEFAULTS.colorful;
		pgBackColor = { ...PLAYGROUND_DEFAULTS.backColor };
		activePreset = null;
	}

	function applyPreset(name: string) {
		const p = PLAYGROUND_PRESETS[name];
		if (!p) return;
		if (p.curl !== undefined) pgCurl = p.curl;
		if (p.splatRadius !== undefined) pgSplatRadius = p.splatRadius;
		if (p.splatForce !== undefined) pgSplatForce = p.splatForce;
		if (p.densityDissipation !== undefined) pgDensityDissipation = p.densityDissipation;
		if (p.velocityDissipation !== undefined) pgVelocityDissipation = p.velocityDissipation;
		if (p.bloom !== undefined) pgBloom = p.bloom;
		if (p.shading !== undefined) pgShading = p.shading;
		if (p.colorful !== undefined) pgColorful = p.colorful;
		if (p.backColor !== undefined) pgBackColor = { ...p.backColor };
		activePreset = name;
	}

	function rgbToHex(c: RGB) {
		const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
		return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
	}

	function hexToRgb(hex: string): RGB {
		const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		if (!m) return { r: 0, g: 0, b: 0 };
		return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
	}

	const pgBackColorHex = $derived(rgbToHex(pgBackColor));

	function onBackColorInput(e: Event) {
		const v = (e.target as HTMLInputElement).value;
		pgBackColor = hexToRgb(v);
		activePreset = null;
	}

	const playgroundSnippet = $derived.by(() => {
		const lines: string[] = [];
		if (pgCurl !== PLAYGROUND_DEFAULTS.curl) lines.push(`\tcurl={${pgCurl}}`);
		if (pgSplatRadius !== PLAYGROUND_DEFAULTS.splatRadius) lines.push(`\tsplatRadius={${pgSplatRadius}}`);
		if (pgSplatForce !== PLAYGROUND_DEFAULTS.splatForce) lines.push(`\tsplatForce={${pgSplatForce}}`);
		if (pgDensityDissipation !== PLAYGROUND_DEFAULTS.densityDissipation)
			lines.push(`\tdensityDissipation={${pgDensityDissipation}}`);
		if (pgVelocityDissipation !== PLAYGROUND_DEFAULTS.velocityDissipation)
			lines.push(`\tvelocityDissipation={${pgVelocityDissipation}}`);
		if (pgBloom !== PLAYGROUND_DEFAULTS.bloom) lines.push(`\tbloom={${pgBloom}}`);
		if (pgShading !== PLAYGROUND_DEFAULTS.shading) lines.push(`\tshading={${pgShading}}`);
		if (pgColorful !== PLAYGROUND_DEFAULTS.colorful) lines.push(`\tcolorful={${pgColorful}}`);
		const d = PLAYGROUND_DEFAULTS.backColor;
		if (pgBackColor.r !== d.r || pgBackColor.g !== d.g || pgBackColor.b !== d.b)
			lines.push(`\tbackColor={{ r: ${pgBackColor.r}, g: ${pgBackColor.g}, b: ${pgBackColor.b} }}`);
		if (lines.length === 0) return '<Fluid />';
		return `<Fluid\n${lines.join('\n')}\n/>`;
	});

	async function copySnippet() {
		try {
			await navigator.clipboard.writeText(playgroundSnippet);
			copiedSnippet = true;
			setTimeout(() => (copiedSnippet = false), 1200);
		} catch {
			copiedSnippet = false;
		}
	}

	function markCustomEdit() {
		activePreset = null;
	}
</script>

<svelte:head>
	<title>svelte-fluid — WebGL fluid as a Svelte 5 component</title>
</svelte:head>

<a class="competition-back" href="{base}/design-competition">← Competition</a>

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
		<div class="hero-bg" aria-label="Decorative fluid background">
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
				splatRadius={0.18}
				splatForce={5000}
				initialSplatCount={28}
				exclude=".card, .nav-bar, .footer-bar"
				excludeRadius={20}
			/>
		</div>
		<div class="hero-scrim" aria-hidden="true"></div>
		<div class="hero-content">
			<div class="eyebrow">Svelte 5</div>
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
			<h1 class="tagline">
				WebGL fluid simulation as a Svelte 5 component.
				<span class="italic-accent">Multi-instance</span>, resize-stable, deterministic seeding.
			</h1>
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
			<Plasma seed={303} splatOnHover lazy aria-label="Plasma preset" backColor={{ r: 10, g: 10, b: 10 }} />
		</div>
		<aside class="glass-caption">
			<div class="eyebrow muted">§ 02 · Preset · PLASMA</div>
			<h3 class="display small">
				<span class="italic">Fluid</span>.
			</h3>
			<p class="body-copy small">
				A real-time WebGL fluid simulation, dropped in as a Svelte component. One tag for a
				finished look; eighty-plus props when you want to design your own physics, palette, and
				motion.
			</p>
			<a class="source-link" href="{base}/docs">→ View source</a>
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
						<C seed={p.seed} splatOnHover lazy aria-label="{p.name} preset" backColor={{ r: 10, g: 10, b: 10 }} />
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
						<CircularFluid seed={601} lazy aria-label="Circle container" backColor={{ r: 10, g: 10, b: 10 }} />
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
						<FrameFluid seed={603} lazy aria-label="Frame container" backColor={{ r: 10, g: 10, b: 10 }} />
					</div>
					<figcaption>FRAME</figcaption>
				</figure>
				<figure class="shape-cell">
					<div class="shape-canvas">
						<AnnularFluid seed={604} lazy aria-label="Annulus container" backColor={{ r: 10, g: 10, b: 10 }} />
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

	<section class="physics-section reveal" bind:this={revealEls[7]}>
		<div class="physics-inner">
			<div class="eyebrow">§ 05</div>
			<h2 class="display center">
				Build with <span class="italic">&lt;Fluid /&gt;</span>.
			</h2>
			<p class="muted center small-copy">
				Every prop is optional. Drop in a tag for a finished look; reach for props when you want
				your own physics.
			</p>
			<div class="physics-grid">
				<figure class="physics-cell">
					<div class="physics-canvas">
						<Fluid
							seed={1234}
							initialSplatCount={12}
							splatOnHover
							lazy
							aria-label="Default fluid configuration"
						/>
					</div>
					<code class="physics-snippet">{'<Fluid />'}</code>
					<figcaption>DEFAULT</figcaption>
				</figure>
				<figure class="physics-cell">
					<div class="physics-canvas">
						<Fluid
							seed={5678}
							bloom={false}
							curl={5}
							densityDissipation={0.4}
							initialSplatCount={10}
							splatOnHover
							lazy
							aria-label="Flat fluid with low curl"
						/>
					</div>
					<code class="physics-snippet"
						>{'<Fluid bloom={false} curl={5} densityDissipation={0.4} />'}</code
					>
					<figcaption>FLAT + SOFT</figcaption>
				</figure>
				<figure class="physics-cell">
					<div class="physics-canvas">
						<Fluid
							seed={9012}
							shading={false}
							splatRadius={0.8}
							splatForce={9000}
							initialSplatCount={8}
							splatOnHover
							lazy
							aria-label="Fluid with large bold splats"
						/>
					</div>
					<code class="physics-snippet"
						>{'<Fluid shading={false} splatRadius={0.8} splatForce={9000} />'}</code
					>
					<figcaption>BOLD SPLATS</figcaption>
				</figure>
				<figure class="physics-cell">
					<div class="physics-canvas">
						<Fluid
							seed={3456}
							velocityDissipation={0.05}
							densityDissipation={0.5}
							transparent
							initialSplatCount={14}
							splatOnHover
							lazy
							aria-label="Slow-motion transparent fluid"
						/>
					</div>
					<code class="physics-snippet"
						>{'<Fluid velocityDissipation={0.05} densityDissipation={0.5} transparent />'}</code
					>
					<figcaption>SLOW + TRANSPARENT</figcaption>
				</figure>
			</div>
		</div>
	</section>

	<section class="glass-section reveal" bind:this={revealEls[8]}>
		<div class="glass-inner">
			<div class="eyebrow">§ 06</div>
			<h2 class="display center">
				Refract through <span class="italic">glass</span>.
			</h2>
			<p class="muted center small-copy">
				Glass adds a lens — refraction at the wall, chromatic fringes at the edge. Use with any
				container shape.
			</p>
			<div class="glass-grid">
				<figure class="glass-cell">
					<div class="glass-canvas">
						<Fluid
							seed={1111}
							lazy
							glass
							glassRefraction={0.7}
							glassReflectivity={0.15}
							glassChromatic={0.5}
							glassThickness={0.08}
							containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 }}
							backColor={{ r: 4, g: 2, b: 12 }}
							curl={35}
							densityDissipation={0.15}
							velocityDissipation={0.06}
							splatRadius={0.38}
							splatForce={5000}
							shading
							bloom
							sunrays={false}
							initialSplatCount={12}
							autoSplatRate={stickyAutoAnimate ? 1.2 : 0}
							autoSplatCenterY={0.5}
							autoSplatBandHeight={0.8}
							autoSplatSwirl={500}
							splatOnHover
							aria-label="Crystal orb effect demo"
						/>
					</div>
					<figcaption>CRYSTAL ORB</figcaption>
				</figure>
				<figure class="glass-cell">
					<div class="glass-canvas">
						<Fluid
							seed={1212}
							lazy
							glass
							glassRefraction={0.25}
							glassReflectivity={0.06}
							glassChromatic={0.1}
							containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 }}
							backColor={{ r: 0, g: 0, b: 0 }}
							curl={30}
							densityDissipation={0.4}
							velocityDissipation={0.12}
							splatRadius={0.25}
							splatForce={5000}
							shading
							bloom
							sunrays
							initialSplatCount={15}
							autoSplatRate={stickyAutoAnimate ? 2.5 : 0}
							autoSplatCount={2}
							autoSplatCenterY={0.5}
							autoSplatBandHeight={0.8}
							autoSplatSwirl={400}
							splatOnHover
							aria-label="Soft lens effect demo"
						/>
					</div>
					<figcaption>SOFT LENS</figcaption>
				</figure>
				<figure class="glass-cell">
					<div class="glass-canvas">
						<Fluid
							seed={1313}
							lazy
							glass
							glassThickness={0.05}
							glassRefraction={0.6}
							glassReflectivity={0.15}
							glassChromatic={0.7}
							containerShape={{
								type: 'annulus',
								cx: 0.5,
								cy: 0.5,
								innerRadius: 0.15,
								outerRadius: 0.42
							}}
							backColor={{ r: 2, g: 4, b: 14 }}
							curl={40}
							densityDissipation={0.3}
							velocityDissipation={0.1}
							splatRadius={0.3}
							splatForce={5000}
							shading
							bloom
							sunrays={false}
							initialSplatCount={10}
							autoSplatRate={stickyAutoAnimate ? 1.5 : 0}
							autoSplatCenterY={0.5}
							autoSplatBandHeight={0.6}
							autoSplatSwirl={400}
							splatOnHover
							aria-label="Portal ring glass effect demo"
						/>
					</div>
					<figcaption>PORTAL RING</figcaption>
				</figure>
				<figure class="glass-cell">
					<div class="glass-canvas">
						<Fluid
							seed={1414}
							lazy
							glass
							glassThickness={0.06}
							glassRefraction={0.5}
							glassReflectivity={0.18}
							glassChromatic={0.4}
							containerShape={{
								type: 'frame',
								cx: 0.5,
								cy: 0.5,
								halfW: 0.22,
								halfH: 0.22,
								innerCornerRadius: 0.06,
								outerHalfW: 0.48,
								outerHalfH: 0.48,
								outerCornerRadius: 0.04
							}}
							backColor={{ r: 6, g: 3, b: 16 }}
							curl={25}
							densityDissipation={0.25}
							velocityDissipation={0.1}
							splatRadius={0.35}
							splatForce={5000}
							shading
							bloom
							bloomIntensity={1.0}
							sunrays={false}
							initialSplatCount={10}
							autoSplatRate={stickyAutoAnimate ? 3.0 : 0}
							autoSplatCount={2}
							autoSplatCenterY={0.5}
							autoSplatBandHeight={1.5}
							autoSplatSwirl={350}
							splatOnHover
							aria-label="Glass frame effect demo"
						/>
					</div>
					<figcaption>GLASS FRAME</figcaption>
				</figure>
			</div>
		</div>
	</section>

	<section class="sticky-section reveal" bind:this={revealEls[4]}>
		<div class="sticky-inner">
			<div class="eyebrow">§ 07</div>
			<h2 class="display center">
				Make dye cling to <span class="italic">letterforms</span>.
			</h2>
			<p class="muted center small-copy">FluidStick masks the simulation with text or SVG paths. Hover to engage.</p>
			<div class="sticky-grid">
				{#each stickyCells as s (s.text)}
					<figure class="sticky-cell">
						<div class="sticky-canvas" aria-label="Sticky text demo — {s.caption}">
							<FluidStick
								text={s.text}
								font={s.font}
								seed={s.seed}
								autoAnimate={stickyAutoAnimate}
								autoAnimateDuration={4}
								colorful
								shading
								bloom={false}
								densityDissipation={0.92}
								splatRadius={0.18}
								lazy
							/>
						</div>
						<figcaption>{s.caption}</figcaption>
					</figure>
				{/each}
			</div>
		</div>
	</section>

	<section class="reveal-section reveal" bind:this={revealEls[9]}>
		<div class="reveal-inner">
			<div class="eyebrow">§ 08</div>
			<h2 class="display center">
				Uncover with <span class="italic">FluidReveal</span>.
			</h2>
			<p class="muted center small-copy">
				FluidReveal uses the simulation as an opacity mask. Move the cursor to uncover what's
				underneath.
			</p>
			<div class="reveal-grid">
				<figure class="reveal-cell">
					<div class="reveal-canvas" aria-label="Scratch-to-reveal demo">
						<FluidReveal
							lazy
							velocityDissipation={0.95}
							pressureIterations={10}
						>
							<div class="reveal-gradient">
								<span class="reveal-label">Revealed!</span>
							</div>
						</FluidReveal>
					</div>
					<figcaption>SCRATCH TO REVEAL</figcaption>
				</figure>
				<figure class="reveal-cell">
					<div class="reveal-canvas" aria-label="Auto-reveal demo">
						<FluidReveal
							lazy
							autoReveal={stickyAutoAnimate}
							autoRevealSpeed={0.8}
							fadeBack={false}
							velocityDissipation={0.95}
							sensitivity={0.15}
							coverColor={{ r: 0.05, g: 0.08, b: 0.13 }}
							fringeColor={{ r: 0.15, g: 0.35, b: 0.55 }}
							accentColor={{ r: 0, g: 0.78, b: 1 }}
						>
							<div class="reveal-stars">
								<span class="reveal-label">Auto Reveal</span>
							</div>
						</FluidReveal>
					</div>
					<figcaption>AUTO-REVEAL</figcaption>
				</figure>
			</div>
		</div>
	</section>

	<section class="distort-section reveal" bind:this={revealEls[5]}>
		<div class="distort-inner">
			<div class="eyebrow">§ 09</div>
			<h2 class="display center">
				Distort an <span class="italic">image</span>.
			</h2>
			<p class="muted center small-copy">
				FluidDistortion warps any source with the velocity field. Hover to engage.
			</p>
			<div class="distort-grid">
				{#each distortCells as d (d.seed)}
					<figure class="distort-cell">
						<div class="distort-canvas" aria-label="Image distortion demo — {d.caption}">
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

	<section class="play-section reveal" bind:this={revealEls[10]}>
		<div class="play-inner">
			<div class="eyebrow centered">§ 10 · Play</div>
			<h2 class="display center">
				<span class="italic">Try</span> it.
			</h2>
			<p class="muted center small-copy">
				Drag the knobs. The fluid updates in real time.
			</p>

			<div class="preset-chips" role="tablist" aria-label="Quick-start presets">
				{#each presetNames as name (name)}
					<button
						type="button"
						class="preset-chip"
						class:active={activePreset === name}
						aria-pressed={activePreset === name}
						onclick={() => applyPreset(name)}
					>
						{name}
					</button>
				{/each}
				<button type="button" class="preset-chip reset" onclick={resetPlayground}>
					Reset
				</button>
			</div>

			<div class="playground-grid">
				<div class="playground-canvas" aria-label="Interactive playground stage">
					<Fluid
						seed={4242}
						lazy
						splatOnHover
						initialSplatCount={20}
						curl={pgCurl}
						splatRadius={pgSplatRadius}
						splatForce={pgSplatForce}
						densityDissipation={pgDensityDissipation}
						velocityDissipation={pgVelocityDissipation}
						bloom={pgBloom}
						shading={pgShading}
						colorful={pgColorful}
						backColor={pgBackColor}
						aria-label="Interactive playground"
					/>
				</div>

				<aside class="playground-panel">
					<div class="knob-group">
						<div class="knob-group-title">Physics</div>
						<label class="knob-row">
							<span class="knob-label">curl</span>
							<input
								type="range"
								min="0"
								max="50"
								step="1"
								bind:value={pgCurl}
								oninput={markCustomEdit}
							/>
							<span class="knob-value">{pgCurl}</span>
						</label>
						<label class="knob-row">
							<span class="knob-label">splatRadius</span>
							<input
								type="range"
								min="0.05"
								max="1"
								step="0.01"
								bind:value={pgSplatRadius}
								oninput={markCustomEdit}
							/>
							<span class="knob-value">{pgSplatRadius.toFixed(2)}</span>
						</label>
						<label class="knob-row">
							<span class="knob-label">splatForce</span>
							<input
								type="range"
								min="1000"
								max="9000"
								step="100"
								bind:value={pgSplatForce}
								oninput={markCustomEdit}
							/>
							<span class="knob-value">{pgSplatForce}</span>
						</label>
						<label class="knob-row">
							<span class="knob-label">densityDissipation</span>
							<input
								type="range"
								min="0"
								max="1"
								step="0.01"
								bind:value={pgDensityDissipation}
								oninput={markCustomEdit}
							/>
							<span class="knob-value">{pgDensityDissipation.toFixed(2)}</span>
						</label>
						<label class="knob-row">
							<span class="knob-label">velocityDissipation</span>
							<input
								type="range"
								min="0"
								max="1"
								step="0.01"
								bind:value={pgVelocityDissipation}
								oninput={markCustomEdit}
							/>
							<span class="knob-value">{pgVelocityDissipation.toFixed(2)}</span>
						</label>
					</div>

					<div class="knob-group">
						<div class="knob-group-title">Visuals</div>
						<label class="toggle-row">
							<input
								type="checkbox"
								bind:checked={pgBloom}
								onchange={markCustomEdit}
							/>
							<span class="toggle-pill" aria-hidden="true"></span>
							<span class="knob-label">bloom</span>
						</label>
						<label class="toggle-row">
							<input
								type="checkbox"
								bind:checked={pgShading}
								onchange={markCustomEdit}
							/>
							<span class="toggle-pill" aria-hidden="true"></span>
							<span class="knob-label">shading</span>
						</label>
						<label class="toggle-row">
							<input
								type="checkbox"
								bind:checked={pgColorful}
								onchange={markCustomEdit}
							/>
							<span class="toggle-pill" aria-hidden="true"></span>
							<span class="knob-label">colorful</span>
						</label>
					</div>

					<div class="knob-group">
						<div class="knob-group-title">Background</div>
						<label class="color-row">
							<span class="knob-label">backColor</span>
							<input
								type="color"
								value={pgBackColorHex}
								oninput={onBackColorInput}
								aria-label="Background color"
							/>
							<span class="knob-value mono">{pgBackColorHex}</span>
						</label>
					</div>

					<div class="snippet-head">
						<span>snippet</span>
						<button class="copy-btn small" onclick={copySnippet} aria-label="Copy playground snippet">
							{copiedSnippet ? 'Copied!' : 'Copy'}
						</button>
					</div>
					<pre class="snippet-code"><code>{playgroundSnippet}</code></pre>
				</aside>
			</div>
		</div>
	</section>

	<section class="manifest-section reveal" bind:this={revealEls[6]}>
		<div class="manifest-inner">
			<div class="eyebrow">§ 11 · Manifest</div>
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
	.competition-back {
		position: fixed;
		top: 1rem;
		left: 1rem;
		z-index: 200;
		font-size: 0.75rem;
		font-weight: 500;
		letter-spacing: 0.05em;
		color: rgba(255, 255, 255, 0.45);
		text-decoration: none;
		background: rgba(0, 0, 0, 0.55);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		padding: 0.35rem 0.7rem;
		transition: color 0.15s, border-color 0.15s;
	}

	.competition-back:hover {
		color: rgba(255, 255, 255, 0.85);
		border-color: rgba(255, 255, 255, 0.2);
	}

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

	/* Scrim behind every post-hero section to block FluidBackground bleed.
	   The hero section has no `.reveal` class, so it stays untouched.
	   Applied as the section's own background — using a ::before with z-index:-1
	   does not composite reliably above the fixed FluidBackground canvas. */
	section.reveal {
		position: relative;
		z-index: 1;
		background-color: rgba(8, 8, 12, 0.86);
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
	.distort-section,
	.physics-section,
	.glass-section,
	.reveal-section {
		padding-block: 7rem;
		padding-inline: 1.5rem;
		background: #0a0a0a;
	}

	.shape-inner,
	.sticky-inner,
	.distort-inner,
	.physics-inner,
	.glass-inner,
	.reveal-inner {
		max-width: 1200px;
		margin: 0 auto;
		text-align: center;
	}

	.shape-inner .eyebrow,
	.sticky-inner .eyebrow,
	.distort-inner .eyebrow,
	.physics-inner .eyebrow,
	.glass-inner .eyebrow,
	.reveal-inner .eyebrow {
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

	.physics-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1.25rem;
	}

	.physics-cell {
		margin: 0;
		display: flex;
		flex-direction: column;
	}

	.physics-canvas {
		position: relative;
		height: 280px;
		background: #050505;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		overflow: hidden;
		cursor: crosshair;
	}

	.physics-snippet {
		display: block;
		margin-top: 0.7rem;
		padding: 0.45rem 0.6rem;
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.7rem;
		line-height: 1.4;
		letter-spacing: 0.01em;
		color: rgba(255, 255, 255, 0.72);
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 4px;
		text-align: left;
		overflow-x: auto;
		white-space: nowrap;
	}

	.glass-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.25rem;
	}

	.glass-cell {
		margin: 0;
	}

	.glass-canvas {
		position: relative;
		height: 360px;
		background: #050505;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		overflow: hidden;
		cursor: crosshair;
	}

	.reveal-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.25rem;
	}

	.reveal-cell {
		margin: 0;
	}

	.reveal-canvas {
		position: relative;
		height: 360px;
		background: #050505;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		overflow: hidden;
		cursor: crosshair;
	}

	.reveal-gradient {
		width: 100%;
		height: 100%;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: inherit;
	}

	.reveal-stars {
		width: 100%;
		height: 100%;
		background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: inherit;
	}

	.reveal-label {
		font-family: 'Geist', 'Inter', system-ui, sans-serif;
		font-weight: 700;
		font-size: clamp(1.6rem, 3.2vw, 2.4rem);
		color: #ffffff;
		letter-spacing: -0.02em;
		text-align: center;
	}

	.glass-cell figcaption,
	.physics-cell figcaption,
	.reveal-cell figcaption {
		margin-top: 0.7rem;
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.2em;
		color: rgba(255, 255, 255, 0.55);
		text-align: center;
	}

	.physics-cell figcaption {
		margin-top: 0.55rem;
	}

	.play-section {
		padding-block: 7rem;
		padding-inline: 1.5rem;
		background: #0a0a0a;
	}

	.play-inner {
		max-width: 1100px;
		margin: 0 auto;
		text-align: center;
	}

	.play-inner .eyebrow {
		margin-bottom: 1rem;
	}

	.play-inner .display {
		margin-bottom: 0.6rem;
	}

	.play-inner .small-copy {
		margin-bottom: 2rem;
	}

	.preset-chips {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
		margin: 0 auto 1.8rem;
		max-width: 100%;
	}

	.preset-chip {
		padding: 0.42rem 0.95rem;
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.12);
		color: rgba(255, 255, 255, 0.7);
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border-radius: 999px;
		cursor: pointer;
		transition:
			border-color 0.18s ease,
			color 0.18s ease,
			background 0.18s ease;
	}

	.preset-chip:hover {
		border-color: rgba(255, 248, 231, 0.6);
		color: #fff8e7;
	}

	.preset-chip.active {
		background: rgba(255, 248, 231, 0.08);
		border-color: #fff8e7;
		color: #fff8e7;
	}

	.preset-chip.reset {
		opacity: 0.7;
	}

	.playground-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 320px;
		gap: 1.25rem;
		align-items: stretch;
		text-align: left;
	}

	.playground-canvas {
		position: relative;
		height: 520px;
		background: #050505;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		overflow: hidden;
		cursor: crosshair;
	}

	.playground-panel {
		background: rgba(14, 14, 14, 0.92);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		padding: 1.1rem 1.1rem 1.2rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		overflow: hidden;
	}

	.knob-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.knob-group-title {
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.55);
		margin-bottom: 0.2rem;
	}

	.knob-row {
		display: grid;
		grid-template-columns: 7.5rem minmax(0, 1fr) 3.2rem;
		align-items: center;
		gap: 0.55rem;
	}

	.knob-label {
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.72rem;
		color: rgba(255, 255, 255, 0.72);
		letter-spacing: 0.02em;
	}

	.knob-value {
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.72rem;
		color: rgba(255, 255, 255, 0.55);
		text-align: right;
	}

	.knob-value.mono {
		text-transform: lowercase;
	}

	.knob-row input[type='range'] {
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 2px;
		background: rgba(255, 255, 255, 0.14);
		border-radius: 1px;
		outline: none;
		cursor: pointer;
	}

	.knob-row input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #fafafa;
		border: 1px solid rgba(0, 0, 0, 0.4);
		cursor: pointer;
		transition: transform 0.15s ease;
	}

	.knob-row input[type='range']::-moz-range-thumb {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #fafafa;
		border: 1px solid rgba(0, 0, 0, 0.4);
		cursor: pointer;
	}

	.knob-row input[type='range']:hover::-webkit-slider-thumb {
		transform: scale(1.18);
	}

	.toggle-row {
		display: grid;
		grid-template-columns: 32px auto 1fr;
		align-items: center;
		gap: 0.55rem;
		cursor: pointer;
		padding: 0.18rem 0;
	}

	.toggle-row input[type='checkbox'] {
		position: absolute;
		opacity: 0;
		pointer-events: none;
		width: 0;
		height: 0;
	}

	.toggle-pill {
		position: relative;
		display: inline-block;
		width: 28px;
		height: 16px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.14);
		transition:
			background 0.18s ease,
			border-color 0.18s ease;
	}

	.toggle-pill::after {
		content: '';
		position: absolute;
		top: 1px;
		left: 1px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.55);
		transition:
			transform 0.18s ease,
			background 0.18s ease;
	}

	.toggle-row input[type='checkbox']:checked ~ .toggle-pill {
		background: rgba(255, 248, 231, 0.18);
		border-color: rgba(255, 248, 231, 0.5);
	}

	.toggle-row input[type='checkbox']:checked ~ .toggle-pill::after {
		transform: translateX(12px);
		background: #fff8e7;
	}

	.color-row {
		display: grid;
		grid-template-columns: 7.5rem 28px minmax(0, 1fr);
		align-items: center;
		gap: 0.55rem;
		cursor: pointer;
	}

	.color-row input[type='color'] {
		appearance: none;
		-webkit-appearance: none;
		width: 28px;
		height: 22px;
		padding: 0;
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 4px;
		background: transparent;
		cursor: pointer;
	}

	.color-row input[type='color']::-webkit-color-swatch-wrapper {
		padding: 0;
	}

	.color-row input[type='color']::-webkit-color-swatch {
		border: 0;
		border-radius: 3px;
	}

	.snippet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.55rem 0.1rem 0;
		margin-top: 0.4rem;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.5);
	}

	.snippet-code {
		margin: 0;
		padding: 0.7rem 0.85rem;
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.74rem;
		line-height: 1.55;
		color: rgba(255, 255, 255, 0.85);
		background: #050505;
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 6px;
		overflow-x: auto;
		white-space: pre;
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
		.physics-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.footer-row.cols {
			grid-template-columns: repeat(2, 1fr);
		}
		.playground-grid {
			grid-template-columns: 1fr;
		}
		.playground-canvas {
			height: 420px;
		}
		.preset-chips {
			justify-content: flex-start;
			overflow-x: auto;
			flex-wrap: nowrap;
			scrollbar-width: thin;
			padding-bottom: 0.3rem;
		}
		.preset-chip {
			flex: 0 0 auto;
		}
	}

	@media (max-width: 720px) {
		.shape-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.glass-grid {
			grid-template-columns: 1fr;
		}
		.reveal-grid {
			grid-template-columns: 1fr;
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
		.physics-grid {
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
		.distort-section,
		.physics-section,
		.glass-section,
		.reveal-section {
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
