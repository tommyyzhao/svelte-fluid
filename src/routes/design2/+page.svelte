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

	let installTab = $state<'npm' | 'bun' | 'pnpm'>('npm');

	const installCmd = $derived(
		installTab === 'npm'
			? 'npm install svelte-fluid'
			: installTab === 'bun'
				? 'bun add svelte-fluid'
				: 'pnpm add svelte-fluid'
	);

	const usage = `<script>
  import { Fluid } from 'svelte-fluid';
<\/script>

<div style="width: 100%; height: 480px;">
  <Fluid seed={42} splatOnHover backColor={{ r: 245, g: 241, b: 234 }} />
</div>`;

	const features = [
		{ n: '01', t: 'Multi-instance', d: 'Many engines coexist on one page. No shared globals.' },
		{ n: '02', t: 'Resize-stable', d: 'Survives ResizeObserver storms. FBOs rebuild on stable size.' },
		{ n: '03', t: 'Deterministic seeding', d: 'A seed in. The same fluid out. Frame for frame.' },
		{ n: '04', t: 'MIT licensed', d: 'Derivative of PavelDoGreat. Use it. Ship it.' },
		{ n: '05', t: 'Zero runtime deps', d: 'Pure Svelte 5 and WebGL. Nothing else in your bundle.' },
		{ n: '06', t: '70+ configuration props', d: 'Bloom, sunrays, curl, dissipation, splat radius. All hot-swappable.' },
		{ n: '07', t: 'Ten built-in presets', d: 'Editorial fluid wallpaper out of the box.' }
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

	const paperColor: RGB = { r: 245, g: 241, b: 234 };

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
	<title>svelte-fluid — WebGL fluid as a Svelte 5 component</title>
</svelte:head>

<a class="competition-back" href="{base}/design-competition">← Competition</a>

<main class="page">
	<header class="hero">
		<div class="margin-mark">§ 00</div>
		<div class="kicker">A Svelte 5 component library / Issue No. 1</div>
		<h1 class="display">svelte<span class="dash">‑</span>fluid</h1>
		<h1 class="tagline">
			WebGL fluid simulation as a Svelte 5 component. Multi-instance, resize-stable,
			deterministic seeding.
		</h1>

		<div class="install-row">
			<div class="install-tabs">
				<button
					class="tab"
					class:active={installTab === 'npm'}
					onclick={() => (installTab = 'npm')}>NPM</button
				>
				<button
					class="tab"
					class:active={installTab === 'bun'}
					onclick={() => (installTab = 'bun')}>BUN</button
				>
				<button
					class="tab"
					class:active={installTab === 'pnpm'}
					onclick={() => (installTab = 'pnpm')}>PNPM</button
				>
			</div>
			<div class="install-box">
				<span class="prompt">↳</span>
				<code>{installCmd}</code>
			</div>
		</div>

		<nav class="hero-links">
			<a class="hero-link" href="https://github.com/tommyyzhao/svelte-fluid">→ GitHub</a>
			<a class="hero-link" href="{base}/docs">→ Documentation</a>
		</nav>
	</header>

	<section class="section index-section">
		<div class="section-head">
			<div class="margin-mark">§ 01</div>
			<h2 class="section-title">01. INDEX — A MANIFESTO</h2>
		</div>
		<ol class="manifesto">
			{#each features as f (f.n)}
				<li>
					<span class="num">{f.n}.</span>
					<span class="t">{f.t}</span>
					<span class="d">— {f.d}</span>
				</li>
			{/each}
		</ol>
	</section>

	<section class="section usage-section">
		<div class="section-head">
			<div class="margin-mark">§ 02</div>
			<h2 class="section-title">02. INSTALL — A MINIMUM</h2>
		</div>
		<div class="usage-grid">
			<pre class="snippet"><code>{usage}</code></pre>
			<div class="usage-preview">
				<div class="cell-label">PREVIEW</div>
				<div class="fluid-host"><Fluid seed={42} splatOnHover backColor={paperColor} /></div>
			</div>
		</div>
	</section>

	<section class="section quote-section">
		<div class="margin-mark">§ 03</div>
		<blockquote class="pull-quote">
			<span class="open-quote" aria-hidden="true">&ldquo;</span>
			<p>
				A seed in. The same fluid out. Frame for frame, render for render — pixels
				stable across reloads, machines, and time.
			</p>
			<footer class="quote-cite">— ON DETERMINISTIC SEEDING</footer>
		</blockquote>
	</section>

	<section class="section presets-section">
		<div class="section-head">
			<div class="margin-mark">§ 04</div>
			<h2 class="section-title">03. PRESETS — A SAMPLER</h2>
			<p class="section-sub">Six of ten. Each fills its parent. Each accepts a seed.</p>
		</div>
		<div class="preset-grid">
			<article class="preset-cell">
				<div class="cell-label">§ 04 / LAVA LAMP</div>
				<div class="cell-canvas"><LavaLamp seed={1} backColor={paperColor} aria-label="LavaLamp preset" /></div>
			</article>
			<article class="preset-cell">
				<div class="cell-label">§ 04 / PLASMA</div>
				<div class="cell-canvas"><Plasma seed={2} backColor={paperColor} aria-label="Plasma preset" /></div>
			</article>
			<article class="preset-cell">
				<div class="cell-label">§ 04 / INK IN WATER</div>
				<div class="cell-canvas">
					<InkInWater seed={3} lazy backColor={paperColor} aria-label="InkInWater preset" />
				</div>
			</article>
			<article class="preset-cell">
				<div class="cell-label">§ 04 / FROZEN SWIRL</div>
				<div class="cell-canvas">
					<FrozenSwirl seed={4} lazy backColor={paperColor} aria-label="FrozenSwirl preset" />
				</div>
			</article>
			<article class="preset-cell">
				<div class="cell-label">§ 04 / AURORA</div>
				<div class="cell-canvas"><Aurora seed={5} lazy backColor={paperColor} aria-label="Aurora preset" /></div>
			</article>
			<article class="preset-cell">
				<div class="cell-label">§ 04 / TOROIDAL TEMPEST</div>
				<div class="cell-canvas">
					<ToroidalTempest seed={6} lazy backColor={paperColor} aria-label="ToroidalTempest preset" />
				</div>
			</article>
		</div>
	</section>

	<section class="section invert-section">
		<div class="invert-grid">
			<div class="invert-text">
				<div class="margin-mark light">§ 05</div>
				<h2 class="invert-title">04. PLASMA — AFTER MIDNIGHT</h2>
				<p class="invert-body">
					Inverted, the fluid reads as type. Set against cream it argues with the
					page. Set against black it argues with the void. Same engine, two columns.
				</p>
				<a class="invert-link" href="{base}/docs">→ Read the docs</a>
			</div>
			<div class="invert-canvas">
				<Plasma seed={99} lazy aria-label="Plasma preset, inverted" />
			</div>
		</div>
	</section>

	<section class="section shapes-section">
		<div class="section-head">
			<div class="margin-mark">§ 06</div>
			<h2 class="section-title">05. SHAPES — A TYPOLOGY</h2>
			<p class="section-sub">Six primitives. Confine the dye. Hover to splat.</p>
		</div>
		<div class="shape-grid">
			<article class="shape-cell">
				<div class="cell-label">CIRCLE</div>
				<div class="shape-canvas">
					<CircularFluid seed={601} lazy backColor={paperColor} splatOnHover aria-label="Circle container shape" />
				</div>
			</article>
			<article class="shape-cell">
				<div class="cell-label">ROUNDED RECT</div>
				<div class="shape-canvas">
					<Fluid
						seed={602}
						colorful
						shading
						bloom
						splatOnHover
						initialSplatCount={15}
						containerShape={{ type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.42, halfH: 0.42, cornerRadius: 0.08 }}
						backColor={paperColor}
						lazy
						aria-label="Rounded rect container shape"
					/>
				</div>
			</article>
			<article class="shape-cell">
				<div class="cell-label">FRAME</div>
				<div class="shape-canvas">
					<FrameFluid seed={603} lazy backColor={paperColor} splatOnHover aria-label="Frame container shape" />
				</div>
			</article>
			<article class="shape-cell">
				<div class="cell-label">ANNULUS</div>
				<div class="shape-canvas">
					<AnnularFluid seed={604} lazy backColor={paperColor} splatOnHover aria-label="Annulus container shape" />
				</div>
			</article>
			<article class="shape-cell">
				<div class="cell-label">SVG PATH</div>
				<div class="shape-canvas">
					<Fluid
						seed={605}
						colorful
						shading
						bloom
						splatOnHover
						initialSplatCount={15}
						containerShape={{ type: 'svgPath', d: lightning, viewBox: [0, 0, 100, 100] }}
						backColor={paperColor}
						lazy
						aria-label="SVG path container shape"
					/>
				</div>
			</article>
			<article class="shape-cell">
				<div class="cell-label">TEXT GLYPH</div>
				<div class="shape-canvas">
					<Fluid
						seed={606}
						colorful
						shading
						bloom
						splatOnHover
						initialSplatCount={15}
						containerShape={{ type: 'svgPath', text: '&', font: '900 280px Georgia, serif' }}
						backColor={paperColor}
						lazy
						aria-label="Text glyph container shape"
					/>
				</div>
			</article>
		</div>
	</section>

	<section class="section physics-section">
		<div class="section-head">
			<div class="margin-mark">§ 07</div>
			<h2 class="section-title">06. PHYSICS — A STUDY</h2>
			<p class="section-sub">Every prop optional. Drop the tag; reach for props when you want your own physics.</p>
		</div>
		<div class="physics-grid">
			<article class="physics-cell">
				<div class="cell-label">DEFAULT</div>
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
			</article>
			<article class="physics-cell">
				<div class="cell-label">FLAT + SOFT</div>
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
			</article>
			<article class="physics-cell">
				<div class="cell-label">BOLD SPLATS</div>
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
			</article>
			<article class="physics-cell">
				<div class="cell-label">SLOW + TRANSPARENT</div>
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
			</article>
		</div>
	</section>

	<section class="section glass-section">
		<div class="section-head">
			<div class="margin-mark">§ 08</div>
			<h2 class="section-title">07. REFRACTION — A FOOTNOTE</h2>
			<p class="section-sub">A lens at the wall. Chromatic fringes at the edge. Pairs with any shape.</p>
		</div>
		<div class="glass-grid">
			<article class="glass-cell">
				<div class="cell-label">CRYSTAL ORB</div>
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
			</article>
			<article class="glass-cell">
				<div class="cell-label">SOFT LENS</div>
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
			</article>
			<article class="glass-cell">
				<div class="cell-label">PORTAL RING</div>
				<div class="glass-canvas">
					<Fluid
						seed={1313}
						lazy
						glass
						glassThickness={0.05}
						glassRefraction={0.6}
						glassReflectivity={0.15}
						glassChromatic={0.7}
						containerShape={{ type: 'annulus', cx: 0.5, cy: 0.5, innerRadius: 0.15, outerRadius: 0.42 }}
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
			</article>
			<article class="glass-cell">
				<div class="cell-label">GLASS FRAME</div>
				<div class="glass-canvas">
					<Fluid
						seed={1414}
						lazy
						glass
						glassThickness={0.06}
						glassRefraction={0.5}
						glassReflectivity={0.18}
						glassChromatic={0.4}
						containerShape={{ type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.22, halfH: 0.22, innerCornerRadius: 0.06, outerHalfW: 0.48, outerHalfH: 0.48, outerCornerRadius: 0.04 }}
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
			</article>
		</div>
	</section>

	<section class="section sticky-section">
		<div class="section-head">
			<div class="margin-mark">§ 09</div>
			<h2 class="section-title">08. LETTERFORMS — A STUDY</h2>
			<p class="section-sub">Dye accumulates inside the letterforms. Try the cursor.</p>
		</div>
		<div class="sticky-grid">
			<article class="sticky-cell">
				<div class="cell-label">GEIST · 900</div>
				<div class="sticky-canvas">
					<FluidStick
						text="FLUID"
						font="900 100px Georgia, serif"
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
			</article>
			<article class="sticky-cell">
				<div class="cell-label">GEORGIA · ∞</div>
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
			</article>
		</div>
	</section>

	<section class="section reveal-section">
		<div class="section-head">
			<div class="margin-mark">§ 10</div>
			<h2 class="section-title">09. REVEAL — A CURTAIN</h2>
			<p class="section-sub">The fluid serves as an opacity mask. Drag to uncover what lies beneath.</p>
		</div>
		<div class="reveal-grid">
			<article class="reveal-cell">
				<div class="cell-label">SCRATCH TO REVEAL</div>
				<div class="reveal-canvas">
					<FluidReveal lazy velocityDissipation={0.95} pressureIterations={10}>
						<div class="reveal-content">
							<span class="reveal-label">Revealed</span>
						</div>
					</FluidReveal>
				</div>
			</article>
			<article class="reveal-cell">
				<div class="cell-label">AUTO REVEAL</div>
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
						<div class="reveal-content reveal-content--dark">
							<span class="reveal-label reveal-label--light">Auto Reveal</span>
						</div>
					</FluidReveal>
				</div>
			</article>
		</div>
	</section>

	<section class="section distort-section">
		<div class="section-head">
			<div class="margin-mark">§ 11</div>
			<h2 class="section-title">10. DISTORTION — AN IMAGE</h2>
			<p class="section-sub">The velocity field warps the source image. Move the cursor across the plate.</p>
		</div>
		<div class="distort-grid">
			<article class="distort-cell">
				<div class="cell-label">SUBTLE · STRENGTH 0.3</div>
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
			</article>
			<article class="distort-cell">
				<div class="cell-label">STRONG · STRENGTH 0.45</div>
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
			</article>
		</div>
	</section>

	<section class="section close-section">
		<div class="section-head">
			<div class="margin-mark">§ 12</div>
			<h2 class="section-title">11. SPECIFICATIONS — A LEDGER</h2>
		</div>
		<dl class="spec-list">
			<div class="spec-row">
				<dt>License</dt>
				<dd>MIT</dd>
			</div>
			<div class="spec-row">
				<dt>Framework</dt>
				<dd>Svelte 5 (runes)</dd>
			</div>
			<div class="spec-row">
				<dt>Runtime dependencies</dt>
				<dd>Zero</dd>
			</div>
			<div class="spec-row">
				<dt>Configuration props</dt>
				<dd>70+</dd>
			</div>
			<div class="spec-row">
				<dt>Built-in presets</dt>
				<dd>10</dd>
			</div>
			<div class="spec-row">
				<dt>Source</dt>
				<dd>
					<a href="https://github.com/tommyyzhao/svelte-fluid">github.com/tommyyzhao/svelte-fluid</a>
				</dd>
			</div>
		</dl>
	</section>

	<section class="section playground-section">
		<div class="section-head">
			<div class="margin-mark">§ 13</div>
			<h2 class="section-title">12. PLAYGROUND — AN INSTRUMENT</h2>
			<p class="section-sub">Turn the knobs. The fluid responds in real time. Take the snippet with you.</p>
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
						<input type="range" min="0" max="50" step="1" bind:value={pgCurl} oninput={markCustomEdit} />
						<span class="knob-value">{pgCurl}</span>
					</label>
					<label class="knob-row">
						<span class="knob-label">splatRadius</span>
						<input type="range" min="0.05" max="1" step="0.01" bind:value={pgSplatRadius} oninput={markCustomEdit} />
						<span class="knob-value">{pgSplatRadius.toFixed(2)}</span>
					</label>
					<label class="knob-row">
						<span class="knob-label">splatForce</span>
						<input type="range" min="1000" max="9000" step="100" bind:value={pgSplatForce} oninput={markCustomEdit} />
						<span class="knob-value">{pgSplatForce}</span>
					</label>
					<label class="knob-row">
						<span class="knob-label">densityDissipation</span>
						<input type="range" min="0" max="1" step="0.01" bind:value={pgDensityDissipation} oninput={markCustomEdit} />
						<span class="knob-value">{pgDensityDissipation.toFixed(2)}</span>
					</label>
					<label class="knob-row">
						<span class="knob-label">velocityDissipation</span>
						<input type="range" min="0" max="1" step="0.01" bind:value={pgVelocityDissipation} oninput={markCustomEdit} />
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
						<input type="color" value={pgBackColorHex} oninput={onBackColorInput} aria-label="Background color" />
						<span class="knob-value mono">{pgBackColorHex}</span>
					</label>
				</div>

				<div class="snippet-head">
					<span>snippet</span>
					<button class="copy-btn" onclick={copySnippet} aria-label="Copy playground snippet">
						{copiedSnippet ? 'Copied!' : 'Copy'}
					</button>
				</div>
				<pre class="snippet-code"><code>{playgroundSnippet}</code></pre>
			</aside>
		</div>
	</section>

	<footer class="page-footer">
		<hr />
		<div class="footer-row">
			<div class="footer-left">SVELTE&nbsp;·&nbsp;FLUID</div>
			<div class="footer-mid">
				Derivative work of PavelDoGreat / WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017.
			</div>
			<div class="footer-right">M&nbsp;I&nbsp;T&nbsp;&nbsp;·&nbsp;&nbsp;2 0 2 6</div>
		</div>
	</footer>
</main>

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
		background: #f5f1ea;
	}

	.competition-back {
		position: fixed;
		top: 1rem;
		left: 1rem;
		z-index: 200;
		font-size: 0.75rem;
		font-weight: 500;
		letter-spacing: 0.05em;
		color: rgba(0, 0, 0, 0.55);
		text-decoration: none;
		background: rgba(245, 241, 234, 0.9);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: 4px;
		padding: 0.35rem 0.7rem;
		font-family: var(--mono, monospace);
		transition: color 0.15s;
	}
	.competition-back:hover {
		color: rgba(0, 0, 0, 0.85);
	}

	.page {
		--paper: #f5f1ea;
		--ink: #0a0a0a;
		--accent: #ff2d2d;
		background: var(--paper);
		color: var(--ink);
		font-family: ui-monospace, 'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace;
		font-size: 14px;
		line-height: 1.55;
		max-width: 1400px;
		margin: 0 auto;
		padding: 0 24px 0;
	}

	.margin-mark {
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 11px;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: var(--ink);
	}
	.margin-mark.light {
		color: var(--paper);
	}

	.hero {
		border-bottom: 2px solid var(--ink);
		padding: 32px 0 56px;
		position: relative;
	}

	.kicker {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.3em;
		border-top: 2px solid var(--ink);
		border-bottom: 2px solid var(--ink);
		padding: 6px 0;
		margin: 12px 0 32px;
	}

	.display {
		font-family: 'Times New Roman', Georgia, 'Playfair Display', serif;
		font-weight: 900;
		font-size: clamp(4rem, 13vw, 12rem);
		line-height: 0.88;
		letter-spacing: -0.04em;
		margin: 0;
	}
	.display .dash {
		letter-spacing: -0.12em;
		color: var(--accent);
	}

	.tagline {
		font-size: clamp(1rem, 1.4vw, 1.25rem);
		max-width: 640px;
		margin: 28px 0 36px;
	}

	.install-row {
		display: flex;
		align-items: stretch;
		gap: 0;
		max-width: 640px;
	}
	.install-tabs {
		display: flex;
		border: 2px solid var(--ink);
		border-right: 0;
	}
	.tab {
		background: var(--paper);
		color: var(--ink);
		border: 0;
		border-right: 2px solid var(--ink);
		padding: 0 14px;
		font: inherit;
		font-size: 11px;
		letter-spacing: 0.2em;
		cursor: pointer;
	}
	.tab:last-child {
		border-right: 0;
	}
	.tab.active {
		background: var(--ink);
		color: var(--paper);
	}
	.install-box {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 10px;
		border: 2px solid var(--ink);
		padding: 8px 14px;
		background: var(--paper);
		font-size: 14px;
	}
	.install-box .prompt {
		color: var(--accent);
	}

	.hero-links {
		margin-top: 32px;
		display: flex;
		gap: 32px;
		font-size: 13px;
	}
	.hero-link {
		color: var(--ink);
		text-decoration: none;
		border-bottom: 2px solid var(--ink);
		padding-bottom: 2px;
	}
	.hero-link:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	.section {
		border-bottom: 2px solid var(--ink);
		padding: 56px 0;
	}
	.section-head {
		margin-bottom: 32px;
	}
	.section-title {
		font-family: 'Times New Roman', Georgia, serif;
		font-weight: 900;
		font-size: clamp(2rem, 5vw, 4rem);
		line-height: 1;
		letter-spacing: -0.02em;
		margin: 8px 0 0;
	}
	.section-sub {
		margin: 12px 0 0;
		max-width: 540px;
	}

	.manifesto {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 2px solid var(--ink);
	}
	.manifesto li {
		display: grid;
		grid-template-columns: 64px 240px 1fr;
		gap: 16px;
		align-items: baseline;
		padding: 16px 0;
		border-bottom: 2px solid var(--ink);
	}
	.manifesto .num {
		font-weight: 700;
		color: var(--accent);
	}
	.manifesto .t {
		text-transform: uppercase;
		letter-spacing: 0.15em;
		font-weight: 700;
		font-size: 13px;
	}
	.manifesto .d {
		font-size: 14px;
	}

	.usage-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		border: 2px solid var(--ink);
	}
	.snippet {
		margin: 0;
		padding: 20px;
		border-right: 2px solid var(--ink);
		background: var(--paper);
		overflow-x: auto;
		font-size: 13px;
		line-height: 1.6;
	}
	.usage-preview {
		display: flex;
		flex-direction: column;
	}
	.cell-label {
		font-size: 10px;
		letter-spacing: 0.25em;
		text-transform: uppercase;
		padding: 8px 12px;
		border-bottom: 2px solid var(--ink);
		background: var(--paper);
	}
	.fluid-host {
		flex: 1;
		min-height: 320px;
		position: relative;
	}

	.quote-section {
		padding: 80px 0;
	}
	.pull-quote {
		margin: 0;
		max-width: 980px;
		position: relative;
		padding-left: 120px;
	}
	.open-quote {
		font-family: 'Times New Roman', Georgia, serif;
		font-weight: 900;
		font-size: clamp(8rem, 16vw, 14rem);
		line-height: 0.7;
		color: var(--accent);
		position: absolute;
		left: 0;
		top: -10px;
	}
	.pull-quote p {
		font-family: 'Times New Roman', Georgia, serif;
		font-style: italic;
		font-weight: 500;
		font-size: clamp(1.5rem, 3.2vw, 2.6rem);
		line-height: 1.2;
		margin: 0;
	}
	.quote-cite {
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-style: normal;
		font-size: 11px;
		letter-spacing: 0.3em;
		margin-top: 24px;
	}

	.preset-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		border: 2px solid var(--ink);
	}
	.preset-cell {
		display: flex;
		flex-direction: column;
		border-right: 2px solid var(--ink);
		border-bottom: 2px solid var(--ink);
	}
	.preset-cell:nth-child(3n) {
		border-right: 0;
	}
	.preset-cell:nth-child(n + 4) {
		border-bottom: 0;
	}
	.cell-canvas {
		height: 360px;
		position: relative;
	}

	.invert-section {
		background: var(--ink);
		color: var(--paper);
		padding: 0;
		border-bottom: 2px solid var(--ink);
		margin: 0 -24px;
	}
	.invert-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
	}
	.invert-text {
		padding: 64px 56px;
		border-right: 2px solid var(--paper);
	}
	.invert-title {
		font-family: 'Times New Roman', Georgia, serif;
		font-weight: 900;
		font-size: clamp(2.4rem, 5.5vw, 4.5rem);
		line-height: 1;
		letter-spacing: -0.02em;
		margin: 24px 0 24px;
	}
	.invert-body {
		max-width: 480px;
		font-size: 15px;
		line-height: 1.6;
	}
	.invert-link {
		display: inline-block;
		margin-top: 32px;
		color: var(--paper);
		text-decoration: none;
		border-bottom: 2px solid var(--accent);
		padding-bottom: 2px;
	}
	.invert-canvas {
		min-height: 480px;
		position: relative;
	}

	/* Shapes */
	.shape-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		border: 2px solid var(--ink);
	}
	.shape-cell {
		display: flex;
		flex-direction: column;
		border-right: 2px solid var(--ink);
		border-bottom: 2px solid var(--ink);
	}
	.shape-cell:nth-child(3n) {
		border-right: 0;
	}
	.shape-cell:nth-child(n + 4) {
		border-bottom: 0;
	}
	.shape-canvas {
		height: 300px;
		position: relative;
	}

	/* Physics */
	.physics-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		border: 2px solid var(--ink);
	}
	.physics-cell {
		display: flex;
		flex-direction: column;
		border-right: 2px solid var(--ink);
	}
	.physics-cell:last-child {
		border-right: 0;
	}
	.physics-canvas {
		height: 300px;
		position: relative;
	}
	.physics-snippet {
		font-size: 10px;
		letter-spacing: 0.05em;
		padding: 8px 12px;
		border-top: 2px solid var(--ink);
		background: var(--paper);
		word-break: break-all;
		white-space: pre-wrap;
	}

	/* Glass */
	.glass-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		border: 2px solid var(--ink);
	}
	.glass-cell {
		display: flex;
		flex-direction: column;
		border-right: 2px solid var(--ink);
	}
	.glass-cell:last-child {
		border-right: 0;
	}
	.glass-canvas {
		height: 340px;
		position: relative;
		background: var(--paper);
	}

	/* Sticky */
	.sticky-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		border: 2px solid var(--ink);
	}
	.sticky-cell {
		display: flex;
		flex-direction: column;
		border-right: 2px solid var(--ink);
	}
	.sticky-cell:last-child {
		border-right: 0;
	}
	.sticky-canvas {
		height: 340px;
		position: relative;
	}

	/* Reveal */
	.reveal-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		border: 2px solid var(--ink);
	}
	.reveal-cell {
		display: flex;
		flex-direction: column;
		border-right: 2px solid var(--ink);
	}
	.reveal-cell:last-child {
		border-right: 0;
	}
	.reveal-canvas {
		height: 340px;
		position: relative;
	}
	.reveal-content {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		background: linear-gradient(135deg, #f5f1ea 0%, #e8dfd0 100%);
	}
	.reveal-content--dark {
		background: linear-gradient(135deg, #0a0e1a 0%, #0d1833 100%);
	}
	.reveal-label {
		font-family: 'Times New Roman', Georgia, serif;
		font-size: 1.5rem;
		font-style: italic;
		color: var(--ink);
	}
	.reveal-label--light {
		color: rgba(255, 255, 255, 0.9);
	}

	/* Distortion */
	.distort-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		border: 2px solid var(--ink);
	}
	.distort-cell {
		display: flex;
		flex-direction: column;
		border-right: 2px solid var(--ink);
	}
	.distort-cell:last-child {
		border-right: 0;
	}
	.distort-canvas {
		height: 340px;
		position: relative;
	}

	/* Playground */
	.playground-section {
		border-bottom: 2px solid var(--ink);
	}
	.preset-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 24px;
	}
	.preset-chip {
		background: var(--paper);
		color: var(--ink);
		border: 2px solid var(--ink);
		padding: 4px 12px;
		font: inherit;
		font-size: 11px;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		cursor: pointer;
		transition: background 0.1s, color 0.1s;
	}
	.preset-chip:hover,
	.preset-chip.active {
		background: var(--ink);
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
		border: 2px solid var(--ink);
		gap: 0;
	}
	.playground-canvas {
		min-height: 480px;
		position: relative;
		border-right: 2px solid var(--ink);
	}
	.playground-panel {
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		overflow-y: auto;
		max-height: 600px;
	}
	.knob-group {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.knob-group-title {
		font-size: 10px;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		font-weight: 700;
		border-bottom: 1px solid var(--ink);
		padding-bottom: 4px;
	}
	.knob-row {
		display: grid;
		grid-template-columns: 130px 1fr 48px;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}
	.knob-label {
		font-size: 11px;
		letter-spacing: 0.05em;
	}
	.knob-value {
		font-size: 11px;
		text-align: right;
	}
	.knob-value.mono {
		font-family: ui-monospace, 'JetBrains Mono', monospace;
	}
	input[type='range'] {
		width: 100%;
		accent-color: var(--ink);
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
		height: 16px;
		background: rgba(0, 0, 0, 0.15);
		border: 1.5px solid var(--ink);
		border-radius: 8px;
		position: relative;
		transition: background 0.15s;
		flex-shrink: 0;
	}
	.toggle-pill::after {
		content: '';
		position: absolute;
		top: 1px;
		left: 1px;
		width: 10px;
		height: 10px;
		background: var(--ink);
		border-radius: 50%;
		transition: transform 0.15s;
	}
	.toggle-row input[type='checkbox']:checked ~ .toggle-pill {
		background: var(--ink);
	}
	.toggle-row input[type='checkbox']:checked ~ .toggle-pill::after {
		transform: translateX(16px);
		background: var(--paper);
	}
	.color-row {
		display: flex;
		align-items: center;
		gap: 10px;
		cursor: pointer;
	}
	.color-row input[type='color'] {
		width: 32px;
		height: 24px;
		border: 1.5px solid var(--ink);
		padding: 1px;
		background: none;
		cursor: pointer;
	}
	.snippet-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 10px;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		border-bottom: 1px solid var(--ink);
		padding-bottom: 4px;
	}
	.copy-btn {
		background: var(--paper);
		color: var(--ink);
		border: 1.5px solid var(--ink);
		padding: 2px 8px;
		font: inherit;
		font-size: 10px;
		letter-spacing: 0.1em;
		cursor: pointer;
	}
	.copy-btn:hover {
		background: var(--ink);
		color: var(--paper);
	}
	.snippet-code {
		margin: 0;
		font-size: 11px;
		line-height: 1.6;
		white-space: pre-wrap;
		word-break: break-all;
		background: var(--paper);
	}

	/* Specs */
	.spec-list {
		margin: 0;
		padding: 0;
		border-top: 2px solid var(--ink);
	}
	.spec-row {
		display: grid;
		grid-template-columns: 280px 1fr;
		gap: 24px;
		padding: 14px 0;
		border-bottom: 2px solid var(--ink);
	}
	.spec-row dt {
		text-transform: uppercase;
		letter-spacing: 0.2em;
		font-size: 11px;
		font-weight: 700;
	}
	.spec-row dd {
		margin: 0;
		font-size: 14px;
	}
	.spec-row a {
		color: var(--accent);
		text-decoration: none;
		border-bottom: 1px solid var(--accent);
	}

	.page-footer {
		padding: 40px 0 64px;
	}
	.page-footer hr {
		border: 0;
		border-top: 2px solid var(--ink);
		margin: 0 0 24px;
	}
	.footer-row {
		display: grid;
		grid-template-columns: 1fr 2fr 1fr;
		gap: 24px;
		font-size: 11px;
		letter-spacing: 0.2em;
		text-transform: uppercase;
	}
	.footer-mid {
		text-align: center;
		text-transform: none;
		letter-spacing: 0.05em;
		font-size: 11px;
	}
	.footer-right {
		text-align: right;
	}

	@media (max-width: 900px) {
		.usage-grid,
		.preset-grid,
		.invert-grid {
			grid-template-columns: 1fr;
		}
		.snippet {
			border-right: 0;
			border-bottom: 2px solid var(--ink);
		}
		.preset-cell {
			border-right: 0;
		}
		.preset-cell:nth-child(n) {
			border-bottom: 2px solid var(--ink);
		}
		.preset-cell:last-child {
			border-bottom: 0;
		}
		.invert-text {
			border-right: 0;
			border-bottom: 2px solid var(--paper);
			padding: 40px 24px;
		}
		.manifesto li {
			grid-template-columns: 48px 1fr;
		}
		.manifesto .d {
			grid-column: 1 / -1;
			padding-left: 64px;
		}
		.pull-quote {
			padding-left: 64px;
		}
		.spec-row {
			grid-template-columns: 1fr;
			gap: 4px;
		}
		.footer-row {
			grid-template-columns: 1fr;
			text-align: left;
		}
		.footer-mid,
		.footer-right {
			text-align: left;
		}
		.shape-grid,
		.physics-grid,
		.glass-grid,
		.sticky-grid,
		.reveal-grid,
		.distort-grid {
			grid-template-columns: 1fr;
		}
		.shape-cell,
		.physics-cell,
		.glass-cell,
		.sticky-cell,
		.reveal-cell,
		.distort-cell {
			border-right: 0;
			border-bottom: 2px solid var(--ink);
		}
		.shape-cell:last-child,
		.physics-cell:last-child,
		.glass-cell:last-child,
		.sticky-cell:last-child,
		.reveal-cell:last-child,
		.distort-cell:last-child {
			border-bottom: 0;
		}
		.playground-grid {
			grid-template-columns: 1fr;
		}
		.playground-canvas {
			border-right: 0;
			border-bottom: 2px solid var(--ink);
		}
	}

	@media (max-width: 640px) {
		.page {
			font-size: 13px;
			padding: 0 16px;
		}
		.display {
			font-size: clamp(3rem, 16vw, 6rem);
		}
		.tagline {
			font-size: 1rem;
			margin: 20px 0 28px;
		}
		.section {
			padding: 40px 0;
		}
		.section-title {
			font-size: clamp(1.6rem, 7vw, 2.4rem);
		}
		.invert-title {
			font-size: clamp(1.8rem, 7.5vw, 2.6rem);
		}
		.shape-grid,
		.physics-grid,
		.glass-grid,
		.preset-grid,
		.reveal-grid,
		.distort-grid,
		.sticky-grid {
			grid-template-columns: 1fr;
		}
		.open-quote {
			font-size: clamp(5rem, 18vw, 8rem);
		}
		.pull-quote {
			padding-left: 48px;
		}
		.pull-quote p {
			font-size: clamp(1.2rem, 4.5vw, 1.8rem);
		}
		.invert-text {
			padding: 32px 20px;
		}
		.cell-canvas,
		.shape-canvas,
		.physics-canvas,
		.glass-canvas,
		.sticky-canvas,
		.reveal-canvas,
		.distort-canvas {
			height: 260px;
		}
		.playground-canvas {
			min-height: 360px;
		}
		.invert-canvas {
			min-height: 360px;
		}
	}

	@media (max-width: 480px) {
		.page {
			padding: 0 12px;
		}
		.section {
			padding: 32px 0;
		}
		.hero {
			padding: 24px 0 40px;
		}
		.kicker {
			font-size: 10px;
			letter-spacing: 0.22em;
			margin: 10px 0 24px;
		}
		.margin-mark {
			font-size: 10px;
			letter-spacing: 0.12em;
		}
		.knob-group-title,
		.cell-label,
		.physics-snippet,
		.snippet-head {
			font-size: 9px;
			letter-spacing: 0.18em;
		}
		.install-row {
			flex-direction: column;
		}
		.install-tabs {
			border-right: 2px solid var(--ink);
			border-bottom: 0;
		}
		.install-box {
			border-top: 0;
		}
		.hero-links {
			gap: 20px;
			flex-wrap: wrap;
		}
		.manifesto li {
			grid-template-columns: 36px 1fr;
			padding: 12px 0;
		}
		.manifesto .d {
			padding-left: 48px;
		}
		.knob-row {
			grid-template-columns: 100px 1fr 40px;
		}
		.playground-panel {
			padding: 16px;
			max-height: none;
		}
		.snippet {
			padding: 14px;
			font-size: 12px;
		}
		.section-head {
			margin-bottom: 20px;
		}
	}
</style>
