<script lang="ts">
	import {
		AnnularFluid,
		CircularFluid,
		Fluid,
		FluidBackground,
		FluidDistortion,
		FluidReveal,
		FluidStick,
		FrameFluid,
		LavaLamp,
		Plasma,
		InkInWater,
		FrozenSwirl,
		Aurora,
		ToroidalTempest
	} from '$lib/index.js';
	import { base } from '$app/paths';

	const installCmd = 'npm install svelte-fluid';
	const usageSnippet = `<script>
	import { Fluid } from 'svelte-fluid';
<\/script>

<div style="width: 100%; height: 480px;">
	<Fluid seed={42} colorful bloom sunrays />
</div>`;

	let copied = $state(false);
	let copiedUsage = $state(false);

	async function copyInstall() {
		try {
			await navigator.clipboard.writeText(installCmd);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {}
	}

	async function copyUsage() {
		try {
			await navigator.clipboard.writeText(usageSnippet);
			copiedUsage = true;
			setTimeout(() => (copiedUsage = false), 1600);
		} catch {}
	}

	const features = [
		'multi-instance',
		'resize-stable',
		'deterministic seeding',
		'MIT',
		'zero runtime deps',
		'70+ props',
		'10 presets'
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

	type RGB = { r: number; g: number; b: number };

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
	<title>svelte-fluid — Liquid Glass</title>
</svelte:head>

<a class="competition-back" href="{base}/design-competition">← Competition</a>

<FluidBackground
	exclude=".glass-card, .glass-nav, .glass-section, .glass-pill, .glass-code, .glass-footer"
	excludeRadius={20}
	excludePad={6}
	colorful
	shading
	bloom
	sunrays
	autoSplatRate={0.25}
	autoSplatCount={3}
	autoSplatSwirl={0.7}
	velocityDissipation={0.15}
	densityDissipation={0.6}
	splatRadius={0.35}
	bloomIntensity={0.7}
	sunraysWeight={0.9}
	backColor={{ r: 6, g: 8, b: 26 }}
	seed={777}
>
	<main class="page">
		<nav class="glass-nav" aria-label="Primary">
			<a class="brand" href="{base}/">
				<span class="brand-dot"></span>
				<span class="brand-name">svelte-fluid</span>
			</a>
			<div class="nav-links">
				<a href="{base}/docs">Docs</a>
				<a href="{base}/docs/presets">Presets</a>
				<a href="{base}/docs/api">API</a>
				<a href="https://github.com/tommyyzhao/svelte-fluid" target="_blank" rel="noopener">GitHub</a>
			</div>
		</nav>

		<section class="hero">
			<div class="hero-inner glass-card">
				<h1 class="display">
					<span class="gradient-text">Fluid, as a Svelte&nbsp;5 component.</span>
				</h1>
				<p class="tagline">
					WebGL fluid simulation as a Svelte 5 component. Multi-instance, resize-stable,
					deterministic seeding.
				</p>
				<div class="cta-row">
					<a class="pill pill-primary" href="{base}/docs">Get Started</a>
					<a
						class="pill"
						href="https://github.com/tommyyzhao/svelte-fluid"
						target="_blank"
						rel="noopener"
					>
						View on GitHub
					</a>
				</div>

				<div class="why-row">
					{#each features as f}
						<span class="glass-pill">{f}</span>
					{/each}
				</div>
			</div>
		</section>

		<section class="install glass-section">
			<header class="section-head">
				<h2>Install</h2>
				<p class="muted">Bun, pnpm, and yarn also work — no native deps, zero runtime cost.</p>
			</header>
			<div class="glass-code install-code">
				<code>{installCmd}</code>
				<button class="copy-btn" type="button" onclick={copyInstall} aria-label="Copy install command">
					{copied ? 'Copied' : 'Copy'}
				</button>
			</div>
		</section>

		<section class="usage glass-section">
			<header class="section-head">
				<h2>Drop one in</h2>
				<p class="muted">A sized container is all you need. The engine handles the rest.</p>
			</header>
			<div class="glass-code usage-code">
				<pre><code>{usageSnippet}</code></pre>
				<button class="copy-btn" type="button" onclick={copyUsage} aria-label="Copy usage snippet">
					{copiedUsage ? 'Copied' : 'Copy'}
				</button>
			</div>
		</section>

		<section class="presets">
			<header class="section-head">
				<h2>Presets</h2>
				<p class="muted">Ten opinionated themes. Six shown here. Drop-in replacements for &lt;Fluid /&gt;.</p>
			</header>

			<div class="preset-grid">
				<div class="glass-card preset-card">
					<div class="preset-canvas">
						<LavaLamp seed={11} aria-label="LavaLamp preset" />
					</div>
					<div class="preset-meta">
						<h3>LavaLamp</h3>
						<p>Slow, viscous warm blobs.</p>
					</div>
				</div>

				<div class="glass-card preset-card">
					<div class="preset-canvas">
						<Plasma seed={22} aria-label="Plasma preset" />
					</div>
					<div class="preset-meta">
						<h3>Plasma</h3>
						<p>High-energy electric currents.</p>
					</div>
				</div>

				<div class="glass-card preset-card">
					<div class="preset-canvas">
						<InkInWater seed={33} lazy aria-label="InkInWater preset" />
					</div>
					<div class="preset-meta">
						<h3>InkInWater</h3>
						<p>Dispersive saturated dye.</p>
					</div>
				</div>

				<div class="glass-card preset-card">
					<div class="preset-canvas">
						<FrozenSwirl seed={44} lazy aria-label="FrozenSwirl preset" />
					</div>
					<div class="preset-meta">
						<h3>FrozenSwirl</h3>
						<p>Cool, crystalline curls.</p>
					</div>
				</div>

				<div class="glass-card preset-card">
					<div class="preset-canvas">
						<Aurora seed={55} lazy aria-label="Aurora preset" />
					</div>
					<div class="preset-meta">
						<h3>Aurora</h3>
						<p>Drifting polar ribbons.</p>
					</div>
				</div>

				<div class="glass-card preset-card">
					<div class="preset-canvas">
						<ToroidalTempest seed={66} lazy aria-label="ToroidalTempest preset" />
					</div>
					<div class="preset-meta">
						<h3>ToroidalTempest</h3>
						<p>Rotating annular storm.</p>
					</div>
				</div>
			</div>
		</section>

		<!-- SHAPES -->
		<section class="shapes-section">
			<header class="section-head">
				<h2 class="section-label">SHAPES</h2>
				<p class="muted">Six primitives — circle, rounded rect, frame, annulus, SVG path, and text glyph. Hover to splat.</p>
			</header>
			<div class="shape-grid">
				<figure class="glass-card shape-card">
					<div class="shape-canvas">
						<CircularFluid seed={601} lazy splatOnHover aria-label="Circle container demo" />
					</div>
					<figcaption class="shape-caption">CIRCLE</figcaption>
				</figure>
				<figure class="glass-card shape-card">
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
					<figcaption class="shape-caption">ROUNDED RECT</figcaption>
				</figure>
				<figure class="glass-card shape-card">
					<div class="shape-canvas">
						<FrameFluid seed={603} lazy splatOnHover aria-label="Frame container demo" />
					</div>
					<figcaption class="shape-caption">FRAME</figcaption>
				</figure>
				<figure class="glass-card shape-card">
					<div class="shape-canvas">
						<AnnularFluid seed={604} lazy splatOnHover aria-label="Annulus container demo" />
					</div>
					<figcaption class="shape-caption">ANNULUS</figcaption>
				</figure>
				<figure class="glass-card shape-card">
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
					<figcaption class="shape-caption">SVG PATH</figcaption>
				</figure>
				<figure class="glass-card shape-card">
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
					<figcaption class="shape-caption">TEXT GLYPH</figcaption>
				</figure>
			</div>
		</section>

		<!-- PHYSICS -->
		<section class="physics-section">
			<header class="section-head">
				<h2 class="section-label">PHYSICS</h2>
				<p class="muted">Every prop is optional. Reach for props when you want your own physics.</p>
			</header>
			<div class="physics-grid">
				<figure class="glass-card physics-card">
					<div class="physics-canvas">
						<Fluid
							seed={1234}
							initialSplatCount={12}
							splatOnHover
							lazy
							aria-label="Default fluid configuration"
						/>
					</div>
					<figcaption class="physics-caption">DEFAULT</figcaption>
				</figure>
				<figure class="glass-card physics-card">
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
					<figcaption class="physics-caption">FLAT + SOFT</figcaption>
				</figure>
				<figure class="glass-card physics-card">
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
					<figcaption class="physics-caption">BOLD SPLATS</figcaption>
				</figure>
				<figure class="glass-card physics-card">
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
					<figcaption class="physics-caption">SLOW + TRANSPARENT</figcaption>
				</figure>
			</div>
		</section>

		<!-- GLASS -->
		<section class="glass-demos-section">
			<header class="section-head">
				<h2 class="section-label">GLASS</h2>
				<p class="muted">A lens at the wall — refraction, chromatic fringes, reflectivity. Use with any container shape.</p>
			</header>
			<div class="glass-demo-grid">
				<figure class="glass-card glass-demo-card">
					<div class="glass-demo-canvas">
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
					<figcaption class="glass-demo-caption">CRYSTAL ORB</figcaption>
				</figure>
				<figure class="glass-card glass-demo-card">
					<div class="glass-demo-canvas">
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
					<figcaption class="glass-demo-caption">SOFT LENS</figcaption>
				</figure>
				<figure class="glass-card glass-demo-card">
					<div class="glass-demo-canvas">
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
					<figcaption class="glass-demo-caption">PORTAL RING</figcaption>
				</figure>
				<figure class="glass-card glass-demo-card">
					<div class="glass-demo-canvas">
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
					<figcaption class="glass-demo-caption">GLASS FRAME</figcaption>
				</figure>
			</div>
		</section>

		<!-- STICKY -->
		<section class="sticky-section">
			<header class="section-head">
				<h2 class="section-label">STICKY</h2>
				<p class="muted">FluidStick masks the simulation with text or SVG paths. Dye clings to letterforms.</p>
			</header>
			<div class="sticky-grid">
				<div class="glass-card sticky-panel">
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
				<div class="glass-card sticky-panel">
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

		<!-- REVEAL -->
		<section class="reveal-section">
			<header class="section-head">
				<h2 class="section-label">REVEAL</h2>
				<p class="muted">FluidReveal uses the simulation as an opacity mask. Move the cursor to uncover.</p>
			</header>
			<div class="reveal-grid">
				<div class="glass-card reveal-card">
					<div class="reveal-canvas">
						<FluidReveal lazy velocityDissipation={0.95} pressureIterations={10}>
							<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:1.4rem;color:#e0e8ff;">Revealed</div>
						</FluidReveal>
					</div>
					<div class="reveal-meta">SCRATCH TO REVEAL</div>
				</div>
				<div class="glass-card reveal-card">
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
							<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:1.4rem;color:#e0e8ff;">Auto Reveal</div>
						</FluidReveal>
					</div>
					<div class="reveal-meta">AUTO-REVEAL</div>
				</div>
			</div>
		</section>

		<!-- DISTORTION -->
		<section class="distort-section">
			<header class="section-head">
				<h2 class="section-label">DISTORTION</h2>
				<p class="muted">FluidDistortion warps any source with the velocity field. Hover to engage.</p>
			</header>
			<div class="distort-grid">
				<div class="glass-card distort-card">
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
					<div class="distort-meta">SUBTLE · STRENGTH 0.3</div>
				</div>
				<div class="glass-card distort-card">
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
					<div class="distort-meta">STRONG · STRENGTH 0.45</div>
				</div>
			</div>
		</section>

		<!-- PLAYGROUND -->
		<section class="playground-section glass-card">
			<header class="section-head">
				<h2 class="section-label">PLAYGROUND</h2>
				<p class="muted">Drag the knobs. The fluid updates in real time.</p>
			</header>

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
						<button class="copy-btn small" onclick={copySnippet} aria-label="Copy playground snippet">
							{copiedSnippet ? 'Copied!' : 'Copy'}
						</button>
					</div>
					<pre class="snippet-code"><code>{playgroundSnippet}</code></pre>
				</aside>
			</div>
		</section>

		<footer class="glass-footer">
			<p>
				Derivative work of
				<a href="https://github.com/PavelDoGreat/WebGL-Fluid-Simulation" target="_blank" rel="noopener">
					PavelDoGreat/WebGL-Fluid-Simulation
				</a>
				by Pavel Dobryakov (c) 2017. MIT licensed.
			</p>
		</footer>
	</main>
</FluidBackground>

<style>
	:global(html), :global(body) {
		background: #06081a;
		color: #f4f6ff;
	}
	:global(body) {
		margin: 0;
		font-family:
			-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, sans-serif;
		-webkit-font-smoothing: antialiased;
		text-rendering: optimizeLegibility;
	}

	.page {
		position: relative;
		min-height: 100vh;
		padding: 96px 24px 64px;
		max-width: 1180px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 56px;
		pointer-events: none;
	}
	.page > * {
		pointer-events: auto;
	}

	/* ---------- Glass primitives ---------- */
	.glass-card,
	.glass-section,
	.glass-nav,
	.glass-footer {
		position: relative;
		background: rgba(255, 255, 255, 0.08);
		backdrop-filter: blur(24px) saturate(180%);
		-webkit-backdrop-filter: blur(24px) saturate(180%);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 28px;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.18),
			0 8px 32px rgba(0, 0, 0, 0.25);
		overflow: hidden;
	}

	/* Iridescent conic rim highlight on cards */
	.glass-card::before,
	.glass-section::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		padding: 1px;
		background: conic-gradient(
			from 140deg,
			rgba(255, 200, 240, 0.55),
			rgba(180, 220, 255, 0.15),
			rgba(255, 240, 200, 0.45),
			rgba(180, 255, 220, 0.15),
			rgba(255, 200, 240, 0.55)
		);
		-webkit-mask:
			linear-gradient(#000 0 0) content-box,
			linear-gradient(#000 0 0);
		-webkit-mask-composite: xor;
		mask:
			linear-gradient(#000 0 0) content-box,
			linear-gradient(#000 0 0);
		mask-composite: exclude;
		pointer-events: none;
		opacity: 0.55;
	}

	/* Inner glow */
	.glass-card::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: radial-gradient(
			120% 80% at 50% 0%,
			rgba(255, 255, 255, 0.18),
			transparent 55%
		);
		pointer-events: none;
	}

	/* ---------- Back link ---------- */
	.competition-back {
		position: fixed;
		top: 1rem;
		left: 1rem;
		z-index: 200;
		font-size: 0.75rem;
		font-weight: 500;
		color: rgba(220, 230, 255, 0.5);
		text-decoration: none;
		background: rgba(10, 14, 26, 0.7);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		border: 1px solid rgba(130, 120, 255, 0.25);
		border-radius: 6px;
		padding: 0.35rem 0.7rem;
		transition: color 0.15s, border-color 0.15s;
	}
	.competition-back:hover {
		color: rgba(220, 230, 255, 0.9);
		border-color: rgba(180, 160, 255, 0.4);
	}

	/* ---------- Nav ---------- */
	.glass-nav {
		position: sticky;
		top: 16px;
		z-index: 10;
		align-self: center;
		display: flex;
		align-items: center;
		gap: 28px;
		padding: 10px 18px;
		border-radius: 999px;
		max-width: max-content;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		color: #fff;
		text-decoration: none;
		font-weight: 500;
		letter-spacing: -0.01em;
	}
	.brand-dot {
		width: 10px;
		height: 10px;
		border-radius: 999px;
		background: radial-gradient(circle at 30% 30%, #fff, #b8c8ff 60%, #4a64ff);
		box-shadow: 0 0 12px rgba(160, 180, 255, 0.7);
	}
	.brand-name {
		font-size: 15px;
	}
	.nav-links {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.nav-links a {
		color: rgba(255, 255, 255, 0.78);
		text-decoration: none;
		font-size: 14px;
		padding: 6px 12px;
		border-radius: 999px;
		transition: background 0.2s, color 0.2s;
	}
	.nav-links a:hover {
		color: #fff;
		background: rgba(255, 255, 255, 0.1);
	}

	/* ---------- Hero ---------- */
	.hero {
		display: flex;
		justify-content: center;
		animation: float-slow 9s ease-in-out infinite;
	}
	.hero-inner {
		padding: 64px 48px 44px;
		text-align: center;
		max-width: 920px;
		width: 100%;
	}
	.display {
		font-size: clamp(40px, 7vw, 84px);
		font-weight: 200;
		line-height: 1.02;
		letter-spacing: -0.035em;
		margin: 0 0 18px;
	}
	.gradient-text {
		background: linear-gradient(180deg, #ffffff 0%, #d8dcef 60%, #a3acd0 100%);
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
		color: transparent;
	}
	.tagline {
		font-size: clamp(15px, 1.4vw, 18px);
		color: rgba(255, 255, 255, 0.75);
		max-width: 620px;
		margin: 0 auto 28px;
		line-height: 1.5;
		font-weight: 300;
	}
	.cta-row {
		display: flex;
		justify-content: center;
		gap: 12px;
		margin-bottom: 32px;
		flex-wrap: wrap;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		padding: 12px 22px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.18);
		color: #fff;
		text-decoration: none;
		font-size: 14px;
		font-weight: 500;
		letter-spacing: -0.005em;
		backdrop-filter: blur(12px) saturate(180%);
		-webkit-backdrop-filter: blur(12px) saturate(180%);
		transition: transform 0.15s, background 0.2s;
	}
	.pill:hover {
		background: rgba(255, 255, 255, 0.16);
		transform: translateY(-1px);
	}
	.pill-primary {
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(220, 226, 255, 0.85));
		color: #0c1030;
		border-color: rgba(255, 255, 255, 0.6);
	}

	.why-row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		justify-content: center;
		margin-top: 4px;
	}
	.glass-pill {
		font-size: 12px;
		font-weight: 400;
		padding: 6px 12px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.07);
		border: 1px solid rgba(255, 255, 255, 0.14);
		color: rgba(255, 255, 255, 0.82);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		letter-spacing: 0.01em;
	}

	/* ---------- Sections ---------- */
	.glass-section {
		padding: 36px 36px 34px;
	}
	.section-head {
		margin-bottom: 22px;
	}
	.section-head h2 {
		font-size: clamp(22px, 2.4vw, 30px);
		font-weight: 300;
		letter-spacing: -0.02em;
		margin: 0 0 6px;
		color: #fff;
	}
	.section-label {
		font-size: 11px !important;
		font-weight: 600 !important;
		letter-spacing: 0.15em !important;
		text-transform: uppercase;
		color: rgba(200, 210, 255, 0.7) !important;
		margin: 0 0 8px !important;
	}
	.muted {
		color: rgba(255, 255, 255, 0.62);
		margin: 0;
		font-size: 14px;
		font-weight: 300;
	}

	/* ---------- Code ---------- */
	.glass-code {
		position: relative;
		background: rgba(0, 0, 0, 0.32);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 18px;
		padding: 16px 20px;
		font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, Menlo, monospace;
		font-size: 13.5px;
		color: #e6eaff;
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
	}
	.install-code {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}
	.install-code code {
		font-size: 15px;
	}
	.usage-code pre {
		margin: 0;
		white-space: pre;
		overflow-x: auto;
		padding-right: 80px;
		line-height: 1.55;
	}
	.copy-btn {
		appearance: none;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(255, 255, 255, 0.08);
		color: #fff;
		font-size: 12px;
		font-weight: 500;
		padding: 6px 12px;
		border-radius: 999px;
		cursor: pointer;
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		transition: background 0.2s;
	}
	.usage-code .copy-btn {
		position: absolute;
		top: 14px;
		right: 14px;
	}
	.copy-btn:hover {
		background: rgba(255, 255, 255, 0.16);
	}

	/* ---------- Presets ---------- */
	.presets {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.presets > .section-head {
		padding: 0 4px;
	}
	.preset-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 20px;
	}
	.preset-card {
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		animation: float-slow 11s ease-in-out infinite;
	}
	.preset-card:nth-child(2) { animation-delay: -1.5s; }
	.preset-card:nth-child(3) { animation-delay: -3s; }
	.preset-card:nth-child(4) { animation-delay: -4.5s; }
	.preset-card:nth-child(5) { animation-delay: -6s; }
	.preset-card:nth-child(6) { animation-delay: -7.5s; }

	.preset-canvas {
		position: relative;
		width: 100%;
		height: 320px;
		border-radius: 22px;
		overflow: hidden;
		background: #06081a;
		border: 1px solid rgba(255, 255, 255, 0.08);
	}
	.preset-meta {
		padding: 0 8px 6px;
	}
	.preset-meta h3 {
		margin: 0 0 4px;
		font-size: 17px;
		font-weight: 500;
		letter-spacing: -0.01em;
		color: #fff;
	}
	.preset-meta p {
		margin: 0;
		font-size: 13.5px;
		color: rgba(255, 255, 255, 0.65);
		font-weight: 300;
	}

	/* ---------- Shapes section ---------- */
	.shapes-section {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.shape-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 20px;
	}
	.shape-card {
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		animation: float-slow 12s ease-in-out infinite;
	}
	.shape-card:nth-child(2) { animation-delay: -2s; }
	.shape-card:nth-child(3) { animation-delay: -4s; }
	.shape-card:nth-child(4) { animation-delay: -6s; }
	.shape-card:nth-child(5) { animation-delay: -8s; }
	.shape-card:nth-child(6) { animation-delay: -10s; }
	.shape-canvas {
		width: 100%;
		height: 220px;
		border-radius: 18px;
		overflow: hidden;
		background: #06081a;
		border: 1px solid rgba(255, 255, 255, 0.07);
	}
	.shape-caption {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: rgba(200, 210, 255, 0.65);
		padding: 0 6px 4px;
		text-align: center;
	}

	/* ---------- Physics section ---------- */
	.physics-section {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.physics-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 20px;
	}
	.physics-card {
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		animation: float-slow 10s ease-in-out infinite;
	}
	.physics-card:nth-child(2) { animation-delay: -2.5s; }
	.physics-card:nth-child(3) { animation-delay: -5s; }
	.physics-card:nth-child(4) { animation-delay: -7.5s; }
	.physics-canvas {
		width: 100%;
		height: 260px;
		border-radius: 18px;
		overflow: hidden;
		background: #06081a;
		border: 1px solid rgba(255, 255, 255, 0.07);
	}
	.physics-caption {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: rgba(200, 210, 255, 0.65);
		padding: 0 6px 4px;
		text-align: center;
	}

	/* ---------- Glass demos section ---------- */
	.glass-demos-section {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.glass-demo-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 20px;
	}
	.glass-demo-card {
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		animation: float-slow 13s ease-in-out infinite;
	}
	.glass-demo-card:nth-child(2) { animation-delay: -3.25s; }
	.glass-demo-card:nth-child(3) { animation-delay: -6.5s; }
	.glass-demo-card:nth-child(4) { animation-delay: -9.75s; }
	.glass-demo-canvas {
		width: 100%;
		height: 300px;
		border-radius: 18px;
		overflow: hidden;
		background: #06081a;
		border: 1px solid rgba(255, 255, 255, 0.07);
	}
	.glass-demo-caption {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: rgba(200, 210, 255, 0.65);
		padding: 0 6px 4px;
		text-align: center;
	}

	/* ---------- Sticky section ---------- */
	.sticky-section {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.sticky-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 20px;
	}
	.sticky-panel {
		height: 240px;
		animation: float-slow 9s ease-in-out infinite;
	}
	.sticky-panel:nth-child(2) { animation-delay: -4.5s; }

	/* ---------- Reveal section ---------- */
	.reveal-section {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.reveal-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 20px;
	}
	.reveal-card {
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		animation: float-slow 11s ease-in-out infinite;
	}
	.reveal-card:nth-child(2) { animation-delay: -5.5s; }
	.reveal-canvas {
		width: 100%;
		height: 260px;
		border-radius: 18px;
		overflow: hidden;
		background: #06081a;
		border: 1px solid rgba(255, 255, 255, 0.07);
	}
	.reveal-meta {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: rgba(200, 210, 255, 0.65);
		padding: 0 6px 4px;
		text-align: center;
	}

	/* ---------- Distortion section ---------- */
	.distort-section {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.distort-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 20px;
	}
	.distort-card {
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		animation: float-slow 10s ease-in-out infinite;
	}
	.distort-card:nth-child(2) { animation-delay: -5s; }
	.distort-canvas {
		width: 100%;
		height: 280px;
		border-radius: 18px;
		overflow: hidden;
		background: #06081a;
		border: 1px solid rgba(255, 255, 255, 0.07);
	}
	.distort-meta {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: rgba(200, 210, 255, 0.65);
		padding: 0 6px 4px;
		text-align: center;
	}

	/* ---------- Playground section ---------- */
	.playground-section {
		padding: 36px 36px 34px;
		display: flex;
		flex-direction: column;
		gap: 0;
	}
	.preset-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 22px;
	}
	.preset-chip {
		appearance: none;
		border: 1px solid rgba(255, 255, 255, 0.15);
		background: rgba(255, 255, 255, 0.06);
		color: rgba(255, 255, 255, 0.72);
		font-size: 12px;
		font-weight: 500;
		padding: 5px 12px;
		border-radius: 999px;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s, color 0.15s;
		letter-spacing: 0.02em;
	}
	.preset-chip:hover {
		background: rgba(255, 255, 255, 0.12);
		color: #fff;
	}
	.preset-chip.active {
		background: rgba(140, 120, 255, 0.18);
		border-color: rgba(180, 160, 255, 0.55);
		color: #d8d0ff;
	}
	.preset-chip.reset {
		border-color: rgba(255, 100, 100, 0.25);
		color: rgba(255, 160, 160, 0.7);
	}
	.preset-chip.reset:hover {
		background: rgba(255, 80, 80, 0.1);
		color: rgba(255, 180, 180, 0.9);
	}
	.playground-grid {
		display: grid;
		grid-template-columns: 1fr 320px;
		gap: 24px;
		align-items: start;
	}
	.playground-canvas {
		width: 100%;
		height: 420px;
		border-radius: 20px;
		overflow: hidden;
		background: #06081a;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}
	.playground-panel {
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
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: rgba(200, 210, 255, 0.6);
		padding-bottom: 4px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}
	.knob-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.knob-label {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.72);
		min-width: 120px;
		font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, Menlo, monospace;
		font-size: 11.5px;
	}
	.knob-row input[type='range'] {
		flex: 1;
		accent-color: rgba(160, 140, 255, 0.9);
	}
	.knob-value {
		font-size: 11.5px;
		font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, Menlo, monospace;
		color: rgba(200, 210, 255, 0.8);
		min-width: 36px;
		text-align: right;
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
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.12);
		border: 1px solid rgba(255, 255, 255, 0.18);
		position: relative;
		transition: background 0.2s;
		flex-shrink: 0;
	}
	.toggle-pill::after {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: 12px;
		height: 12px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.5);
		transition: transform 0.2s, background 0.2s;
	}
	.toggle-row input:checked + .toggle-pill {
		background: rgba(140, 120, 255, 0.5);
		border-color: rgba(180, 160, 255, 0.5);
	}
	.toggle-row input:checked + .toggle-pill::after {
		transform: translateX(14px);
		background: #fff;
	}
	.color-row {
		display: flex;
		align-items: center;
		gap: 10px;
		cursor: pointer;
	}
	.color-row input[type='color'] {
		width: 28px;
		height: 28px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 6px;
		background: none;
		cursor: pointer;
		padding: 0;
	}
	.mono {
		font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, Menlo, monospace;
	}
	.snippet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: rgba(200, 210, 255, 0.55);
	}
	.copy-btn.small {
		font-size: 10.5px;
		padding: 4px 10px;
	}
	.snippet-code {
		background: rgba(0, 0, 0, 0.35);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 12px 14px;
		margin: 0;
		font-family: 'SF Mono', 'JetBrains Mono', ui-monospace, Menlo, monospace;
		font-size: 11.5px;
		color: #c8d4ff;
		overflow-x: auto;
		line-height: 1.5;
		white-space: pre;
	}

	/* ---------- Footer ---------- */
	.glass-footer {
		padding: 22px 28px;
		text-align: center;
		font-size: 13px;
		color: rgba(255, 255, 255, 0.7);
		font-weight: 300;
	}
	.glass-footer a {
		color: #fff;
		text-decoration: underline;
		text-decoration-color: rgba(255, 255, 255, 0.3);
		text-underline-offset: 3px;
	}

	/* ---------- Float animation ---------- */
	@keyframes float-slow {
		0%, 100% { transform: translateY(0); }
		50% { transform: translateY(-0.4px); }
	}

	/* ---------- Responsive ---------- */
	@media (max-width: 960px) {
		.shape-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.playground-grid {
			grid-template-columns: 1fr;
		}
		.playground-canvas {
			height: 320px;
		}
	}

	@media (max-width: 780px) {
		.page {
			padding: 80px 14px 40px;
			gap: 40px;
		}
		.glass-nav {
			gap: 12px;
			padding: 8px 12px;
			align-self: stretch;
			max-width: none;
			justify-content: space-between;
			border-radius: 22px;
		}
		.nav-links {
			gap: 0;
		}
		.nav-links a {
			padding: 6px 8px;
			font-size: 13px;
		}
		.hero-inner {
			padding: 40px 22px 28px;
		}
		.glass-section {
			padding: 26px 20px;
		}
		.playground-section {
			padding: 26px 20px;
		}
		.preset-grid,
		.physics-grid,
		.glass-demo-grid,
		.sticky-grid,
		.reveal-grid,
		.distort-grid,
		.shape-grid {
			grid-template-columns: 1fr;
		}
		.preset-canvas {
			height: 260px;
		}
		.usage-code pre {
			font-size: 12px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.hero,
		.preset-card,
		.shape-card,
		.physics-card,
		.glass-demo-card,
		.sticky-panel,
		.reveal-card,
		.distort-card {
			animation: none;
		}
	}
</style>
