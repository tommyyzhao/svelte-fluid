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

	let installTab = $state<'npm' | 'bun' | 'pnpm'>('bun');

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
  <Fluid seed={42} curl={50} colorful bloom splatOnHover />
</div>`;

	const features = [
		{ n: '01', t: 'Multi-instance', d: 'Many engines on one page. No globals. No collisions.' },
		{ n: '02', t: 'Resize-stable', d: 'Survives ResizeObserver storms. FBOs rebuild on calm.' },
		{ n: '03', t: 'Deterministic seed', d: 'Same seed in. Same vortex out. Frame for frame.' },
		{ n: '04', t: 'MIT', d: 'Take it. Twist it. Ship it.' },
		{ n: '05', t: 'Zero deps', d: 'Pure Svelte 5 + WebGL. Nothing else in the bundle.' },
		{ n: '06', t: '70+ props', d: 'Curl, dissipation, bloom, splat. All hot-swappable.' },
		{ n: '07', t: 'Ten presets', d: 'Plug-and-play vortices. Drop them in.' }
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

	const pageColor: RGB = { r: 58, g: 31, b: 92 };
	const surfaceColor: RGB = { r: 74, g: 42, b: 114 };

	const PLAYGROUND_DEFAULTS = {
		curl: 50,
		splatRadius: 0.25,
		splatForce: 6000,
		densityDissipation: 1.0,
		velocityDissipation: 0.2,
		bloom: true,
		shading: true,
		colorful: true,
		backColor: { ...surfaceColor } as RGB
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
	<title>svelte-fluid // VORTEX</title>
</svelte:head>

<a class="competition-back" href="{base}/design-competition">← Competition</a>

<main class="page">
	<header class="hero">
		<div class="hero-bg" aria-hidden="true">
			<Fluid
				seed={1909}
				colorful
				curl={50}
				bloom
				bloomIntensity={1.6}
				splatRadius={0.32}
				densityDissipation={0.3}
				velocityDissipation={0.08}
				initialSplatCount={28}
				autoSplatRate={stickyAutoAnimate ? 1.6 : 0}
				autoSplatSwirl={550}
				autoSplatBandHeight={1.6}
				backColor={pageColor}
			/>
		</div>
		<div class="hero-scrim" aria-hidden="true"></div>
		<div class="hero-inner">
			<div class="kicker">// VORTEX // ISSUE 019 // RAVE EDITION</div>
			<h1 class="display">FLUID<span class="slash">//</span>SVELTE</h1>
			<p class="tagline">
				WebGL Navier–Stokes for Svelte 5. Spin the field. Bend the light. Mask the type.
			</p>

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
					<span class="prompt">$</span>
					<code>{installCmd}</code>
				</div>
			</div>

			<nav class="hero-links">
				<a class="cta cta-fill" href="{base}/docs">ENTER THE DOCS &rarr;</a>
				<a class="cta cta-out" href="https://github.com/tommyyzhao/svelte-fluid">GITHUB &rarr;</a>
			</nav>

			<ul class="pill-row">
				<li class="pill">SVELTE 5</li>
				<li class="pill">WEBGL</li>
				<li class="pill">MIT</li>
				<li class="pill">ZERO DEPS</li>
				<li class="pill">70+ PROPS</li>
				<li class="pill">10 PRESETS</li>
			</ul>
		</div>
	</header>

	<section class="section index-section">
		<div class="section-head">
			<div class="margin-mark">// 01 — INDEX</div>
			<h2 class="section-title">SEVEN VECTORS</h2>
			<p class="section-sub">Manifesto, in seven turns.</p>
		</div>
		<ol class="manifesto">
			{#each features as f (f.n)}
				<li>
					<span class="num">{f.n}</span>
					<span class="t">{f.t}</span>
					<span class="d">— {f.d}</span>
				</li>
			{/each}
		</ol>
	</section>

	<section class="section usage-section">
		<div class="section-head">
			<div class="margin-mark">// 02 — INSTALL &amp; USAGE</div>
			<h2 class="section-title">DROP THE TAG</h2>
			<p class="section-sub">One import. One tag. One vortex.</p>
		</div>
		<div class="usage-grid">
			<pre class="snippet"><code>{usage}</code></pre>
			<div class="usage-preview">
				<div class="cell-label">// LIVE</div>
				<div class="fluid-host">
					<Fluid
						seed={42}
						colorful
						curl={50}
						bloom
						bloomIntensity={1.5}
						splatOnHover
						initialSplatCount={20}
						backColor={surfaceColor}
						lazy
					/>
				</div>
			</div>
		</div>
	</section>

	<section class="section presets-section">
		<div class="section-head">
			<div class="margin-mark">// 03 — PRESETS</div>
			<h2 class="section-title">VINYL SINGLES</h2>
			<p class="section-sub">Six of ten. Each preset adapts to the room you patch it into.</p>
		</div>
		<div class="preset-grid">
			<article class="preset-cell">
				<div class="cell-label">// LAVALAMP</div>
				<div class="cell-canvas">
					<LavaLamp seed={11} backColor={surfaceColor} aria-label="LavaLamp preset" />
				</div>
			</article>
			<article class="preset-cell">
				<div class="cell-label">// PLASMA</div>
				<div class="cell-canvas">
					<Plasma seed={22} backColor={surfaceColor} aria-label="Plasma preset" />
				</div>
			</article>
			<article class="preset-cell">
				<div class="cell-label">// INK IN WATER</div>
				<div class="cell-canvas">
					<InkInWater seed={33} lazy backColor={surfaceColor} aria-label="InkInWater preset" />
				</div>
			</article>
			<article class="preset-cell">
				<div class="cell-label">// FROZEN SWIRL</div>
				<div class="cell-canvas">
					<FrozenSwirl seed={44} lazy backColor={surfaceColor} aria-label="FrozenSwirl preset" />
				</div>
			</article>
			<article class="preset-cell">
				<div class="cell-label">// AURORA</div>
				<div class="cell-canvas">
					<Aurora seed={55} lazy backColor={surfaceColor} aria-label="Aurora preset" />
				</div>
			</article>
			<article class="preset-cell">
				<div class="cell-label">// TOROIDAL TEMPEST</div>
				<div class="cell-canvas">
					<ToroidalTempest seed={66} lazy backColor={surfaceColor} aria-label="ToroidalTempest preset" />
				</div>
			</article>
		</div>
	</section>

	<section class="section shapes-section">
		<div class="section-head">
			<div class="margin-mark">>> SHAPES</div>
			<h2 class="section-title">CONFINE THE FIELD</h2>
			<p class="section-sub">Six containers. Hover to splat. Watch the dye crash the wall.</p>
		</div>
		<div class="shape-grid">
			<article class="shape-cell">
				<div class="cell-label">// CIRCLE</div>
				<div class="shape-canvas">
					<CircularFluid seed={601} lazy backColor={surfaceColor} splatOnHover aria-label="Circle container shape" />
				</div>
			</article>
			<article class="shape-cell">
				<div class="cell-label">// ROUNDED RECT</div>
				<div class="shape-canvas">
					<Fluid
						seed={602}
						colorful
						curl={50}
						shading
						bloom
						splatOnHover
						initialSplatCount={15}
						containerShape={{ type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.42, halfH: 0.42, cornerRadius: 0.08 }}
						backColor={surfaceColor}
						lazy
						aria-label="Rounded rect container shape"
					/>
				</div>
			</article>
			<article class="shape-cell">
				<div class="cell-label">// FRAME</div>
				<div class="shape-canvas">
					<FrameFluid seed={603} lazy backColor={surfaceColor} splatOnHover aria-label="Frame container shape" />
				</div>
			</article>
			<article class="shape-cell">
				<div class="cell-label">// ANNULUS</div>
				<div class="shape-canvas">
					<AnnularFluid seed={604} lazy backColor={surfaceColor} splatOnHover aria-label="Annulus container shape" />
				</div>
			</article>
			<article class="shape-cell">
				<div class="cell-label">// LIGHTNING</div>
				<div class="shape-canvas">
					<Fluid
						seed={605}
						colorful
						curl={50}
						shading
						bloom
						splatOnHover
						initialSplatCount={15}
						containerShape={{ type: 'svgPath', d: lightning, viewBox: [0, 0, 100, 100] }}
						backColor={surfaceColor}
						lazy
						aria-label="Lightning bolt container shape"
					/>
				</div>
			</article>
			<article class="shape-cell">
				<div class="cell-label">// INFINITY</div>
				<div class="shape-canvas">
					<Fluid
						seed={606}
						colorful
						curl={50}
						shading
						bloom
						splatOnHover
						initialSplatCount={15}
						containerShape={{ type: 'svgPath', text: '∞', font: '200px Georgia, serif' }}
						backColor={surfaceColor}
						lazy
						aria-label="Infinity glyph container shape"
					/>
				</div>
			</article>
		</div>
	</section>

	<section class="section physics-section">
		<div class="section-head">
			<div class="margin-mark">// PHYSICS</div>
			<h2 class="section-title">ROTATE THE FIELD</h2>
			<p class="section-sub">Crank the curl. Choke the dissipation. Same engine, four moods.</p>
		</div>
		<div class="physics-grid">
			<article class="physics-cell">
				<div class="cell-label">// DEFAULT</div>
				<div class="physics-canvas">
					<Fluid
						seed={1234}
						initialSplatCount={12}
						splatOnHover
						backColor={surfaceColor}
						lazy
						aria-label="Default fluid configuration"
					/>
				</div>
				<code class="physics-snippet">{'<Fluid />'}</code>
			</article>
			<article class="physics-cell">
				<div class="cell-label">// SWIRLY</div>
				<div class="physics-canvas">
					<Fluid
						seed={5678}
						curl={50}
						velocityDissipation={0.05}
						colorful
						initialSplatCount={14}
						splatOnHover
						backColor={surfaceColor}
						lazy
						aria-label="Swirly fluid with high curl"
					/>
				</div>
				<code class="physics-snippet">{'curl={50} velocityDissipation={0.05}'}</code>
			</article>
			<article class="physics-cell">
				<div class="cell-label">// BOLD SPLATS</div>
				<div class="physics-canvas">
					<Fluid
						seed={9012}
						splatRadius={0.8}
						splatForce={9000}
						initialSplatCount={8}
						splatOnHover
						backColor={surfaceColor}
						lazy
						aria-label="Fluid with large bold splats"
					/>
				</div>
				<code class="physics-snippet">{'splatRadius={0.8} splatForce={9000}'}</code>
			</article>
			<article class="physics-cell">
				<div class="cell-label">// SLOW + CLEAR</div>
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
				<code class="physics-snippet">{'velocityDissipation={0.05} transparent'}</code>
			</article>
		</div>
	</section>

	<section class="section glass-section">
		<div class="section-head">
			<div class="margin-mark">// GLASS</div>
			<h2 class="section-title">BEND THE LIGHT</h2>
			<p class="section-sub">Refraction at the wall. Chromatic fringes at the edge. Pairs with any shape.</p>
		</div>
		<div class="glass-grid">
			<article class="glass-cell">
				<div class="cell-label">// CRYSTAL ORB</div>
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
						backColor={surfaceColor}
						colorful
						curl={50}
						densityDissipation={0.15}
						velocityDissipation={0.06}
						splatRadius={0.38}
						splatForce={5000}
						shading
						bloom
						sunrays={false}
						initialSplatCount={12}
						autoSplatRate={stickyAutoAnimate ? 2.5 : 0}
						autoSplatCenterY={0.5}
						autoSplatBandHeight={0.8}
						autoSplatSwirl={500}
						splatOnHover
						aria-label="Crystal orb glass demo"
					/>
				</div>
			</article>
			<article class="glass-cell">
				<div class="cell-label">// SOFT LENS</div>
				<div class="glass-canvas">
					<Fluid
						seed={1212}
						lazy
						glass
						glassRefraction={0.25}
						glassReflectivity={0.06}
						glassChromatic={0.1}
						containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 }}
						backColor={surfaceColor}
						colorful
						curl={50}
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
				<div class="cell-label">// PORTAL RING</div>
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
						backColor={surfaceColor}
						colorful
						curl={50}
						densityDissipation={0.3}
						velocityDissipation={0.1}
						splatRadius={0.3}
						splatForce={5000}
						shading
						bloom
						sunrays={false}
						initialSplatCount={10}
						autoSplatRate={stickyAutoAnimate ? 2.5 : 0}
						autoSplatCenterY={0.5}
						autoSplatBandHeight={0.6}
						autoSplatSwirl={400}
						splatOnHover
						aria-label="Portal ring glass demo"
					/>
				</div>
			</article>
			<article class="glass-cell">
				<div class="cell-label">// GLASS FRAME</div>
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
						backColor={surfaceColor}
						colorful
						curl={50}
						densityDissipation={0.25}
						velocityDissipation={0.1}
						splatRadius={0.35}
						splatForce={5000}
						shading
						bloom
						bloomIntensity={1.0}
						sunrays={false}
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
			</article>
		</div>
	</section>

	<section class="section sticky-section">
		<div class="section-head">
			<div class="margin-mark">// STICKY</div>
			<h2 class="section-title">MASK THE TYPE</h2>
			<p class="section-sub">Dye accumulates inside the letterforms. Drag the cursor across the glyphs.</p>
		</div>
		<div class="sticky-grid">
			<article class="sticky-cell">
				<div class="cell-label">// VORTEX · 900</div>
				<div class="sticky-canvas">
					<FluidStick
						text="VORTEX"
						font="900 100px 'Inter', system-ui, sans-serif"
						seed={211}
						autoAnimate={stickyAutoAnimate}
						autoAnimateDuration={3}
						colorful
						shading
						bloom={false}
						densityDissipation={0.92}
						splatRadius={0.18}
						backColor={surfaceColor}
						lazy
					/>
				</div>
			</article>
			<article class="sticky-cell">
				<div class="cell-label">// GEORGIA · ∞</div>
				<div class="sticky-canvas">
					<FluidStick
						text="∞"
						font="200px Georgia, serif"
						seed={222}
						autoAnimate={stickyAutoAnimate}
						autoAnimateDuration={3}
						colorful
						shading
						bloom={false}
						densityDissipation={0.92}
						splatRadius={0.18}
						backColor={surfaceColor}
						lazy
					/>
				</div>
			</article>
		</div>
	</section>

	<section class="section reveal-section">
		<div class="section-head">
			<div class="margin-mark">// REVEAL</div>
			<h2 class="section-title">SCRATCH THE SURFACE</h2>
			<p class="section-sub">The fluid serves as an opacity mask. Drag to uncover what lies beneath.</p>
		</div>
		<div class="reveal-grid">
			<article class="reveal-cell">
				<div class="cell-label">// SCRATCH</div>
				<div class="reveal-canvas">
					<FluidReveal
						lazy
						velocityDissipation={0.95}
						pressureIterations={10}
						coverColor={{ r: 0.227, g: 0.122, b: 0.36 }}
						fringeColor={{ r: 1.0, g: 0.23, b: 0.64 }}
						accentColor={{ r: 0.48, g: 1.0, b: 0.54 }}
					>
						<div class="reveal-content">
							<span class="reveal-label">REVEALED</span>
						</div>
					</FluidReveal>
				</div>
			</article>
			<article class="reveal-cell">
				<div class="cell-label">// AUTO</div>
				<div class="reveal-canvas">
					<FluidReveal
						lazy
						autoReveal={stickyAutoAnimate}
						autoRevealSpeed={0.8}
						fadeBack={false}
						velocityDissipation={0.95}
						sensitivity={0.15}
						coverColor={{ r: 0.227, g: 0.122, b: 0.36 }}
						fringeColor={{ r: 1.0, g: 0.23, b: 0.64 }}
						accentColor={{ r: 0.48, g: 1.0, b: 0.54 }}
					>
						<div class="reveal-content">
							<span class="reveal-label">AUTO REVEAL</span>
						</div>
					</FluidReveal>
				</div>
			</article>
		</div>
	</section>

	<section class="section distort-section">
		<div class="section-head">
			<div class="margin-mark">// DISTORTION</div>
			<h2 class="section-title">WARP THE WORLD</h2>
			<p class="section-sub">The velocity field warps the source. Drag across the plate.</p>
		</div>
		<div class="distort-grid">
			<article class="distort-cell">
				<div class="cell-label">// SUBTLE · 0.30</div>
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
				<div class="cell-label">// STRONG · 0.45</div>
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

	<section class="section playground-section">
		<div class="section-head">
			<div class="margin-mark">// 11 — PLAYGROUND</div>
			<h2 class="section-title">TURN THE KNOBS</h2>
			<p class="section-sub">Real-time props. Take the snippet with you.</p>
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
					<div class="knob-group-title">// PHYSICS</div>
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
					<div class="knob-group-title">// VISUALS</div>
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
					<div class="knob-group-title">// BACKGROUND</div>
					<label class="color-row">
						<span class="knob-label">backColor</span>
						<input type="color" value={pgBackColorHex} oninput={onBackColorInput} aria-label="Background color" />
						<span class="knob-value mono">{pgBackColorHex}</span>
					</label>
				</div>

				<div class="snippet-head">
					<span>// SNIPPET</span>
					<button class="copy-btn" onclick={copySnippet} aria-label="Copy playground snippet">
						{copiedSnippet ? 'COPIED' : 'COPY'}
					</button>
				</div>
				<pre class="snippet-code"><code>{playgroundSnippet}</code></pre>
			</aside>
		</div>
	</section>

	<footer class="page-footer">
		<hr />
		<div class="footer-row">
			<div class="footer-left">SVELTE // FLUID</div>
			<div class="footer-mid">
				DERIVATIVE OF PAVELDOGREAT / WEBGL-FLUID-SIMULATION (C) 2017
			</div>
			<div class="footer-right">M I T // 2 0 2 6</div>
		</div>
	</footer>
</main>

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
		background: #3a1f5c;
	}

	.competition-back {
		position: fixed;
		top: 1rem;
		left: 1rem;
		z-index: 200;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: #f0e8ff;
		text-decoration: none;
		background: rgba(74, 42, 114, 0.85);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		border: 1px solid #ff3aa3;
		box-shadow: 0 0 0 1px rgba(255, 58, 163, 0.25), 0 0 14px rgba(255, 58, 163, 0.35);
		border-radius: 999px;
		padding: 0.4rem 0.85rem;
		font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		transition: color 0.15s, box-shadow 0.15s;
	}
	.competition-back:hover {
		color: #7aff8a;
		box-shadow: 0 0 0 1px rgba(122, 255, 138, 0.4), 0 0 18px rgba(122, 255, 138, 0.45);
	}

	.page {
		--page: #3a1f5c;
		--surface: #4a2a72;
		--ink: #f0e8ff;
		--ink-soft: rgba(240, 232, 255, 0.72);
		--ink-faint: rgba(240, 232, 255, 0.18);
		--pink: #ff3aa3;
		--green: #7aff8a;
		--mono: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
		background: var(--page);
		color: var(--ink);
		font-family: 'Inter', system-ui, -apple-system, sans-serif;
		font-size: 14px;
		line-height: 1.55;
		max-width: 1400px;
		margin: 0 auto;
		padding: 0 24px 0;
		position: relative;
	}

	/* subtle rave grid backdrop */
	.page::before {
		content: '';
		position: fixed;
		inset: 0;
		pointer-events: none;
		background-image:
			linear-gradient(rgba(240, 232, 255, 0.04) 1px, transparent 1px),
			linear-gradient(90deg, rgba(240, 232, 255, 0.04) 1px, transparent 1px);
		background-size: 48px 48px;
		z-index: 0;
	}

	.margin-mark {
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--pink);
	}

	/* HERO */
	.hero {
		position: relative;
		padding: 32px 0 56px;
		border-bottom: 1px solid var(--ink-faint);
		isolation: isolate;
		overflow: hidden;
	}
	.hero-bg {
		position: absolute;
		inset: -2px;
		z-index: 0;
		filter: saturate(1.15);
	}
	.hero-scrim {
		position: absolute;
		inset: 0;
		z-index: 1;
		background:
			radial-gradient(ellipse at 50% 60%, rgba(58, 31, 92, 0.15) 0%, rgba(58, 31, 92, 0.6) 60%, rgba(58, 31, 92, 0.92) 100%),
			linear-gradient(180deg, rgba(58, 31, 92, 0.25) 0%, rgba(58, 31, 92, 0.85) 100%);
		pointer-events: none;
	}
	.hero-inner {
		position: relative;
		z-index: 2;
		padding: 40px 0 0;
	}

	.kicker {
		font-family: var(--mono);
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.32em;
		color: var(--green);
		border-top: 1px solid var(--ink-faint);
		border-bottom: 1px solid var(--ink-faint);
		padding: 8px 0;
		margin: 12px 0 32px;
	}

	.display {
		font-family: 'Inter', system-ui, sans-serif;
		font-weight: 900;
		font-size: clamp(3.5rem, 12vw, 11rem);
		line-height: 0.86;
		letter-spacing: -0.04em;
		text-transform: uppercase;
		margin: 0;
		color: var(--ink);
		text-shadow: 0 0 28px rgba(255, 58, 163, 0.35), 0 0 1px rgba(122, 255, 138, 0.6);
	}
	.display .slash {
		color: var(--pink);
		letter-spacing: -0.06em;
		padding: 0 0.05em;
		text-shadow: 0 0 14px rgba(255, 58, 163, 0.65);
	}

	.tagline {
		font-family: 'Inter', system-ui, sans-serif;
		font-size: clamp(1rem, 1.4vw, 1.25rem);
		max-width: 640px;
		margin: 28px 0 36px;
		color: var(--ink-soft);
		line-height: 1.5;
	}

	.install-row {
		display: flex;
		align-items: stretch;
		gap: 0;
		max-width: 640px;
	}
	.install-tabs {
		display: flex;
		border: 1px solid var(--ink-faint);
		border-right: 0;
		background: rgba(74, 42, 114, 0.7);
		backdrop-filter: blur(8px);
	}
	.tab {
		background: transparent;
		color: var(--ink-soft);
		border: 0;
		border-right: 1px solid var(--ink-faint);
		padding: 0 14px;
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.2em;
		cursor: pointer;
	}
	.tab:last-child {
		border-right: 0;
	}
	.tab.active {
		background: var(--pink);
		color: #2a0e3f;
		font-weight: 700;
	}
	.install-box {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 10px;
		border: 1px solid var(--ink-faint);
		padding: 8px 14px;
		background: rgba(74, 42, 114, 0.7);
		backdrop-filter: blur(8px);
		font-family: var(--mono);
		font-size: 14px;
		color: var(--ink);
	}
	.install-box .prompt {
		color: var(--green);
		font-weight: 700;
	}

	.hero-links {
		margin-top: 32px;
		display: flex;
		gap: 16px;
		font-size: 13px;
		flex-wrap: wrap;
	}
	.cta {
		font-family: var(--mono);
		font-size: 12px;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		text-decoration: none;
		padding: 12px 22px;
		border-radius: 2px;
		font-weight: 700;
		transition: transform 0.12s, box-shadow 0.15s, background 0.12s, color 0.12s;
	}
	.cta-fill {
		background: var(--pink);
		color: #2a0e3f;
		box-shadow: 0 0 0 1px var(--pink), 0 0 22px rgba(255, 58, 163, 0.45);
	}
	.cta-fill:hover {
		transform: translateY(-1px);
		box-shadow: 0 0 0 1px var(--pink), 0 0 30px rgba(255, 58, 163, 0.7);
	}
	.cta-out {
		background: transparent;
		color: var(--green);
		border: 1px solid var(--green);
		box-shadow: 0 0 14px rgba(122, 255, 138, 0.18);
	}
	.cta-out:hover {
		background: var(--green);
		color: #102a14;
		box-shadow: 0 0 24px rgba(122, 255, 138, 0.55);
	}

	.pill-row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 32px 0 0;
		padding: 0;
		list-style: none;
	}
	.pill {
		font-family: var(--mono);
		font-size: 10px;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--ink-soft);
		padding: 5px 10px;
		border: 1px solid var(--ink-faint);
		border-radius: 999px;
		background: rgba(74, 42, 114, 0.45);
	}

	/* SECTIONS */
	.section {
		border-bottom: 1px solid var(--ink-faint);
		padding: 64px 0;
		position: relative;
		z-index: 1;
	}
	.section-head {
		margin-bottom: 32px;
	}
	.section-title {
		font-family: 'Inter', system-ui, sans-serif;
		font-weight: 900;
		font-size: clamp(2rem, 5vw, 4rem);
		line-height: 1;
		letter-spacing: -0.04em;
		text-transform: uppercase;
		margin: 8px 0 0;
		color: var(--ink);
	}
	.section-sub {
		margin: 14px 0 0;
		max-width: 540px;
		color: var(--ink-soft);
	}

	/* MANIFESTO */
	.manifesto {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--ink-faint);
	}
	.manifesto li {
		display: grid;
		grid-template-columns: 64px 240px 1fr;
		gap: 16px;
		align-items: baseline;
		padding: 18px 0;
		border-bottom: 1px solid var(--ink-faint);
	}
	.manifesto .num {
		font-family: var(--mono);
		font-weight: 700;
		color: var(--green);
		letter-spacing: 0.1em;
	}
	.manifesto .t {
		text-transform: uppercase;
		letter-spacing: 0.18em;
		font-weight: 800;
		font-size: 13px;
		color: var(--ink);
	}
	.manifesto .d {
		font-size: 14px;
		color: var(--ink-soft);
	}

	/* USAGE */
	.usage-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		border: 1px solid var(--ink-faint);
		background: var(--surface);
	}
	.snippet {
		margin: 0;
		padding: 20px;
		border-right: 1px solid var(--ink-faint);
		background: rgba(0, 0, 0, 0.2);
		overflow-x: auto;
		font-family: var(--mono);
		font-size: 13px;
		line-height: 1.6;
		color: var(--ink);
	}
	.usage-preview {
		display: flex;
		flex-direction: column;
	}
	.cell-label {
		font-family: var(--mono);
		font-size: 10px;
		letter-spacing: 0.25em;
		text-transform: uppercase;
		padding: 8px 12px;
		border-bottom: 1px solid var(--ink-faint);
		background: rgba(0, 0, 0, 0.18);
		color: var(--green);
	}
	.fluid-host {
		flex: 1;
		min-height: 320px;
		position: relative;
	}

	/* PRESETS */
	.preset-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 14px;
	}
	.preset-cell {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--pink);
		border-radius: 4px;
		background: var(--surface);
		box-shadow: 0 0 0 1px rgba(255, 58, 163, 0.08), 0 0 22px rgba(255, 58, 163, 0.18);
		overflow: hidden;
		transition: box-shadow 0.18s;
	}
	.preset-cell:hover {
		box-shadow: 0 0 0 1px rgba(255, 58, 163, 0.18), 0 0 30px rgba(255, 58, 163, 0.32);
	}
	.cell-canvas {
		height: 360px;
		position: relative;
	}

	/* SHAPES */
	.shape-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 14px;
	}
	.shape-cell {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--ink-faint);
		border-radius: 4px;
		background: var(--surface);
		overflow: hidden;
	}
	.shape-canvas {
		height: 300px;
		position: relative;
	}

	/* PHYSICS */
	.physics-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 14px;
	}
	.physics-cell {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--ink-faint);
		border-radius: 4px;
		background: var(--surface);
		overflow: hidden;
	}
	.physics-canvas {
		height: 300px;
		position: relative;
	}
	.physics-snippet {
		font-family: var(--mono);
		font-size: 10px;
		letter-spacing: 0.04em;
		padding: 10px 12px;
		border-top: 1px solid var(--ink-faint);
		background: rgba(0, 0, 0, 0.22);
		color: var(--green);
		word-break: break-all;
		white-space: pre-wrap;
	}

	/* GLASS */
	.glass-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 14px;
	}
	.glass-cell {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--ink-faint);
		border-radius: 4px;
		background: var(--surface);
		overflow: hidden;
	}
	.glass-canvas {
		height: 340px;
		position: relative;
	}

	/* STICKY */
	.sticky-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 14px;
	}
	.sticky-cell {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--ink-faint);
		border-radius: 4px;
		background: var(--surface);
		overflow: hidden;
	}
	.sticky-canvas {
		height: 340px;
		position: relative;
	}

	/* REVEAL */
	.reveal-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 14px;
	}
	.reveal-cell {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--ink-faint);
		border-radius: 4px;
		background: var(--surface);
		overflow: hidden;
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
		background: linear-gradient(135deg, #2c1647 0%, #1a0c2c 100%);
	}
	.reveal-label {
		font-family: 'Inter', system-ui, sans-serif;
		font-size: 1.6rem;
		font-weight: 900;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ink);
		text-shadow: 0 0 16px rgba(122, 255, 138, 0.45);
	}

	/* DISTORT */
	.distort-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 14px;
	}
	.distort-cell {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--ink-faint);
		border-radius: 4px;
		background: var(--surface);
		overflow: hidden;
	}
	.distort-canvas {
		height: 340px;
		position: relative;
	}

	/* PLAYGROUND */
	.preset-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 24px;
	}
	.preset-chip {
		background: transparent;
		color: var(--ink-soft);
		border: 1px solid var(--ink-faint);
		padding: 6px 14px;
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		cursor: pointer;
		border-radius: 999px;
		transition: background 0.12s, color 0.12s, border-color 0.12s, box-shadow 0.15s;
	}
	.preset-chip:hover {
		color: var(--ink);
		border-color: var(--pink);
	}
	.preset-chip.active {
		background: var(--pink);
		color: #2a0e3f;
		border-color: var(--pink);
		font-weight: 700;
		box-shadow: 0 0 18px rgba(255, 58, 163, 0.5);
	}
	.preset-chip.reset {
		border-color: var(--green);
		color: var(--green);
	}
	.preset-chip.reset:hover {
		background: var(--green);
		color: #102a14;
	}
	.playground-grid {
		display: grid;
		grid-template-columns: 1fr 320px;
		border: 1px solid var(--ink-faint);
		background: var(--surface);
		border-radius: 4px;
		overflow: hidden;
	}
	.playground-canvas {
		min-height: 480px;
		position: relative;
		border-right: 1px solid var(--ink-faint);
	}
	.playground-panel {
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		overflow-y: auto;
		max-height: 600px;
		background: rgba(0, 0, 0, 0.2);
	}
	.knob-group {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.knob-group-title {
		font-family: var(--mono);
		font-size: 10px;
		letter-spacing: 0.28em;
		text-transform: uppercase;
		font-weight: 700;
		color: var(--pink);
		border-bottom: 1px solid var(--ink-faint);
		padding-bottom: 6px;
	}
	.knob-row {
		display: grid;
		grid-template-columns: 130px 1fr 48px;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}
	.knob-label {
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.04em;
		color: var(--ink);
	}
	.knob-value {
		font-family: var(--mono);
		font-size: 11px;
		text-align: right;
		color: var(--green);
	}
	.knob-value.mono {
		font-family: var(--mono);
	}
	.knob-row input[type='range'] {
		width: 100%;
		accent-color: var(--green);
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
		background: rgba(240, 232, 255, 0.1);
		border: 1.5px solid var(--ink-faint);
		border-radius: 8px;
		position: relative;
		transition: background 0.15s, border-color 0.15s;
		flex-shrink: 0;
	}
	.toggle-pill::after {
		content: '';
		position: absolute;
		top: 1px;
		left: 1px;
		width: 10px;
		height: 10px;
		background: var(--ink-soft);
		border-radius: 50%;
		transition: transform 0.15s, background 0.15s;
	}
	.toggle-row input[type='checkbox']:checked ~ .toggle-pill {
		background: var(--pink);
		border-color: var(--pink);
	}
	.toggle-row input[type='checkbox']:checked ~ .toggle-pill::after {
		transform: translateX(16px);
		background: #2a0e3f;
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
		border: 1.5px solid var(--ink-faint);
		padding: 1px;
		background: none;
		cursor: pointer;
	}
	.snippet-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-family: var(--mono);
		font-size: 10px;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		border-bottom: 1px solid var(--ink-faint);
		padding-bottom: 6px;
		color: var(--pink);
	}
	.copy-btn {
		background: transparent;
		color: var(--green);
		border: 1px solid var(--green);
		padding: 3px 10px;
		font-family: var(--mono);
		font-size: 10px;
		letter-spacing: 0.18em;
		cursor: pointer;
		border-radius: 2px;
	}
	.copy-btn:hover {
		background: var(--green);
		color: #102a14;
	}
	.snippet-code {
		margin: 0;
		font-family: var(--mono);
		font-size: 11px;
		line-height: 1.6;
		white-space: pre-wrap;
		word-break: break-all;
		background: rgba(0, 0, 0, 0.3);
		color: var(--ink);
		padding: 12px;
		border: 1px solid var(--ink-faint);
		border-radius: 2px;
	}

	/* FOOTER */
	.page-footer {
		padding: 40px 0 64px;
	}
	.page-footer hr {
		border: 0;
		border-top: 1px solid var(--ink-faint);
		margin: 0 0 24px;
	}
	.footer-row {
		display: grid;
		grid-template-columns: 1fr 2fr 1fr;
		gap: 24px;
		font-family: var(--mono);
		font-size: 10px;
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}
	.footer-left {
		color: var(--ink);
		border-bottom: 1px solid var(--pink);
		padding-bottom: 4px;
		justify-self: start;
	}
	.footer-mid {
		text-align: center;
	}
	.footer-right {
		text-align: right;
		color: var(--ink);
		border-bottom: 1px solid var(--green);
		padding-bottom: 4px;
		justify-self: end;
	}

	@media (max-width: 1100px) {
		.physics-grid,
		.glass-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 900px) {
		.usage-grid {
			grid-template-columns: 1fr;
		}
		.snippet {
			border-right: 0;
			border-bottom: 1px solid var(--ink-faint);
		}
		.preset-grid,
		.shape-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.manifesto li {
			grid-template-columns: 48px 1fr;
		}
		.manifesto .d {
			grid-column: 1 / -1;
			padding-left: 64px;
		}
		.footer-row {
			grid-template-columns: 1fr;
			text-align: left;
		}
		.footer-mid,
		.footer-right {
			text-align: left;
			justify-self: start;
		}
		.sticky-grid,
		.reveal-grid,
		.distort-grid {
			grid-template-columns: 1fr;
		}
		.playground-grid {
			grid-template-columns: 1fr;
		}
		.playground-canvas {
			border-right: 0;
			border-bottom: 1px solid var(--ink-faint);
		}
	}

	@media (max-width: 640px) {
		.page {
			font-size: 13px;
			padding: 0 16px;
		}
		.display {
			font-size: clamp(2.6rem, 14vw, 5rem);
		}
		.tagline {
			font-size: 1rem;
			margin: 20px 0 28px;
		}
		.section {
			padding: 44px 0;
		}
		.section-title {
			font-size: clamp(1.6rem, 7vw, 2.4rem);
		}
		.preset-grid,
		.shape-grid,
		.physics-grid,
		.glass-grid {
			grid-template-columns: 1fr;
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
			letter-spacing: 0.24em;
			margin: 10px 0 24px;
		}
		.install-row {
			flex-direction: column;
		}
		.install-tabs {
			border-right: 1px solid var(--ink-faint);
			border-bottom: 0;
		}
		.install-box {
			border-top: 0;
		}
		.hero-links {
			gap: 12px;
			flex-wrap: wrap;
		}
		.cta {
			padding: 10px 16px;
			font-size: 11px;
		}
		.manifesto li {
			grid-template-columns: 36px 1fr;
			padding: 12px 0;
		}
		.manifesto .d {
			padding-left: 48px;
		}
		.knob-row {
			grid-template-columns: 110px 1fr 44px;
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
