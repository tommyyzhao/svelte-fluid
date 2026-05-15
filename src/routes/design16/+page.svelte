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

	type RGB = { r: number; g: number; b: number };

	const pageColor: RGB = { r: 58, g: 31, b: 44 };
	const surfaceColor: RGB = { r: 74, g: 42, b: 55 };

	let installTab = $state<'npm' | 'bun' | 'pnpm'>('npm');

	const installCmd = $derived(
		installTab === 'npm'
			? 'npm install svelte-fluid'
			: installTab === 'bun'
				? 'bun add svelte-fluid'
				: 'pnpm add svelte-fluid'
	);

	let installCopied = $state(false);
	async function copyInstall() {
		try {
			await navigator.clipboard.writeText(installCmd);
			installCopied = true;
			setTimeout(() => (installCopied = false), 1200);
		} catch {
			installCopied = false;
		}
	}

	const usage = `<script>
  import { Fluid } from 'svelte-fluid';
<\/script>

<div style="width: 100%; height: 480px;">
  <Fluid seed={42} splatOnHover backColor={{ r: 58, g: 31, b: 44 }} />
</div>`;

	const features = [
		{ n: '01', t: 'Multi-instance', d: 'Many engines coexist on one page. No shared globals, no jealousy.' },
		{ n: '02', t: 'Resize-stable', d: 'Survives ResizeObserver storms. FBOs rebuild only on stable size.' },
		{ n: '03', t: 'Deterministic seeding', d: 'A seed in. The same fluid out. Frame for frame.' },
		{ n: '04', t: 'MIT licensed', d: 'Derivative of PavelDoGreat. Take it home.' },
		{ n: '05', t: 'Zero runtime deps', d: 'Pure Svelte 5 and WebGL. Nothing else in your bundle.' },
		{ n: '06', t: '70+ configuration props', d: 'Bloom, sunrays, curl, dissipation. All hot-swappable, all hours.' },
		{ n: '07', t: 'Ten built-in presets', d: 'Editorial fluid wallpaper. Pour and serve.' }
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
		backColor: { ...pageColor } as RGB
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
	<title>svelte-fluid — Velvet</title>
</svelte:head>

<a class="competition-back" href="{base}/design-competition">← Competition</a>

<main class="page">
	<header class="hero">
		<div class="margin-mark">§ 00 · ISSUE NO. XVI</div>
		<div class="kicker">A Svelte 5 component library / Late edition</div>
		<h1 class="display"><em>velvet</em><span class="dash">,</span> <em>after</em> <em>hours</em></h1>
		<h1 class="tagline">
			WebGL fluid simulation as a Svelte 5 component. Slow swirling pigment, served
			between the dark and the light.
		</h1>

		<div class="install-row">
			<div class="install-tabs" role="tablist" aria-label="Package manager">
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
				<button class="install-copy" onclick={copyInstall} aria-label="Copy install command">
					{installCopied ? 'Copied' : 'Copy'}
				</button>
			</div>
		</div>

		<nav class="hero-links" aria-label="Primary">
			<a class="hero-link" href="https://github.com/tommyyzhao/svelte-fluid">→ GitHub</a>
			<a class="hero-link" href="{base}/docs">→ Documentation</a>
			<a class="hero-link" href="{base}/design-competition">→ All designs</a>
		</nav>

		<div class="feature-pills">
			{#each features as f (f.n)}
				<span class="pill"><span class="pill-num">{f.n}</span>{f.t}</span>
			{/each}
		</div>
	</header>

	<section class="section index-section">
		<div class="section-head">
			<div class="margin-mark">§ 01 · INDEX</div>
			<h2 class="section-title"><em>An index of small mercies</em></h2>
			<p class="section-sub">
				Seven reasons to pour something dark, sit close to the screen, and let the
				engine do the moving.
			</p>
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
			<div class="margin-mark">§ 02 · INSTALL</div>
			<h2 class="section-title"><em>Open the bottle</em></h2>
			<p class="section-sub">One line. Then the page begins to breathe.</p>
		</div>
		<div class="install-box install-box--standalone">
			<span class="prompt">↳</span>
			<code>{installCmd}</code>
			<button class="install-copy" onclick={copyInstall} aria-label="Copy install command">
				{installCopied ? 'Copied' : 'Copy'}
			</button>
		</div>
	</section>

	<section class="section usage-section">
		<div class="section-head">
			<div class="margin-mark">§ 03 · USAGE</div>
			<h2 class="section-title"><em>A first pour</em></h2>
			<p class="section-sub">Drop the tag. Reach for props when you want your own physics.</p>
		</div>
		<div class="usage-grid">
			<pre class="snippet"><code>{usage}</code></pre>
			<div class="usage-preview">
				<div class="cell-label">§ 03 · PREVIEW</div>
				<div class="fluid-host">
					<Fluid seed={42} splatOnHover backColor={surfaceColor} lazy aria-label="Velvet usage preview" />
				</div>
			</div>
		</div>
	</section>

	<section class="section presets-section">
		<div class="section-head">
			<div class="margin-mark">§ 04 · PRESETS</div>
			<h2 class="section-title"><em>A taxonomy of the dye</em></h2>
			<p class="section-sub">
				<em>Note —</em> each preset ships its own ink: dark plates set into wine
				frames, like jewels in velvet boxes.
			</p>
		</div>
		<div class="preset-grid">
			<article class="preset-cell">
				<div class="cell-label">§ 04 / I · LAVA LAMP</div>
				<div class="cell-canvas"><LavaLamp seed={11} aria-label="LavaLamp preset" /></div>
			</article>
			<article class="preset-cell">
				<div class="cell-label">§ 04 / II · PLASMA</div>
				<div class="cell-canvas"><Plasma seed={22} aria-label="Plasma preset" /></div>
			</article>
			<article class="preset-cell">
				<div class="cell-label">§ 04 / III · INK IN WATER</div>
				<div class="cell-canvas">
					<InkInWater seed={33} lazy aria-label="InkInWater preset" />
				</div>
			</article>
			<article class="preset-cell">
				<div class="cell-label">§ 04 / IV · FROZEN SWIRL</div>
				<div class="cell-canvas">
					<FrozenSwirl seed={44} lazy aria-label="FrozenSwirl preset" />
				</div>
			</article>
			<article class="preset-cell">
				<div class="cell-label">§ 04 / V · AURORA</div>
				<div class="cell-canvas"><Aurora seed={55} lazy aria-label="Aurora preset" /></div>
			</article>
			<article class="preset-cell">
				<div class="cell-label">§ 04 / VI · TOROIDAL TEMPEST</div>
				<div class="cell-canvas">
					<ToroidalTempest seed={66} lazy aria-label="ToroidalTempest preset" />
				</div>
			</article>
		</div>
	</section>

	<section class="section shapes-section">
		<div class="section-head">
			<div class="margin-mark">§ 05 · SHAPES</div>
			<h2 class="section-title"><em>The shape of containment</em></h2>
			<p class="section-sub">Six vessels for the dye. Hover, and the dye answers.</p>
		</div>
		<div class="shape-grid">
			<article class="shape-cell">
				<div class="cell-label">§ 05 / I · CIRCLE</div>
				<div class="shape-canvas">
					<CircularFluid seed={601} lazy splatOnHover aria-label="Circle container shape" />
				</div>
			</article>
			<article class="shape-cell">
				<div class="cell-label">§ 05 / II · ROUNDED RECT</div>
				<div class="shape-canvas">
					<Fluid
						seed={602}
						colorful
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
				<div class="cell-label">§ 05 / III · FRAME</div>
				<div class="shape-canvas">
					<FrameFluid seed={603} lazy splatOnHover aria-label="Frame container shape" />
				</div>
			</article>
			<article class="shape-cell">
				<div class="cell-label">§ 05 / IV · ANNULUS</div>
				<div class="shape-canvas">
					<AnnularFluid seed={604} lazy splatOnHover aria-label="Annulus container shape" />
				</div>
			</article>
			<article class="shape-cell">
				<div class="cell-label">§ 05 / V · LIGHTNING</div>
				<div class="shape-canvas">
					<Fluid
						seed={605}
						colorful
						shading
						bloom
						splatOnHover
						initialSplatCount={15}
						containerShape={{ type: 'svgPath', d: lightning, viewBox: [0, 0, 100, 100] }}
						backColor={surfaceColor}
						lazy
						aria-label="Lightning SVG path container shape"
					/>
				</div>
			</article>
			<article class="shape-cell">
				<div class="cell-label">§ 05 / VI · AMPERSAND</div>
				<div class="shape-canvas">
					<Fluid
						seed={606}
						colorful
						shading
						bloom
						splatOnHover
						initialSplatCount={15}
						containerShape={{ type: 'svgPath', text: '&', font: '900 280px Georgia, serif' }}
						backColor={surfaceColor}
						lazy
						aria-label="Ampersand text glyph container shape"
					/>
				</div>
			</article>
		</div>
	</section>

	<section class="section physics-section">
		<div class="section-head">
			<div class="margin-mark">§ 06 · PHYSICS</div>
			<h2 class="section-title"><em>Four moods, one engine</em></h2>
			<p class="section-sub">
				Every prop optional. Each cell is the same component, dressed for a different
				hour of the night.
			</p>
		</div>
		<div class="physics-grid">
			<article class="physics-cell">
				<div class="cell-label">§ 06 / I · DEFAULT</div>
				<div class="physics-canvas">
					<Fluid
						seed={1234}
						initialSplatCount={12}
						splatOnHover
						backColor={pageColor}
						lazy
						aria-label="Default fluid configuration"
					/>
				</div>
				<code class="physics-snippet">{'<Fluid />'}</code>
			</article>
			<article class="physics-cell">
				<div class="cell-label">§ 06 / II · FLAT + SOFT</div>
				<div class="physics-canvas">
					<Fluid
						seed={5678}
						bloom={false}
						curl={5}
						densityDissipation={0.4}
						initialSplatCount={10}
						splatOnHover
						backColor={pageColor}
						lazy
						aria-label="Flat fluid with low curl"
					/>
				</div>
				<code class="physics-snippet">{'bloom={false} curl={5} densityDissipation={0.4}'}</code>
			</article>
			<article class="physics-cell">
				<div class="cell-label">§ 06 / III · BOLD SPLATS</div>
				<div class="physics-canvas">
					<Fluid
						seed={9012}
						shading={false}
						splatRadius={0.8}
						splatForce={9000}
						initialSplatCount={8}
						splatOnHover
						backColor={pageColor}
						lazy
						aria-label="Fluid with large bold splats"
					/>
				</div>
				<code class="physics-snippet">{'shading={false} splatRadius={0.8} splatForce={9000}'}</code>
			</article>
			<article class="physics-cell">
				<div class="cell-label">§ 06 / IV · SLOW + TRANSPARENT</div>
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
			<div class="margin-mark">§ 07 · GLASS</div>
			<h2 class="section-title"><em>Refraction, after dark</em></h2>
			<p class="section-sub">A lens at the wall. Chromatic fringes at the edge. Wine reads through it.</p>
		</div>
		<div class="glass-grid">
			<article class="glass-cell">
				<div class="cell-label">§ 07 / I · CRYSTAL ORB</div>
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
						backColor={pageColor}
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
				<div class="cell-label">§ 07 / II · SOFT LENS</div>
				<div class="glass-canvas">
					<Fluid
						seed={1212}
						lazy
						glass
						glassRefraction={0.25}
						glassReflectivity={0.06}
						glassChromatic={0.1}
						containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 }}
						backColor={pageColor}
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
				<div class="cell-label">§ 07 / III · PORTAL RING</div>
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
						backColor={pageColor}
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
				<div class="cell-label">§ 07 / IV · GLASS FRAME</div>
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
						backColor={pageColor}
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
			<div class="margin-mark">§ 08 · STICKY</div>
			<h2 class="section-title"><em>Letterforms in the dark</em></h2>
			<p class="section-sub">Dye accumulates inside the glyphs. The page wears its own name.</p>
		</div>
		<div class="sticky-grid">
			<article class="sticky-cell">
				<div class="cell-label">§ 08 / I · PLAYFAIR · 900</div>
				<div class="sticky-canvas">
					<FluidStick
						text="VELVET"
						font="900 100px 'Playfair Display', Georgia, serif"
						seed={211}
						autoAnimate={stickyAutoAnimate}
						autoAnimateDuration={4}
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
				<div class="cell-label">§ 08 / II · GEORGIA · ∞</div>
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
						backColor={surfaceColor}
						lazy
					/>
				</div>
			</article>
		</div>
	</section>

	<section class="section reveal-section">
		<div class="section-head">
			<div class="margin-mark">§ 09 · REVEAL</div>
			<h2 class="section-title"><em>What lies beneath the curtain</em></h2>
			<p class="section-sub">The fluid serves as a mask. Drag, and the wine parts.</p>
		</div>
		<div class="reveal-grid">
			<article class="reveal-cell">
				<div class="cell-label">§ 09 / I · SCRATCH</div>
				<div class="reveal-canvas">
					<FluidReveal
						lazy
						velocityDissipation={0.95}
						pressureIterations={10}
						coverColor={{ r: 0.227, g: 0.122, b: 0.173 }}
						fringeColor={{ r: 0.6, g: 0.45, b: 0.55 }}
						accentColor={{ r: 0.83, g: 0.72, b: 0.59 }}
					>
						<div class="reveal-content">
							<span class="reveal-label">Revealed</span>
						</div>
					</FluidReveal>
				</div>
			</article>
			<article class="reveal-cell">
				<div class="cell-label">§ 09 / II · AUTO</div>
				<div class="reveal-canvas">
					<FluidReveal
						lazy
						autoReveal={stickyAutoAnimate}
						autoRevealSpeed={0.8}
						fadeBack={false}
						velocityDissipation={0.95}
						sensitivity={0.15}
						coverColor={{ r: 0.227, g: 0.122, b: 0.173 }}
						fringeColor={{ r: 0.6, g: 0.45, b: 0.55 }}
						accentColor={{ r: 0.83, g: 0.72, b: 0.59 }}
					>
						<div class="reveal-content reveal-content--dark">
							<span class="reveal-label reveal-label--light"><em>Auto reveal</em></span>
						</div>
					</FluidReveal>
				</div>
			</article>
		</div>
	</section>

	<section class="section distort-section">
		<div class="section-head">
			<div class="margin-mark">§ 10 · DISTORTION</div>
			<h2 class="section-title"><em>The garden, rearranged</em></h2>
			<p class="section-sub">The velocity field warps the source. Hover to disturb.</p>
		</div>
		<div class="distort-grid">
			<article class="distort-cell">
				<div class="cell-label">§ 10 / I · SUBTLE · 0.3</div>
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
				<div class="cell-label">§ 10 / II · STRONG · 0.45</div>
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
			<div class="margin-mark">§ 11 · PLAYGROUND</div>
			<h2 class="section-title"><em>An instrument for the host</em></h2>
			<p class="section-sub">Turn the knobs. Take the snippet home.</p>
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
			<div class="playground-canvas">
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
			<div class="footer-left">SVELTE&nbsp;·&nbsp;FLUID&nbsp;·&nbsp;VELVET</div>
			<div class="footer-mid">
				<em>Derivative work of PavelDoGreat / WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017.</em>
			</div>
			<div class="footer-right">M&nbsp;I&nbsp;T&nbsp;&nbsp;·&nbsp;&nbsp;2 0 2 6</div>
		</div>
	</footer>
