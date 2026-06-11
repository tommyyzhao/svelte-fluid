<script lang="ts">
	import {
		AnnularFluid,
		Aurora,
		CircularFluid,
		Fluid,
		FluidDistortion,
		FluidReveal,
		FluidStick,
		FluidText,
		FrameFluid,
		FrozenSwirl,
		InkInWater,
		LavaLamp,
		Plasma,
		Toroidal,
		type RGB
	} from '$lib/index.js';
	import { base } from '$app/paths';

	type TabKey = 'bun' | 'npm' | 'pnpm';

	const installCmds: Record<TabKey, string> = {
		bun: 'bun add svelte-fluid',
		npm: 'npm install svelte-fluid',
		pnpm: 'pnpm add svelte-fluid'
	};

	let activeTab = $state<TabKey>('npm');
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

	const presets = [
		{
			name: 'LavaLamp',
			component: LavaLamp,
			seed: 12,
			desc: 'Slow molten blobs, warm palette.'
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
			name: 'Toroidal',
			component: Toroidal,
			seed: 72,
			desc: 'Annular storm with sustained flow.'
		}
	];

	const stats = [
		{ label: '10 presets' },
		{ label: '276 tests' },
		{ label: 'MIT licensed' },
		{ label: 'Svelte 5' },
		{ label: 'Zero deps' }
	];

	const features = [
		{
			title: 'Multi-instance',
			desc: 'Render many independent simulations on one page.'
		},
		{
			title: 'Resize-stable',
			desc: 'Survives container resizes without artifacts.'
		},
		{
			title: 'Deterministic seeding',
			desc: 'Same seed renders the same opening splash.'
		},
		{
			title: 'Zero runtime deps',
			desc: 'Just Svelte 5 and a WebGL canvas. Nothing else.'
		}
	];

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
		LavaLamp: {
			curl: 8,
			splatRadius: 0.55,
			splatForce: 4800,
			densityDissipation: 0.18,
			velocityDissipation: 0.08,
			bloom: true,
			shading: true,
			colorful: false,
			backColor: { r: 8, g: 4, b: 14 }
		},
		Plasma: {
			curl: 50,
			splatRadius: 0.22,
			splatForce: 7500,
			densityDissipation: 0.6,
			velocityDissipation: 0.15,
			bloom: true,
			shading: true,
			colorful: true,
			backColor: { r: 4, g: 2, b: 12 }
		},
		'Ink in Water': {
			curl: 12,
			splatRadius: 0.32,
			splatForce: 5200,
			densityDissipation: 0.4,
			velocityDissipation: 0.1,
			bloom: false,
			shading: true,
			colorful: false,
			backColor: { r: 244, g: 240, b: 232 }
		},
		'Frozen Swirl': {
			curl: 35,
			splatRadius: 0.28,
			splatForce: 5800,
			densityDissipation: 0.2,
			velocityDissipation: 0.05,
			bloom: true,
			shading: true,
			colorful: false,
			backColor: { r: 2, g: 8, b: 18 }
		},
		Aurora: {
			curl: 22,
			splatRadius: 0.38,
			splatForce: 6200,
			densityDissipation: 0.15,
			velocityDissipation: 0.08,
			bloom: true,
			shading: true,
			colorful: true,
			backColor: { r: 0, g: 4, b: 14 }
		},
		'Toroidal': {
			curl: 45,
			splatRadius: 0.3,
			splatForce: 7000,
			densityDissipation: 0.25,
			velocityDissipation: 0.1,
			bloom: true,
			shading: false,
			colorful: true,
			backColor: { r: 6, g: 2, b: 16 }
		}
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
		const h = (n: number) =>
			Math.max(0, Math.min(255, Math.round(n)))
				.toString(16)
				.padStart(2, '0');
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
		if (pgSplatRadius !== PLAYGROUND_DEFAULTS.splatRadius)
			lines.push(`\tsplatRadius={${pgSplatRadius}}`);
		if (pgSplatForce !== PLAYGROUND_DEFAULTS.splatForce)
			lines.push(`\tsplatForce={${pgSplatForce}}`);
		if (pgDensityDissipation !== PLAYGROUND_DEFAULTS.densityDissipation)
			lines.push(`\tdensityDissipation={${pgDensityDissipation}}`);
		if (pgVelocityDissipation !== PLAYGROUND_DEFAULTS.velocityDissipation)
			lines.push(`\tvelocityDissipation={${pgVelocityDissipation}}`);
		if (pgBloom !== PLAYGROUND_DEFAULTS.bloom) lines.push(`\tbloom={${pgBloom}}`);
		if (pgShading !== PLAYGROUND_DEFAULTS.shading) lines.push(`\tshading={${pgShading}}`);
		if (pgColorful !== PLAYGROUND_DEFAULTS.colorful) lines.push(`\tcolorful={${pgColorful}}`);
		const d = PLAYGROUND_DEFAULTS.backColor;
		if (pgBackColor.r !== d.r || pgBackColor.g !== d.g || pgBackColor.b !== d.b)
			lines.push(
				`\tbackColor={{ r: ${pgBackColor.r}, g: ${pgBackColor.g}, b: ${pgBackColor.b} }}`
			);
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

