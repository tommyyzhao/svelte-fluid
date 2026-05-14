<script lang="ts">
	import { base } from '$app/paths';
	import {
		Fluid,
		FluidBackground,
		FluidReveal,
		FluidStick,
		FluidDistortion,
		LavaLamp,
		Plasma,
		InkInWater,
		FrozenSwirl,
		Aurora,
		ToroidalTempest,
		CircularFluid,
		FrameFluid,
		AnnularFluid
	} from '$lib/index.js';
	import type { RGB } from '$lib/index.js';

	type PM = 'bun' | 'npm' | 'pnpm' | 'yarn';

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

	const installCmds: Record<PM, string> = {
		bun: 'bun add svelte-fluid',
		npm: 'npm install svelte-fluid',
		pnpm: 'pnpm add svelte-fluid',
		yarn: 'yarn add svelte-fluid'
	};

	const usage = `<script>
  import { Fluid } from 'svelte-fluid';
<\/script>

<div style="width: 100%; height: 480px;">
  <Fluid seed={42} splatOnHover />
</div>`;

	let activeTab = $state<PM>('bun');
	let copiedInstall = $state(false);
	let copiedUsage = $state(false);
	let reducedMotion = $state(false);
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

	$effect(() => {
		if (typeof window === 'undefined') return;
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		reducedMotion = mq.matches;
		const onChange = (e: MediaQueryListEvent) => (reducedMotion = e.matches);
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	});

	const stickyAutoAnimate = $derived(!reducedMotion);

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
			await navigator.clipboard.writeText(usage);
			copiedUsage = true;
			setTimeout(() => (copiedUsage = false), 1200);
		} catch {
			copiedUsage = false;
		}
	}

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

	const presets = [
		{ idx: '01', name: 'LavaLamp', component: LavaLamp, seed: 11, slug: 'lavalamp' },
		{ idx: '02', name: 'Plasma', component: Plasma, seed: 22, slug: 'plasma' },
		{ idx: '03', name: 'InkInWater', component: InkInWater, seed: 33, slug: 'inkinwater' },
		{ idx: '04', name: 'FrozenSwirl', component: FrozenSwirl, seed: 44, slug: 'frozenswirl' },
		{ idx: '05', name: 'Aurora', component: Aurora, seed: 55, slug: 'aurora' },
		{
			idx: '06',
			name: 'ToroidalTempest',
			component: ToroidalTempest,
			seed: 66,
			slug: 'toroidaltempest'
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
			src: 'hero.webp',
			strength: 0.45,
			intensity: 28,
			scale: 1.0,
			caption: 'STRONG · STRENGTH 0.45'
		}
	];

	const leaf =
		'M 50 6 C 78 18 92 38 88 60 C 82 84 60 94 50 94 C 40 94 18 84 12 60 C 8 38 22 18 50 6 Z';

	const manifest = [
		{ n: '01', t: 'multi-instance.' },
		{ n: '02', t: 'resize-stable.' },
		{ n: '03', t: 'deterministic seeding.' },
		{ n: '04', t: 'MIT licensed.' },
		{ n: '05', t: 'zero runtime deps.' },
		{ n: '06', t: '70+ props.' },
		{ n: '07', t: '10 presets.' },
		{ n: '08', t: 'sticky text masks.' },
		{ n: '09', t: 'image distortion.' },
		{ n: '10', t: 'six container shape primitives.' }
	];
</script>

<svelte:head>
	<title>svelte-fluid — Flagship</title>
</svelte:head>

<a class="competition-back" href="{base}/design-competition">← Competition</a>

