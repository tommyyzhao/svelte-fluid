<script lang="ts">
	import { base } from '$app/paths';
	import {
		AnnularFluid,
		CircularFluid,
		Fluid,
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

	let copied = $state(false);

	function copyInstall() {
		navigator.clipboard.writeText('npm install svelte-fluid');
		copied = true;
		setTimeout(() => (copied = false), 1600);
	}

	const presets = [
		{ name: 'Lava Lamp', mark: '✦', tint: '#ffd6db', Component: LavaLamp, blurb: 'Slow molten blobs that drift forever.' },
		{ name: 'Plasma', mark: '✿', tint: '#d8d0eb', Component: Plasma, blurb: 'Electric ribbons of color, gently humming.' },
		{ name: 'Ink In Water', mark: '❀', tint: '#c8d9c4', Component: InkInWater, blurb: 'Soft diffusion, like a dropper in a glass.' },
		{ name: 'Frozen Swirl', mark: '◌', tint: '#cfe3ec', Component: FrozenSwirl, blurb: 'Pale, suspended, almost glacial.' },
		{ name: 'Aurora', mark: '✦', tint: '#cde6d4', Component: Aurora, blurb: 'Long curtains of light, low and luminous.' },
		{ name: 'Toroidal Tempest', mark: '✿', tint: '#ffd9b3', Component: ToroidalTempest, blurb: 'A storm folded into a doughnut.' }
	];

	const features = [
		'Multi-instance — run as many as you like',
		'Resize-stable — no flicker, no reset',
		'Deterministic seeding — same look every load',
		'MIT licensed — yours to ship',
		'Zero runtime dependencies',
		'70+ props, 10 friendly presets'
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

	const paperColor: RGB = { r: 251, g: 245, b: 238 };

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
	<title>svelte-fluid — a friendly fluid simulation for Svelte</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<a class="competition-back" href="{base}/design-competition">← Competition</a>

<div class="page">
	<header class="topnav">
		<div class="brand">
			<span class="dot"></span>
			<span>svelte-fluid</span>
		</div>
		<nav>
			<a href="{base}/docs">Docs</a>
			<a href="https://github.com/tommyyzhao/svelte-fluid" target="_blank" rel="noreferrer">GitHub</a>
		</nav>
	</header>

	<section class="hero">
		<div class="hero-card">
			<p class="eyebrow">A little library, a lot of motion</p>
			<h1>
				A <em>beautiful</em>, interactive
				<br />
				WebGL <em>fluid</em> simulation
				<br />
				as a Svelte component.
			</h1>
			<h1 class="tagline">
				WebGL fluid simulation as a Svelte 5 component. Multi-instance,
				resize-stable, deterministic seeding. Drop one component in. Get a
				beautiful, interactive fluid simulation. That's it.
			</h1>
			<div class="cta-row">
				<a class="btn btn-primary" href="{base}/docs">Read the docs</a>
				<a
					class="btn btn-ghost"
					href="https://github.com/tommyyzhao/svelte-fluid"
					target="_blank"
					rel="noreferrer">Star on GitHub</a
				>
			</div>

			<div class="arrow-hint">
				<svg width="92" height="56" viewBox="0 0 92 56" fill="none" aria-hidden="true">
					<path
						d="M4 8 C 28 6, 44 30, 64 36 C 72 38, 80 38, 86 34"
						stroke="#a07a86"
						stroke-width="2"
						stroke-linecap="round"
						fill="none"
					/>
					<path
						d="M80 28 L 86 34 L 80 40"
						stroke="#a07a86"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						fill="none"
					/>
				</svg>
				<span><em>Try a preset</em> below</span>
			</div>
		</div>
	</section>

	<section class="install">
		<div class="install-card">
			<div class="install-left">
				<p class="kicker">Get started</p>
				<h2>One line. <em>That's the install.</em></h2>
			</div>
			<div class="snippet">
				<code>npm install svelte-fluid</code>
				<button class="copy" onclick={copyInstall} aria-label="Copy install command">
					{copied ? 'Copied' : 'Copy'}
				</button>
			</div>
		</div>

		<div class="usage-card">
			<p class="kicker">Then in your component</p>
			<pre class="code"><span class="tag">&lt;script&gt;</span>
  <span class="kw">import</span> &#123; LavaLamp &#125; <span class="kw">from</span> <span class="str">'svelte-fluid'</span>;
<span class="tag">&lt;/script&gt;</span>

<span class="tag">&lt;div</span> <span class="attr">style</span>=<span class="str">"height: 480px"</span><span class="tag">&gt;</span>
  <span class="tag">&lt;LavaLamp</span> <span class="attr">seed</span>=<span class="str">&#123;42&#125;</span> <span class="tag">/&gt;</span>
<span class="tag">&lt;/div&gt;</span></pre>
		</div>
	</section>

	<section class="presets">
		<div class="section-head">
			<p class="kicker">Pick a vibe</p>
			<h2>Six <em>ready-made</em> presets</h2>
			<p class="sub">
				Each one is a thin wrapper around <code>&lt;Fluid /&gt;</code> with a curated set
				of physics and colors. Tweak any prop, or drop them in as-is.
			</p>
		</div>

		<div class="preset-grid">
			{#each presets as preset, i (preset.name)}
				<article class="preset" style="animation-delay: {120 + i * 60}ms">
					<div class="preset-strip" style="background: {preset.tint}">
						<span class="preset-mark">{preset.mark}</span>
						<span class="preset-name">{preset.name}</span>
					</div>
					<div class="preset-canvas">
						<preset.Component seed={i * 7 + 11} lazy backColor={paperColor} aria-label="{preset.name} preset preview" />
					</div>
					<p class="preset-blurb">{preset.blurb}</p>
				</article>
			{/each}
		</div>
	</section>

	<section class="why">
		<div class="why-head">
			<p class="kicker">Why people love it</p>
			<h2>Small library, <em>thoughtful</em> defaults</h2>
		</div>
		<ul class="why-list">
			{#each features as feature, i (feature)}
				<li style="animation-delay: {200 + i * 60}ms">
					<span class="check" aria-hidden="true">✓</span>
					<span>{feature}</span>
				</li>
			{/each}
		</ul>
	</section>

	<section class="shapes-section panel-lavender">
		<div class="panel-inner">
			<p class="kicker">Container shapes</p>
			<h2 class="serif-heading"><em>Shapes</em></h2>
			<p class="panel-sub">
				Six primitives — circle, rounded rect, frame, annulus, SVG path, and text glyph. Hover to splat.
			</p>
			<div class="shape-grid">
				<figure class="shape-cell">
					<div class="shape-canvas">
						<CircularFluid seed={601} lazy backColor={paperColor} splatOnHover aria-label="Circle container demo" />
					</div>
					<figcaption>Circle</figcaption>
				</figure>
				<figure class="shape-cell">
					<div class="shape-canvas">
						<Fluid
							seed={602}
							colorful
							shading
							bloom={false}
							splatOnHover
							containerShape={{
								type: 'roundedRect',
								cx: 0.5,
								cy: 0.5,
								halfW: 0.42,
								halfH: 0.42,
								cornerRadius: 0.08
							}}
							backColor={paperColor}
							lazy
							aria-label="Rounded rect container demo"
						/>
					</div>
					<figcaption>Rounded Rect</figcaption>
				</figure>
				<figure class="shape-cell">
					<div class="shape-canvas">
						<FrameFluid seed={603} lazy backColor={paperColor} splatOnHover aria-label="Frame container demo" />
					</div>
					<figcaption>Frame</figcaption>
				</figure>
				<figure class="shape-cell">
					<div class="shape-canvas">
						<AnnularFluid seed={604} lazy backColor={paperColor} splatOnHover aria-label="Annulus container demo" />
					</div>
					<figcaption>Annulus</figcaption>
				</figure>
				<figure class="shape-cell">
					<div class="shape-canvas">
						<Fluid
							seed={605}
							colorful
							bloom={false}
							splatOnHover
							containerShape={{ type: 'svgPath', d: lightning, viewBox: [0, 0, 100, 100] }}
							backColor={paperColor}
							lazy
							aria-label="SVG path lightning container demo"
						/>
					</div>
					<figcaption>SVG Path</figcaption>
				</figure>
				<figure class="shape-cell">
					<div class="shape-canvas">
						<Fluid
							seed={606}
							colorful
							bloom={false}
							splatOnHover
							containerShape={{
								type: 'svgPath',
								text: '&',
								font: '900 280px Georgia, serif'
							}}
							backColor={paperColor}
							lazy
							aria-label="Text glyph container demo"
						/>
					</div>
					<figcaption>Text Glyph</figcaption>
				</figure>
			</div>
		</div>
	</section>

	<section class="physics-section panel-sage">
		<div class="panel-inner">
			<p class="kicker">Physics</p>
			<h2 class="serif-heading"><em>Build</em></h2>
			<p class="panel-sub">
				Every prop is optional. Drop in a tag for a finished look; reach for props when you want your own physics.
			</p>
			<div class="physics-grid">
				<figure class="physics-cell">
					<div class="physics-canvas">
						<Fluid
							seed={1234}
							initialSplatCount={12}
							splatOnHover
							backColor={paperColor}
							lazy
							aria-label="Default fluid configuration"
						/>
					</div>
					<code class="physics-snippet">{'<Fluid />'}</code>
					<figcaption>Default</figcaption>
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
							backColor={paperColor}
							lazy
							aria-label="Flat fluid with low curl"
						/>
					</div>
					<code class="physics-snippet">{'bloom={false} curl={5} densityDissipation={0.4}'}</code>
					<figcaption>Flat + Soft</figcaption>
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
							backColor={paperColor}
							lazy
							aria-label="Fluid with large bold splats"
						/>
					</div>
					<code class="physics-snippet">{'shading={false} splatRadius={0.8} splatForce={9000}'}</code>
					<figcaption>Bold Splats</figcaption>
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
					<code class="physics-snippet">{'velocityDissipation={0.05} densityDissipation={0.5} transparent'}</code>
					<figcaption>Slow + Transparent</figcaption>
				</figure>
			</div>
		</div>
	</section>

	<section class="glass-section panel-pink">
		<div class="panel-inner">
			<p class="kicker">Glass effects</p>
			<h2 class="serif-heading">Through <em>glass</em></h2>
			<p class="panel-sub">
				A thin lens bends the colors as they drift past, softening every edge with a faint, prismatic blush.
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
							backColor={paperColor}
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
					<figcaption>Crystal Orb</figcaption>
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
							backColor={paperColor}
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
					<figcaption>Soft Lens</figcaption>
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
							backColor={paperColor}
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
					<figcaption>Portal Ring</figcaption>
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
							backColor={paperColor}
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
					<figcaption>Glass Frame</figcaption>
				</figure>
			</div>
		</div>
	</section>

	<section class="sticky-section panel-lavender">
		<div class="panel-inner">
			<p class="kicker">Sticky text masks</p>
			<h2 class="serif-heading">Through <em>letterforms</em></h2>
			<p class="panel-sub">Dye settles quietly into the shape of a word, pooling in the curves of each serif like ink finding its way through paper.</p>
			<div class="sticky-grid">
				<figure class="sticky-cell">
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
							backColor={paperColor}
							lazy
						/>
					</div>
					<figcaption>Geist · 900</figcaption>
				</figure>
				<figure class="sticky-cell">
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
							backColor={paperColor}
							lazy
						/>
					</div>
					<figcaption>Georgia · ∞</figcaption>
				</figure>
			</div>
		</div>
	</section>

	<section class="reveal-section panel-sage">
		<div class="panel-inner">
			<p class="kicker">Scratch to reveal</p>
			<h2 class="serif-heading">Gently <em>uncover</em></h2>
			<p class="panel-sub">A soft veil rests over the page, parting wherever a hand passes through — slow, deliberate, almost shy.</p>
			<div class="reveal-grid">
				<figure class="reveal-cell">
					<div class="reveal-canvas" aria-label="Scratch-to-reveal demo">
						<FluidReveal
							lazy
							velocityDissipation={0.95}
							pressureIterations={10}
						>
							<div style="display:flex;align-items:center;justify-content:center;height:100%;background:linear-gradient(135deg,#e8d5f5,#d5e8f5);font-size:1.5rem;font-family:'Instrument Serif',serif;font-style:italic;">Revealed</div>
						</FluidReveal>
					</div>
					<figcaption>Scratch to Reveal</figcaption>
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
							coverColor={{ r: 0.9, g: 0.85, b: 0.95 }}
							fringeColor={{ r: 0.7, g: 0.8, b: 0.95 }}
							accentColor={{ r: 0.5, g: 0.75, b: 1 }}
						>
							<div style="display:flex;align-items:center;justify-content:center;height:100%;background:linear-gradient(135deg,#d5f5e5,#f5f0d5);font-size:1.5rem;font-family:'Instrument Serif',serif;font-style:italic;">Auto Reveal</div>
						</FluidReveal>
					</div>
					<figcaption>Auto-Reveal</figcaption>
				</figure>
			</div>
		</div>
	</section>

	<section class="distort-section panel-pink">
		<div class="panel-inner">
			<p class="kicker">Image distortion</p>
			<h2 class="serif-heading">A painting, gently <em>stirred</em></h2>
			<p class="panel-sub">An image becomes a pond — currents of color slipping under the surface, the picture half-remembered as it moves.</p>
			<div class="distort-grid">
				<figure class="distort-cell">
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
					<figcaption>Subtle · Strength 0.3</figcaption>
				</figure>
				<figure class="distort-cell">
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
					<figcaption>Strong · Strength 0.45</figcaption>
				</figure>
			</div>
		</div>
	</section>

	<section class="play-section panel-lavender">
		<div class="panel-inner">
			<p class="kicker">Interactive</p>
			<h2 class="serif-heading"><em>Play</em></h2>
			<p class="panel-sub">Drag the knobs. The fluid updates in real time.</p>

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

	<section class="closer">
		<div class="closer-card">
			<h2>
				Ready to <em>add a little motion</em>
				<br />to your next project?
			</h2>
			<div class="cta-row">
				<a class="btn btn-primary" href="{base}/docs">Read the docs</a>
				<a
					class="btn btn-ghost"
					href="https://github.com/tommyyzhao/svelte-fluid"
					target="_blank"
					rel="noreferrer">Browse the source</a
				>
			</div>
		</div>
	</section>

	<footer class="foot">
		<p>
			Derivative work of PavelDoGreat/WebGL-Fluid-Simulation by Pavel Dobryakov
			(c) 2017.
		</p>
		<p class="foot-small">Released under the MIT license.</p>
	</footer>
</div>

<style>
	:global(body) {
		margin: 0;
		background: #fbf5ee;
	}

	.competition-back {
		position: fixed;
		top: 1rem;
		left: 1rem;
		z-index: 200;
		font-size: 0.75rem;
		font-weight: 500;
		color: rgba(80, 60, 100, 0.65);
		text-decoration: none;
		background: rgba(240, 230, 255, 0.92);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid rgba(160, 130, 200, 0.2);
		border-radius: 20px;
		padding: 0.35rem 0.8rem;
		font-family: 'Instrument Serif', serif;
		font-style: italic;
		transition: color 0.15s;
	}

	.competition-back:hover {
		color: rgba(80, 60, 100, 0.95);
	}

	.page {
		font-family: 'Inter', 'DM Sans', system-ui, -apple-system, sans-serif;
		color: #1a1815;
		background: #fbf5ee;
		min-height: 100vh;
		padding: 1.5rem 1.5rem 4rem;
		max-width: 1200px;
		margin: 0 auto;
		line-height: 1.55;
	}

	em {
		font-family: 'Instrument Serif', 'EB Garamond', Georgia, serif;
		font-style: italic;
		font-weight: 400;
		color: #5a3b46;
	}

	.topnav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		margin-bottom: 1.25rem;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		font-size: 1rem;
		letter-spacing: -0.01em;
	}

	.dot {
		width: 14px;
		height: 14px;
		border-radius: 9999px;
		background: linear-gradient(135deg, #ffd6db, #d8d0eb);
		box-shadow: 0 1px 3px rgba(180, 100, 80, 0.25);
	}

	.topnav nav {
		display: flex;
		gap: 1.5rem;
	}

	.topnav nav a {
		color: #4a3f3a;
		text-decoration: none;
		font-size: 0.95rem;
		font-weight: 500;
	}

	.topnav nav a:hover {
		color: #1a1815;
	}

	.hero {
		animation: fadeUp 500ms ease-out both;
	}

	.hero-card {
		background: linear-gradient(135deg, #ffe5db 0%, #ffd6db 50%, #d8d0eb 100%);
		border-radius: 40px;
		padding: 5rem 4rem;
		position: relative;
		box-shadow: 0 12px 48px rgba(180, 100, 80, 0.12), 0 1px 2px rgba(0, 0, 0, 0.04);
		overflow: hidden;
	}

	.eyebrow {
		text-transform: uppercase;
		letter-spacing: 0.18em;
		font-size: 0.72rem;
		font-weight: 600;
		color: #8a5b6a;
		margin: 0 0 1.25rem;
	}

	h1 {
		font-size: clamp(2.25rem, 5vw, 3.75rem);
		line-height: 1.08;
		letter-spacing: -0.025em;
		font-weight: 600;
		margin: 0 0 1.5rem;
		max-width: 22ch;
	}

	h1 em {
		font-size: 1.08em;
		color: #5a3b46;
	}

	.tagline {
		max-width: 50ch;
		font-size: 1.075rem;
		color: #4a3f3a;
		margin: 0 0 2rem;
	}

	.cta-row {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.85rem 1.5rem;
		border-radius: 9999px;
		text-decoration: none;
		font-weight: 500;
		font-size: 0.95rem;
		transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
		border: 1px solid transparent;
		cursor: pointer;
	}

	.btn-primary {
		background: #1a1815;
		color: #fdf6ee;
		box-shadow: 0 4px 16px rgba(26, 24, 21, 0.18);
	}

	.btn-primary:hover {
		transform: translateY(-1px);
		box-shadow: 0 6px 20px rgba(26, 24, 21, 0.24);
	}

	.btn-ghost {
		background: rgba(254, 252, 249, 0.7);
		color: #1a1815;
		border-color: rgba(26, 24, 21, 0.1);
	}

	.btn-ghost:hover {
		background: rgba(254, 252, 249, 0.95);
		transform: translateY(-1px);
	}

	.arrow-hint {
		position: absolute;
		bottom: 2rem;
		right: 3rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: #8a5b6a;
		font-size: 0.95rem;
	}

	.arrow-hint em {
		color: #5a3b46;
	}

	.install {
		display: grid;
		grid-template-columns: 1.1fr 1fr;
		gap: 1.25rem;
		margin-top: 1.5rem;
		animation: fadeUp 500ms ease-out 100ms both;
	}

	.install-card,
	.usage-card {
		background: linear-gradient(135deg, #fefcf9 0%, #f7ede4 100%);
		border-radius: 32px;
		padding: 2.5rem;
		box-shadow: 0 4px 24px rgba(180, 100, 80, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
	}

	.install-card {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 1.5rem;
	}

	.kicker {
		text-transform: uppercase;
		letter-spacing: 0.16em;
		font-size: 0.7rem;
		font-weight: 600;
		color: #8a5b6a;
		margin: 0 0 0.75rem;
	}

	h2 {
		font-size: clamp(1.5rem, 2.5vw, 1.9rem);
		font-weight: 600;
		letter-spacing: -0.02em;
		line-height: 1.15;
		margin: 0;
	}

	.snippet {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		background: #fdf6ee;
		border-radius: 9999px;
		padding: 0.6rem 0.6rem 0.6rem 1.25rem;
		border: 1px solid rgba(180, 100, 80, 0.12);
	}

	.snippet code {
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
		font-size: 0.9rem;
		color: #1a1815;
	}

	.copy {
		border: none;
		background: #1a1815;
		color: #fdf6ee;
		font-family: inherit;
		font-size: 0.78rem;
		font-weight: 500;
		padding: 0.45rem 1rem;
		border-radius: 9999px;
		cursor: pointer;
		transition: background 120ms ease;
	}

	.copy:hover {
		background: #3a2f2a;
	}

	.usage-card {
		background: linear-gradient(135deg, #f1ecf6 0%, #e7e0ee 100%);
	}

	.code {
		margin: 0.5rem 0 0;
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
		font-size: 0.82rem;
		line-height: 1.65;
		color: #2a2520;
		background: rgba(254, 252, 249, 0.75);
		border-radius: 20px;
		padding: 1.25rem 1.5rem;
		overflow-x: auto;
	}

	.code .tag { color: #9b5b6e; }
	.code .kw { color: #6e5b9b; }
	.code .str { color: #5b7a6e; }
	.code .attr { color: #9b7a5b; }

	.presets {
		margin-top: 3.5rem;
		animation: fadeUp 500ms ease-out 200ms both;
	}

	.section-head {
		margin-bottom: 2rem;
		padding: 0 0.5rem;
	}

	.sub {
		max-width: 56ch;
		color: #4a3f3a;
		margin: 0.75rem 0 0;
		font-size: 1rem;
	}

	.sub code {
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
		font-size: 0.85em;
		background: #f1ecf6;
		padding: 0.1rem 0.4rem;
		border-radius: 6px;
	}

	.preset-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.5rem;
	}

	.preset:nth-child(even) {
		transform: translateY(2rem);
	}

	.preset {
		background: #fefcf9;
		border-radius: 32px;
		padding: 0;
		overflow: hidden;
		box-shadow: 0 4px 24px rgba(180, 100, 80, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
		animation: fadeUp 500ms ease-out both;
		display: flex;
		flex-direction: column;
	}

	.preset-strip {
		padding: 1rem 1.5rem;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-weight: 500;
	}

	.preset-mark {
		font-family: 'Instrument Serif', serif;
		font-size: 1.25rem;
		color: #5a3b46;
	}

	.preset-name {
		font-size: 1.02rem;
		color: #1a1815;
		letter-spacing: -0.01em;
	}

	.preset-canvas {
		height: 320px;
		width: 100%;
		background: #fbf5ee;
		position: relative;
	}

	.preset-blurb {
		margin: 0;
		padding: 1.1rem 1.5rem 1.4rem;
		color: #4a3f3a;
		font-size: 0.95rem;
	}

	.why {
		margin-top: 4rem;
		background: linear-gradient(135deg, #c8d9c4 0%, #cde6d4 100%);
		border-radius: 40px;
		padding: 3.5rem 4rem;
		box-shadow: 0 4px 24px rgba(80, 120, 90, 0.1);
		animation: fadeUp 500ms ease-out 300ms both;
	}

	.why-head {
		margin-bottom: 2rem;
	}

	.why-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem 2rem;
	}

	.why-list li {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		font-size: 1rem;
		color: #2a2520;
		animation: fadeUp 500ms ease-out both;
	}

	.check {
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		border-radius: 9999px;
		background: #fefcf9;
		color: #5a7a5b;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 0.85rem;
		box-shadow: 0 1px 4px rgba(80, 120, 90, 0.18);
	}

	/* Shared panel styles */
	.panel-lavender {
		background: linear-gradient(135deg, #ede5f7 0%, #e0d8f0 100%);
	}

	.panel-sage {
		background: linear-gradient(135deg, #ddeedd 0%, #cfe3d4 100%);
	}

	.panel-pink {
		background: linear-gradient(135deg, #fce8ec 0%, #f5dde5 100%);
	}

	.shapes-section,
	.physics-section,
	.glass-section,
	.sticky-section,
	.reveal-section,
	.distort-section,
	.play-section {
		margin-top: 3rem;
		border-radius: 40px;
		padding: 3.5rem 4rem;
		box-shadow: 0 4px 24px rgba(180, 100, 80, 0.07);
	}

	.panel-inner {
		max-width: 960px;
		margin: 0 auto;
	}

	.serif-heading {
		font-size: clamp(2rem, 4vw, 3rem);
		font-weight: 400;
		letter-spacing: -0.01em;
		line-height: 1.1;
		margin: 0 0 0.75rem;
	}

	.serif-heading em {
		font-size: 1em;
		color: #5a3b46;
	}

	.panel-sub {
		max-width: 58ch;
		color: #4a3f3a;
		font-size: 1rem;
		margin: 0 0 2.5rem;
	}

	/* Shapes grid */
	.shape-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1.25rem;
	}

	.shape-cell {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.shape-canvas {
		height: 220px;
		background: rgba(255, 255, 255, 0.5);
		border-radius: 24px;
		overflow: hidden;
		box-shadow: 0 2px 12px rgba(160, 100, 130, 0.1);
	}

	.shape-cell figcaption {
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #7a5b6a;
		text-align: center;
	}

	/* Physics grid */
	.physics-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.25rem;
	}

	.physics-cell {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.physics-canvas {
		height: 260px;
		background: #fbf5ee;
		border-radius: 24px;
		overflow: hidden;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
	}

	.physics-snippet {
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
		font-size: 0.75rem;
		color: #5a4a5a;
		background: rgba(255, 255, 255, 0.6);
		border-radius: 8px;
		padding: 0.35rem 0.6rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.physics-cell figcaption {
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #5a7a5b;
		text-align: center;
	}

	/* Glass grid */
	.glass-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.25rem;
	}

	.glass-cell {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.glass-canvas {
		height: 280px;
		background: #fbf5ee;
		border-radius: 24px;
		overflow: hidden;
		box-shadow: 0 2px 16px rgba(0, 0, 0, 0.15);
	}

	.glass-cell figcaption {
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #7a5b6a;
		text-align: center;
	}

	/* Sticky grid */
	.sticky-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.25rem;
	}

	.sticky-cell {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.sticky-canvas {
		height: 260px;
		background: #fbf5ee;
		border-radius: 24px;
		overflow: hidden;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
	}

	.sticky-cell figcaption {
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #7a5b6a;
		text-align: center;
	}

	/* Reveal grid */
	.reveal-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.25rem;
	}

	.reveal-cell {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.reveal-canvas {
		height: 260px;
		border-radius: 24px;
		overflow: hidden;
		box-shadow: 0 2px 12px rgba(160, 100, 130, 0.1);
	}

	.reveal-cell figcaption {
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #5a7a5b;
		text-align: center;
	}

	/* Distort grid */
	.distort-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.25rem;
	}

	.distort-cell {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.distort-canvas {
		height: 280px;
		border-radius: 24px;
		overflow: hidden;
		box-shadow: 0 2px 12px rgba(160, 100, 130, 0.1);
	}

	.distort-cell figcaption {
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #7a5b6a;
		text-align: center;
	}

	/* Playground */
	.preset-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
	}

	.preset-chip {
		border: 1px solid rgba(160, 130, 180, 0.3);
		background: rgba(255, 255, 255, 0.55);
		color: #4a3a5a;
		font-family: inherit;
		font-size: 0.8rem;
		font-weight: 500;
		padding: 0.3rem 0.85rem;
		border-radius: 9999px;
		cursor: pointer;
		transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
	}

	.preset-chip:hover {
		background: rgba(255, 255, 255, 0.85);
		border-color: rgba(130, 90, 160, 0.45);
	}

	.preset-chip.active {
		background: #5a3b6e;
		color: #f0e8ff;
		border-color: #5a3b6e;
	}

	.preset-chip.reset {
		border-style: dashed;
		color: #8a7b6a;
	}

	.preset-chip.reset:hover {
		color: #4a3f3a;
		background: rgba(255, 255, 255, 0.7);
	}

	.playground-grid {
		display: grid;
		grid-template-columns: 1fr 320px;
		gap: 1.5rem;
		align-items: start;
	}

	.playground-canvas {
		height: 400px;
		background: #fbf5ee;
		border-radius: 24px;
		overflow: hidden;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
	}

	.playground-panel {
		background: rgba(255, 255, 255, 0.6);
		border: 1px solid rgba(160, 130, 180, 0.2);
		border-radius: 24px;
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.knob-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.knob-group-title {
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #8a6b7a;
		margin-bottom: 0.25rem;
	}

	.knob-row {
		display: grid;
		grid-template-columns: 7rem 1fr 3rem;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}

	.knob-label {
		font-size: 0.78rem;
		color: #4a3f3a;
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
	}

	.knob-value {
		font-size: 0.75rem;
		color: #6a5b56;
		text-align: right;
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
	}

	.knob-value.mono {
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
	}

	input[type='range'] {
		width: 100%;
		accent-color: #7a5b8a;
	}

	.toggle-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		cursor: pointer;
	}

	.toggle-row input[type='checkbox'] {
		display: none;
	}

	.toggle-pill {
		width: 32px;
		height: 18px;
		border-radius: 9999px;
		background: #d0c4da;
		position: relative;
		flex-shrink: 0;
		transition: background 150ms ease;
	}

	.toggle-pill::after {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: 14px;
		height: 14px;
		border-radius: 9999px;
		background: white;
		transition: transform 150ms ease;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	}

	.toggle-row input:checked + .toggle-pill {
		background: #7a5b8a;
	}

	.toggle-row input:checked + .toggle-pill::after {
		transform: translateX(14px);
	}

	.color-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		cursor: pointer;
	}

	.color-row input[type='color'] {
		width: 32px;
		height: 24px;
		border: none;
		border-radius: 6px;
		padding: 0;
		cursor: pointer;
		background: none;
	}

	.snippet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #8a6b7a;
	}

	.copy-btn {
		border: 1px solid rgba(160, 130, 180, 0.3);
		background: rgba(255, 255, 255, 0.6);
		color: #5a3b6e;
		font-family: inherit;
		font-size: 0.72rem;
		font-weight: 600;
		padding: 0.2rem 0.6rem;
		border-radius: 9999px;
		cursor: pointer;
		transition: background 120ms ease;
	}

	.copy-btn:hover {
		background: rgba(255, 255, 255, 0.9);
	}

	.snippet-code {
		background: rgba(255, 255, 255, 0.5);
		border-radius: 12px;
		padding: 0.75rem 1rem;
		font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
		font-size: 0.72rem;
		line-height: 1.6;
		color: #2a2520;
		overflow-x: auto;
		margin: 0;
		white-space: pre;
	}

	.closer {
		margin-top: 3rem;
		animation: fadeUp 500ms ease-out 400ms both;
	}

	.closer-card {
		background: linear-gradient(135deg, #ffd9b3 0%, #ffd6db 100%);
		border-radius: 40px;
		padding: 4rem 3rem;
		text-align: center;
		box-shadow: 0 4px 24px rgba(180, 100, 80, 0.1);
	}

	.closer-card h2 {
		font-size: clamp(1.75rem, 3.5vw, 2.5rem);
		margin-bottom: 1.75rem;
	}

	.closer-card .cta-row {
		justify-content: center;
	}

	.foot {
		margin-top: 3rem;
		padding: 1.5rem 1rem;
		text-align: center;
		color: #6a5b56;
		font-size: 0.88rem;
	}

	.foot p {
		margin: 0.25rem 0;
	}

	.foot-small {
		font-size: 0.82rem;
		color: #8a7b75;
	}

	@keyframes fadeUp {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.preset:nth-child(even) {
		animation-name: fadeUpStagger;
	}

	@keyframes fadeUpStagger {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
		to {
			opacity: 1;
			transform: translateY(2rem);
		}
	}

	@media (max-width: 880px) {
		.hero-card {
			padding: 3rem 2rem;
		}
		.arrow-hint {
			position: static;
			margin-top: 1.5rem;
		}
		.install {
			grid-template-columns: 1fr;
		}
		.install-card,
		.usage-card,
		.why {
			padding: 2rem 1.5rem;
		}
		.preset-grid {
			grid-template-columns: 1fr;
		}
		.preset:nth-child(even) {
			transform: none;
			animation-name: fadeUp;
		}
		.why-list {
			grid-template-columns: 1fr;
		}
		.closer-card {
			padding: 2.5rem 1.5rem;
		}
		.shapes-section,
		.physics-section,
		.glass-section,
		.sticky-section,
		.reveal-section,
		.distort-section,
		.play-section {
			padding: 2.5rem 1.5rem;
		}
		.shape-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.physics-grid,
		.glass-grid,
		.sticky-grid,
		.reveal-grid,
		.distort-grid {
			grid-template-columns: 1fr;
		}
		.playground-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 640px) {
		.page {
			padding: 1rem 1rem 3rem;
		}
		.hero-card {
			padding: 2.5rem 1.5rem;
			border-radius: 32px;
		}
		h1 {
			font-size: clamp(1.85rem, 7vw, 2.5rem);
		}
		.serif-heading {
			font-size: clamp(1.65rem, 6vw, 2.25rem);
		}
		.closer-card h2 {
			font-size: clamp(1.5rem, 5vw, 2rem);
		}
		.shape-grid {
			grid-template-columns: 1fr;
		}
		.shapes-section,
		.physics-section,
		.glass-section,
		.sticky-section,
		.reveal-section,
		.distort-section,
		.play-section {
			padding: 2rem 1.25rem;
			border-radius: 32px;
		}
		.panel-sub {
			margin: 0 0 1.75rem;
		}
		.why {
			padding: 2rem 1.25rem;
			border-radius: 32px;
		}
		.install-card,
		.usage-card {
			padding: 1.75rem 1.25rem;
			border-radius: 28px;
		}
		.closer-card {
			padding: 2rem 1.25rem;
			border-radius: 32px;
		}
		.playground-panel {
			padding: 1rem;
		}
		.knob-row {
			grid-template-columns: 6.5rem 1fr 2.5rem;
		}
	}

	@media (max-width: 480px) {
		.page {
			padding: 0.75rem 0.75rem 2.5rem;
			overflow-x: hidden;
		}
		.hero-card {
			padding: 2rem 1.1rem;
			border-radius: 28px;
		}
		h1 {
			font-size: clamp(1.6rem, 8vw, 2.1rem);
			max-width: none;
		}
		.tagline {
			font-size: 1rem;
		}
		.serif-heading {
			font-size: clamp(1.4rem, 7vw, 1.9rem);
		}
		.cta-row {
			flex-direction: column;
			align-items: stretch;
		}
		.cta-row .btn {
			width: 100%;
		}
		.btn {
			padding: 0.75rem 1.1rem;
			font-size: 0.9rem;
		}
		.snippet {
			flex-wrap: wrap;
			padding: 0.5rem;
		}
		.snippet code {
			font-size: 0.78rem;
		}
		.code {
			font-size: 0.72rem;
			padding: 1rem 1rem;
		}
		.preset-canvas,
		.shape-canvas,
		.physics-canvas,
		.glass-canvas,
		.sticky-canvas,
		.reveal-canvas,
		.distort-canvas {
			height: 220px;
		}
		.playground-canvas {
			height: 300px;
		}
		.shapes-section,
		.physics-section,
		.glass-section,
		.sticky-section,
		.reveal-section,
		.distort-section,
		.play-section,
		.why,
		.install-card,
		.usage-card,
		.closer-card {
			padding: 1.5rem 1rem;
			border-radius: 24px;
		}
		.preset {
			border-radius: 24px;
		}
		.arrow-hint {
			font-size: 0.85rem;
		}
		.knob-row {
			grid-template-columns: 5.5rem 1fr 2.25rem;
			gap: 0.4rem;
		}
		.knob-label,
		.knob-value {
			font-size: 0.72rem;
		}
		.preset-chip {
			font-size: 0.75rem;
			padding: 0.28rem 0.7rem;
		}
	}
</style>