<div class="page">
	<header class="nav">
		<div class="nav-inner">
			<a class="logo" href="{base}/">
				<span class="logo-dot"></span>
				<span>svelte-fluid</span>
			</a>
			<nav class="nav-links">
				<a href="{base}/docs">Docs</a>
				<a href="{base}/docs/components">Components</a>
				<a href="{base}/docs/presets">Presets</a>
				<a href="https://github.com/tommyyzhao/svelte-fluid" target="_blank" rel="noreferrer">
					GitHub
				</a>
				<a class="nav-cta" href="{base}/docs">Get Started</a>
			</nav>
		</div>
	</header>

	<main>
		<section class="hero">
			<div class="hero-eyebrow">
				<span class="pulse"></span>
				v0.2.2 — now on npm
			</div>
			<h1 class="display">
				<span class="display-prefix">svelte-</span>
				<span class="display-fluid">
					<FluidText text="FLUID" seed={7} bloom sunrays colorful />
				</span>
			</h1>
			<p class="subtitle">
				WebGL fluid simulation as a Svelte 5 component. Multi-instance, resize-stable,
				deterministic seeding.
			</p>
			<div class="cta-row">
				<a class="btn primary" href="{base}/docs">
					Get Started
					<span class="btn-arrow">→</span>
				</a>
				<a
					class="btn secondary"
					href="https://github.com/tommyyzhao/svelte-fluid"
					target="_blank"
					rel="noreferrer"
				>
					Star on GitHub
				</a>
			</div>

			<div class="stats">
				{#each stats as stat (stat.label)}
					<div class="stat-card">{stat.label}</div>
				{/each}
			</div>
		</section>

		<section class="featured">
			<div class="featured-frame">
				<div class="featured-canvas">
					<Aurora seed={101} aria-label="Aurora preset featured preview" backColor={{ r: 0, g: 0, b: 0 }} />
				</div>
				<div class="featured-vignette" aria-hidden="true"></div>
				<div class="featured-label">AURORA / PRESET</div>
			</div>
		</section>

		<section class="presets-section">
			<div class="section-head">
				<span class="eyebrow">Presets</span>
				<h2>Drop-in visuals, one import each.</h2>
				<p class="section-sub">
					Opinionated configurations of the underlying engine. Pick one, give it a seed, ship.
				</p>
			</div>

			<div class="preset-grid">
				{#each presets as p (p.name)}
					<article class="preset-card">
						<div class="preset-canvas">
							{#if p.name === 'LavaLamp'}
								<LavaLamp seed={p.seed} lazy aria-label="LavaLamp preview" backColor={{ r: 0, g: 0, b: 0 }} />
							{:else if p.name === 'Plasma'}
								<Plasma seed={p.seed} lazy aria-label="Plasma preview" backColor={{ r: 0, g: 0, b: 0 }} />
							{:else if p.name === 'InkInWater'}
								<InkInWater seed={p.seed} lazy aria-label="InkInWater preview" backColor={{ r: 0, g: 0, b: 0 }} />
							{:else if p.name === 'FrozenSwirl'}
								<FrozenSwirl seed={p.seed} lazy aria-label="FrozenSwirl preview" backColor={{ r: 0, g: 0, b: 0 }} />
							{:else if p.name === 'Aurora'}
								<Aurora seed={p.seed} lazy aria-label="Aurora preview" backColor={{ r: 0, g: 0, b: 0 }} />
							{:else if p.name === 'Toroidal'}
								<Toroidal seed={p.seed} lazy aria-label="Toroidal preview" backColor={{ r: 0, g: 0, b: 0 }} />
							{/if}
						</div>
						<div class="preset-meta">
							<div class="preset-name">{p.name}</div>
							<div class="preset-desc">{p.desc}</div>
						</div>
					</article>
				{/each}
			</div>
		</section>

		<section class="shapes-section">
			<div class="section-head">
				<span class="eyebrow">Shapes</span>
				<h2>Container shape API.</h2>
				<p class="section-sub">
					The <code>containerShape</code> prop accepts six variants — circle, rounded rect, frame,
					annulus, SVG path, and text glyph — each backed by an analytical SDF or a rasterized
					mask texture.
				</p>
			</div>
			<div class="shape-grid">
				<article class="shape-card">
					<div class="shape-canvas">
						<CircularFluid seed={601} lazy splatOnHover aria-label="Circle container demo" backColor={{ r: 0, g: 0, b: 0 }} />
					</div>
					<div class="shape-label">Circle</div>
				</article>
				<article class="shape-card">
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
					<div class="shape-label">Rounded Rect</div>
				</article>
				<article class="shape-card">
					<div class="shape-canvas">
						<FrameFluid seed={603} lazy splatOnHover aria-label="Frame container demo" backColor={{ r: 0, g: 0, b: 0 }} />
					</div>
					<div class="shape-label">Frame</div>
				</article>
				<article class="shape-card">
					<div class="shape-canvas">
						<AnnularFluid seed={604} lazy splatOnHover aria-label="Annulus container demo" backColor={{ r: 0, g: 0, b: 0 }} />
					</div>
					<div class="shape-label">Annulus</div>
				</article>
				<article class="shape-card">
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
					<div class="shape-label">SVG Path</div>
				</article>
				<article class="shape-card">
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
					<div class="shape-label">Text Glyph</div>
				</article>
			</div>
		</section>

		<section class="glass-section">
			<div class="section-head">
				<span class="eyebrow">Glass</span>
				<h2>Refractive container walls.</h2>
				<p class="section-sub">
					Setting <code>glass</code> samples the scene behind the canvas and refracts it through the
					container boundary, with configurable IOR and chromatic dispersion.
				</p>
			</div>
			<div class="glass-grid">
				<article class="glass-card">
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
					<div class="glass-meta">
						<div class="glass-name">Crystal Orb</div>
						<div class="glass-desc">High refraction · chromatic · circle</div>
					</div>
				</article>
				<article class="glass-card">
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
					<div class="glass-meta">
						<div class="glass-name">Soft Lens</div>
						<div class="glass-desc">Low refraction · sunrays · circle</div>
					</div>
				</article>
				<article class="glass-card">
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
					<div class="glass-meta">
						<div class="glass-name">Portal Ring</div>
						<div class="glass-desc">High chromatic · annulus</div>
					</div>
				</article>
				<article class="glass-card">
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
					<div class="glass-meta">
						<div class="glass-name">Glass Frame</div>
						<div class="glass-desc">Bloom · frame shape</div>
					</div>
				</article>
			</div>
		</section>

		<section class="sticky-section">
			<div class="section-head">
				<span class="eyebrow">Sticky</span>
				<h2>Text-shape dye masks.</h2>
				<p class="section-sub">
					<code>&lt;FluidStick&gt;</code> rasterizes a string or SVG path to a sticky mask, clipping
					the simulation to the resulting glyph silhouette.
				</p>
			</div>
			<div class="sticky-grid">
				<div class="sticky-card">
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
				<div class="sticky-card">
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
			</div>
		</section>

		<section class="reveal-section">
			<div class="section-head">
				<span class="eyebrow">Reveal</span>
				<h2>Velocity-driven opacity masks.</h2>
				<p class="section-sub">
					<code>&lt;FluidReveal&gt;</code> wraps arbitrary child content and exposes it where the
					simulation's density field exceeds a threshold. Supports cursor-driven and
					auto-revealing modes via props.
				</p>
			</div>
			<div class="reveal-grid">
				<article class="reveal-card">
					<div class="reveal-canvas">
						<FluidReveal lazy velocityDissipation={0.95} pressureIterations={10}>
							<div class="reveal-inner-content">Revealed</div>
						</FluidReveal>
					</div>
					<div class="reveal-label-text">Scratch to Reveal</div>
				</article>
				<article class="reveal-card">
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
							<div class="reveal-inner-content">Auto Reveal</div>
						</FluidReveal>
					</div>
					<div class="reveal-label-text">Auto-Reveal</div>
				</article>
			</div>
		</section>

		<section class="distort-section">
			<div class="section-head">
				<span class="eyebrow">Distortion</span>
				<h2>Velocity-field image warp.</h2>
				<p class="section-sub">
					<code>&lt;FluidDistortion&gt;</code> samples an image source and displaces its UVs by the
					live velocity field. Tune <code>strength</code> and <code>intensity</code> to dial
					between subtle ripple and full liquefy.
				</p>
			</div>
			<div class="distort-grid">
				<article class="distort-card">
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
					<div class="distort-label-text">Subtle · Strength 0.3</div>
				</article>
				<article class="distort-card">
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
					<div class="distort-label-text">Strong · Strength 0.45</div>
				</article>
			</div>
		</section>

		<section class="play-section">
			<div class="play-inner">
				<div class="section-head center">
					<span class="eyebrow">Playground</span>
					<h2>Live prop inspector.</h2>
					<p class="section-sub">
						Adjust physics and visual props on a mounted <code>&lt;Fluid&gt;</code> instance.
						Changes hot-reload through <code>setConfig</code> without remounting the canvas.
					</p>
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
					<button type="button" class="preset-chip reset" onclick={resetPlayground}>Reset</button>
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
								<input type="checkbox" bind:checked={pgBloom} onchange={markCustomEdit} />
								<span class="toggle-pill" aria-hidden="true"></span>
								<span class="knob-label">bloom</span>
							</label>
							<label class="toggle-row">
								<input type="checkbox" bind:checked={pgShading} onchange={markCustomEdit} />
								<span class="toggle-pill" aria-hidden="true"></span>
								<span class="knob-label">shading</span>
							</label>
							<label class="toggle-row">
								<input type="checkbox" bind:checked={pgColorful} onchange={markCustomEdit} />
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
							<button
								class="pg-copy-btn"
								onclick={copySnippet}
								aria-label="Copy playground snippet"
							>
								{copiedSnippet ? 'Copied!' : 'Copy'}
							</button>
						</div>
						<pre class="snippet-code"><code>{playgroundSnippet}</code></pre>
					</aside>
				</div>
			</div>
		</section>

		<section class="install-section">
			<div class="section-head center">
				<span class="eyebrow">Install</span>
				<h2>Ship it in 30 seconds.</h2>
			</div>
			<div class="install-card">
				<div class="install-tabs">
					{#each ['bun', 'npm', 'pnpm'] as tab (tab)}
						<button
							class="install-tab"
							class:active={activeTab === tab}
							onclick={() => (activeTab = tab as TabKey)}
						>
							{tab}
						</button>
					{/each}
					<button class="copy-btn" onclick={copyInstall}>
						{copied ? 'Copied' : 'Copy'}
					</button>
				</div>
				<pre class="install-code"><code>{installCmds[activeTab]}</code></pre>
			</div>

			<div class="usage-card">
				<div class="usage-head">Minimal usage</div>
				<pre class="usage-code"><code>{`<script>
	import { Fluid } from 'svelte-fluid';
<\/script>

<div style="width: 100%; height: 480px;">
	<Fluid seed={42} splatOnHover />
</div>`}</code></pre>
			</div>
		</section>

		<section class="why-section">
			<div class="section-head">
				<span class="eyebrow">Why svelte-fluid</span>
				<h2>Built for production, not just demos.</h2>
			</div>
			<div class="feature-grid">
				{#each features as f, i (f.title)}
					<div class="feature">
						<div class="feature-icon" data-i={i}></div>
						<div class="feature-title">{f.title}</div>
						<div class="feature-desc">{f.desc}</div>
					</div>
				{/each}
			</div>
		</section>
	</main>

	<footer class="footer">
		<div class="footer-inner">
			<div class="footer-links">
				<a href="{base}/docs">Docs</a>
				<a href="{base}/docs/presets">Presets</a>
				<a href="https://github.com/tommyyzhao/svelte-fluid" target="_blank" rel="noreferrer">
					GitHub
				</a>
				<a href="https://www.npmjs.com/package/svelte-fluid" target="_blank" rel="noreferrer">
					npm
				</a>
			</div>
			<div class="footer-credit">
				Derivative work of PavelDoGreat/WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017.
			</div>
		</div>
	</footer>
</div>

<style>
	:global(html) {
		scroll-behavior: smooth;
	}

	.competition-back {
		position: fixed;
		top: 1rem;
		left: 1rem;
		z-index: 200;
		font-size: 0.75rem;
		font-weight: 500;
		color: #a0a0a0;
		text-decoration: none;
		background: rgba(10, 10, 10, 0.85);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 6px;
		padding: 0.35rem 0.7rem;
		transition: color 0.15s;
	}

	.competition-back:hover {
		color: #fff;
	}

	.page {
		min-height: 100vh;
		background: #000;
		color: #fff;
		font-family:
			-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
		font-feature-settings: 'ss01', 'cv11';
		-webkit-font-smoothing: antialiased;
	}

	.nav {
		position: sticky;
		top: 0;
		z-index: 50;
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		background: rgba(0, 0, 0, 0.6);
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}

	.nav-inner {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0.9rem 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.logo {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		color: #fff;
		text-decoration: none;
		font-weight: 600;
		font-size: 0.95rem;
		letter-spacing: -0.01em;
	}

	.logo-dot {
		width: 14px;
		height: 14px;
		border-radius: 4px;
		background: linear-gradient(135deg, #2563eb 0%, #8b5cf6 50%, #06b6d4 100%);
		box-shadow: 0 0 12px rgba(139, 92, 246, 0.5);
	}

	.nav-links {
		display: flex;
		align-items: center;
		gap: 1.5rem;
	}

	.nav-links a {
		color: #a0a0a0;
		text-decoration: none;
		font-size: 0.875rem;
		font-weight: 500;
		transition: color 0.15s ease;
	}

	.nav-links a:hover {
		color: #fff;
	}

	.nav-cta {
		padding: 0.5rem 1rem;
		border-radius: 9px;
		background: linear-gradient(135deg, #2563eb 0%, #8b5cf6 50%, #06b6d4 100%);
		color: #fff !important;
		font-weight: 600 !important;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
	}

	main {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 1.5rem;
	}

	.hero {
		padding-block: 6rem 4rem;
		text-align: center;
	}

	.hero-eyebrow {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.85rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.03);
		font-size: 0.78rem;
		color: #c0c0c0;
		margin-bottom: 1.75rem;
	}

	.pulse {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #06b6d4;
		box-shadow: 0 0 8px #06b6d4;
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.4;
		}
	}

	.display {
		font-size: clamp(3.5rem, 11vw, 8rem);
		line-height: 0.95;
		letter-spacing: -0.04em;
		font-weight: 700;
		margin: 0 0 1.5rem;
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 0.1em;
		flex-wrap: wrap;
	}

	.display-prefix {
		color: #fff;
		font-family: 'Iowan Old Style', Georgia, 'Times New Roman', serif;
		font-style: italic;
		font-weight: 500;
	}

	.display-fluid {
		display: inline-block;
		height: 1em;
		width: clamp(280px, 50vw, 600px);
		vertical-align: baseline;
	}

	.subtitle {
		max-width: 620px;
		margin: 0 auto 2rem;
		font-size: 1.15rem;
		line-height: 1.55;
		color: #a0a0a0;
	}

	.cta-row {
		display: flex;
		justify-content: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-bottom: 3.5rem;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.7rem 1.25rem;
		border-radius: 10px;
		font-size: 0.92rem;
		font-weight: 500;
		text-decoration: none;
		transition:
			transform 0.15s ease,
			box-shadow 0.2s ease;
	}

	.btn.primary {
		background: linear-gradient(135deg, #2563eb 0%, #8b5cf6 50%, #06b6d4 100%);
		color: #fff;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.2),
			0 4px 14px -2px rgba(139, 92, 246, 0.4);
	}

	.btn.primary:hover {
		transform: translateY(-1px);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.25),
			0 8px 24px -4px rgba(139, 92, 246, 0.55);
	}

	.btn.secondary {
		background: transparent;
		color: #e5e5e5;
		border: 1px solid rgba(255, 255, 255, 0.12);
	}

	.btn.secondary:hover {
		border-color: rgba(255, 255, 255, 0.25);
		background: rgba(255, 255, 255, 0.03);
	}

	.btn-arrow {
		transition: transform 0.15s ease;
	}

	.btn.primary:hover .btn-arrow {
		transform: translateX(2px);
	}

	.stats {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.6rem;
	}

	.stat-card {
		padding: 0.5rem 0.95rem;
		border-radius: 9px;
		font-size: 0.82rem;
		color: #c0c0c0;
		font-weight: 500;
		background:
			linear-gradient(#0a0a0a, #0a0a0a) padding-box,
			linear-gradient(135deg, rgba(37, 99, 235, 0.4), rgba(139, 92, 246, 0.4), rgba(6, 182, 212, 0.4))
				border-box;
		border: 1px solid transparent;
	}

	.featured {
		padding-block: 2rem 4rem;
	}

	.featured-frame {
		position: relative;
		height: 520px;
		border-radius: 20px;
		overflow: hidden;
		border: 1px solid #1f1f1f;
		background: #050505;
	}

	.featured-canvas {
		position: absolute;
		inset: 0;
	}

	.featured-vignette {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background:
			radial-gradient(ellipse at center, transparent 40%, rgba(0, 0, 0, 0.6) 100%),
			linear-gradient(180deg, rgba(0, 0, 0, 0.3) 0%, transparent 30%, transparent 70%, rgba(0, 0, 0, 0.5) 100%);
	}

	.featured-label {
		position: absolute;
		bottom: 1.5rem;
		left: 1.75rem;
		font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		font-size: 0.72rem;
		letter-spacing: 0.18em;
		color: rgba(255, 255, 255, 0.85);
		text-shadow: 0 1px 8px rgba(0, 0, 0, 0.6);
	}

	.section-head {
		margin-bottom: 2.5rem;
	}

	.section-head.center {
		text-align: center;
	}

	.eyebrow {
		display: inline-block;
		font-size: 0.72rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		font-weight: 600;
		background: linear-gradient(135deg, #2563eb 0%, #8b5cf6 50%, #06b6d4 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		margin-bottom: 0.75rem;
	}

	.section-head h2 {
		font-size: clamp(1.75rem, 3.5vw, 2.5rem);
		font-weight: 600;
		letter-spacing: -0.025em;
		margin: 0 0 0.75rem;
		line-height: 1.15;
	}

	.section-sub {
		color: #a0a0a0;
		font-size: 1rem;
		line-height: 1.55;
		max-width: 580px;
		margin: 0;
	}

	.presets-section {
		padding-block: 4rem;
	}

	.preset-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1.25rem;
	}

	@media (max-width: 900px) {
		.preset-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 600px) {
		.preset-grid {
			grid-template-columns: 1fr;
		}
	}

	.preset-card {
		background: #0a0a0a;
		border: 1px solid #1f1f1f;
		border-radius: 16px;
		overflow: hidden;
		transition:
			transform 0.2s ease,
			box-shadow 0.25s ease,
			border-color 0.2s ease;
		position: relative;
	}

	.preset-card::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 16px;
		padding: 1px;
		background: linear-gradient(135deg, #2563eb, #8b5cf6, #06b6d4);
		mask:
			linear-gradient(#000 0 0) content-box,
			linear-gradient(#000 0 0);
		-webkit-mask:
			linear-gradient(#000 0 0) content-box,
			linear-gradient(#000 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
		opacity: 0;
		transition: opacity 0.2s ease;
		pointer-events: none;
	}

	.preset-card:hover {
		transform: translateY(-4px);
		box-shadow:
			0 0 0 1px rgba(139, 92, 246, 0.4),
			0 20px 40px -10px rgba(37, 99, 235, 0.3);
	}

	.preset-card:hover::before {
		opacity: 1;
	}

	.preset-canvas {
		height: 280px;
		position: relative;
		background: #050505;
	}

	.preset-meta {
		padding: 1rem 1.15rem 1.15rem;
	}

	.preset-name {
		font-size: 0.95rem;
		font-weight: 600;
		color: #fff;
		margin-bottom: 0.25rem;
	}

	.preset-desc {
		font-size: 0.85rem;
		color: #909090;
		line-height: 1.45;
	}

	/* Shapes section */

	.shapes-section {
		padding-block: 4rem;
	}

	.shape-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1.25rem;
	}

	@media (max-width: 900px) {
		.shape-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 600px) {
		.shape-grid {
			grid-template-columns: 1fr;
		}
	}

	.shape-card {
		background: #0a0a0a;
		border: 1px solid #1f1f1f;
		border-radius: 14px;
		overflow: hidden;
		transition:
			transform 0.2s ease,
			border-color 0.2s ease;
		position: relative;
	}

	.shape-card::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 14px;
		padding: 1px;
		background: linear-gradient(135deg, #2563eb, #8b5cf6, #06b6d4);
		mask:
			linear-gradient(#000 0 0) content-box,
			linear-gradient(#000 0 0);
		-webkit-mask:
			linear-gradient(#000 0 0) content-box,
			linear-gradient(#000 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
		opacity: 0;
		transition: opacity 0.2s ease;
		pointer-events: none;
	}

	.shape-card:hover {
		transform: translateY(-3px);
		border-color: rgba(139, 92, 246, 0.3);
	}

	.shape-card:hover::before {
		opacity: 1;
	}

	.shape-canvas {
		aspect-ratio: 1 / 1;
		position: relative;
		background: #050505;
		cursor: crosshair;
	}

	.shape-label {
		padding: 0.75rem 1rem;
		font-size: 0.8rem;
		font-weight: 600;
		color: #a0a0a0;
		letter-spacing: 0.04em;
		font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
	}

	/* Glass section */

	.glass-section {
		padding-block: 4rem;
	}

	.glass-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.25rem;
	}

	@media (max-width: 700px) {
		.glass-grid {
			grid-template-columns: 1fr;
		}
	}

	.glass-card {
		background: #0a0a0a;
		border: 1px solid #1f1f1f;
		border-radius: 14px;
		overflow: hidden;
		transition:
			transform 0.2s ease,
			border-color 0.2s ease;
		position: relative;
	}

	.glass-card::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 14px;
		padding: 1px;
		background: linear-gradient(135deg, #2563eb, #8b5cf6, #06b6d4);
		mask:
			linear-gradient(#000 0 0) content-box,
			linear-gradient(#000 0 0);
		-webkit-mask:
			linear-gradient(#000 0 0) content-box,
			linear-gradient(#000 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
		opacity: 0;
		transition: opacity 0.2s ease;
		pointer-events: none;
	}

	.glass-card:hover {
		transform: translateY(-3px);
		border-color: rgba(139, 92, 246, 0.3);
	}

	.glass-card:hover::before {
		opacity: 1;
	}

	.glass-canvas {
		height: 340px;
		position: relative;
		background: #050505;
		cursor: crosshair;
	}

	.glass-meta {
		padding: 0.85rem 1rem 1rem;
	}

	.glass-name {
		font-size: 0.92rem;
		font-weight: 600;
		color: #fff;
		margin-bottom: 0.2rem;
	}

	.glass-desc {
		font-size: 0.8rem;
		color: #707070;
		font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
	}

	/* Sticky section */

	.sticky-section {
		padding-block: 4rem;
	}

	.sticky-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.25rem;
	}

	@media (max-width: 700px) {
		.sticky-grid {
			grid-template-columns: 1fr;
		}
	}

	.sticky-card {
		height: 320px;
		background: #0a0a0a;
		border: 1px solid #1f1f1f;
		border-radius: 14px;
		overflow: hidden;
		position: relative;
		cursor: crosshair;
		transition: border-color 0.2s ease;
	}

	.sticky-card:hover {
		border-color: rgba(139, 92, 246, 0.3);
	}

	/* Reveal section */

	.reveal-section {
		padding-block: 4rem;
	}

	.reveal-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.25rem;
	}

	@media (max-width: 700px) {
		.reveal-grid {
			grid-template-columns: 1fr;
		}
	}

	.reveal-card {
		background: #0a0a0a;
		border: 1px solid #1f1f1f;
		border-radius: 14px;
		overflow: hidden;
		transition: border-color 0.2s ease;
	}

	.reveal-card:hover {
		border-color: rgba(139, 92, 246, 0.3);
	}

	.reveal-canvas {
		height: 340px;
		position: relative;
		background: #050505;
		cursor: crosshair;
	}

	.reveal-inner-content {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		font-size: 1.4rem;
		font-weight: 600;
		color: #fff;
		background: linear-gradient(135deg, #1e3a5f 0%, #2d1b69 50%, #0e4d6e 100%);
	}

	.reveal-label-text {
		padding: 0.75rem 1rem;
		font-size: 0.78rem;
		font-weight: 600;
		color: #707070;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
	}

	/* Distortion section */

	.distort-section {
		padding-block: 4rem;
	}

	.distort-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.25rem;
	}

	@media (max-width: 700px) {
		.distort-grid {
			grid-template-columns: 1fr;
		}
	}

	.distort-card {
		background: #0a0a0a;
		border: 1px solid #1f1f1f;
		border-radius: 14px;
		overflow: hidden;
		transition: border-color 0.2s ease;
	}

	.distort-card:hover {
		border-color: rgba(139, 92, 246, 0.3);
	}

	.distort-canvas {
		height: 440px;
		position: relative;
		background: #050505;
		cursor: crosshair;
	}

	.distort-label-text {
		padding: 0.75rem 1rem;
		font-size: 0.78rem;
		font-weight: 600;
		color: #707070;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
	}

	/* Playground section */

	.play-section {
		padding-block: 4rem;
	}

	.play-inner {
		width: 100%;
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
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: #a0a0a0;
		font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
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
		border-color: rgba(139, 92, 246, 0.6);
		color: #c0c0ff;
	}

	.preset-chip.active {
		background: rgba(139, 92, 246, 0.12);
		border-color: rgba(139, 92, 246, 0.7);
		color: #c4b5fd;
	}

	.preset-chip.reset {
		opacity: 0.65;
	}

	.playground-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 320px;
		gap: 1.25rem;
		align-items: stretch;
		text-align: left;
	}

	@media (max-width: 900px) {
		.playground-grid {
			grid-template-columns: 1fr;
		}
	}

	.playground-canvas {
		position: relative;
		height: 520px;
		background: #050505;
		border: 1px solid #1f1f1f;
		border-radius: 14px;
		overflow: hidden;
		cursor: crosshair;
	}

	.playground-panel {
		background: #0a0a0a;
		border: 1px solid #1f1f1f;
		border-radius: 14px;
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
		font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		font-size: 0.66rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: #606060;
		margin-bottom: 0.2rem;
	}

	.knob-row {
		display: grid;
		grid-template-columns: 7.5rem minmax(0, 1fr) 3.2rem;
		align-items: center;
		gap: 0.55rem;
	}

	.knob-label {
		font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		font-size: 0.72rem;
		color: #a0a0a0;
		letter-spacing: 0.02em;
	}

	.knob-value {
		font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		font-size: 0.72rem;
		color: #707070;
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
		background: rgba(255, 255, 255, 0.1);
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
		background: linear-gradient(135deg, #8b5cf6, #06b6d4);
		border: none;
		cursor: pointer;
		transition: transform 0.15s ease;
	}

	.knob-row input[type='range']::-moz-range-thumb {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: linear-gradient(135deg, #8b5cf6, #06b6d4);
		border: none;
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
		background: rgba(255, 255, 255, 0.07);
		border: 1px solid rgba(255, 255, 255, 0.12);
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
		background: #606060;
		transition:
			transform 0.18s ease,
			background 0.18s ease;
	}

	.toggle-row input[type='checkbox']:checked ~ .toggle-pill {
		background: rgba(139, 92, 246, 0.2);
		border-color: rgba(139, 92, 246, 0.6);
	}

	.toggle-row input[type='checkbox']:checked ~ .toggle-pill::after {
		transform: translateX(12px);
		background: #8b5cf6;
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
		border: 1px solid rgba(255, 255, 255, 0.12);
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
		font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		font-size: 0.66rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: #606060;
	}

	.pg-copy-btn {
		padding: 0.28rem 0.65rem;
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: #a0a0a0;
		font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		font-size: 0.66rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		border-radius: 5px;
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			color 0.15s ease;
		min-width: 4rem;
		text-align: center;
	}

	.pg-copy-btn:hover {
		border-color: rgba(139, 92, 246, 0.5);
		color: #c4b5fd;
	}

	.snippet-code {
		margin: 0;
		padding: 0.7rem 0.85rem;
		font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		font-size: 0.74rem;
		line-height: 1.55;
		color: #e0e0e0;
		background: #050505;
		border: 1px solid #1f1f1f;
		border-radius: 6px;
		overflow-x: auto;
		white-space: pre;
	}

	.install-section {
		padding-block: 4rem;
		max-width: 760px;
		margin: 0 auto;
	}

	.install-card,
	.usage-card {
		background: #0a0a0a;
		border: 1px solid #1f1f1f;
		border-radius: 14px;
		overflow: hidden;
		box-shadow: 0 8px 24px -8px rgba(0, 0, 0, 0.6);
	}

	.install-card {
		margin-bottom: 1rem;
	}

	.install-tabs {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.5rem 0.6rem;
		border-bottom: 1px solid #1f1f1f;
		background: #070707;
	}

	.install-tab {
		padding: 0.4rem 0.85rem;
		background: transparent;
		border: none;
		color: #808080;
		font-size: 0.82rem;
		font-weight: 500;
		font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		border-radius: 7px;
		cursor: pointer;
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}

	.install-tab:hover {
		color: #d0d0d0;
	}

	.install-tab.active {
		background: rgba(255, 255, 255, 0.06);
		color: #fff;
	}

	.copy-btn {
		margin-left: auto;
		padding: 0.4rem 0.85rem;
		background: transparent;
		border: 1px solid #2a2a2a;
		color: #c0c0c0;
		font-size: 0.78rem;
		font-weight: 500;
		border-radius: 7px;
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			color 0.15s ease;
	}

	.copy-btn:hover {
		border-color: #444;
		color: #fff;
	}

	.install-code,
	.usage-code {
		margin: 0;
		padding: 1.1rem 1.25rem;
		font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		font-size: 0.88rem;
		color: #e5e5e5;
		line-height: 1.55;
		overflow-x: auto;
		background: transparent;
	}

	.usage-head {
		padding: 0.75rem 1.25rem;
		font-size: 0.78rem;
		font-weight: 600;
		color: #a0a0a0;
		letter-spacing: 0.05em;
		border-bottom: 1px solid #1f1f1f;
		background: #070707;
	}

	.why-section {
		padding-block: 4rem 6rem;
	}

	.feature-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1.25rem;
	}

	@media (max-width: 900px) {
		.feature-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 540px) {
		.feature-grid {
			grid-template-columns: 1fr;
		}
	}

	.feature {
		padding: 1.5rem;
		border: 1px solid #1f1f1f;
		border-radius: 14px;
		background: #0a0a0a;
	}

	.feature-icon {
		width: 32px;
		height: 32px;
		border-radius: 8px;
		margin-bottom: 1rem;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.2),
			0 0 18px -4px rgba(139, 92, 246, 0.45);
	}

	.feature-icon[data-i='0'] {
		background: linear-gradient(135deg, #2563eb, #8b5cf6);
	}

	.feature-icon[data-i='1'] {
		background: linear-gradient(135deg, #8b5cf6, #06b6d4);
	}

	.feature-icon[data-i='2'] {
		background: linear-gradient(135deg, #06b6d4, #2563eb);
	}

	.feature-icon[data-i='3'] {
		background: linear-gradient(135deg, #2563eb, #06b6d4, #8b5cf6);
	}

	.feature-title {
		font-size: 1rem;
		font-weight: 600;
		color: #fff;
		margin-bottom: 0.4rem;
	}

	.feature-desc {
		font-size: 0.88rem;
		color: #909090;
		line-height: 1.5;
	}

	.footer {
		border-top: 1px solid rgba(255, 255, 255, 0.06);
		padding-block: 2rem;
	}

	.footer-inner {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.footer-links {
		display: flex;
		gap: 1.25rem;
	}

	.footer-links a {
		color: #a0a0a0;
		text-decoration: none;
		font-size: 0.85rem;
		transition: color 0.15s ease;
	}

	.footer-links a:hover {
		color: #fff;
	}

	.footer-credit {
		font-size: 0.78rem;
		color: #707070;
	}
</style>