<main class="page">
	<header class="top-strip">
		<span class="wordmark">svelte-fluid</span>
		<nav class="topnav">
			<a href="{base}/docs">DOCS</a>
			<span class="dot">·</span>
			<a href="https://github.com/tommyyzhao/svelte-fluid" target="_blank" rel="noreferrer"
				>GITHUB</a
			>
			<span class="dot">·</span>
			<a href="{base}/docs">README</a>
		</nav>
	</header>

	<!-- § 01 — HERO with sticky-title FluidBackground -->
	<section class="hero-box">
		<div class="hero-gutter">§ 01 / TITLE</div>
		<FluidBackground
			class="hero-bg"
			simResolution={128}
			dyeResolution={1024}
			pressureIterations={20}
			bloomIterations={8}
			sticky={true}
			stickyMask={{
				text: 'FLUID',
				font: '900 280px "Geist", "Inter", system-ui, sans-serif',
				padding: 0.92,
				blur: 2,
				maskResolution: 1024
			}}
			stickyStrength={0.95}
			stickyPressure={0.15}
			stickyAmplify={1.2}
			colorful
			shading
			bloom
			bloomIntensity={0.18}
			splatOnHover
			densityDissipation={0.94}
			velocityDissipation={0.2}
			curl={20}
			splatRadius={0.5}
			splatForce={4500}
			initialSplatCount={reducedMotion ? 5 : 18}
			exclude=".hero-meta, .top-strip"
			excludeRadius={8}
		>
			<div class="hero-meta">
				<div class="eyebrow">§ 01 / TITLE</div>
				<p class="hero-tagline">
					WebGL fluid simulation as a Svelte 5 component. Multi-instance, resize-stable,
					<em>deterministic</em> seeding.
				</p>
				<div class="hero-links">
					<a class="hero-link" href="{base}/docs">→ Read the docs</a>
					<a
						class="hero-link"
						href="https://github.com/tommyyzhao/svelte-fluid"
						target="_blank"
						rel="noreferrer">→ GitHub</a
					>
				</div>
			</div>
		</FluidBackground>
	</section>

	<!-- § 02 — Install -->
	<section class="install">
		<div class="gutter">§ 02</div>
		<div class="install-grid">
			<div class="install-head">
				<div class="eyebrow">/ 02</div>
				<h2 class="serif">Install</h2>
			</div>
			<div class="install-body">
				<div class="tabrow">
					{#each ['bun', 'npm', 'pnpm', 'yarn'] as tab (tab)}
						<button
							class="tab"
							class:active={activeTab === tab}
							onclick={() => (activeTab = tab as PM)}
						>
							{tab}
						</button>
					{/each}
				</div>
				<div class="cmd-row">
					<pre class="cmd"><code>$ {installCmds[activeTab]}</code></pre>
					<button class="copy" onclick={copyInstall} aria-label="Copy install command">
						{copiedInstall ? 'Copied!' : 'Copy'}
					</button>
				</div>
				<div class="rule"></div>
				<div class="snippet-head">
					<span class="eyebrow">Minimal usage</span>
					<button class="copy" onclick={copyUsage} aria-label="Copy usage snippet">
						{copiedUsage ? 'Copied!' : 'Copy'}
					</button>
				</div>
				<pre class="snippet"><code>{usage}</code></pre>
			</div>
		</div>
	</section>

	<!-- § 03 — Featured cinematic preset (Plasma) -->
	<section class="featured">
		<div class="gutter">§ 03</div>
		<div class="featured-grid">
			<div class="featured-stage">
				<Plasma seed={7} aria-label="Plasma featured" />
			</div>
			<div class="featured-copy">
				<div class="eyebrow">§ 03 / FEATURED</div>
				<h2 class="serif featured-title">Plasma.</h2>
				<p class="featured-body">
					High-curl, high-bloom turbulence. A bright, electric loop that breathes without
					attention. Drop it behind a hero, on a card, on a 404.
				</p>
				<a class="hero-link" href="{base}/docs/presets#plasma">→ View source</a>
			</div>
		</div>
	</section>

	<!-- § 04 — Presets (6) -->
	<section class="presets-head">
		<div class="gutter">§ 04</div>
		<div class="eyebrow">/ 04</div>
		<h2 class="serif">Presets.</h2>
		<p class="muted">Each fills its parent. Each accepts a seed. Each ships ready.</p>
	</section>
	<section class="presets">
		<div class="preset-grid">
			{#each presets as p (p.name)}
				{@const C = p.component}
				<article class="preset-cell">
					<div class="cell-label">§ 04.{p.idx} / {p.name.toUpperCase()}</div>
					<div class="cell-canvas">
						<C seed={p.seed} lazy aria-label="{p.name} preset" />
					</div>
					<div class="cell-hover">
						<code class="cell-snippet">&lt;{p.name} /&gt;</code>
						<a class="cell-link" href="{base}/docs/presets#{p.slug}">→</a>
					</div>
				</article>
			{/each}
		</div>
	</section>

	<!-- § 05 — Container shapes -->
	<section class="shapes-head">
		<div class="gutter">§ 05</div>
		<div class="eyebrow">/ 05</div>
		<h2 class="serif">Container shapes.</h2>
		<p class="muted">Six primitives. Analytical SDFs and rasterized mask textures.</p>
	</section>
	<section class="shapes">
		<div class="shape-grid">
			<article class="shape-cell">
				<div class="cell-label">§ 05.01 / CIRCLE</div>
				<div class="cell-canvas square">
					<CircularFluid seed={601} lazy aria-label="Circle container" />
				</div>
				<div class="cell-caption">Circle</div>
			</article>
			<article class="shape-cell">
				<div class="cell-label">§ 05.02 / ROUNDED RECT</div>
				<div class="cell-canvas square">
					<Fluid
						seed={602}
						containerShape={{
							type: 'roundedRect',
							cx: 0.5,
							cy: 0.5,
							halfW: 0.42,
							halfH: 0.42,
							cornerRadius: 0.08
						}}
						initialSplatCount={15}
						lazy
						aria-label="Rounded rect container"
					/>
				</div>
				<div class="cell-caption">RoundedRect</div>
			</article>
			<article class="shape-cell">
				<div class="cell-label">§ 05.03 / FRAME</div>
				<div class="cell-canvas square">
					<FrameFluid seed={603} lazy aria-label="Frame container" />
				</div>
				<div class="cell-caption">Frame</div>
			</article>
			<article class="shape-cell">
				<div class="cell-label">§ 05.04 / ANNULUS</div>
				<div class="cell-canvas square">
					<AnnularFluid seed={604} lazy aria-label="Annulus container" />
				</div>
				<div class="cell-caption">Annulus</div>
			</article>
			<article class="shape-cell">
				<div class="cell-label">§ 05.05 / SVG PATH</div>
				<div class="cell-canvas square">
					<Fluid
						seed={605}
						containerShape={{ type: 'svgPath', d: leaf, viewBox: [0, 0, 100, 100] }}
						initialSplatCount={15}
						lazy
						aria-label="SVG path container"
					/>
				</div>
				<div class="cell-caption">SvgPath</div>
			</article>
			<article class="shape-cell">
				<div class="cell-label">§ 05.06 / TEXTGLYPH</div>
				<div class="cell-canvas square">
					<Fluid
						seed={606}
						containerShape={{ type: 'svgPath', text: '&', font: '900 280px Georgia, serif' }}
						initialSplatCount={15}
						lazy
						aria-label="Text glyph container"
					/>
				</div>
				<div class="cell-caption">TextGlyph</div>
			</article>
		</div>
	</section>

	<!-- § 06 — Sticky mask gallery -->
	<section class="stick-head">
		<div class="gutter">§ 06</div>
		<div class="eyebrow">/ 06</div>
		<h2 class="serif">Sticky masks.</h2>
		<p class="muted">Dye clings to letterforms via mask textures and reduced dissipation.</p>
	</section>
	<section class="stick">
		<div class="stick-grid">
			<article class="stick-cell">
				<div class="cell-label">§ 06.01 / STICKY</div>
				<div class="cell-canvas">
					<FluidStick
						text="STICKY"
						font={'900 100px "Geist", "Inter", sans-serif'}
						seed={100}
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
				<div class="cell-caption">Sans · 900</div>
			</article>
			<article class="stick-cell">
				<div class="cell-label">§ 06.02 / INFINITY</div>
				<div class="cell-canvas">
					<FluidStick
						text="∞"
						font="200px Georgia, serif"
						seed={101}
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
				<div class="cell-caption">Serif glyph</div>
			</article>
		</div>
	</section>

	<!-- § 07 — Distortion gallery -->
	<section class="distort-head">
		<div class="gutter">§ 07</div>
		<div class="eyebrow">/ 07</div>
		<h2 class="serif">Image distortion.</h2>
		<p class="muted">Fluid velocity bends image UVs. Move the cursor to push pigment.</p>
	</section>
	<section class="distort">
		<div class="distort-grid">
			{#each distortCells as cell, i (cell.seed)}
				<article class="distort-cell">
					<div class="cell-label">§ 07.0{i + 1} / {cell.caption}</div>
					<div class="cell-canvas">
						<FluidDistortion
							src={`${base}/${cell.src}`}
							strength={cell.strength}
							intensity={cell.intensity}
							scale={cell.scale}
							lazy
						/>
					</div>
				</article>
			{/each}
		</div>
	</section>

	<!-- § 08 — Physics / raw Fluid -->
	<section class="physics-head">
		<div class="gutter">§ 08</div>
		<div class="eyebrow">/ 08</div>
		<h2 class="serif">Build with <code class="inline-code">&lt;Fluid /&gt;</code>.</h2>
		<p class="muted">Four configs. One component. Endless variation.</p>
	</section>
	<section class="physics">
		<div class="physics-grid">
			<article class="physics-cell">
				<div class="cell-label">§ 08.01 / DEFAULT</div>
				<div class="cell-canvas">
					<Fluid seed={1234} initialSplatCount={12} splatOnHover lazy aria-label="Default fluid" />
				</div>
				<div class="cell-caption">Default</div>
			</article>
			<article class="physics-cell">
				<div class="cell-label">§ 08.02 / FLAT + SOFT</div>
				<div class="cell-canvas">
					<Fluid
						seed={1235}
						bloom={false}
						curl={5}
						densityDissipation={0.4}
						initialSplatCount={12}
						splatOnHover
						lazy
						aria-label="Flat soft fluid"
					/>
				</div>
				<div class="cell-caption">bloom=false · curl=5 · dissipation=0.4</div>
			</article>
			<article class="physics-cell">
				<div class="cell-label">§ 08.03 / BOLD SPLATS</div>
				<div class="cell-canvas">
					<Fluid
						seed={1236}
						shading={false}
						splatRadius={0.8}
						splatForce={9000}
						initialSplatCount={12}
						splatOnHover
						lazy
						aria-label="Bold splats fluid"
					/>
				</div>
				<div class="cell-caption">shading=false · radius=0.8 · force=9000</div>
			</article>
			<article class="physics-cell">
				<div class="cell-label">§ 08.04 / SLOW + TRANSPARENT</div>
				<div class="cell-canvas">
					<Fluid
						seed={1237}
						velocityDissipation={0.05}
						densityDissipation={0.5}
						transparent
						initialSplatCount={12}
						splatOnHover
						lazy
						aria-label="Slow transparent fluid"
					/>
				</div>
				<div class="cell-caption">slow velocity · transparent</div>
			</article>
		</div>
	</section>

	<!-- § 09 — Glass / Refraction -->
	<section class="glass-head">
		<div class="gutter">§ 09</div>
		<div class="eyebrow">/ 09</div>
		<h2 class="serif">Refraction.</h2>
		<p class="muted">Glass adds a lens — refraction at the wall, chromatic fringes at the edge.</p>
	</section>
	<section class="glass">
		<div class="glass-grid">
			<article class="glass-cell">
				<div class="cell-label">§ 09.01 / CRYSTAL ORB</div>
				<div class="cell-canvas square">
					<Fluid
						seed={1111}
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
						lazy
						aria-label="Crystal orb glass demo"
					/>
				</div>
				<div class="cell-caption">Crystal Orb</div>
			</article>
			<article class="glass-cell">
				<div class="cell-label">§ 09.02 / SOFT LENS</div>
				<div class="cell-canvas square">
					<Fluid
						seed={1212}
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
						lazy
						aria-label="Soft lens glass demo"
					/>
				</div>
				<div class="cell-caption">Soft Lens</div>
			</article>
			<article class="glass-cell">
				<div class="cell-label">§ 09.03 / PORTAL RING</div>
				<div class="cell-canvas square">
					<Fluid
						seed={1313}
						glass
						glassThickness={0.05}
						glassRefraction={0.6}
						glassReflectivity={0.15}
						glassChromatic={0.7}
						containerShape={{ type: 'annulus', cx: 0.5, cy: 0.5, innerRadius: 0.15, outerRadius: 0.42 }}
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
						lazy
						aria-label="Portal ring glass demo"
					/>
				</div>
				<div class="cell-caption">Portal Ring</div>
			</article>
			<article class="glass-cell">
				<div class="cell-label">§ 09.04 / GLASS FRAME</div>
				<div class="cell-canvas square">
					<Fluid
						seed={1414}
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
						lazy
						aria-label="Glass frame demo"
					/>
				</div>
				<div class="cell-caption">Glass Frame</div>
			</article>
		</div>
	</section>

	<!-- § 10 — Reveal -->
	<section class="reveal-head">
		<div class="gutter">§ 10</div>
		<div class="eyebrow">/ 10</div>
		<h2 class="serif">Reveal.</h2>
		<p class="muted">FluidReveal uses the simulation as an opacity mask. Scratch or auto-uncover.</p>
	</section>
	<section class="reveal-demo">
		<div class="reveal-grid">
			<article class="reveal-cell">
				<div class="cell-label">§ 10.01 / SCRATCH TO REVEAL</div>
				<div class="cell-canvas reveal-canvas">
					<FluidReveal lazy velocityDissipation={0.95} pressureIterations={10}>
						<div class="reveal-content">Scratch to reveal</div>
					</FluidReveal>
				</div>
				<div class="cell-caption">Pointer-driven</div>
			</article>
			<article class="reveal-cell">
				<div class="cell-label">§ 10.02 / AUTO REVEAL</div>
				<div class="cell-canvas reveal-canvas">
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
				<div class="cell-caption">Auto-reveal · no fade-back</div>
			</article>
		</div>
	</section>

	<!-- § 11 — Playground -->
	<section class="play-head">
		<div class="gutter">§ 11</div>
		<div class="eyebrow">/ 11</div>
		<h2 class="serif">Playground.</h2>
		<p class="muted">Drag knobs. The fluid updates live. Copy the snippet when done.</p>
	</section>
	<section class="play">
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
			<button type="button" class="preset-chip reset-chip" onclick={resetPlayground}>Reset</button>
		</div>
		<div class="playground-grid">
			<div class="playground-canvas">
				<Fluid
					seed={4242}
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
					lazy
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
				<div class="pg-snippet-head">
					<span class="eyebrow">snippet</span>
					<button class="copy" onclick={copySnippet} aria-label="Copy playground snippet">
						{copiedSnippet ? 'Copied!' : 'Copy'}
					</button>
				</div>
				<pre class="snippet pg-snippet"><code>{playgroundSnippet}</code></pre>
			</aside>
		</div>
	</section>

	<!-- § 12 — Manifest -->
	<section class="manifest">
		<div class="gutter">§ 12</div>
		<div class="manifest-grid">
			<div class="manifest-head">
				<div class="eyebrow">/ 12</div>
				<h2 class="serif small">Manifest.</h2>
			</div>
			<ol class="manifest-list">
				{#each manifest as m (m.n)}
					<li>
						<span class="m-n">{m.n}</span>
						<span class="m-t">— {m.t}</span>
					</li>
				{/each}
			</ol>
		</div>
	</section>

	<footer class="page-footer">
		<div class="footer-rule"></div>
		<div class="footer-row">
			<div class="f-cluster">
				<div class="f-head">LIBRARY</div>
				<a
					class="f-link"
					href="https://github.com/tommyyzhao/svelte-fluid"
					target="_blank"
					rel="noreferrer">GitHub</a
				>
				<a class="f-link" href="{base}/docs">Docs</a>
				<a
					class="f-link"
					href="https://github.com/tommyyzhao/svelte-fluid/issues"
					target="_blank"
					rel="noreferrer">Issues</a
				>
				<a
					class="f-link"
					href="https://github.com/tommyyzhao/svelte-fluid/blob/main/LICENSE"
					target="_blank"
					rel="noreferrer">License</a
				>
			</div>
			<div class="f-cluster">
				<div class="f-head">PROJECT</div>
				<a
					class="f-link"
					href="https://github.com/tommyyzhao/svelte-fluid/blob/main/CONTRIBUTING.md"
					target="_blank"
					rel="noreferrer">Contributing</a
				>
				<a
					class="f-link"
					href="https://github.com/tommyyzhao/svelte-fluid/blob/main/CHANGELOG.md"
					target="_blank"
					rel="noreferrer">Changelog</a
				>
			</div>
			<div class="f-cluster">
				<div class="f-head">CREDIT</div>
				<div class="f-note">
					Derivative work of PavelDoGreat/WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017.
				</div>
				<div class="f-note dim">M I T · 2 0 2 6</div>
			</div>
		</div>
	</footer>
</main>

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
		background: #0a0a0a;
	}

	.page {
		--ink: #0a0a0a;
		--paper: #f5f1ea;
		--muted: #888;
		--hair: rgba(245, 241, 234, 0.12);
		--accent: #ffb84d;
		--serif: 'Times New Roman', 'Cormorant Garamond', Georgia, serif;
		--mono: ui-monospace, 'JetBrains Mono', 'Geist Mono', 'SFMono-Regular', Menlo, monospace;

		background: var(--ink);
		color: var(--paper);
		font-family: var(--mono);
		font-size: 0.875rem;
		line-height: 1.6;
		max-width: 1320px;
		margin: 0 auto;
		padding: 0 24px;
	}

	.top-strip {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 18px 0;
		border-bottom: 1px solid var(--hair);
		position: relative;
		z-index: 5;
	}
	.wordmark {
		font-family: var(--serif);
		font-style: italic;
		font-weight: 600;
		font-size: 1rem;
		letter-spacing: -0.02em;
	}
	.topnav {
		display: flex;
		gap: 14px;
		font-size: 0.72rem;
		letter-spacing: 0.22em;
	}
	.topnav a {
		color: var(--paper);
		text-decoration: none;
		transition: color 140ms ease;
	}
	.topnav a:hover {
		color: var(--accent);
	}
	.dot {
		color: var(--muted);
	}

	.gutter {
		position: absolute;
		left: -12px;
		top: 20px;
		font-family: var(--mono);
		font-size: 0.68rem;
		letter-spacing: 0.28em;
		color: var(--accent);
		text-transform: uppercase;
		z-index: 4;
	}

	.eyebrow {
		font-family: var(--mono);
		font-size: 0.68rem;
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.serif {
		font-family: var(--serif);
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1;
		margin: 0;
	}
	.serif.small {
		font-size: clamp(1.6rem, 2.4vw, 2rem);
	}
	.muted {
		color: var(--muted);
	}

	/* § 01 HERO */
	.hero-box {
		position: relative;
		min-height: 92vh;
		border: 1px solid var(--hair);
		border-top: 0;
		overflow: hidden;
	}
	.hero-gutter {
		position: absolute;
		left: 12px;
		top: 14px;
		font-family: var(--mono);
		font-size: 0.68rem;
		letter-spacing: 0.28em;
		color: var(--accent);
		text-transform: uppercase;
		z-index: 4;
		pointer-events: none;
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.7);
	}
	:global(.hero-box .svelte-fluid-bg) {
		position: absolute;
		inset: 0;
		min-height: 0;
		height: 100%;
	}
	:global(.hero-box .svelte-fluid-bg__canvas) {
		position: absolute;
	}
	.hero-meta {
		position: absolute;
		left: 32px;
		bottom: 32px;
		max-width: 420px;
		padding: 22px 24px;
		border: 1px solid var(--hair);
		background: rgba(10, 10, 10, 0.78);
		backdrop-filter: blur(6px);
		display: flex;
		flex-direction: column;
		gap: 14px;
		z-index: 3;
		pointer-events: auto;
	}
	.hero-tagline {
		font-family: var(--serif);
		font-style: italic;
		font-weight: 500;
		font-size: 1.05rem;
		line-height: 1.45;
		color: var(--paper);
		margin: 0;
	}
	.hero-tagline em {
		font-style: italic;
		color: var(--accent);
		font-weight: 600;
	}
	.hero-links {
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 0.78rem;
		letter-spacing: 0.1em;
	}
	.hero-link {
		color: var(--paper);
		text-decoration: none;
		border-bottom: 1px solid var(--hair);
		padding-bottom: 4px;
		width: max-content;
		transition:
			color 140ms ease,
			border-color 140ms ease;
		font-family: var(--mono);
	}
	.hero-link:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	/* § 02 INSTALL */
	.install {
		position: relative;
		border: 1px solid var(--hair);
		border-top: 0;
		min-height: 260px;
	}
	.install-grid {
		display: grid;
		grid-template-columns: 33% 67%;
		min-height: 260px;
	}
	.install-head {
		padding: 36px 36px;
		border-right: 1px solid var(--hair);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.install-head h2 {
		font-size: clamp(2rem, 3.4vw, 2.8rem);
	}
	.install-body {
		padding: 28px 36px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.tabrow {
		display: flex;
		gap: 0;
	}
	.tab {
		font: inherit;
		font-family: var(--mono);
		font-size: 0.72rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		background: transparent;
		color: var(--muted);
		border: 0;
		border-bottom: 1px solid var(--hair);
		padding: 8px 18px 10px;
		cursor: pointer;
		transition:
			color 140ms ease,
			border-color 140ms ease;
	}
	.tab:hover {
		color: var(--paper);
	}
	.tab.active {
		color: var(--paper);
		border-bottom-color: var(--accent);
	}
	.cmd-row {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.cmd {
		flex: 1;
		margin: 0;
		font-family: var(--mono);
		font-size: 1.1rem;
		color: var(--paper);
		overflow-x: auto;
		padding: 6px 0;
	}
	.copy {
		font: inherit;
		font-family: var(--mono);
		font-size: 0.7rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		background: transparent;
		color: var(--muted);
		border: 1px solid var(--hair);
		padding: 8px 14px;
		cursor: pointer;
		transition:
			color 140ms ease,
			border-color 140ms ease;
	}
	.copy:hover {
		color: var(--accent);
		border-color: var(--accent);
	}
	.rule {
		height: 1px;
		background: var(--hair);
	}
	.snippet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.snippet {
		margin: 0;
		font-family: var(--mono);
		font-size: 0.8rem;
		color: var(--paper);
		line-height: 1.6;
		overflow-x: auto;
		white-space: pre;
	}

	/* § 03 FEATURED */
	.featured {
		position: relative;
		border: 1px solid var(--hair);
		border-top: 0;
		min-height: 80vh;
		background: #100a06;
	}
	.featured-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		min-height: 80vh;
	}
	.featured-stage {
		position: relative;
		border-right: 1px solid var(--hair);
		background: #050505;
	}
	.featured-copy {
		padding: 56px 56px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 22px;
	}
	.featured-title {
		font-family: var(--serif);
		font-style: italic;
		font-weight: 700;
		font-size: clamp(3rem, 6vw, 5.5rem);
		line-height: 0.95;
		letter-spacing: -0.02em;
		margin: 0;
	}
	.featured-body {
		font-family: var(--serif);
		font-style: italic;
		font-weight: 400;
		font-size: 1.15rem;
		line-height: 1.5;
		color: var(--muted);
		max-width: 42ch;
		margin: 0;
	}

	/* § 04 PRESETS */
	.presets-head {
		position: relative;
		border: 1px solid var(--hair);
		border-top: 0;
		padding: 44px 36px 28px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.presets-head h2 {
		font-size: clamp(1.8rem, 3.2vw, 2.6rem);
	}
	.presets {
		position: relative;
		border: 1px solid var(--hair);
		border-top: 0;
	}
	.preset-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
	}
	.preset-cell {
		position: relative;
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--hair);
		border-top: 1px solid var(--hair);
		overflow: hidden;
	}
	.preset-cell:nth-child(3n) {
		border-right: 0;
	}
	.preset-cell:nth-child(-n + 3) {
		border-top: 0;
	}
	.cell-label {
		font-family: var(--mono);
		font-size: 0.62rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--muted);
		position: absolute;
		top: 10px;
		left: 12px;
		z-index: 2;
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.7);
	}
	.cell-canvas {
		height: 380px;
		position: relative;
		background: #050505;
	}
	.cell-canvas.square {
		height: auto;
		aspect-ratio: 1 / 1;
	}
	.cell-hover {
		position: absolute;
		right: 12px;
		bottom: 10px;
		display: flex;
		align-items: center;
		gap: 10px;
		opacity: 0;
		transform: translateY(4px);
		transition:
			opacity 180ms ease,
			transform 180ms ease;
		pointer-events: none;
		z-index: 2;
	}
	.preset-cell:hover .cell-hover,
	.preset-cell:focus-within .cell-hover {
		opacity: 1;
		transform: translateY(0);
		pointer-events: auto;
	}
	.cell-snippet {
		font-family: var(--mono);
		font-size: 0.72rem;
		color: var(--paper);
		background: rgba(10, 10, 10, 0.78);
		border: 1px solid var(--hair);
		padding: 4px 8px;
		backdrop-filter: blur(4px);
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.7);
	}
	.cell-link {
		color: var(--accent);
		text-decoration: none;
		font-family: var(--mono);
		font-size: 0.95rem;
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.7);
		transition: transform 140ms ease;
	}
	.cell-link:hover {
		transform: translateX(4px);
	}

	/* § 05 SHAPES */
	.shapes-head {
		position: relative;
		border: 1px solid var(--hair);
		border-top: 0;
		padding: 36px 36px 24px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.shapes {
		position: relative;
		border: 1px solid var(--hair);
		border-top: 0;
	}
	.shape-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
	}
	.shape-cell {
		position: relative;
		border-right: 1px solid var(--hair);
		border-top: 1px solid var(--hair);
		display: flex;
		flex-direction: column;
	}
	.shape-cell:nth-child(3n) {
		border-right: 0;
	}
	.shape-cell:nth-child(-n + 3) {
		border-top: 0;
	}
	.shape-cell .cell-caption {
		font-family: var(--mono);
		font-size: 0.7rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--muted);
		padding: 12px 16px;
		border-top: 1px solid var(--hair);
	}

	/* § 06 STICK */
	.stick-head {
		position: relative;
		border: 1px solid var(--hair);
		border-top: 0;
		padding: 36px 36px 24px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.stick {
		position: relative;
		border: 1px solid var(--hair);
		border-top: 0;
	}
	.stick-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
	}
	.stick-cell {
		position: relative;
		border-right: 1px solid var(--hair);
		display: flex;
		flex-direction: column;
	}
	.stick-cell:last-child {
		border-right: 0;
	}
	.stick-cell .cell-canvas {
		height: 360px;
	}
	.stick-cell .cell-caption {
		font-family: var(--mono);
		font-size: 0.7rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--muted);
		padding: 12px 16px;
		border-top: 1px solid var(--hair);
	}

	/* § 07 DISTORT */
	.distort-head {
		position: relative;
		border: 1px solid var(--hair);
		border-top: 0;
		padding: 36px 36px 24px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.distort {
		position: relative;
		border: 1px solid var(--hair);
		border-top: 0;
	}
	.distort-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
	}
	.distort-cell {
		position: relative;
		border-right: 1px solid var(--hair);
		display: flex;
		flex-direction: column;
	}
	.distort-cell:last-child {
		border-right: 0;
	}
	.distort-cell .cell-canvas {
		height: 420px;
	}

	/* § 08 PHYSICS */
	.physics-head {
		position: relative;
		border: 1px solid var(--hair);
		border-top: 0;
		padding: 36px 36px 24px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.inline-code {
		font-family: var(--mono);
		font-size: 0.85em;
		color: var(--accent);
		background: rgba(255, 184, 77, 0.1);
		padding: 0.1em 0.35em;
		border-radius: 3px;
	}
	.physics {
		position: relative;
		border: 1px solid var(--hair);
		border-top: 0;
	}
	.physics-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
	}
	.physics-cell {
		position: relative;
		border-right: 1px solid var(--hair);
		border-top: 1px solid var(--hair);
		display: flex;
		flex-direction: column;
	}
	.physics-cell:nth-child(2n) {
		border-right: 0;
	}
	.physics-cell:nth-child(-n + 2) {
		border-top: 0;
	}
	.physics-cell .cell-canvas {
		height: 380px;
	}
	.physics-cell .cell-caption {
		font-family: var(--mono);
		font-size: 0.7rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--muted);
		padding: 12px 16px;
		border-top: 1px solid var(--hair);
	}

	/* § 09 GLASS */
	.glass-head {
		position: relative;
		border: 1px solid var(--hair);
		border-top: 0;
		padding: 36px 36px 24px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.glass {
		position: relative;
		border: 1px solid var(--hair);
		border-top: 0;
	}
	.glass-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
	}
	.glass-cell {
		position: relative;
		border-right: 1px solid var(--hair);
		border-top: 1px solid var(--hair);
		display: flex;
		flex-direction: column;
	}
	.glass-cell:nth-child(2n) {
		border-right: 0;
	}
	.glass-cell:nth-child(-n + 2) {
		border-top: 0;
	}
	.glass-cell .cell-canvas.square {
		height: auto;
		aspect-ratio: 1 / 1;
	}
	.glass-cell .cell-caption {
		font-family: var(--mono);
		font-size: 0.7rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--muted);
		padding: 12px 16px;
		border-top: 1px solid var(--hair);
	}

	/* § 10 REVEAL */
	.reveal-head {
		position: relative;
		border: 1px solid var(--hair);
		border-top: 0;
		padding: 36px 36px 24px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.reveal-demo {
		position: relative;
		border: 1px solid var(--hair);
		border-top: 0;
	}
	.reveal-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
	}
	.reveal-cell {
		position: relative;
		border-right: 1px solid var(--hair);
		display: flex;
		flex-direction: column;
	}
	.reveal-cell:last-child {
		border-right: 0;
	}
	.reveal-canvas {
		height: 380px;
		position: relative;
		background: #050505;
	}
	.reveal-content {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--serif);
		font-style: italic;
		font-size: clamp(1.8rem, 4vw, 3rem);
		font-weight: 700;
		color: var(--paper);
		background: linear-gradient(135deg, #1a0533 0%, #0a1a2e 50%, #001a0a 100%);
		letter-spacing: -0.02em;
	}
	.reveal-cell .cell-caption {
		font-family: var(--mono);
		font-size: 0.7rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--muted);
		padding: 12px 16px;
		border-top: 1px solid var(--hair);
	}

	/* § 11 PLAYGROUND */
	.play-head {
		position: relative;
		border: 1px solid var(--hair);
		border-top: 0;
		padding: 36px 36px 24px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.play {
		position: relative;
		border: 1px solid var(--hair);
		border-top: 0;
		padding: 28px 36px 36px;
	}
	.preset-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 24px;
	}
	.preset-chip {
		font: inherit;
		font-family: var(--mono);
		font-size: 0.7rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		background: transparent;
		color: var(--muted);
		border: 1px solid var(--hair);
		padding: 6px 14px;
		cursor: pointer;
		border-radius: 2px;
		transition:
			color 140ms ease,
			border-color 140ms ease,
			background 140ms ease;
	}
	.preset-chip:hover {
		color: var(--paper);
		border-color: rgba(245, 241, 234, 0.3);
	}
	.preset-chip.active {
		color: var(--accent);
		border-color: var(--accent);
		background: rgba(255, 184, 77, 0.08);
	}
	.reset-chip {
		margin-left: auto;
	}
	.playground-grid {
		display: grid;
		grid-template-columns: 1fr 380px;
		gap: 0;
		border: 1px solid var(--hair);
		min-height: 480px;
	}
	.playground-canvas {
		position: relative;
		border-right: 1px solid var(--hair);
		background: #050505;
		min-height: 480px;
	}
	.playground-panel {
		padding: 24px 20px;
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
		font-family: var(--mono);
		font-size: 0.62rem;
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: var(--accent);
		padding-bottom: 6px;
		border-bottom: 1px solid var(--hair);
	}
	.knob-row {
		display: grid;
		grid-template-columns: 140px 1fr 56px;
		gap: 10px;
		align-items: center;
		cursor: pointer;
	}
	.knob-label {
		font-family: var(--mono);
		font-size: 0.7rem;
		color: var(--muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.knob-value {
		font-family: var(--mono);
		font-size: 0.7rem;
		color: var(--paper);
		text-align: right;
	}
	.knob-value.mono {
		letter-spacing: 0.04em;
	}
	input[type='range'] {
		width: 100%;
		accent-color: var(--accent);
		cursor: pointer;
	}
	.toggle-row {
		display: flex;
		align-items: center;
		gap: 10px;
		cursor: pointer;
		position: relative;
	}
	.toggle-row input[type='checkbox'] {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}
	.toggle-pill {
		display: inline-block;
		width: 34px;
		height: 18px;
		border-radius: 9px;
		background: var(--hair);
		border: 1px solid rgba(245, 241, 234, 0.18);
		position: relative;
		flex-shrink: 0;
		transition: background 140ms ease;
	}
	.toggle-pill::after {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--muted);
		transition:
			left 140ms ease,
			background 140ms ease;
	}
	.toggle-row input[type='checkbox']:checked ~ .toggle-pill {
		background: rgba(255, 184, 77, 0.2);
		border-color: var(--accent);
	}
	.toggle-row input[type='checkbox']:checked ~ .toggle-pill::after {
		left: 18px;
		background: var(--accent);
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
		border: 1px solid var(--hair);
		border-radius: 2px;
		padding: 0;
		background: none;
		cursor: pointer;
	}
	.pg-snippet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-top: 8px;
		border-top: 1px solid var(--hair);
	}
	.pg-snippet {
		margin: 0;
		font-size: 0.72rem;
		line-height: 1.55;
		color: var(--paper);
		overflow-x: auto;
		white-space: pre;
		background: rgba(245, 241, 234, 0.04);
		padding: 10px 12px;
		border: 1px solid var(--hair);
	}

	/* competition back-link */
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

	/* § 12 MANIFEST */
	.manifest {
		position: relative;
		border: 1px solid var(--hair);
		border-top: 0;
		padding: 44px 36px;
	}
	.manifest-grid {
		display: grid;
		grid-template-columns: 220px 1fr;
		gap: 32px;
	}
	.manifest-head {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.manifest-list {
		list-style: none;
		margin: 0;
		padding: 0;
		column-count: 2;
		column-gap: 48px;
	}
	.manifest-list li {
		break-inside: avoid;
		padding: 10px 0;
		border-bottom: 1px solid var(--hair);
		display: grid;
		grid-template-columns: 40px 1fr;
		gap: 12px;
		align-items: baseline;
	}
	.m-n {
		font-family: var(--mono);
		font-size: 0.72rem;
		letter-spacing: 0.22em;
		color: var(--accent);
	}
	.m-t {
		font-family: var(--serif);
		font-style: italic;
		font-weight: 500;
		font-size: 1.1rem;
		color: var(--paper);
	}

	/* FOOTER */
	.page-footer {
		padding: 32px 0 56px;
	}
	.footer-rule {
		height: 1px;
		background: var(--hair);
		margin-bottom: 28px;
	}
	.footer-row {
		display: grid;
		grid-template-columns: 1fr 1fr 1.6fr;
		gap: 36px;
		font-family: var(--mono);
		font-size: 0.72rem;
		color: var(--muted);
	}
	.f-cluster {
		display: flex;
		flex-direction: column;
		gap: 8px;
		border-top: 1px solid var(--hair);
		padding-top: 14px;
	}
	.f-head {
		font-size: 0.68rem;
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: var(--accent);
		margin-bottom: 4px;
	}
	.f-link {
		color: var(--paper);
		text-decoration: none;
		font-size: 0.78rem;
		letter-spacing: 0.04em;
		transition: color 140ms ease;
		width: max-content;
	}
	.f-link:hover {
		color: var(--accent);
	}
	.f-note {
		font-size: 0.72rem;
		line-height: 1.5;
		color: var(--muted);
		letter-spacing: 0.02em;
	}
	.f-note.dim {
		letter-spacing: 0.22em;
		text-transform: uppercase;
		font-size: 0.66rem;
		margin-top: 4px;
	}

	/* Responsive */
	@media (max-width: 1100px) {
		.playground-grid {
			grid-template-columns: 1fr 320px;
		}
	}

	@media (max-width: 960px) {
		.install-grid,
		.featured-grid,
		.manifest-grid {
			grid-template-columns: 1fr;
		}
		.install-head,
		.featured-stage {
			border-right: 0;
			border-bottom: 1px solid var(--hair);
		}
		.preset-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.preset-cell {
			border-right: 1px solid var(--hair);
			border-top: 1px solid var(--hair);
		}
		.preset-cell:nth-child(3n) {
			border-right: 1px solid var(--hair);
		}
		.preset-cell:nth-child(-n + 3) {
			border-top: 1px solid var(--hair);
		}
		.preset-cell:nth-child(2n) {
			border-right: 0;
		}
		.preset-cell:nth-child(-n + 2) {
			border-top: 0;
		}
		.shape-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.shape-cell:nth-child(3n) {
			border-right: 1px solid var(--hair);
		}
		.shape-cell:nth-child(-n + 3) {
			border-top: 1px solid var(--hair);
		}
		.shape-cell:nth-child(2n) {
			border-right: 0;
		}
		.shape-cell:nth-child(-n + 2) {
			border-top: 0;
		}
		.stick-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.distort-grid {
			grid-template-columns: 1fr;
		}
		.distort-cell {
			border-right: 0;
			border-bottom: 1px solid var(--hair);
		}
		.distort-cell:last-child {
			border-bottom: 0;
		}
		.physics-grid,
		.glass-grid,
		.reveal-grid {
			grid-template-columns: 1fr;
		}
		.physics-cell,
		.glass-cell,
		.reveal-cell {
			border-right: 0;
			border-top: 1px solid var(--hair);
		}
		.physics-cell:first-child,
		.glass-cell:first-child,
		.reveal-cell:first-child {
			border-top: 0;
		}
		.playground-grid {
			grid-template-columns: 1fr;
		}
		.playground-canvas {
			border-right: 0;
			border-bottom: 1px solid var(--hair);
			min-height: 360px;
		}
		.manifest-list {
			column-count: 1;
		}
		.hero-meta {
			left: 16px;
			right: 16px;
			bottom: 16px;
			max-width: none;
		}
		.footer-row {
			grid-template-columns: 1fr;
			gap: 20px;
		}
	}

	@media (max-width: 720px) {
		.shape-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 640px) {
		.page {
			padding: 0 16px;
		}
		.preset-grid,
		.stick-grid {
			grid-template-columns: 1fr;
		}
		.preset-cell,
		.stick-cell {
			border-right: 0;
			border-top: 1px solid var(--hair);
		}
		.preset-cell:first-child,
		.stick-cell:first-child {
			border-top: 0;
		}
		.preset-cell .cell-canvas {
			height: 320px;
		}
		.stick-cell .cell-canvas {
			height: 300px;
		}
		.distort-cell .cell-canvas {
			height: 320px;
		}
		.physics-cell .cell-canvas,
		.reveal-canvas {
			height: 280px;
		}
		.play {
			padding: 20px 16px 28px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.cell-hover,
		.cell-link,
		.hero-link,
		.topnav a,
		.tab,
		.copy,
		.f-link {
			transition: none !important;
		}
		.preset-cell:hover .cell-hover,
		.preset-cell:focus-within .cell-hover {
			transform: none;
		}
	}
</style>
