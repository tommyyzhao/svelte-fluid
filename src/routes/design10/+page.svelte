<script lang="ts">
	import {
		AnnularFluid,
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
		Aurora,
		ToroidalTempest,
		type RGB
	} from '$lib/index.js';
	import { base } from '$app/paths';

	type TabKey = 'bun' | 'npm' | 'pnpm' | 'yarn';

	const installCmds: Record<TabKey, string> = {
		bun: 'bun add svelte-fluid',
		npm: 'npm install svelte-fluid',
		pnpm: 'pnpm add svelte-fluid',
		yarn: 'yarn add svelte-fluid'
	};

	let activeTab = $state<TabKey>('bun');
	let copied = $state(false);

	async function copyInstall() {
		try {
			await navigator.clipboard.writeText(installCmds[activeTab]);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {
			copied = false;
		}
	}

	const usage = `<script>
  import { Fluid } from 'svelte-fluid';
<\/script>

<Fluid seed={42} splatOnHover />`;

	const features = [
		'Multi-instance',
		'Resize-stable',
		'Deterministic seeding',
		'70+ props',
		'10 presets',
		'Zero runtime deps',
		'MIT licensed'
	];

	const presets = [
		{
			name: 'LavaLamp',
			component: LavaLamp,
			seed: 12,
			desc: 'Slow molten blobs in a warm palette.'
		},
		{
			name: 'Plasma',
			component: Plasma,
			seed: 24,
			desc: 'High-energy chromatic turbulence.'
		},
		{
			name: 'InkInWater',
			component: InkInWater,
			seed: 36,
			desc: 'Diffusing ink against a pale field.'
		},
		{
			name: 'FrozenSwirl',
			component: FrozenSwirl,
			seed: 48,
			desc: 'Crystalline swirls in cool tones.'
		},
		{
			name: 'Aurora',
			component: Aurora,
			seed: 60,
			desc: 'Sheets of green-violet light.'
		},
		{
			name: 'ToroidalTempest',
			component: ToroidalTempest,
			seed: 72,
			desc: 'Annular storm with sustained flow.'
		}
	];

	const tabs: TabKey[] = ['bun', 'npm', 'pnpm', 'yarn'];

	const lightning = 'M 55 5 L 25 55 L 45 55 L 35 95 L 75 40 L 55 40 L 70 5 Z';

	let reducedMotion = $state(false);

	$effect(() => {
		if (typeof window === 'undefined') return;
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		reducedMotion = mq.matches;
		const onChange = (e: MediaQueryListEvent) => (reducedMotion = e.matches);
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	});

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
	<title>svelte-fluid — WebGL fluid for Svelte 5</title>
</svelte:head>

<a class="competition-back" href="{base}/design-competition">← Competition</a>

<FluidBackground
	colorful
	shading
	bloom
	bloomIntensity={0.5}
	sunrays={false}
	densityDissipation={0.6}
	velocityDissipation={0.4}
	curl={40}
	splatRadius={0.05}
	splatForce={3000}
	splatOnHover
	autoSplatRate={stickyAutoAnimate ? 2 : 0}
	autoSplatCount={2}
	exclude=".card, .panel, .nav-bar, .footer-bar"
	excludeRadius={20}
	seed={2026}
>
	<div class="page">
		<header class="nav-bar">
			<div class="nav-inner">
				<a class="brand" href="{base}/">svelte-fluid</a>
				<nav class="nav-links">
					<a href="{base}/docs">Docs</a>
					<a href="https://github.com/tommyyzhao/svelte-fluid" target="_blank" rel="noreferrer"
						>GitHub</a
					>
				</nav>
			</div>
		</header>

		<main>
			<section class="hero">
				<span class="eyebrow">WebGL fluid &middot; Svelte 5</span>
				<div class="hero-fluid">
					<FluidText
						text="FLUID"
						seed={7}
						colorful
						shading
						bloom
						splatOnHover
						initialSplatCount={20}
						autoSplatRate={stickyAutoAnimate ? 6 : 0}
						autoSplatCount={4}
						autoSplatSwirl={300}
					/>
				</div>
				<h1 class="tagline">
					WebGL fluid simulation as a Svelte 5 component.
					<span class="tag-accent"
						>Multi-instance, resize-stable, deterministic seeding.</span
					>
				</h1>
				<div class="cta-row">
					<a class="btn primary" href="{base}/docs">Get Started</a>
					<a
						class="btn ghost"
						href="https://github.com/tommyyzhao/svelte-fluid"
						target="_blank"
						rel="noreferrer">GitHub</a
					>
				</div>
			</section>

			<section class="install-section">
				<div class="card panel install-card">
					<div class="tab-row">
						{#each tabs as t (t)}
							<button
								class="tab"
								class:active={activeTab === t}
								onclick={() => (activeTab = t)}
							>
								{t}
							</button>
						{/each}
					</div>
					<div class="install-row">
						<code class="install-code">{installCmds[activeTab]}</code>
						<button class="copy-btn" onclick={copyInstall} aria-label="Copy install command">
							{copied ? 'Copied' : 'Copy'}
						</button>
					</div>
					<div class="divider"></div>
					<div class="usage-head">Minimal usage</div>
					<pre class="usage-code"><code>{usage}</code></pre>
				</div>
			</section>

			<section class="why-section">
				<div class="pill-row">
					{#each features as f (f)}
						<span class="card pill">{f}</span>
					{/each}
				</div>
			</section>

			<section class="presets-section">
				<div class="section-head">
					<span class="eyebrow">Presets</span>
					<h2>Drop-in visuals, one import each.</h2>
				</div>
				<div class="preset-grid">
					{#each presets as p (p.name)}
						{@const C = p.component}
						<article class="card preset-card">
							<div class="preset-canvas">
								<C seed={p.seed} lazy aria-label="{p.name} preset" backColor={{ r: 8, g: 8, b: 10 }} />
							</div>
							<div class="preset-meta">
								<div class="preset-name">{p.name}</div>
								<div class="preset-desc">{p.desc}</div>
								<a class="preset-src" href="{base}/docs/presets">View source &rarr;</a>
							</div>
						</article>
					{/each}
				</div>
			</section>

			<section class="shapes-section">
				<div class="section-head">
					<span class="eyebrow">Shapes</span>
					<h2>Container primitives.</h2>
					<p class="section-sub">Six analytical SDFs ship in-engine: circle, rounded rect, frame, annulus, plus SVG path and text glyph rasterized to a mask texture.</p>
				</div>
				<div class="shape-grid">
					<article class="card shape-card">
						<div class="shape-canvas">
							<CircularFluid seed={601} lazy splatOnHover aria-label="Circle container demo" backColor={{ r: 8, g: 8, b: 10 }} />
						</div>
						<div class="shape-label">CIRCLE</div>
					</article>
					<article class="card shape-card">
						<div class="shape-canvas">
							<Fluid
								seed={602}
								colorful
								shading
								bloom
								splatOnHover
								containerShape={{
									type: 'roundedRect',
									cx: 0.5,
									cy: 0.5,
									halfW: 0.42,
									halfH: 0.42,
									cornerRadius: 0.08
								}}
								lazy
								aria-label="Rounded rect container demo"
							/>
						</div>
						<div class="shape-label">ROUNDED RECT</div>
					</article>
					<article class="card shape-card">
						<div class="shape-canvas">
							<FrameFluid seed={603} lazy splatOnHover aria-label="Frame container demo" backColor={{ r: 8, g: 8, b: 10 }} />
						</div>
						<div class="shape-label">FRAME</div>
					</article>
					<article class="card shape-card">
						<div class="shape-canvas">
							<AnnularFluid seed={604} lazy splatOnHover aria-label="Annulus container demo" backColor={{ r: 8, g: 8, b: 10 }} />
						</div>
						<div class="shape-label">ANNULUS</div>
					</article>
					<article class="card shape-card">
						<div class="shape-canvas">
							<Fluid
								seed={605}
								colorful
								shading
								bloom
								splatOnHover
								containerShape={{ type: 'svgPath', d: lightning, viewBox: [0, 0, 100, 100] }}
								lazy
								aria-label="SVG path lightning container demo"
							/>
						</div>
						<div class="shape-label">SVG PATH</div>
					</article>
					<article class="card shape-card">
						<div class="shape-canvas">
							<Fluid
								seed={606}
								colorful
								shading
								bloom
								splatOnHover
								containerShape={{ type: 'svgPath', text: '&', font: '900 280px Georgia, serif' }}
								lazy
								aria-label="Text glyph container demo"
							/>
						</div>
						<div class="shape-label">TEXT GLYPH</div>
					</article>
				</div>
			</section>

			<section class="physics-section">
				<div class="section-head">
					<span class="eyebrow">Physics</span>
					<h2>Tunable simulation.</h2>
					<p class="section-sub">Sensible defaults out of the box. Override curl, dissipation, splat radius, and force to dial in the look — every prop is optional.</p>
				</div>
				<div class="physics-grid">
					<article class="card physics-card">
						<div class="physics-canvas">
							<Fluid
								seed={1234}
								initialSplatCount={12}
								splatOnHover
								lazy
								aria-label="Default fluid configuration"
							/>
						</div>
						<div class="physics-meta">
							<code class="physics-snippet">{'<Fluid />'}</code>
							<div class="physics-label">DEFAULT</div>
						</div>
					</article>
					<article class="card physics-card">
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
						<div class="physics-meta">
							<code class="physics-snippet">{'bloom={false} curl={5} densityDissipation={0.4}'}</code>
							<div class="physics-label">FLAT + SOFT</div>
						</div>
					</article>
					<article class="card physics-card">
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
						<div class="physics-meta">
							<code class="physics-snippet">{'shading={false} splatRadius={0.8} splatForce={9000}'}</code>
							<div class="physics-label">BOLD SPLATS</div>
						</div>
					</article>
					<article class="card physics-card">
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
						<div class="physics-meta">
							<code class="physics-snippet">{'velocityDissipation={0.05} densityDissipation={0.5} transparent'}</code>
							<div class="physics-label">SLOW + TRANSPARENT</div>
						</div>
					</article>
				</div>
			</section>

			<section class="glass-section">
				<div class="section-head">
					<span class="eyebrow">Glass</span>
					<h2>Lens refraction.</h2>
					<p class="section-sub">Enable the glass pass to bend the scene at the container wall with tunable thickness, reflectivity, and chromatic dispersion. Composes with any shape.</p>
				</div>
				<div class="glass-grid">
					<article class="card glass-card">
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
								aria-label="Crystal orb glass demo"
							/>
						</div>
						<div class="glass-label">CRYSTAL ORB</div>
					</article>
					<article class="card glass-card">
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
								aria-label="Soft lens glass demo"
							/>
						</div>
						<div class="glass-label">SOFT LENS</div>
					</article>
					<article class="card glass-card">
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
								aria-label="Portal ring glass demo"
							/>
						</div>
						<div class="glass-label">PORTAL RING</div>
					</article>
					<article class="card glass-card">
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
								aria-label="Glass frame demo"
							/>
						</div>
						<div class="glass-label">GLASS FRAME</div>
					</article>
				</div>
			</section>

			<section class="sticky-section">
				<div class="section-head">
					<span class="eyebrow">Sticky</span>
					<h2>Masked dye fields.</h2>
					<p class="section-sub">FluidStick binds the dye to a text or SVG path mask. The simulation runs full-bleed; only pixels inside the mask retain color.</p>
				</div>
				<div class="sticky-grid">
					<article class="card sticky-card">
						<div class="sticky-canvas">
							<FluidStick
								text="FLUID"
								font="900 100px Geist, Inter, sans-serif"
								seed={211}
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
						<div class="sticky-label">Geist · 900</div>
					</article>
					<article class="card sticky-card">
						<div class="sticky-canvas">
							<FluidStick
								text="∞"
								font="200px Georgia, serif"
								seed={222}
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
						<div class="sticky-label">Georgia · ∞</div>
					</article>
				</div>
			</section>

			<section class="reveal-section">
				<div class="section-head">
					<span class="eyebrow">Reveal</span>
					<h2>Opacity-mask overlay.</h2>
					<p class="section-sub">FluidReveal renders the dye field as an alpha channel over arbitrary child content. Pointer motion or auto-reveal clears the cover.</p>
				</div>
				<div class="reveal-grid">
					<article class="card reveal-card">
						<div class="reveal-canvas">
							<FluidReveal
								lazy
								velocityDissipation={0.95}
								pressureIterations={10}
							>
								<div class="reveal-content">Revealed</div>
							</FluidReveal>
						</div>
						<div class="reveal-label">SCRATCH TO REVEAL</div>
					</article>
					<article class="card reveal-card">
						<div class="reveal-canvas">
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
								<div class="reveal-content">Auto Reveal</div>
							</FluidReveal>
						</div>
						<div class="reveal-label">AUTO-REVEAL</div>
					</article>
				</div>
			</section>

			<section class="distort-section">
				<div class="section-head">
					<span class="eyebrow">Distortion</span>
					<h2>Velocity-warped imagery.</h2>
					<p class="section-sub">FluidDistortion samples a source image through the live velocity field. Tune strength and intensity for subtle ripples or heavy turbulence.</p>
				</div>
				<div class="distort-grid">
					<article class="card distort-card">
						<div class="distort-canvas">
							<FluidDistortion
								src="{base}/bosch-garden.jpg"
								seed={311}
								strength={0.3}
								intensity={20}
								scale={1.0}
								fit="cover"
								initialSplats={6}
								lazy
							/>
						</div>
						<div class="distort-label">SUBTLE · STRENGTH 0.3</div>
					</article>
					<article class="card distort-card">
						<div class="distort-canvas">
							<FluidDistortion
								src="{base}/bosch-garden.jpg"
								seed={322}
								strength={0.45}
								intensity={28}
								scale={1.0}
								fit="cover"
								initialSplats={6}
								lazy
							/>
						</div>
						<div class="distort-label">STRONG · STRENGTH 0.45</div>
					</article>
				</div>
			</section>

			<section class="play-section">
				<div class="section-head">
					<span class="eyebrow">Playground</span>
					<h2>Try it.</h2>
					<p class="section-sub">Drag the knobs. The fluid updates in real time.</p>
				</div>

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
					<div class="playground-canvas-wrap card">
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

					<aside class="playground-panel card">
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
			</section>
		</main>

		<footer class="footer-bar">
			<div class="footer-inner">
				<div class="footer-links">
					<a href="{base}/docs">Docs</a>
					<a href="https://github.com/tommyyzhao/svelte-fluid" target="_blank" rel="noreferrer"
						>GitHub</a
					>
					<a href="https://www.npmjs.com/package/svelte-fluid" target="_blank" rel="noreferrer"
						>npm</a
					>
				</div>
				<div class="footer-credit">
					MIT &middot; Derivative work of PavelDoGreat/WebGL-Fluid-Simulation by Pavel Dobryakov (c)
					2017.
				</div>
			</div>
		</footer>
	</div>
</FluidBackground>

<style>
	:global(html),
	:global(body) {
		margin: 0;
		padding: 0;
		background: #08080a;
	}

	.competition-back {
		position: fixed;
		top: 1rem;
		left: 1rem;
		z-index: 200;
		font-size: 0.75rem;
		font-weight: 500;
		color: rgba(0, 0, 0, 0.55);
		text-decoration: none;
		background: rgba(255, 255, 255, 0.95);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: 20px;
		padding: 0.35rem 0.8rem;
		transition:
			color 0.15s,
			box-shadow 0.15s;
	}

	.competition-back:hover {
		color: rgba(0, 0, 0, 0.9);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.page {
		min-height: 100vh;
		color: #fafafa;
		font-family: 'Geist', 'Inter', system-ui, -apple-system, sans-serif;
		font-feature-settings: 'ss01', 'cv11';
		-webkit-font-smoothing: antialiased;
	}

	.nav-bar {
		position: sticky;
		top: 0;
		z-index: 40;
		height: 56px;
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		background: rgba(8, 8, 10, 0.6);
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.nav-inner {
		max-width: 1200px;
		height: 100%;
		margin: 0 auto;
		padding: 0 24px;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.brand {
		font-size: 14px;
		font-weight: 600;
		letter-spacing: -0.01em;
		color: #fafafa;
		text-decoration: none;
	}

	.nav-links {
		display: flex;
		gap: 22px;
	}

	.nav-links a {
		font-size: 13px;
		color: rgba(255, 255, 255, 0.6);
		text-decoration: none;
		transition: color 140ms ease;
	}

	.nav-links a:hover {
		color: #fafafa;
	}

	main {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 24px;
	}

	.hero {
		min-height: 90vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 64px 0 80px;
		gap: 28px;
	}

	.eyebrow {
		display: inline-block;
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
		font-size: 11px;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.55);
	}

	.hero-fluid {
		width: clamp(300px, 70vw, 760px);
		height: clamp(140px, 22vw, 240px);
	}

	.tagline {
		max-width: 580px;
		margin: 0;
		font-size: clamp(1rem, 1.4vw, 1.15rem);
		line-height: 1.55;
		color: rgba(255, 255, 255, 0.7);
	}

	.tag-accent {
		font-family: 'Playfair Display', 'EB Garamond', Georgia, serif;
		font-style: italic;
		color: rgba(255, 255, 255, 0.85);
	}

	.cta-row {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		justify-content: center;
		margin-top: 4px;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		padding: 11px 22px;
		border-radius: 999px;
		font-size: 14px;
		font-weight: 500;
		text-decoration: none;
		transition:
			background 140ms ease,
			border-color 140ms ease,
			color 140ms ease,
			transform 140ms ease;
	}

	.btn.primary {
		background: #fafafa;
		color: #08080a;
	}

	.btn.primary:hover {
		transform: translateY(-1px);
	}

	.btn.ghost {
		background: transparent;
		color: #fafafa;
		border: 1px solid rgba(255, 255, 255, 0.18);
	}

	.btn.ghost:hover {
		border-color: rgba(255, 255, 255, 0.4);
		background: rgba(255, 255, 255, 0.04);
	}

	.card {
		background: rgba(10, 10, 12, 0.92);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 16px;
	}

	.install-section {
		max-width: 720px;
		margin: 0 auto;
		padding: 16px 0 64px;
	}

	.install-card {
		padding: 14px 16px 18px;
	}

	.tab-row {
		display: flex;
		gap: 4px;
		padding: 4px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 10px;
		width: fit-content;
	}

	.tab {
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
		font-size: 12px;
		letter-spacing: 0.05em;
		padding: 6px 14px;
		border-radius: 7px;
		border: 0;
		background: transparent;
		color: rgba(255, 255, 255, 0.55);
		cursor: pointer;
		transition:
			background 140ms ease,
			color 140ms ease;
	}

	.tab:hover {
		color: #fafafa;
	}

	.tab.active {
		background: rgba(255, 255, 255, 0.09);
		color: #fafafa;
	}

	.install-row {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 14px;
		padding: 12px 14px;
		background: #050507;
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 10px;
	}

	.install-code {
		flex: 1;
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
		font-size: 13px;
		color: #fafafa;
		overflow-x: auto;
		white-space: nowrap;
	}

	.copy-btn {
		flex-shrink: 0;
		padding: 6px 14px;
		font-size: 11px;
		font-weight: 500;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		border-radius: 7px;
		background: transparent;
		color: rgba(255, 255, 255, 0.65);
		border: 1px solid rgba(255, 255, 255, 0.12);
		cursor: pointer;
		transition:
			color 140ms ease,
			border-color 140ms ease;
	}

	.copy-btn:hover {
		color: #fafafa;
		border-color: rgba(255, 255, 255, 0.3);
	}

	.copy-btn.small {
		padding: 4px 10px;
		font-size: 10px;
	}

	.divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.05);
		margin: 18px 0 14px;
	}

	.usage-head {
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
		font-size: 10px;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.45);
		margin-bottom: 10px;
	}

	.usage-code {
		margin: 0;
		padding: 12px 14px;
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
		font-size: 12.5px;
		line-height: 1.6;
		color: rgba(255, 255, 255, 0.88);
		background: #050507;
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 10px;
		overflow-x: auto;
	}

	.why-section {
		max-width: 960px;
		margin: 0 auto;
		padding: 8px 0 64px;
	}

	.pill-row {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		justify-content: center;
	}

	.pill {
		padding: 7px 14px;
		font-size: 12.5px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.78);
		border-radius: 999px;
	}

	.presets-section {
		max-width: 1200px;
		margin: 0 auto;
		padding: 16px 0 96px;
	}

	.section-head {
		text-align: center;
		margin-bottom: 36px;
	}

	.section-head .eyebrow {
		margin-bottom: 10px;
	}

	.section-head h2 {
		font-size: clamp(1.6rem, 3vw, 2.1rem);
		font-weight: 600;
		letter-spacing: -0.02em;
		margin: 0 0 10px;
		color: #fafafa;
	}

	.section-sub {
		max-width: 560px;
		margin: 0 auto;
		font-size: 0.9rem;
		line-height: 1.55;
		color: rgba(255, 255, 255, 0.5);
	}

	.preset-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 18px;
	}

	.preset-card {
		overflow: hidden;
		display: flex;
		flex-direction: column;
		transition:
			transform 200ms ease,
			border-color 200ms ease;
	}

	.preset-card:hover {
		transform: translateY(-2px);
		border-color: rgba(255, 255, 255, 0.16);
	}

	.preset-canvas {
		height: 320px;
		position: relative;
		background: #050507;
	}

	.preset-meta {
		padding: 14px 16px 16px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.preset-name {
		font-size: 14px;
		font-weight: 600;
		color: #fafafa;
		letter-spacing: -0.01em;
	}

	.preset-desc {
		font-size: 12.5px;
		color: rgba(255, 255, 255, 0.55);
		line-height: 1.45;
	}

	.preset-src {
		margin-top: 6px;
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.55);
		text-decoration: none;
		transition: color 140ms ease;
	}

	.preset-src:hover {
		color: #fafafa;
	}

	/* Shapes section */
	.shapes-section {
		max-width: 1200px;
		margin: 0 auto;
		padding: 16px 0 96px;
	}

	.shape-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 18px;
	}

	.shape-card {
		overflow: hidden;
		display: flex;
		flex-direction: column;
		transition:
			transform 200ms ease,
			border-color 200ms ease;
	}

	.shape-card:hover {
		transform: translateY(-2px);
		border-color: rgba(255, 255, 255, 0.16);
	}

	.shape-canvas {
		height: 280px;
		position: relative;
		background: #050507;
	}

	.shape-label {
		padding: 10px 14px 12px;
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
		font-size: 10.5px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.5);
	}

	/* Physics section */
	.physics-section {
		max-width: 1200px;
		margin: 0 auto;
		padding: 16px 0 96px;
	}

	.physics-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 18px;
	}

	.physics-card {
		overflow: hidden;
		display: flex;
		flex-direction: column;
		transition:
			transform 200ms ease,
			border-color 200ms ease;
	}

	.physics-card:hover {
		transform: translateY(-2px);
		border-color: rgba(255, 255, 255, 0.16);
	}

	.physics-canvas {
		height: 260px;
		position: relative;
		background: #050507;
	}

	.physics-meta {
		padding: 10px 14px 14px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.physics-snippet {
		display: block;
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
		font-size: 11px;
		color: rgba(255, 255, 255, 0.7);
		background: #050507;
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 6px;
		padding: 6px 10px;
		overflow-x: auto;
		white-space: nowrap;
	}

	.physics-label {
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
		font-size: 10px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.4);
	}

	/* Glass section */
	.glass-section {
		max-width: 1200px;
		margin: 0 auto;
		padding: 16px 0 96px;
	}

	.glass-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 18px;
	}

	.glass-card {
		overflow: hidden;
		display: flex;
		flex-direction: column;
		transition:
			transform 200ms ease,
			border-color 200ms ease;
	}

	.glass-card:hover {
		transform: translateY(-2px);
		border-color: rgba(255, 255, 255, 0.16);
	}

	.glass-canvas {
		height: 320px;
		position: relative;
		background: #060408;
	}

	.glass-label {
		padding: 10px 14px 12px;
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
		font-size: 10.5px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.5);
	}

	/* Sticky section */
	.sticky-section {
		max-width: 1200px;
		margin: 0 auto;
		padding: 16px 0 96px;
	}

	.sticky-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 18px;
	}

	.sticky-card {
		overflow: hidden;
		display: flex;
		flex-direction: column;
		transition:
			transform 200ms ease,
			border-color 200ms ease;
	}

	.sticky-card:hover {
		transform: translateY(-2px);
		border-color: rgba(255, 255, 255, 0.16);
	}

	.sticky-canvas {
		height: 220px;
		position: relative;
		background: #050507;
	}

	.sticky-label {
		padding: 10px 14px 12px;
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
		font-size: 10.5px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.5);
	}

	/* Reveal section */
	.reveal-section {
		max-width: 1200px;
		margin: 0 auto;
		padding: 16px 0 96px;
	}

	.reveal-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 18px;
	}

	.reveal-card {
		overflow: hidden;
		display: flex;
		flex-direction: column;
		transition:
			transform 200ms ease,
			border-color 200ms ease;
	}

	.reveal-card:hover {
		transform: translateY(-2px);
		border-color: rgba(255, 255, 255, 0.16);
	}

	.reveal-canvas {
		height: 280px;
		position: relative;
		background: #050507;
	}

	.reveal-content {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		font-size: 1.4rem;
	}

	.reveal-label {
		padding: 10px 14px 12px;
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
		font-size: 10.5px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.5);
	}

	/* Distortion section */
	.distort-section {
		max-width: 1200px;
		margin: 0 auto;
		padding: 16px 0 96px;
	}

	.distort-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 18px;
	}

	.distort-card {
		overflow: hidden;
		display: flex;
		flex-direction: column;
		transition:
			transform 200ms ease,
			border-color 200ms ease;
	}

	.distort-card:hover {
		transform: translateY(-2px);
		border-color: rgba(255, 255, 255, 0.16);
	}

	.distort-canvas {
		height: 320px;
		position: relative;
		background: #050507;
	}

	.distort-label {
		padding: 10px 14px 12px;
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
		font-size: 10.5px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.5);
	}

	/* Playground section */
	.play-section {
		max-width: 1200px;
		margin: 0 auto;
		padding: 16px 0 96px;
	}

	.preset-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		justify-content: center;
		margin-bottom: 28px;
	}

	.preset-chip {
		padding: 6px 16px;
		border-radius: 999px;
		font-size: 12.5px;
		font-weight: 500;
		background: transparent;
		color: rgba(255, 255, 255, 0.6);
		border: 1px solid rgba(255, 255, 255, 0.12);
		cursor: pointer;
		transition:
			background 140ms ease,
			color 140ms ease,
			border-color 140ms ease;
	}

	.preset-chip:hover {
		color: #fafafa;
		border-color: rgba(255, 255, 255, 0.28);
	}

	.preset-chip.active {
		background: linear-gradient(135deg, rgba(120, 80, 255, 0.25), rgba(40, 160, 255, 0.25));
		color: #fafafa;
		border-color: rgba(120, 80, 255, 0.5);
	}

	.preset-chip.reset {
		color: rgba(255, 255, 255, 0.4);
	}

	.preset-chip.reset:hover {
		color: rgba(255, 255, 255, 0.7);
	}

	.playground-grid {
		display: grid;
		grid-template-columns: 1fr 320px;
		gap: 18px;
		align-items: start;
	}

	.playground-canvas-wrap {
		height: 480px;
		position: relative;
		overflow: hidden;
	}

	.playground-panel {
		padding: 18px 16px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.knob-group {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.knob-group-title {
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
		font-size: 9.5px;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.4);
		margin-bottom: 2px;
	}

	.knob-row {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}

	.knob-label {
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
		font-size: 11px;
		color: rgba(255, 255, 255, 0.65);
		min-width: 130px;
		flex-shrink: 0;
	}

	.knob-row input[type='range'] {
		flex: 1;
		accent-color: rgba(120, 80, 255, 0.8);
		height: 2px;
	}

	.knob-value {
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
		font-size: 11px;
		color: rgba(255, 255, 255, 0.5);
		min-width: 40px;
		text-align: right;
	}

	.knob-value.mono {
		min-width: 60px;
	}

	.toggle-row {
		display: flex;
		align-items: center;
		gap: 10px;
		cursor: pointer;
	}

	.toggle-row input[type='checkbox'] {
		display: none;
	}

	.toggle-pill {
		width: 32px;
		height: 18px;
		border-radius: 9px;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.12);
		position: relative;
		flex-shrink: 0;
		transition: background 140ms ease;
	}

	.toggle-pill::after {
		content: '';
		position: absolute;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.45);
		top: 2px;
		left: 2px;
		transition:
			transform 140ms ease,
			background 140ms ease;
	}

	.toggle-row input[type='checkbox']:checked + .toggle-pill {
		background: rgba(120, 80, 255, 0.5);
		border-color: rgba(120, 80, 255, 0.6);
	}

	.toggle-row input[type='checkbox']:checked + .toggle-pill::after {
		transform: translateX(14px);
		background: #fafafa;
	}

	.color-row {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}

	.color-row input[type='color'] {
		width: 28px;
		height: 22px;
		border-radius: 5px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: none;
		cursor: pointer;
		padding: 0;
	}

	.snippet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
		font-size: 9.5px;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.4);
	}

	.snippet-code {
		margin: 0;
		padding: 10px 12px;
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
		font-size: 11px;
		line-height: 1.6;
		color: rgba(255, 255, 255, 0.8);
		background: #050507;
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 8px;
		overflow-x: auto;
		white-space: pre;
	}

	.footer-bar {
		border-top: 1px solid rgba(255, 255, 255, 0.06);
		background: rgba(8, 8, 10, 0.7);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
	}

	.footer-inner {
		max-width: 1200px;
		margin: 0 auto;
		padding: 18px 24px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 12px;
	}

	.footer-links {
		display: flex;
		gap: 18px;
	}

	.footer-links a {
		font-size: 12.5px;
		color: rgba(255, 255, 255, 0.6);
		text-decoration: none;
		transition: color 140ms ease;
	}

	.footer-links a:hover {
		color: #fafafa;
	}

	.footer-credit {
		font-size: 11.5px;
		color: rgba(255, 255, 255, 0.45);
	}

	@media (max-width: 1000px) {
		.playground-grid {
			grid-template-columns: 1fr;
		}

		.playground-canvas-wrap {
			height: 360px;
		}
	}

	@media (max-width: 900px) {
		.preset-grid,
		.shape-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 600px) {
		.preset-grid,
		.shape-grid,
		.physics-grid,
		.glass-grid,
		.sticky-grid,
		.reveal-grid,
		.distort-grid {
			grid-template-columns: 1fr;
		}

		.hero {
			min-height: 80vh;
			padding: 48px 0 64px;
		}

		.hero-fluid {
			height: clamp(120px, 30vw, 180px);
		}

		.footer-inner {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
