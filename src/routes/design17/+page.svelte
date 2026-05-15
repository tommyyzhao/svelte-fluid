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
  <Fluid seed={42} splatOnHover backColor={{ r: 38, g: 74, b: 89 }} />
</div>`;

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

	const pageColor: RGB = { r: 29, g: 56, b: 69 };
	const surfaceColor: RGB = { r: 38, g: 74, b: 89 };

	const PLAYGROUND_DEFAULTS = {
		curl: 30,
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

	const featurePills = ['Multi-instance', 'Resize-stable', 'Deterministic', 'MIT', 'Zero deps', '70+ props'];
</script>

<svelte:head>
	<title>svelte-fluid — Lagoon</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap"
	/>
</svelte:head>

<a class="competition-back" href="{base}/design-competition">← Competition</a>

<main class="page">
	<header class="hero">
		<div class="label">00 · LAGOON</div>
		<h1 class="display">
			Fluid, <span class="serif-accent">quietly</span> rendered.
		</h1>
		<p class="tagline">
			A WebGL Navier-Stokes simulation as a Svelte 5 component. Multi-instance,
			resize-stable, deterministic.
		</p>

		<div class="install-row">
			<div class="install-tabs">
				<button
					class="tab"
					class:active={installTab === 'npm'}
					onclick={() => (installTab = 'npm')}>npm</button
				>
				<button
					class="tab"
					class:active={installTab === 'bun'}
					onclick={() => (installTab = 'bun')}>bun</button
				>
				<button
					class="tab"
					class:active={installTab === 'pnpm'}
					onclick={() => (installTab = 'pnpm')}>pnpm</button
				>
			</div>
			<div class="install-box">
				<span class="prompt">$</span>
				<code>{installCmd}</code>
			</div>
		</div>

		<div class="cta-row">
			<a class="cta cta-primary" href="{base}/docs">Read the docs</a>
			<a class="cta cta-ghost" href="https://github.com/tommyyzhao/svelte-fluid">GitHub</a>
		</div>

		<div class="feature-pills">
			{#each featurePills as f (f)}
				<span class="feature-pill">{f}</span>
			{/each}
		</div>
	</header>

	<section class="section">
		<div class="section-head">
			<div class="label">02 · INSTALL</div>
			<h2 class="section-title">Install</h2>
		</div>
		<pre class="mono-box"><code>{installCmd}</code></pre>
	</section>

	<section class="section">
		<div class="section-head">
			<div class="label">03 · USAGE</div>
			<h2 class="section-title">Usage</h2>
		</div>
		<div class="usage-grid">
			<pre class="snippet"><code>{usage}</code></pre>
			<div class="usage-preview card">
				<div class="cell-label">Preview</div>
				<div class="fluid-host">
					<Fluid
						seed={42}
						splatOnHover
						backColor={surfaceColor}
						lazy
						aria-label="Usage preview"
					/>
				</div>
			</div>
		</div>
	</section>

	<section class="section">
		<div class="section-head">
			<div class="label">04 · PRESETS</div>
			<h2 class="section-title">Six presets</h2>
			<p class="section-sub">
				Each preset ships its own ink — they render against their own dark plates,
				not the page.
			</p>
		</div>
		<div class="preset-grid">
			<article class="preset-cell card">
				<div class="cell-label">LavaLamp · 11</div>
				<div class="cell-canvas"><LavaLamp seed={11} aria-label="LavaLamp preset" /></div>
			</article>
			<article class="preset-cell card">
				<div class="cell-label">Plasma · 22</div>
				<div class="cell-canvas"><Plasma seed={22} aria-label="Plasma preset" /></div>
			</article>
			<article class="preset-cell card">
				<div class="cell-label">InkInWater · 33</div>
				<div class="cell-canvas">
					<InkInWater seed={33} lazy aria-label="InkInWater preset" />
				</div>
			</article>
			<article class="preset-cell card">
				<div class="cell-label">FrozenSwirl · 44</div>
				<div class="cell-canvas">
					<FrozenSwirl seed={44} lazy aria-label="FrozenSwirl preset" />
				</div>
			</article>
			<article class="preset-cell card">
				<div class="cell-label">Aurora · 55</div>
				<div class="cell-canvas"><Aurora seed={55} lazy aria-label="Aurora preset" /></div>
			</article>
			<article class="preset-cell card">
				<div class="cell-label">ToroidalTempest · 66</div>
				<div class="cell-canvas">
					<ToroidalTempest seed={66} lazy aria-label="ToroidalTempest preset" />
				</div>
			</article>
		</div>
	</section>

	<section class="section">
		<div class="section-head">
			<div class="label">05 · SHAPES</div>
			<h2 class="section-title">Container shapes</h2>
			<p class="section-sub">Six primitives. Confine the dye. Hover to splat.</p>
		</div>
		<div class="shape-grid">
			<article class="shape-cell card">
				<div class="cell-label">Circle</div>
				<div class="shape-canvas">
					<CircularFluid seed={601} lazy splatOnHover aria-label="Circle container shape" />
				</div>
			</article>
			<article class="shape-cell card">
				<div class="cell-label">Rounded rect</div>
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
			<article class="shape-cell card">
				<div class="cell-label">Frame</div>
				<div class="shape-canvas">
					<FrameFluid seed={603} lazy splatOnHover aria-label="Frame container shape" />
				</div>
			</article>
			<article class="shape-cell card">
				<div class="cell-label">Annulus</div>
				<div class="shape-canvas">
					<AnnularFluid seed={604} lazy splatOnHover aria-label="Annulus container shape" />
				</div>
			</article>
			<article class="shape-cell card">
				<div class="cell-label">SVG path</div>
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
						aria-label="SVG path container shape"
					/>
				</div>
			</article>
			<article class="shape-cell card">
				<div class="cell-label">Text glyph</div>
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
						aria-label="Text glyph container shape"
					/>
				</div>
			</article>
		</div>
	</section>

	<section class="section">
		<div class="section-head">
			<div class="label">06 · PHYSICS</div>
			<h2 class="section-title">Knobs and physics</h2>
			<p class="section-sub">Every prop optional. Reach for one when you want your own field.</p>
		</div>
		<div class="physics-grid">
			<article class="physics-cell card">
				<div class="cell-label">Default</div>
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
			<article class="physics-cell card">
				<div class="cell-label">Flat + soft</div>
				<div class="physics-canvas">
					<Fluid
						seed={5678}
						bloom={false}
						curl={5}
						densityDissipation={0.4}
						initialSplatCount={10}
						splatOnHover
						backColor={surfaceColor}
						lazy
						aria-label="Flat fluid with low curl"
					/>
				</div>
				<code class="physics-snippet">{'bloom={false} curl={5} densityDissipation={0.4}'}</code>
			</article>
			<article class="physics-cell card">
				<div class="cell-label">Bold splats</div>
				<div class="physics-canvas">
					<Fluid
						seed={9012}
						shading={false}
						splatRadius={0.8}
						splatForce={9000}
						initialSplatCount={8}
						splatOnHover
						backColor={surfaceColor}
						lazy
						aria-label="Fluid with large bold splats"
					/>
				</div>
				<code class="physics-snippet">{'shading={false} splatRadius={0.8} splatForce={9000}'}</code>
			</article>
			<article class="physics-cell card">
				<div class="cell-label">Slow + transparent</div>
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

	<section class="section">
		<div class="section-head">
			<div class="label">07 · GLASS</div>
			<h2 class="section-title">Refraction at the wall</h2>
			<p class="section-sub">A lens at the boundary. Chromatic fringes at the edge.</p>
		</div>
		<div class="glass-grid">
			<article class="glass-cell card">
				<div class="cell-label">Crystal orb</div>
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
			<article class="glass-cell card">
				<div class="cell-label">Soft lens</div>
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
			<article class="glass-cell card">
				<div class="cell-label">Portal ring</div>
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
			<article class="glass-cell card">
				<div class="cell-label">Glass frame</div>
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

	<section class="section">
		<div class="section-head">
			<div class="label">08 · STICKY</div>
			<h2 class="section-title">Sticky letterforms</h2>
			<p class="section-sub">Dye accumulates inside the glyph. Try the cursor.</p>
		</div>
		<div class="sticky-grid">
			<article class="sticky-cell card">
				<div class="cell-label">Inter · 800</div>
				<div class="sticky-canvas">
					<FluidStick
						text="LAGOON"
						font="800 100px 'Inter', system-ui, sans-serif"
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
			<article class="sticky-cell card">
				<div class="cell-label">Georgia · ∞</div>
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

	<section class="section">
		<div class="section-head">
			<div class="label">09 · REVEAL</div>
			<h2 class="section-title">Reveal</h2>
			<p class="section-sub">The fluid serves as an opacity mask. Drag to uncover.</p>
		</div>
		<div class="reveal-grid">
			<article class="reveal-cell card">
				<div class="cell-label">Scratch to reveal</div>
				<div class="reveal-canvas">
					<FluidReveal
						lazy
						velocityDissipation={0.95}
						pressureIterations={10}
						coverColor={{ r: 0.114, g: 0.22, b: 0.27 }}
						fringeColor={{ r: 0.45, g: 0.65, b: 0.75 }}
						accentColor={{ r: 0.83, g: 0.61, b: 0.42 }}
					>
						<div class="reveal-content">
							<span class="reveal-label">Revealed</span>
						</div>
					</FluidReveal>
				</div>
			</article>
			<article class="reveal-cell card">
				<div class="cell-label">Auto reveal</div>
				<div class="reveal-canvas">
					<FluidReveal
						lazy
						autoReveal={stickyAutoAnimate}
						autoRevealSpeed={0.8}
						fadeBack={false}
						velocityDissipation={0.95}
						sensitivity={0.15}
						coverColor={{ r: 0.114, g: 0.22, b: 0.27 }}
						fringeColor={{ r: 0.45, g: 0.65, b: 0.75 }}
						accentColor={{ r: 0.83, g: 0.61, b: 0.42 }}
					>
						<div class="reveal-content">
							<span class="reveal-label">Auto reveal</span>
						</div>
					</FluidReveal>
				</div>
			</article>
		</div>
	</section>

	<section class="section">
		<div class="section-head">
			<div class="label">10 · DISTORTION</div>
			<h2 class="section-title">Distortion</h2>
			<p class="section-sub">The velocity field warps the source image.</p>
		</div>
		<div class="distort-grid">
			<article class="distort-cell card">
				<div class="cell-label">Subtle · 0.3</div>
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
			<article class="distort-cell card">
				<div class="cell-label">Strong · 0.45</div>
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

	<section class="section">
		<div class="section-head">
			<div class="label">11 · PLAYGROUND</div>
			<h2 class="section-title">Playground</h2>
			<p class="section-sub">Turn the knobs. Watch the fluid respond. Take the snippet with you.</p>
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

		<div class="playground-grid card">
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
					<span>Snippet</span>
					<button class="copy-btn" onclick={copySnippet} aria-label="Copy playground snippet">
						{copiedSnippet ? 'Copied' : 'Copy'}
					</button>
				</div>
				<pre class="snippet-code"><code>{playgroundSnippet}</code></pre>
			</aside>
		</div>
	</section>

	<footer class="page-footer">
		<div class="footer-row">
			<div class="footer-left">SVELTE · FLUID</div>
			<div class="footer-mid">MIT · derivative of PavelDoGreat / WebGL-Fluid-Simulation (c) 2017</div>
			<div class="footer-right">LAGOON · 2026</div>
		</div>
	</footer>
</main>

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
		background: #1d3845;
	}

	.competition-back {
		position: fixed;
		top: 1rem;
		left: 1rem;
		z-index: 200;
		font-size: 0.7rem;
		font-weight: 500;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: rgba(240, 230, 210, 0.75);
		text-decoration: none;
		background: rgba(38, 74, 89, 0.85);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		border: 1px solid rgba(240, 230, 210, 0.18);
		border-radius: 999px;
		padding: 0.4rem 0.85rem;
		font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		transition: color 0.15s, border-color 0.15s;
	}
	.competition-back:hover {
		color: #f0e6d2;
		border-color: rgba(212, 155, 106, 0.6);
	}

	.page {
		--page-bg: #1d3845;
		--surface: #264a59;
		--ink: #f0e6d2;
		--ink-soft: rgba(240, 230, 210, 0.7);
		--ink-faint: rgba(240, 230, 210, 0.18);
		--accent: #d49b6a;
		--mono: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;

		background: var(--page-bg);
		color: var(--ink);
		font-family: 'Inter', system-ui, -apple-system, sans-serif;
		font-size: 15px;
		line-height: 1.6;
		max-width: 1280px;
		margin: 0 auto;
		padding: 0 32px;
	}

	.label {
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}

	.card {
		background: var(--surface);
		border: 1px solid var(--ink-faint);
		border-radius: 8px;
		overflow: hidden;
	}

	.hero {
		padding: 88px 0 72px;
	}
	.display {
		font-family: 'Inter', system-ui, sans-serif;
		font-weight: 700;
		font-size: clamp(2.6rem, 6.5vw, 5.2rem);
		line-height: 1.05;
		letter-spacing: -0.035em;
		margin: 16px 0 0;
		color: var(--ink);
		max-width: 18ch;
	}
	.serif-accent {
		font-family: 'Instrument Serif', Georgia, serif;
		font-style: italic;
		font-weight: 400;
		color: var(--accent);
		letter-spacing: -0.01em;
	}
	.tagline {
		max-width: 540px;
		font-size: clamp(1rem, 1.3vw, 1.15rem);
		color: var(--ink-soft);
		margin: 24px 0 36px;
	}

	.install-row {
		display: flex;
		align-items: stretch;
		max-width: 520px;
		border: 1px solid var(--ink-faint);
		border-radius: 8px;
		overflow: hidden;
		background: var(--surface);
	}
	.install-tabs {
		display: flex;
		border-right: 1px solid var(--ink-faint);
	}
	.tab {
		background: transparent;
		color: var(--ink-soft);
		border: 0;
		border-right: 1px solid var(--ink-faint);
		padding: 0 14px;
		font: inherit;
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		cursor: pointer;
		transition: color 0.15s, background 0.15s;
	}
	.tab:last-child {
		border-right: 0;
	}
	.tab.active {
		background: rgba(212, 155, 106, 0.12);
		color: var(--accent);
	}
	.install-box {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 16px;
		font-family: var(--mono);
		font-size: 13px;
		color: var(--ink);
	}
	.install-box .prompt {
		color: var(--accent);
	}

	.cta-row {
		margin-top: 28px;
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}
	.cta {
		display: inline-flex;
		align-items: center;
		padding: 10px 22px;
		border-radius: 999px;
		font-size: 13px;
		font-weight: 500;
		letter-spacing: 0.02em;
		text-decoration: none;
		transition: background 0.15s, color 0.15s, border-color 0.15s;
	}
	.cta-primary {
		background: var(--accent);
		color: #1d3845;
	}
	.cta-primary:hover {
		background: #e0a978;
	}
	.cta-ghost {
		background: transparent;
		color: var(--ink);
		border: 1px solid var(--ink-faint);
	}
	.cta-ghost:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.feature-pills {
		margin-top: 32px;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.feature-pill {
		font-family: var(--mono);
		font-size: 10.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		padding: 5px 10px;
		border: 1px solid var(--ink-faint);
		border-radius: 999px;
		color: var(--ink-soft);
	}

	.section {
		padding: 64px 0;
		border-top: 1px solid var(--ink-faint);
	}
	.section-head {
		margin-bottom: 32px;
	}
	.section-title {
		font-family: 'Inter', system-ui, sans-serif;
		font-weight: 600;
		font-size: clamp(1.6rem, 3vw, 2.4rem);
		line-height: 1.1;
		letter-spacing: -0.02em;
		margin: 8px 0 0;
		color: var(--ink);
	}
	.section-sub {
		margin: 12px 0 0;
		max-width: 560px;
		color: var(--ink-soft);
	}

	.mono-box {
		margin: 0;
		padding: 18px 22px;
		background: var(--surface);
		border: 1px solid var(--ink-faint);
		border-radius: 8px;
		font-family: var(--mono);
		font-size: 13px;
		color: var(--ink);
		overflow-x: auto;
	}

	.usage-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}
	.snippet {
		margin: 0;
		padding: 22px;
		background: var(--surface);
		border: 1px solid var(--ink-faint);
		border-radius: 8px;
		overflow-x: auto;
		font-family: var(--mono);
		font-size: 12.5px;
		line-height: 1.65;
		color: var(--ink);
	}
	.usage-preview {
		display: flex;
		flex-direction: column;
	}
	.cell-label {
		font-family: var(--mono);
		font-size: 10.5px;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		padding: 10px 14px;
		border-bottom: 1px solid var(--ink-faint);
		color: var(--ink-soft);
	}
	.fluid-host {
		flex: 1;
		min-height: 320px;
		position: relative;
	}

	.preset-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 16px;
	}
	.preset-cell {
		display: flex;
		flex-direction: column;
	}
	.cell-canvas {
		height: 320px;
		position: relative;
	}

	.shape-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 16px;
	}
	.shape-cell {
		display: flex;
		flex-direction: column;
	}
	.shape-canvas {
		height: 280px;
		position: relative;
	}

	.physics-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 16px;
	}
	.physics-cell {
		display: flex;
		flex-direction: column;
	}
	.physics-canvas {
		height: 280px;
		position: relative;
	}
	.physics-snippet {
		font-family: var(--mono);
		font-size: 10.5px;
		letter-spacing: 0.02em;
		padding: 10px 14px;
		border-top: 1px solid var(--ink-faint);
		color: var(--ink-soft);
		word-break: break-all;
		white-space: pre-wrap;
	}

	.glass-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 16px;
	}
	.glass-cell {
		display: flex;
		flex-direction: column;
	}
	.glass-canvas {
		height: 320px;
		position: relative;
	}

	.sticky-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
	}
	.sticky-cell {
		display: flex;
		flex-direction: column;
	}
	.sticky-canvas {
		height: 320px;
		position: relative;
	}

	.reveal-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
	}
	.reveal-cell {
		display: flex;
		flex-direction: column;
	}
	.reveal-canvas {
		height: 320px;
		position: relative;
	}
	.reveal-content {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		background: linear-gradient(135deg, #1a323d 0%, #20424f 100%);
	}
	.reveal-label {
		font-family: 'Instrument Serif', Georgia, serif;
		font-style: italic;
		font-size: 1.6rem;
		color: var(--ink);
	}

	.distort-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
	}
	.distort-cell {
		display: flex;
		flex-direction: column;
	}
	.distort-canvas {
		height: 320px;
		position: relative;
	}

	.preset-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 20px;
	}
	.preset-chip {
		background: transparent;
		color: var(--ink-soft);
		border: 1px solid var(--ink-faint);
		padding: 6px 14px;
		font: inherit;
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		border-radius: 999px;
		cursor: pointer;
		transition: background 0.12s, color 0.12s, border-color 0.12s;
	}
	.preset-chip:hover {
		color: var(--ink);
		border-color: var(--ink-soft);
	}
	.preset-chip.active {
		background: rgba(212, 155, 106, 0.15);
		color: var(--accent);
		border-color: var(--accent);
	}
	.preset-chip.reset {
		color: var(--accent);
		border-color: rgba(212, 155, 106, 0.5);
	}
	.preset-chip.reset:hover {
		background: var(--accent);
		color: var(--page-bg);
		border-color: var(--accent);
	}

	.playground-grid {
		display: grid;
		grid-template-columns: 1fr 320px;
	}
	.playground-canvas {
		min-height: 480px;
		position: relative;
		border-right: 1px solid var(--ink-faint);
	}
	.playground-panel {
		padding: 22px;
		display: flex;
		flex-direction: column;
		gap: 22px;
		overflow-y: auto;
		max-height: 600px;
	}
	.knob-group {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.knob-group-title {
		font-family: var(--mono);
		font-size: 10.5px;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		font-weight: 600;
		color: var(--ink-soft);
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
		font-size: 11.5px;
		color: var(--ink);
	}
	.knob-value {
		font-family: var(--mono);
		font-size: 11px;
		text-align: right;
		color: var(--ink-soft);
	}
	.knob-value.mono {
		font-family: var(--mono);
	}
	input[type='range'] {
		width: 100%;
		accent-color: var(--accent);
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
		background: rgba(240, 230, 210, 0.12);
		border: 1px solid var(--ink-faint);
		border-radius: 9px;
		position: relative;
		transition: background 0.15s, border-color 0.15s;
		flex-shrink: 0;
	}
	.toggle-pill::after {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: 12px;
		height: 12px;
		background: var(--ink-soft);
		border-radius: 50%;
		transition: transform 0.15s, background 0.15s;
	}
	.toggle-row input[type='checkbox']:checked ~ .toggle-pill {
		background: rgba(212, 155, 106, 0.25);
		border-color: var(--accent);
	}
	.toggle-row input[type='checkbox']:checked ~ .toggle-pill::after {
		transform: translateX(14px);
		background: var(--accent);
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
		border-radius: 4px;
	}
	.snippet-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-family: var(--mono);
		font-size: 10.5px;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ink-soft);
		border-bottom: 1px solid var(--ink-faint);
		padding-bottom: 6px;
	}
	.copy-btn {
		background: transparent;
		color: var(--accent);
		border: 1px solid rgba(212, 155, 106, 0.5);
		padding: 3px 10px;
		font: inherit;
		font-family: var(--mono);
		font-size: 10px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		cursor: pointer;
		border-radius: 999px;
		transition: background 0.12s, color 0.12s;
	}
	.copy-btn:hover {
		background: var(--accent);
		color: var(--page-bg);
	}
	.snippet-code {
		margin: 0;
		font-family: var(--mono);
		font-size: 11.5px;
		line-height: 1.6;
		white-space: pre-wrap;
		word-break: break-all;
		color: var(--ink);
	}

	.page-footer {
		padding: 56px 0 72px;
		border-top: 1px solid var(--ink-faint);
		margin-top: 32px;
	}
	.footer-row {
		display: grid;
		grid-template-columns: 1fr 2fr 1fr;
		gap: 24px;
		font-family: var(--mono);
		font-size: 10.5px;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}
	.footer-mid {
		text-align: center;
		text-transform: none;
		letter-spacing: 0.04em;
	}
	.footer-right {
		text-align: right;
	}

	@media (max-width: 1100px) {
		.physics-grid,
		.glass-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 900px) {
		.usage-grid,
		.preset-grid,
		.shape-grid,
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
		.playground-canvas {
			border-right: 0;
			border-bottom: 1px solid var(--ink-faint);
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

	@media (max-width: 640px) {
		.page {
			padding: 0 20px;
		}
		.hero {
			padding: 64px 0 48px;
		}
		.section {
			padding: 48px 0;
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
		.knob-row {
			grid-template-columns: 110px 1fr 44px;
		}
	}

	@media (max-width: 480px) {
		.page {
			padding: 0 14px;
		}
		.install-row {
			flex-direction: column;
		}
		.install-tabs {
			border-right: 0;
			border-bottom: 1px solid var(--ink-faint);
		}
	}
</style>