</main>

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
		background: #3a1f2c;
	}

	.competition-back {
		position: fixed;
		top: 1rem;
		left: 1rem;
		z-index: 200;
		font-size: 0.75rem;
		font-weight: 500;
		letter-spacing: 0.05em;
		color: rgba(245, 232, 212, 0.75);
		text-decoration: none;
		background: rgba(74, 42, 55, 0.85);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid rgba(212, 184, 150, 0.35);
		border-radius: 4px;
		padding: 0.35rem 0.7rem;
		font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		transition: color 0.15s, border-color 0.15s;
	}
	.competition-back:hover {
		color: #d4b896;
		border-color: #d4b896;
	}

	.page {
		--wine: #3a1f2c;
		--wine-surface: #4a2a37;
		--wine-deep: #2a1620;
		--ink: #f5e8d4;
		--ink-soft: rgba(245, 232, 212, 0.65);
		--ink-faint: rgba(245, 232, 212, 0.18);
		--gold: #d4b896;
		--mono: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
		background: var(--wine);
		color: var(--ink);
		font-family: 'Inter', system-ui, sans-serif;
		font-size: 14px;
		line-height: 1.6;
		max-width: 1400px;
		margin: 0 auto;
		padding: 0 24px 0;
	}

	.margin-mark {
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.25em;
		text-transform: uppercase;
		color: var(--gold);
	}

	.hero {
		border-bottom: 1px solid var(--ink-faint);
		padding: 56px 0 64px;
		position: relative;
	}

	.kicker {
		font-family: var(--mono);
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.3em;
		border-top: 1px solid var(--ink-faint);
		border-bottom: 1px solid var(--ink-faint);
		padding: 8px 0;
		margin: 16px 0 40px;
		color: var(--ink-soft);
	}

	.display {
		font-family: 'Playfair Display', 'Times New Roman', Georgia, serif;
		font-weight: 900;
		font-style: italic;
		font-size: clamp(3.5rem, 11vw, 9.5rem);
		line-height: 0.92;
		letter-spacing: -0.03em;
		margin: 0;
		color: var(--ink);
	}
	.display em {
		font-style: italic;
	}
	.display .dash {
		font-style: normal;
		letter-spacing: -0.02em;
		color: var(--gold);
		font-weight: 400;
		margin: 0 -0.05em 0 -0.1em;
	}

	.tagline {
		font-family: 'Playfair Display', Georgia, serif;
		font-style: italic;
		font-weight: 400;
		font-size: clamp(1.05rem, 1.5vw, 1.35rem);
		max-width: 640px;
		margin: 32px 0 36px;
		color: var(--ink-soft);
		line-height: 1.5;
	}

	.install-row {
		display: flex;
		align-items: stretch;
		gap: 0;
		max-width: 720px;
	}
	.install-tabs {
		display: flex;
		border: 1px solid var(--gold);
		border-right: 0;
	}
	.tab {
		background: transparent;
		color: var(--ink-soft);
		border: 0;
		border-right: 1px solid var(--gold);
		padding: 0 14px;
		font: inherit;
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.2em;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.tab:last-child {
		border-right: 0;
	}
	.tab.active {
		background: var(--gold);
		color: var(--wine);
	}
	.install-box {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 10px;
		border: 1px solid var(--gold);
		padding: 8px 14px;
		background: var(--wine-surface);
		font-family: var(--mono);
		font-size: 13px;
		color: var(--ink);
	}
	.install-box .prompt {
		color: var(--gold);
	}
	.install-box code {
		flex: 1;
	}
	.install-box--standalone {
		max-width: 720px;
		padding: 12px 16px;
	}
	.install-copy {
		background: transparent;
		color: var(--gold);
		border: 1px solid var(--gold);
		padding: 2px 10px;
		font: inherit;
		font-family: var(--mono);
		font-size: 10px;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.install-copy:hover {
		background: var(--gold);
		color: var(--wine);
	}

	.hero-links {
		margin-top: 36px;
		display: flex;
		gap: 28px;
		font-family: var(--mono);
		font-size: 12px;
		letter-spacing: 0.1em;
		flex-wrap: wrap;
	}
	.hero-link {
		color: var(--ink);
		text-decoration: none;
		border-bottom: 1px solid var(--ink-faint);
		padding-bottom: 2px;
		transition: color 0.15s, border-color 0.15s;
	}
	.hero-link:hover {
		color: var(--gold);
		border-color: var(--gold);
	}

	.feature-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 40px;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 6px 14px;
		border: 1px solid var(--ink-faint);
		border-radius: 999px;
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-soft);
		background: rgba(74, 42, 55, 0.4);
	}
	.pill-num {
		color: var(--gold);
		font-weight: 700;
	}

	.section {
		border-bottom: 1px solid var(--ink-faint);
		padding: 64px 0;
	}
	.section-head {
		margin-bottom: 36px;
		max-width: 880px;
	}
	.section-title {
		font-family: 'Playfair Display', Georgia, serif;
		font-weight: 500;
		font-style: italic;
		font-size: clamp(2rem, 4.6vw, 3.6rem);
		line-height: 1.05;
		letter-spacing: -0.015em;
		margin: 12px 0 0;
		color: var(--ink);
	}
	.section-sub {
		margin: 16px 0 0;
		max-width: 560px;
		color: var(--ink-soft);
		font-family: 'Playfair Display', Georgia, serif;
		font-style: italic;
		font-size: 1.05rem;
		line-height: 1.55;
	}
	.section-sub em {
		color: var(--gold);
		font-style: italic;
	}

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
		color: var(--gold);
		font-size: 12px;
	}
	.manifesto .t {
		font-family: var(--mono);
		text-transform: uppercase;
		letter-spacing: 0.18em;
		font-weight: 600;
		font-size: 12px;
		color: var(--ink);
	}
	.manifesto .d {
		font-size: 14px;
		color: var(--ink-soft);
	}

	.usage-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		border: 1px solid var(--ink-faint);
		background: var(--wine-surface);
	}
	.snippet {
		margin: 0;
		padding: 22px;
		border-right: 1px solid var(--ink-faint);
		background: var(--wine-deep);
		overflow-x: auto;
		font-family: var(--mono);
		font-size: 12.5px;
		line-height: 1.65;
		color: var(--ink-soft);
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
		padding: 10px 14px;
		border-bottom: 1px solid var(--ink-faint);
		background: var(--wine-surface);
		color: var(--gold);
	}
	.fluid-host {
		flex: 1;
		min-height: 360px;
		position: relative;
	}

	.preset-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		border: 1px solid var(--ink-faint);
		background: var(--wine-surface);
	}
	.preset-cell {
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--ink-faint);
		border-bottom: 1px solid var(--ink-faint);
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

	.shape-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		border: 1px solid var(--ink-faint);
		background: var(--wine-surface);
	}
	.shape-cell {
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--ink-faint);
		border-bottom: 1px solid var(--ink-faint);
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
		background: var(--wine-surface);
	}

	.physics-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		border: 1px solid var(--ink-faint);
		background: var(--wine);
	}
	.physics-cell {
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--ink-faint);
	}
	.physics-cell:last-child {
		border-right: 0;
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
		background: var(--wine-deep);
		color: var(--ink-soft);
		word-break: break-all;
		white-space: pre-wrap;
	}

	.glass-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		border: 1px solid var(--ink-faint);
		background: var(--wine);
	}
	.glass-cell {
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--ink-faint);
	}
	.glass-cell:last-child {
		border-right: 0;
	}
	.glass-canvas {
		height: 340px;
		position: relative;
		background: var(--wine);
	}

	.sticky-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		border: 1px solid var(--ink-faint);
		background: var(--wine-surface);
	}
	.sticky-cell {
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--ink-faint);
	}
	.sticky-cell:last-child {
		border-right: 0;
	}
	.sticky-canvas {
		height: 360px;
		position: relative;
	}

	.reveal-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		border: 1px solid var(--ink-faint);
		background: var(--wine-surface);
	}
	.reveal-cell {
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--ink-faint);
	}
	.reveal-cell:last-child {
		border-right: 0;
	}
	.reveal-canvas {
		height: 360px;
		position: relative;
	}
	.reveal-content {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		background: linear-gradient(135deg, #2a1620 0%, #4a2a37 100%);
	}
	.reveal-content--dark {
		background: linear-gradient(135deg, #1a0c12 0%, #3a1f2c 100%);
	}
	.reveal-label {
		font-family: 'Playfair Display', Georgia, serif;
		font-size: 1.6rem;
		font-style: italic;
		color: var(--ink);
	}
	.reveal-label--light {
		color: var(--gold);
	}

	.distort-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		border: 1px solid var(--ink-faint);
		background: var(--wine-surface);
	}
	.distort-cell {
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--ink-faint);
	}
	.distort-cell:last-child {
		border-right: 0;
	}
	.distort-canvas {
		height: 360px;
		position: relative;
	}

	.playground-section {
		border-bottom: 1px solid var(--ink-faint);
	}
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
		padding: 5px 14px;
		font: inherit;
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		cursor: pointer;
		border-radius: 999px;
		transition: background 0.15s, color 0.15s, border-color 0.15s;
	}
	.preset-chip:hover,
	.preset-chip.active {
		background: var(--gold);
		color: var(--wine);
		border-color: var(--gold);
	}
	.preset-chip.reset {
		border-color: var(--gold);
		color: var(--gold);
	}
	.preset-chip.reset:hover {
		background: var(--gold);
		color: var(--wine);
	}
	.playground-grid {
		display: grid;
		grid-template-columns: 1fr 340px;
		border: 1px solid var(--ink-faint);
		background: var(--wine-surface);
		gap: 0;
	}
	.playground-canvas {
		min-height: 520px;
		position: relative;
		border-right: 1px solid var(--ink-faint);
	}
	.playground-panel {
		padding: 22px;
		display: flex;
		flex-direction: column;
		gap: 22px;
		overflow-y: auto;
		max-height: 640px;
	}
	.knob-group {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.knob-group-title {
		font-family: var(--mono);
		font-size: 10px;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		font-weight: 700;
		color: var(--gold);
		border-bottom: 1px solid var(--ink-faint);
		padding-bottom: 6px;
	}
	.knob-row {
		display: grid;
		grid-template-columns: 140px 1fr 48px;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}
	.knob-label {
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.05em;
		color: var(--ink-soft);
	}
	.knob-value {
		font-family: var(--mono);
		font-size: 11px;
		text-align: right;
		color: var(--ink);
	}
	.knob-value.mono {
		font-family: var(--mono);
	}
	input[type='range'] {
		width: 100%;
		accent-color: var(--gold);
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
		background: rgba(245, 232, 212, 0.12);
		border: 1px solid var(--ink-faint);
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
		background: var(--gold);
		border-color: var(--gold);
	}
	.toggle-row input[type='checkbox']:checked ~ .toggle-pill::after {
		transform: translateX(16px);
		background: var(--wine);
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
		border: 1px solid var(--ink-faint);
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
		letter-spacing: 0.25em;
		text-transform: uppercase;
		color: var(--gold);
		border-bottom: 1px solid var(--ink-faint);
		padding-bottom: 6px;
	}
	.copy-btn {
		background: transparent;
		color: var(--gold);
		border: 1px solid var(--gold);
		padding: 3px 10px;
		font: inherit;
		font-family: var(--mono);
		font-size: 10px;
		letter-spacing: 0.12em;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.copy-btn:hover {
		background: var(--gold);
		color: var(--wine);
	}
	.snippet-code {
		margin: 0;
		font-family: var(--mono);
		font-size: 11px;
		line-height: 1.65;
		white-space: pre-wrap;
		word-break: break-all;
		background: var(--wine-deep);
		color: var(--ink-soft);
		padding: 12px;
		border: 1px solid var(--ink-faint);
	}

	.page-footer {
		padding: 48px 0 72px;
	}
	.page-footer hr {
		border: 0;
		border-top: 1px solid var(--ink-faint);
		margin: 0 0 28px;
	}
	.footer-row {
		display: grid;
		grid-template-columns: 1fr 2fr 1fr;
		gap: 24px;
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}
	.footer-mid {
		text-align: center;
		text-transform: none;
		letter-spacing: 0.04em;
		font-family: 'Playfair Display', Georgia, serif;
		font-style: italic;
		font-size: 12px;
		color: var(--ink-soft);
	}
	.footer-right {
		text-align: right;
		color: var(--gold);
	}

	@media (max-width: 900px) {
		.usage-grid,
		.preset-grid {
			grid-template-columns: 1fr;
		}
		.snippet {
			border-right: 0;
			border-bottom: 1px solid var(--ink-faint);
		}
		.preset-cell {
			border-right: 0;
		}
		.preset-cell:nth-child(n) {
			border-bottom: 1px solid var(--ink-faint);
		}
		.preset-cell:last-child {
			border-bottom: 0;
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
			border-bottom: 1px solid var(--ink-faint);
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
			border-bottom: 1px solid var(--ink-faint);
		}
	}

	@media (max-width: 640px) {
		.page {
			font-size: 13px;
			padding: 0 16px;
		}
		.display {
			font-size: clamp(2.6rem, 14vw, 5.5rem);
		}
		.tagline {
			font-size: 1rem;
			margin: 24px 0 28px;
		}
		.section {
			padding: 44px 0;
		}
		.section-title {
			font-size: clamp(1.6rem, 7vw, 2.4rem);
		}
		.cell-canvas,
		.shape-canvas,
		.physics-canvas,
		.glass-canvas,
		.sticky-canvas,
		.reveal-canvas,
		.distort-canvas {
			height: 280px;
		}
		.playground-canvas {
			min-height: 380px;
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
			padding: 36px 0 48px;
		}
		.kicker {
			font-size: 10px;
			letter-spacing: 0.22em;
			margin: 12px 0 28px;
		}
		.margin-mark {
			font-size: 10px;
			letter-spacing: 0.18em;
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
			border-right: 1px solid var(--gold);
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
			padding: 14px 0;
		}
		.manifesto .d {
			padding-left: 48px;
		}
		.knob-row {
			grid-template-columns: 110px 1fr 40px;
		}
		.playground-panel {
			padding: 16px;
			max-height: none;
		}
		.snippet {
			padding: 16px;
			font-size: 12px;
		}
		.section-head {
			margin-bottom: 24px;
		}
	}
</style>
