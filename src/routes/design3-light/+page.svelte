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

	type RGB = { r: number; g: number; b: number };

	const paperColor: RGB = { r: 244, g: 237, b: 224 };

	const installCmd = 'npm install svelte-fluid';
	const usageSnippet = `<script>
	import { Fluid } from 'svelte-fluid';
<\/script>

<div style="width: 100%; height: 480px;">
	<Fluid seed={42} colorful bloom sunrays
		backColor={{ r: 244, g: 237, b: 224 }} />
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

	const PLAYGROUND_DEFAULTS = {
		curl: 30,
		splatRadius: 0.25,
		splatForce: 6000,
		densityDissipation: 1.0,
		velocityDissipation: 0.2,
		bloom: true,
		shading: true,
		colorful: true,
		backColor: { ...paperColor } as RGB
	};

	const PLAYGROUND_PRESETS: Record<string, Partial<typeof PLAYGROUND_DEFAULTS>> = {
		'LavaLamp':         { curl: 8,  splatRadius: 0.55, splatForce: 4800, densityDissipation: 0.18, velocityDissipation: 0.08, bloom: true,  shading: true,  colorful: false, backColor: { r: 222, g: 218, b: 215 } },
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

	// roundedRect cornerRadius in normalized UV space; tuned to read as
	// ~16px at typical card heights of 240–320px.
	const cardCorner = 0.07;
	const cardHalfW = 0.5;
	const cardHalfH = 0.5;
</script>

<svelte:head>
	<title>svelte-fluid — Editorial Glass</title>
</svelte:head>

<a class="competition-back" href="{base}/design-competition">← Competition</a>

<FluidBackground
	exclude=".paper-card, .paper-nav, .paper-section, .paper-pill, .paper-code, .paper-footer"
	excludeRadius={20}
	excludePad={6}
	colorful={false}
	shading
	bloom
	bloomIntensity={0.3}
	sunrays={false}
	autoSplatRate={stickyAutoAnimate ? 0.18 : 0}
	autoSplatCount={2}
	autoSplatSwirl={0.5}
	velocityDissipation={0.18}
	densityDissipation={0.7}
	splatRadius={0.4}
	backColor={paperColor}
	seed={777}
>
	<main class="page">
		<nav class="paper-nav" aria-label="Primary">
			<a class="brand" href="{base}/">
				<span class="brand-mark">§</span>
				<span class="brand-name">svelte<span class="brand-dash">‑</span>fluid</span>
			</a>
			<div class="nav-links">
				<a href="{base}/docs">Docs</a>
				<a href="{base}/docs/presets">Presets</a>
				<a href="{base}/docs/api">API</a>
				<a href="https://github.com/tommyyzhao/svelte-fluid" target="_blank" rel="noopener">GitHub</a>
			</div>
		</nav>

		<section class="hero">
			<div class="hero-inner paper-card">
				<div class="hero-rule"></div>
				<p class="hero-eyebrow">A SVELTE 5 COMPONENT LIBRARY · ISSUE NO. 1</p>
				<h1 class="display">
					Fluid, as a Svelte<span class="thinsp">&nbsp;</span>5 component.
				</h1>
				<p class="tagline">
					WebGL fluid simulation as a Svelte&nbsp;5 component. Multi-instance, resize-stable,
					deterministic seeding — printed onto the page like ink, not pasted on top of it.
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
						<span class="paper-pill">{f}</span>
					{/each}
				</div>
			</div>
		</section>

		<section class="install paper-section">
			<header class="section-head">
				<p class="section-label">§ 02 · INSTALL</p>
				<h2 class="section-title">A minimum.</h2>
				<p class="muted">Bun, pnpm, and yarn also work — no native deps, zero runtime cost.</p>
			</header>
			<div class="paper-code install-code">
				<code>{installCmd}</code>
				<button class="copy-btn" type="button" onclick={copyInstall} aria-label="Copy install command">
					{copied ? 'Copied' : 'Copy'}
				</button>
			</div>
		</section>

		<section class="usage paper-section">
			<header class="section-head">
				<p class="section-label">§ 03 · USAGE</p>
				<h2 class="section-title">Drop the tag in.</h2>
				<p class="muted">A sized container is all you need. The engine handles the rest.</p>
			</header>
			<div class="paper-code usage-code">
				<pre><code>{usageSnippet}</code></pre>
				<button class="copy-btn" type="button" onclick={copyUsage} aria-label="Copy usage snippet">
					{copiedUsage ? 'Copied' : 'Copy'}
				</button>
			</div>
		</section>

		<section class="presets">
			<header class="section-head">
				<p class="section-label">§ 04 · PRESETS</p>
				<h2 class="section-title">Ten themes, six on file.</h2>
				<p class="muted">Drop-in replacements for &lt;Fluid /&gt;. Each fills its parent. Each accepts a seed.</p>
			</header>

			<div class="preset-grid">
				<figure class="paper-card preset-card">
					<div class="card-fluid">
						<LavaLamp seed={11} aria-label="LavaLamp preset" />
					</div>
					<figcaption class="card-caption">
						<span class="card-num">01</span>
						<span class="card-name">LavaLamp</span>
						<span class="card-blurb">Slow, viscous warm blobs.</span>
					</figcaption>
				</figure>

				<figure class="paper-card preset-card">
					<div class="card-fluid">
						<Plasma seed={22} aria-label="Plasma preset" />
					</div>
					<figcaption class="card-caption">
						<span class="card-num">02</span>
						<span class="card-name">Plasma</span>
						<span class="card-blurb">High-energy electric currents.</span>
					</figcaption>
				</figure>

				<figure class="paper-card preset-card">
					<div class="card-fluid">
						<InkInWater seed={33} lazy aria-label="InkInWater preset" />
					</div>
					<figcaption class="card-caption">
						<span class="card-num">03</span>
						<span class="card-name">InkInWater</span>
						<span class="card-blurb">Dispersive saturated dye.</span>
					</figcaption>
				</figure>

				<figure class="paper-card preset-card">
					<div class="card-fluid">
						<FrozenSwirl seed={44} lazy aria-label="FrozenSwirl preset" />
					</div>
					<figcaption class="card-caption">
						<span class="card-num">04</span>
						<span class="card-name">FrozenSwirl</span>
						<span class="card-blurb">Cool, crystalline curls.</span>
					</figcaption>
				</figure>

				<figure class="paper-card preset-card">
					<div class="card-fluid">
						<Aurora seed={55} lazy aria-label="Aurora preset" />
					</div>
					<figcaption class="card-caption">
						<span class="card-num">05</span>
						<span class="card-name">Aurora</span>
						<span class="card-blurb">Drifting polar ribbons.</span>
					</figcaption>
				</figure>

				<figure class="paper-card preset-card">
					<div class="card-fluid">
						<ToroidalTempest seed={66} lazy aria-label="ToroidalTempest preset" />
					</div>
					<figcaption class="card-caption">
						<span class="card-num">06</span>
						<span class="card-name">ToroidalTempest</span>
						<span class="card-blurb">Rotating annular storm.</span>
					</figcaption>
				</figure>
			</div>
			<p class="presets-note">
				The six plates above use the shipped preset components verbatim. Each preset
				declares its own backColor — the inks here are intentional, set against the page.
			</p>
		</section>

		<section class="shapes-section">
			<header class="section-head">
				<p class="section-label">§ 05 · SHAPES</p>
				<h2 class="section-title">A typology of containers.</h2>
				<p class="muted">
					Six primitives. Each demo runs through the engine's glass shader so the card edge is
					real refraction, not CSS blur.
				</p>
			</header>
			<div class="shape-grid">
				<figure class="paper-card shape-card">
					<div class="card-fluid">
						<Fluid
							seed={601}
							lazy
							glass
							glassRefraction={0.45}
							glassReflectivity={0.12}
							glassChromatic={0.25}
							glassThickness={0.05}
							containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.42 }}
							backColor={paperColor}
							curl={28}
							densityDissipation={0.35}
							velocityDissipation={0.1}
							splatRadius={0.32}
							splatForce={4500}
							shading
							bloom
							bloomIntensity={0.5}
							sunrays={false}
							colorful
							initialSplatCount={10}
							splatOnHover
							aria-label="Circle container demo"
						/>
					</div>
					<figcaption class="card-caption">
						<span class="card-num">01</span>
						<span class="card-name">Circle</span>
					</figcaption>
				</figure>

				<figure class="paper-card shape-card">
					<div class="card-fluid">
						<Fluid
							seed={602}
							lazy
							glass
							glassRefraction={0.45}
							glassReflectivity={0.12}
							glassChromatic={0.25}
							glassThickness={0.05}
							containerShape={{ type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: cardHalfW, halfH: cardHalfH, cornerRadius: cardCorner }}
							backColor={paperColor}
							curl={28}
							densityDissipation={0.35}
							velocityDissipation={0.1}
							splatRadius={0.32}
							splatForce={4500}
							shading
							bloom
							bloomIntensity={0.5}
							sunrays={false}
							colorful
							initialSplatCount={10}
							splatOnHover
							aria-label="Rounded rect container demo"
						/>
					</div>
					<figcaption class="card-caption">
						<span class="card-num">02</span>
						<span class="card-name">Rounded Rect</span>
					</figcaption>
				</figure>

				<figure class="paper-card shape-card">
					<div class="card-fluid">
						<Fluid
							seed={603}
							lazy
							glass
							glassRefraction={0.45}
							glassReflectivity={0.12}
							glassChromatic={0.25}
							glassThickness={0.05}
							containerShape={{ type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.22, halfH: 0.22, innerCornerRadius: 0.04, outerHalfW: 0.48, outerHalfH: 0.48, outerCornerRadius: 0.06 }}
							backColor={paperColor}
							curl={28}
							densityDissipation={0.3}
							velocityDissipation={0.1}
							splatRadius={0.3}
							splatForce={4500}
							shading
							bloom
							bloomIntensity={0.5}
							sunrays={false}
							colorful
							initialSplatCount={10}
							splatOnHover
							aria-label="Frame container demo"
						/>
					</div>
					<figcaption class="card-caption">
						<span class="card-num">03</span>
						<span class="card-name">Frame</span>
					</figcaption>
				</figure>

				<figure class="paper-card shape-card">
					<div class="card-fluid">
						<Fluid
							seed={604}
							lazy
							glass
							glassRefraction={0.45}
							glassReflectivity={0.12}
							glassChromatic={0.3}
							glassThickness={0.05}
							containerShape={{ type: 'annulus', cx: 0.5, cy: 0.5, innerRadius: 0.16, outerRadius: 0.42 }}
							backColor={paperColor}
							curl={32}
							densityDissipation={0.3}
							velocityDissipation={0.1}
							splatRadius={0.3}
							splatForce={4500}
							shading
							bloom
							bloomIntensity={0.55}
							sunrays={false}
							colorful
							initialSplatCount={10}
							splatOnHover
							aria-label="Annulus container demo"
						/>
					</div>
					<figcaption class="card-caption">
						<span class="card-num">04</span>
						<span class="card-name">Annulus</span>
					</figcaption>
				</figure>

				<figure class="paper-card shape-card">
					<div class="card-fluid">
						<Fluid
							seed={605}
							lazy
							glass
							glassRefraction={0.45}
							glassReflectivity={0.1}
							glassChromatic={0.35}
							glassThickness={0.05}
							containerShape={{ type: 'svgPath', d: lightning, viewBox: [0, 0, 100, 100] }}
							backColor={paperColor}
							curl={32}
							densityDissipation={0.3}
							velocityDissipation={0.1}
							splatRadius={0.3}
							splatForce={4500}
							shading
							bloom
							bloomIntensity={0.55}
							sunrays={false}
							colorful
							initialSplatCount={10}
							splatOnHover
							aria-label="SVG path lightning container demo"
						/>
					</div>
					<figcaption class="card-caption">
						<span class="card-num">05</span>
						<span class="card-name">SVG Path</span>
					</figcaption>
				</figure>

				<figure class="paper-card shape-card">
					<div class="card-fluid">
						<Fluid
							seed={606}
							lazy
							glass
							glassRefraction={0.45}
							glassReflectivity={0.1}
							glassChromatic={0.35}
							glassThickness={0.05}
							containerShape={{ type: 'svgPath', text: '&', font: '900 280px Georgia, serif' }}
							backColor={paperColor}
							curl={28}
							densityDissipation={0.3}
							velocityDissipation={0.1}
							splatRadius={0.32}
							splatForce={4500}
							shading
							bloom
							bloomIntensity={0.55}
							sunrays={false}
							colorful
							initialSplatCount={10}
							splatOnHover
							aria-label="Text glyph container demo"
						/>
					</div>
					<figcaption class="card-caption">
						<span class="card-num">06</span>
						<span class="card-name">Text Glyph</span>
					</figcaption>
				</figure>
			</div>
		</section>

		<section class="physics-section">
			<header class="section-head">
				<p class="section-label">§ 06 · PHYSICS</p>
				<h2 class="section-title">A study of knobs.</h2>
				<p class="muted">Every prop is optional. Reach for them when you want your own physics.</p>
			</header>
			<div class="physics-grid">
				<figure class="paper-card physics-card">
					<div class="card-fluid">
						<Fluid
							seed={1234}
							lazy
							glass
							glassRefraction={0.4}
							glassReflectivity={0.1}
							glassChromatic={0.22}
							glassThickness={0.05}
							containerShape={{ type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: cardHalfW, halfH: cardHalfH, cornerRadius: cardCorner }}
							backColor={paperColor}
							initialSplatCount={12}
							splatOnHover
							colorful
							shading
							bloom
							bloomIntensity={0.5}
							aria-label="Default fluid configuration"
						/>
					</div>
					<figcaption class="card-caption">
						<span class="card-num">01</span>
						<span class="card-name">Default</span>
						<code class="card-snippet">{'<Fluid />'}</code>
					</figcaption>
				</figure>
				<figure class="paper-card physics-card">
					<div class="card-fluid">
						<Fluid
							seed={5678}
							lazy
							glass
							glassRefraction={0.4}
							glassReflectivity={0.1}
							glassChromatic={0.18}
							glassThickness={0.05}
							containerShape={{ type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: cardHalfW, halfH: cardHalfH, cornerRadius: cardCorner }}
							backColor={paperColor}
							bloom={false}
							curl={5}
							densityDissipation={0.4}
							initialSplatCount={10}
							splatOnHover
							colorful
							shading
							aria-label="Flat fluid with low curl"
						/>
					</div>
					<figcaption class="card-caption">
						<span class="card-num">02</span>
						<span class="card-name">Flat + Soft</span>
						<code class="card-snippet">{'bloom={false} curl={5}'}</code>
					</figcaption>
				</figure>
				<figure class="paper-card physics-card">
					<div class="card-fluid">
						<Fluid
							seed={9012}
							lazy
							glass
							glassRefraction={0.4}
							glassReflectivity={0.1}
							glassChromatic={0.25}
							glassThickness={0.05}
							containerShape={{ type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: cardHalfW, halfH: cardHalfH, cornerRadius: cardCorner }}
							backColor={paperColor}
							shading={false}
							splatRadius={0.8}
							splatForce={9000}
							initialSplatCount={8}
							splatOnHover
							colorful
							bloom
							bloomIntensity={0.5}
							aria-label="Fluid with large bold splats"
						/>
					</div>
					<figcaption class="card-caption">
						<span class="card-num">03</span>
						<span class="card-name">Bold Splats</span>
						<code class="card-snippet">{'splatRadius={0.8}'}</code>
					</figcaption>
				</figure>
				<figure class="paper-card physics-card">
					<div class="card-fluid">
						<Fluid
							seed={3456}
							lazy
							glass
							glassRefraction={0.4}
							glassReflectivity={0.1}
							glassChromatic={0.2}
							glassThickness={0.05}
							containerShape={{ type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: cardHalfW, halfH: cardHalfH, cornerRadius: cardCorner }}
							backColor={paperColor}
							velocityDissipation={0.05}
							densityDissipation={0.5}
							initialSplatCount={14}
							splatOnHover
							colorful
							shading
							bloom
							bloomIntensity={0.45}
							aria-label="Slow-motion fluid"
						/>
					</div>
					<figcaption class="card-caption">
						<span class="card-num">04</span>
						<span class="card-name">Slow Motion</span>
						<code class="card-snippet">{'velocityDissipation={0.05}'}</code>
					</figcaption>
				</figure>
			</div>
		</section>

		<section class="glass-demos-section">
			<header class="section-head">
				<p class="section-label">§ 07 · GLASS</p>
				<h2 class="section-title">Refraction, plain and simple.</h2>
				<p class="muted">A lens at the wall — refraction, chromatic fringes, reflectivity. The shader does the work.</p>
			</header>
			<div class="glass-demo-grid">
				<figure class="paper-card glass-demo-card">
					<div class="card-fluid">
						<Fluid
							seed={1111}
							lazy
							glass
							glassRefraction={0.85}
							glassReflectivity={0.18}
							glassChromatic={0.6}
							glassThickness={0.1}
							containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.42 }}
							backColor={paperColor}
							curl={32}
							densityDissipation={0.18}
							velocityDissipation={0.06}
							splatRadius={0.35}
							splatForce={4500}
							shading
							bloom
							bloomIntensity={0.4}
							sunrays={false}
							colorful
							initialSplatCount={12}
							autoSplatRate={stickyAutoAnimate ? 1.0 : 0}
							autoSplatCenterY={0.5}
							autoSplatBandHeight={0.8}
							autoSplatSwirl={500}
							splatOnHover
							aria-label="Crystal orb glass demo"
						/>
					</div>
					<figcaption class="card-caption">
						<span class="card-num">01</span>
						<span class="card-name">Crystal Orb</span>
						<span class="card-blurb">High refraction, vivid chromatic fringe.</span>
					</figcaption>
				</figure>
				<figure class="paper-card glass-demo-card">
					<div class="card-fluid">
						<Fluid
							seed={1212}
							lazy
							glass
							glassRefraction={0.3}
							glassReflectivity={0.08}
							glassChromatic={0.12}
							glassThickness={0.04}
							containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.42 }}
							backColor={paperColor}
							curl={28}
							densityDissipation={0.4}
							velocityDissipation={0.12}
							splatRadius={0.25}
							splatForce={4500}
							shading
							bloom
							bloomIntensity={0.4}
							sunrays
							sunraysWeight={0.4}
							colorful
							initialSplatCount={15}
							autoSplatRate={stickyAutoAnimate ? 2.0 : 0}
							autoSplatCount={2}
							autoSplatCenterY={0.5}
							autoSplatBandHeight={0.8}
							autoSplatSwirl={400}
							splatOnHover
							aria-label="Soft lens glass demo"
						/>
					</div>
					<figcaption class="card-caption">
						<span class="card-num">02</span>
						<span class="card-name">Soft Lens</span>
						<span class="card-blurb">Low refraction, gentle chromatic.</span>
					</figcaption>
				</figure>
				<figure class="paper-card glass-demo-card">
					<div class="card-fluid">
						<Fluid
							seed={1313}
							lazy
							glass
							glassRefraction={0.7}
							glassReflectivity={0.18}
							glassChromatic={0.7}
							glassThickness={0.06}
							containerShape={{ type: 'annulus', cx: 0.5, cy: 0.5, innerRadius: 0.18, outerRadius: 0.42 }}
							backColor={paperColor}
							curl={36}
							densityDissipation={0.25}
							velocityDissipation={0.1}
							splatRadius={0.3}
							splatForce={4500}
							shading
							bloom
							bloomIntensity={0.45}
							sunrays={false}
							colorful
							initialSplatCount={10}
							autoSplatRate={stickyAutoAnimate ? 1.2 : 0}
							autoSplatCenterY={0.5}
							autoSplatBandHeight={0.6}
							autoSplatSwirl={400}
							splatOnHover
							aria-label="Portal ring glass demo"
						/>
					</div>
					<figcaption class="card-caption">
						<span class="card-num">03</span>
						<span class="card-name">Portal Ring</span>
						<span class="card-blurb">Annular shape, prismatic edges.</span>
					</figcaption>
				</figure>
				<figure class="paper-card glass-demo-card">
					<div class="card-fluid">
						<Fluid
							seed={1414}
							lazy
							glass
							glassRefraction={0.6}
							glassReflectivity={0.2}
							glassChromatic={0.5}
							glassThickness={0.07}
							containerShape={{ type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.22, halfH: 0.22, innerCornerRadius: 0.04, outerHalfW: 0.48, outerHalfH: 0.48, outerCornerRadius: 0.05 }}
							backColor={paperColor}
							curl={24}
							densityDissipation={0.22}
							velocityDissipation={0.1}
							splatRadius={0.32}
							splatForce={4500}
							shading
							bloom
							bloomIntensity={0.55}
							sunrays={false}
							colorful
							initialSplatCount={10}
							autoSplatRate={stickyAutoAnimate ? 2.5 : 0}
							autoSplatCount={2}
							autoSplatCenterY={0.5}
							autoSplatBandHeight={1.5}
							autoSplatSwirl={350}
							splatOnHover
							aria-label="Glass frame demo"
						/>
					</div>
					<figcaption class="card-caption">
						<span class="card-num">04</span>
						<span class="card-name">Glass Frame</span>
						<span class="card-blurb">Frame shape, framed by frame.</span>
					</figcaption>
				</figure>
			</div>
		</section>

		<section class="sticky-section">
			<header class="section-head">
				<p class="section-label">§ 08 · STICKY</p>
				<h2 class="section-title">Letterforms as containers.</h2>
				<p class="muted">FluidStick masks the simulation with text or SVG paths. Dye clings to glyphs.</p>
			</header>
			<div class="sticky-grid">
				<div class="paper-card sticky-panel">
					<div class="card-fluid">
						<FluidStick
							text="FLUID"
							font="900 110px 'Times New Roman', Georgia, serif"
							seed={211}
							autoAnimate={stickyAutoAnimate}
							autoAnimateDuration={4}
							colorful
							shading
							bloom={false}
							densityDissipation={0.92}
							splatRadius={0.18}
							backColor={paperColor}
							lazy
						/>
					</div>
				</div>
				<div class="paper-card sticky-panel">
					<div class="card-fluid">
						<FluidStick
							text="∞"
							font="220px Georgia, serif"
							seed={222}
							autoAnimate={stickyAutoAnimate}
							autoAnimateDuration={4}
							colorful
							shading
							bloom={false}
							densityDissipation={0.92}
							splatRadius={0.18}
							backColor={paperColor}
							lazy
						/>
					</div>
				</div>
			</div>
		</section>

		<section class="reveal-section">
			<header class="section-head">
				<p class="section-label">§ 09 · REVEAL</p>
				<h2 class="section-title">A curtain you draw with motion.</h2>
				<p class="muted">FluidReveal uses the simulation as an opacity mask. Move the cursor to uncover.</p>
			</header>
			<div class="reveal-grid">
				<div class="paper-card reveal-card">
					<div class="card-fluid">
						<FluidReveal
							lazy
							velocityDissipation={0.95}
							pressureIterations={10}
							coverColor={{ r: 0.96, g: 0.94, b: 0.88 }}
							fringeColor={{ r: 0.85, g: 0.78, b: 0.62 }}
							accentColor={{ r: 0.65, g: 0.4, b: 0.2 }}
						>
							<div class="reveal-content">
								<span class="reveal-label">Revealed</span>
							</div>
						</FluidReveal>
					</div>
					<div class="card-caption">
						<span class="card-num">01</span>
						<span class="card-name">Scratch to reveal</span>
					</div>
				</div>
				<div class="paper-card reveal-card">
					<div class="card-fluid">
						<FluidReveal
							lazy
							autoReveal={stickyAutoAnimate}
							autoRevealSpeed={0.8}
							fadeBack={false}
							velocityDissipation={0.95}
							sensitivity={0.15}
							coverColor={{ r: 0.96, g: 0.94, b: 0.88 }}
							fringeColor={{ r: 0.85, g: 0.78, b: 0.62 }}
							accentColor={{ r: 0.65, g: 0.4, b: 0.2 }}
						>
							<div class="reveal-content">
								<span class="reveal-label">Auto Reveal</span>
							</div>
						</FluidReveal>
					</div>
					<div class="card-caption">
						<span class="card-num">02</span>
						<span class="card-name">Auto-reveal</span>
					</div>
				</div>
			</div>
		</section>

		<section class="distort-section">
			<header class="section-head">
				<p class="section-label">§ 10 · DISTORTION</p>
				<h2 class="section-title">An image, warped by current.</h2>
				<p class="muted">FluidDistortion warps any source with the velocity field. Hover to engage.</p>
			</header>
			<div class="distort-grid">
				<div class="paper-card distort-card">
					<div class="card-fluid">
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
					<div class="card-caption">
						<span class="card-num">01</span>
						<span class="card-name">Subtle</span>
						<code class="card-snippet">{'strength={0.3}'}</code>
					</div>
				</div>
				<div class="paper-card distort-card">
					<div class="card-fluid">
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
					<div class="card-caption">
						<span class="card-num">02</span>
						<span class="card-name">Strong</span>
						<code class="card-snippet">{'strength={0.45}'}</code>
					</div>
				</div>
			</div>
		</section>

		<section class="playground-section paper-card">
			<header class="section-head">
				<p class="section-label">§ 11 · PLAYGROUND</p>
				<h2 class="section-title">An instrument.</h2>
				<p class="muted">Drag the knobs. The fluid updates in real time. Take the snippet with you.</p>
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
				<div class="playground-canvas card-fluid" aria-label="Interactive playground stage">
					<Fluid
						seed={4242}
						lazy
						glass
						glassRefraction={0.4}
						glassReflectivity={0.1}
						glassChromatic={0.22}
						glassThickness={0.05}
						containerShape={{ type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: cardHalfW, halfH: cardHalfH, cornerRadius: 0.04 }}
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

		<footer class="paper-footer">
			<hr />
			<div class="footer-row">
				<div class="footer-left">SVELTE&nbsp;·&nbsp;FLUID</div>
				<div class="footer-mid">
					Derivative work of
					<a href="https://github.com/PavelDoGreat/WebGL-Fluid-Simulation" target="_blank" rel="noopener">
						PavelDoGreat / WebGL-Fluid-Simulation
					</a>
					by Pavel Dobryakov (c) 2017.
				</div>
				<div class="footer-right">M&nbsp;I&nbsp;T&nbsp;&nbsp;·&nbsp;&nbsp;2 0 2 6</div>
			</div>
		</footer>
	</main>
</FluidBackground>

<style>
	:global(html), :global(body) {
		background: #f4ede0;
		color: #18140d;
	}
	:global(body) {
		margin: 0;
		font-family:
			'Instrument Serif', 'Playfair Display', 'Times New Roman', Georgia, serif;
		-webkit-font-smoothing: antialiased;
		text-rendering: optimizeLegibility;
	}

	.page {
		--paper: #f4ede0;
		--paper-deep: #ebe3d2;
		--ink: #18140d;
		--ink-soft: rgba(24, 20, 13, 0.62);
		--ink-faint: rgba(24, 20, 13, 0.18);
		--rule: rgba(24, 20, 13, 0.85);
		--accent: #8c2a1d;
		position: relative;
		min-height: 100vh;
		padding: 80px 24px 64px;
		max-width: 1180px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 64px;
		pointer-events: none;
	}
	.page > * {
		pointer-events: auto;
	}

	/* ---------- Paper card primitive ----------
	   Hairline ink border, modest radius. The fluid inside fills rim-to-rim
	   (no inner padding) — the rounded look is produced by the engine's
	   actual glass shader, not by CSS blur. */
	.paper-card,
	.paper-section,
	.paper-nav,
	.paper-footer {
		position: relative;
		background: var(--paper);
		border: 1px solid var(--rule);
		border-radius: 14px;
		overflow: hidden;
	}

	/* ---------- Back link ---------- */
	.competition-back {
		position: fixed;
		top: 1rem;
		left: 1rem;
		z-index: 200;
		font-size: 0.72rem;
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-soft, rgba(24, 20, 13, 0.62));
		text-decoration: none;
		background: rgba(244, 237, 224, 0.92);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid rgba(24, 20, 13, 0.85);
		border-radius: 4px;
		padding: 0.4rem 0.75rem;
		font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		transition: color 0.15s;
	}
	.competition-back:hover {
		color: #18140d;
	}

	/* ---------- Nav ---------- */
	.paper-nav {
		display: flex;
		align-items: center;
		gap: 28px;
		padding: 12px 20px;
		border-radius: 999px;
		max-width: max-content;
		align-self: center;
		font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.brand {
		display: inline-flex;
		align-items: baseline;
		gap: 8px;
		color: var(--ink);
		text-decoration: none;
		font-weight: 600;
	}
	.brand-mark {
		color: var(--accent);
		font-family: 'Times New Roman', Georgia, serif;
		font-size: 16px;
		font-weight: 700;
		text-transform: none;
	}
	.brand-name {
		font-size: 13px;
		letter-spacing: 0.05em;
	}
	.brand-dash {
		color: var(--accent);
		letter-spacing: -0.1em;
	}
	.nav-links {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.nav-links a {
		color: var(--ink-soft);
		text-decoration: none;
		font-size: 11.5px;
		padding: 6px 10px;
		border-radius: 999px;
		transition: color 0.15s, background 0.15s;
		letter-spacing: 0.08em;
	}
	.nav-links a:hover {
		color: var(--ink);
		background: rgba(24, 20, 13, 0.06);
	}

	/* ---------- Hero ---------- */
	.hero {
		display: flex;
		justify-content: center;
	}
	.hero-inner {
		padding: 56px 56px 44px;
		max-width: 920px;
		width: 100%;
		text-align: left;
	}
	.hero-rule {
		height: 1px;
		background: var(--rule);
		margin: 0 0 18px;
	}
	.hero-eyebrow {
		font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		font-size: 11px;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--ink-soft);
		margin: 0 0 22px;
	}
	.display {
		font-family: 'Instrument Serif', 'Playfair Display', 'Times New Roman', Georgia, serif;
		font-size: clamp(44px, 7vw, 92px);
		font-weight: 400;
		line-height: 1.02;
		letter-spacing: -0.025em;
		margin: 0 0 22px;
		color: var(--ink);
	}
	.thinsp {
		letter-spacing: -0.05em;
	}
	.tagline {
		font-family: 'Instrument Serif', 'Playfair Display', 'Times New Roman', Georgia, serif;
		font-style: italic;
		font-size: clamp(17px, 1.6vw, 21px);
		color: rgba(24, 20, 13, 0.78);
		max-width: 640px;
		margin: 0 0 32px;
		line-height: 1.45;
		font-weight: 400;
	}
	.cta-row {
		display: flex;
		gap: 12px;
		margin-bottom: 30px;
		flex-wrap: wrap;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		padding: 10px 22px;
		border-radius: 999px;
		background: var(--paper);
		border: 1px solid var(--rule);
		color: var(--ink);
		text-decoration: none;
		font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		font-size: 11.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		font-weight: 500;
		transition: background 0.15s, color 0.15s;
	}
	.pill:hover {
		background: var(--ink);
		color: var(--paper);
	}
	.pill-primary {
		background: var(--ink);
		color: var(--paper);
	}
	.pill-primary:hover {
		background: var(--accent);
		border-color: var(--accent);
	}

	.why-row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.paper-pill {
		font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		font-size: 10.5px;
		font-weight: 500;
		padding: 5px 10px;
		border-radius: 999px;
		background: transparent;
		border: 1px solid var(--ink-faint);
		color: var(--ink-soft);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	/* ---------- Sections ---------- */
	.paper-section {
		padding: 36px 36px 34px;
	}
	.section-head {
		margin-bottom: 24px;
	}
	.section-label {
		font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ink-soft);
		margin: 0 0 8px;
	}
	.section-title {
		font-family: 'Instrument Serif', 'Playfair Display', 'Times New Roman', Georgia, serif;
		font-size: clamp(26px, 3vw, 38px);
		font-weight: 400;
		letter-spacing: -0.02em;
		margin: 0 0 8px;
		color: var(--ink);
		line-height: 1.05;
	}
	.muted {
		color: var(--ink-soft);
		margin: 0;
		font-size: 14.5px;
		font-style: italic;
		font-family: 'Instrument Serif', 'Playfair Display', 'Times New Roman', Georgia, serif;
		max-width: 620px;
		line-height: 1.5;
	}

	/* ---------- Code ---------- */
	.paper-code {
		position: relative;
		background: var(--paper-deep);
		border: 1px solid var(--ink-faint);
		border-radius: 10px;
		padding: 16px 20px;
		font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		font-size: 13.5px;
		color: var(--ink);
	}
	.install-code {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}
	.install-code code {
		font-size: 14.5px;
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
		border: 1px solid var(--rule);
		background: var(--paper);
		color: var(--ink);
		font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		font-size: 11px;
		font-weight: 500;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		padding: 5px 12px;
		border-radius: 999px;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.usage-code .copy-btn {
		position: absolute;
		top: 14px;
		right: 14px;
	}
	.copy-btn:hover {
		background: var(--ink);
		color: var(--paper);
	}

	/* ---------- Cards: shared "fluid fills the card edge-to-edge" pattern ----
	   No inner padding. The .card-fluid wrapper IS the canvas frame. The
	   caption strip sits below it with a hairline divider above.
	*/
	.card-fluid {
		position: relative;
		width: 100%;
		display: block;
		background: var(--paper);
	}
	.card-caption {
		display: grid;
		grid-template-columns: auto 1fr;
		column-gap: 14px;
		row-gap: 4px;
		align-items: baseline;
		padding: 12px 16px 14px;
		border-top: 1px solid var(--rule);
		font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		font-size: 11px;
		letter-spacing: 0.06em;
	}
	.card-num {
		font-weight: 600;
		color: var(--accent);
		grid-row: span 2;
		font-size: 12px;
	}
	.card-name {
		font-family: 'Instrument Serif', 'Playfair Display', 'Times New Roman', Georgia, serif;
		font-size: 16px;
		font-style: italic;
		font-weight: 400;
		color: var(--ink);
		letter-spacing: -0.005em;
		text-transform: none;
	}
	.card-blurb {
		grid-column: 2;
		color: var(--ink-soft);
		font-size: 11.5px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.card-snippet {
		grid-column: 2;
		font-size: 10.5px;
		color: var(--ink-soft);
		text-transform: none;
		letter-spacing: 0;
		word-break: break-all;
	}

	/* ---------- Presets ---------- */
	.presets {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.preset-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 20px;
	}
	.preset-card .card-fluid {
		height: 320px;
	}
	.presets-note {
		font-family: 'Instrument Serif', 'Playfair Display', 'Times New Roman', Georgia, serif;
		font-style: italic;
		font-size: 13.5px;
		color: var(--ink-soft);
		margin: 8px 4px 0;
		max-width: 720px;
	}

	/* ---------- Shapes ---------- */
	.shapes-section,
	.physics-section,
	.glass-demos-section,
	.sticky-section,
	.reveal-section,
	.distort-section {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.shape-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 20px;
	}
	.shape-card .card-fluid {
		height: 240px;
	}

	/* ---------- Physics ---------- */
	.physics-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 20px;
	}
	.physics-card .card-fluid {
		height: 280px;
	}

	/* ---------- Glass demos ---------- */
	.glass-demo-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 20px;
	}
	.glass-demo-card .card-fluid {
		height: 320px;
	}

	/* ---------- Sticky ---------- */
	.sticky-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 20px;
	}
	.sticky-panel .card-fluid {
		height: 240px;
	}

	/* ---------- Reveal ---------- */
	.reveal-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 20px;
	}
	.reveal-card .card-fluid {
		height: 260px;
	}
	.reveal-content {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		background: var(--paper-deep);
	}
	.reveal-label {
		font-family: 'Instrument Serif', 'Playfair Display', 'Times New Roman', Georgia, serif;
		font-style: italic;
		font-size: 1.6rem;
		color: var(--ink);
	}

	/* ---------- Distortion ---------- */
	.distort-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 20px;
	}
	.distort-card .card-fluid {
		height: 300px;
	}

	/* ---------- Playground ---------- */
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
		border: 1px solid var(--ink-faint);
		background: transparent;
		color: var(--ink-soft);
		font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		font-size: 11px;
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 5px 12px;
		border-radius: 999px;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s, color 0.15s;
	}
	.preset-chip:hover {
		background: rgba(24, 20, 13, 0.06);
		color: var(--ink);
		border-color: var(--rule);
	}
	.preset-chip.active {
		background: var(--ink);
		border-color: var(--ink);
		color: var(--paper);
	}
	.preset-chip.reset {
		border-color: var(--accent);
		color: var(--accent);
	}
	.preset-chip.reset:hover {
		background: var(--accent);
		color: var(--paper);
	}
	.playground-grid {
		display: grid;
		grid-template-columns: 1fr 320px;
		gap: 24px;
		align-items: start;
	}
	.playground-canvas {
		width: 100%;
		height: 460px;
		border-radius: 12px;
		overflow: hidden;
		border: 1px solid var(--rule);
		background: var(--paper);
	}
	.playground-panel {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.knob-group {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.knob-group-title {
		font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: var(--ink-soft);
		padding-bottom: 4px;
		border-bottom: 1px solid var(--ink-faint);
	}
	.knob-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.knob-label {
		font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		font-size: 11px;
		color: var(--ink);
		min-width: 130px;
		letter-spacing: 0.02em;
	}
	.knob-row input[type='range'] {
		flex: 1;
		accent-color: var(--accent);
	}
	.knob-value {
		font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		font-size: 11px;
		color: var(--ink-soft);
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
		background: transparent;
		border: 1px solid var(--rule);
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
		background: var(--ink);
		transition: transform 0.2s, background 0.2s;
	}
	.toggle-row input:checked + .toggle-pill {
		background: var(--ink);
		border-color: var(--ink);
	}
	.toggle-row input:checked + .toggle-pill::after {
		transform: translateX(14px);
		background: var(--paper);
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
		border: 1px solid var(--rule);
		border-radius: 4px;
		background: none;
		cursor: pointer;
		padding: 0;
	}
	.mono {
		font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;
	}
	.snippet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: var(--ink-soft);
		padding-bottom: 4px;
		border-bottom: 1px solid var(--ink-faint);
	}
	.copy-btn.small {
		font-size: 10px;
		padding: 4px 10px;
	}
	.snippet-code {
		background: var(--paper-deep);
		border: 1px solid var(--ink-faint);
		border-radius: 8px;
		padding: 12px 14px;
		margin: 0;
		font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		font-size: 11px;
		color: var(--ink);
		overflow-x: auto;
		line-height: 1.5;
		white-space: pre;
	}

	/* ---------- Footer ---------- */
	.paper-footer {
		padding: 24px 28px;
		text-align: center;
	}
	.paper-footer hr {
		border: 0;
		border-top: 1px solid var(--rule);
		margin: 0 0 18px;
	}
	.footer-row {
		display: grid;
		grid-template-columns: 1fr 2fr 1fr;
		gap: 24px;
		font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		font-size: 10.5px;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}
	.footer-mid {
		text-align: center;
		text-transform: none;
		letter-spacing: 0.02em;
		font-size: 11px;
		font-family: 'Instrument Serif', 'Playfair Display', 'Times New Roman', Georgia, serif;
		font-style: italic;
	}
	.footer-mid a {
		color: var(--ink);
		text-decoration: underline;
		text-decoration-color: var(--ink-faint);
		text-underline-offset: 3px;
	}
	.footer-right {
		text-align: right;
	}

	/* ---------- Responsive ---------- */
	@media (max-width: 960px) {
		.shape-grid,
		.preset-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.playground-grid {
			grid-template-columns: 1fr;
		}
		.playground-canvas {
			height: 360px;
		}
	}

	@media (max-width: 780px) {
		.page {
			padding: 70px 16px 40px;
			gap: 44px;
		}
		.paper-nav {
			gap: 12px;
			padding: 10px 14px;
			align-self: stretch;
			max-width: none;
			justify-content: space-between;
			border-radius: 16px;
		}
		.nav-links {
			gap: 0;
			flex-wrap: wrap;
			justify-content: flex-end;
		}
		.nav-links a {
			padding: 5px 8px;
			font-size: 11px;
		}
		.hero-inner {
			padding: 36px 22px 28px;
		}
		.paper-section {
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
		.preset-card .card-fluid {
			height: 280px;
		}
		.usage-code pre {
			font-size: 12px;
		}
		.footer-row {
			grid-template-columns: 1fr;
			text-align: left;
		}
		.footer-mid,
		.footer-right {
			text-align: left;
		}
	}

	@media (max-width: 480px) {
		.page {
			padding: 60px 12px 32px;
		}
		.hero-inner {
			padding: 28px 18px 22px;
		}
		.display {
			font-size: clamp(34px, 11vw, 56px);
		}
		.tagline {
			font-size: 16px;
		}
		.section-title {
			font-size: clamp(22px, 7vw, 28px);
		}
	}
</style>
