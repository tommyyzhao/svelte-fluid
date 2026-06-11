<script lang="ts">
	import {
		AnnularFluid,
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
		Aurora,
		Toroidal,
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

	const presets = [
		{ name: 'LavaLamp', component: LavaLamp, seed: 12 },
		{ name: 'Plasma', component: Plasma, seed: 24 },
		{ name: 'InkInWater', component: InkInWater, seed: 36 },
		{ name: 'FrozenSwirl', component: FrozenSwirl, seed: 48 },
		{ name: 'Aurora', component: Aurora, seed: 60 },
		{ name: 'Toroidal', component: Toroidal, seed: 72 }
	];

	const features = [
		'multi-instance',
		'resize-stable',
		'deterministic',
		'MIT',
		'0 deps',
		'70+ props',
		'10 presets'
	];

	const usage = `import { Fluid } from 'svelte-fluid';

<Fluid />`;

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
		'Toroidal': { curl: 45, splatRadius: 0.3,  splatForce: 7000, densityDissipation: 0.25, velocityDissipation: 0.1,  bloom: true,  shading: false, colorful: true,  backColor: { r: 6, g: 2, b: 16 } }
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

<div class="page">
	<header class="nav">
		<div class="nav-inner">
			<a class="brand" href="{base}/">svelte-fluid</a>
			<nav class="nav-links">
				<a href="{base}/docs">Docs</a>
				<a href="https://github.com/tommyyzhao/svelte-fluid" target="_blank" rel="noreferrer">
					GitHub
				</a>
			</nav>
		</div>
	</header>

	<main class="shell">
		<section class="bento">
			<article class="cell hero">
				<div class="hero-glow" aria-hidden="true"></div>
				<div class="hero-fluid">
					<FluidText
						text="FLUID"
						font='900 180px "Geist", "Inter", system-ui, sans-serif'
						seed={7}
						splatOnHover
						colorful
						shading
						bloom
						sunrays
						densityDissipation={0.92}
						velocityDissipation={1.4}
						autoSplatRate={6}
						autoSplatCount={4}
						autoSplatSwirl={300}
					/>
				</div>
				<div class="hero-foot">
					<h1 class="tagline">
						WebGL fluid simulation as a Svelte 5 component. Multi-instance, resize-stable,
						deterministic seeding.
					</h1>
					<div class="cta-row">
						<a class="cta primary" href="{base}/docs">
							Get Started <span class="arrow">→</span>
						</a>
						<a
							class="cta ghost"
							href="https://github.com/tommyyzhao/svelte-fluid"
							target="_blank"
							rel="noreferrer"
						>
							GitHub
						</a>
					</div>
				</div>
			</article>

			<article class="cell install">
				<div class="eyebrow">Install</div>

				<div class="tabs">
					{#each ['bun', 'npm', 'pnpm', 'yarn'] as tab (tab)}
						<button
							class="tab"
							class:active={activeTab === tab}
							onclick={() => (activeTab = tab as TabKey)}
						>
							{tab}
						</button>
					{/each}
				</div>

				<div class="code-inset">
					<code class="cmd">{installCmds[activeTab]}</code>
					<button class="copy" onclick={copyInstall} aria-label="Copy install command">
						{copied ? 'copied' : 'copy'}
					</button>
				</div>

				<div class="eyebrow small">Minimal usage</div>
				<pre class="code-inset usage"><code>{usage}</code></pre>
			</article>

			<article class="cell why">
				{#each features as f, i (f)}
					{#if i > 0}<span class="why-sep" aria-hidden="true"></span>{/if}
					<span class="why-item">{f}</span>
				{/each}
			</article>

			{#each presets as p (p.name)}
				{@const C = p.component}
				<article class="cell preset">
					<div class="preset-canvas">
						<C seed={p.seed} lazy aria-label="{p.name} preset preview" backColor={{ r: 8, g: 8, b: 10 }} />
					</div>
					<div class="preset-meta">
						<span class="preset-name">{p.name}</span>
						<a class="preset-link" href="{base}/docs/presets">
							<span class="arrow">→</span> docs
						</a>
					</div>
				</article>
			{/each}
		</section>

		<!-- // shapes -->
		<section class="bento-section">
			<div class="section-header">
				<span class="section-label">// shapes</span>
				<span class="section-desc">six container primitives. hover to splat.</span>
			</div>
			<div class="bento shapes-bento">
				<article class="cell shape-cell">
					<CircularFluid seed={601} lazy splatOnHover aria-label="Circle container demo" backColor={{ r: 8, g: 8, b: 10 }} />
					<div class="cell-label">CIRCLE</div>
				</article>
				<article class="cell shape-cell">
					<Fluid
						seed={602}
						colorful
						shading
						bloom
						splatOnHover
						containerShape={{ type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.42, halfH: 0.42, cornerRadius: 0.08 }}
						lazy
						aria-label="Rounded rect"
					/>
					<div class="cell-label">ROUNDED RECT</div>
				</article>
				<article class="cell shape-cell">
					<FrameFluid seed={603} lazy splatOnHover aria-label="Frame container demo" backColor={{ r: 8, g: 8, b: 10 }} />
					<div class="cell-label">FRAME</div>
				</article>
				<article class="cell shape-cell">
					<AnnularFluid seed={604} lazy splatOnHover aria-label="Annulus container demo" backColor={{ r: 8, g: 8, b: 10 }} />
					<div class="cell-label">ANNULUS</div>
				</article>
				<article class="cell shape-cell">
					<Fluid
						seed={605}
						colorful
						shading
						bloom
						splatOnHover
						containerShape={{ type: 'svgPath', d: lightning, viewBox: [0, 0, 100, 100] }}
						lazy
						aria-label="SVG path lightning bolt"
					/>
					<div class="cell-label">SVG PATH</div>
				</article>
				<article class="cell shape-cell">
					<Fluid
						seed={606}
						colorful
						shading
						bloom
						splatOnHover
						containerShape={{ type: 'svgPath', text: '&', font: '900 280px Georgia, serif' }}
						lazy
						aria-label="Text glyph container"
					/>
					<div class="cell-label">TEXT GLYPH</div>
				</article>
			</div>
		</section>

		<!-- // physics -->
		<section class="bento-section">
			<div class="section-header">
				<span class="section-label">// physics</span>
				<span class="section-desc">every prop is optional. drop in a tag for a finished look.</span>
			</div>
			<div class="bento physics-bento">
				<article class="cell physics-cell">
					<div class="physics-canvas">
						<Fluid
							seed={1234}
							initialSplatCount={12}
							splatOnHover
							lazy
							aria-label="Default fluid"
						/>
					</div>
					<div class="physics-meta">
						<span class="cell-label">DEFAULT</span>
						<code class="physics-snippet">{'<Fluid />'}</code>
					</div>
				</article>
				<article class="cell physics-cell">
					<div class="physics-canvas">
						<Fluid
							seed={5678}
							bloom={false}
							curl={5}
							densityDissipation={0.4}
							splatOnHover
							lazy
							aria-label="Flat and soft fluid"
						/>
					</div>
					<div class="physics-meta">
						<span class="cell-label">FLAT + SOFT</span>
						<code class="physics-snippet">bloom=false curl=5</code>
					</div>
				</article>
				<article class="cell physics-cell">
					<div class="physics-canvas">
						<Fluid
							seed={9012}
							shading={false}
							splatRadius={0.8}
							splatForce={9000}
							splatOnHover
							lazy
							aria-label="Bold splats fluid"
						/>
					</div>
					<div class="physics-meta">
						<span class="cell-label">BOLD SPLATS</span>
						<code class="physics-snippet">splatRadius=0.8</code>
					</div>
				</article>
				<article class="cell physics-cell">
					<div class="physics-canvas">
						<Fluid
							seed={3456}
							velocityDissipation={0.05}
							densityDissipation={0.5}
							transparent
							splatOnHover
							lazy
							aria-label="Slow transparent fluid"
						/>
					</div>
					<div class="physics-meta">
						<span class="cell-label">SLOW + TRANSPARENT</span>
						<code class="physics-snippet">transparent</code>
					</div>
				</article>
			</div>
		</section>

		<!-- // glass -->
		<section class="bento-section">
			<div class="section-header">
				<span class="section-label">// glass</span>
				<span class="section-desc">refraction, chromatic fringes, and reflectivity. any shape.</span>
			</div>
			<div class="bento glass-bento">
				<article class="cell glass-cell">
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
					<div class="cell-label">CRYSTAL ORB</div>
				</article>
				<article class="cell glass-cell">
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
					<div class="cell-label">SOFT LENS</div>
				</article>
				<article class="cell glass-cell">
					<Fluid
						seed={1313}
						lazy
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
						aria-label="Portal ring glass demo"
					/>
					<div class="cell-label">PORTAL RING</div>
				</article>
				<article class="cell glass-cell">
					<Fluid
						seed={1414}
						lazy
						glass
						glassThickness={0.06}
						glassRefraction={0.5}
						glassReflectivity={0.18}
						glassChromatic={0.4}
						containerShape={{ type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.22, halfH: 0.22, innerCornerRadius: 0.06, outerHalfW: 0.48, outerHalfH: 0.48, outerCornerRadius: 0.04 }}
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
					<div class="cell-label">GLASS FRAME</div>
				</article>
			</div>
		</section>

		<!-- // sticky -->
		<section class="bento-section">
			<div class="section-header">
				<span class="section-label">// sticky</span>
				<span class="section-desc">dye clings to letterforms. hover to engage.</span>
			</div>
			<div class="bento sticky-bento">
				<article class="cell sticky-cell">
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
					<div class="cell-label">GEIST · 900</div>
				</article>
				<article class="cell sticky-cell">
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
					<div class="cell-label">GEORGIA · ∞</div>
				</article>
			</div>
		</section>

		<!-- // reveal -->
		<section class="bento-section">
			<div class="section-header">
				<span class="section-label">// reveal</span>
				<span class="section-desc">fluid as an opacity mask. scratch or auto-reveal.</span>
			</div>
			<div class="bento reveal-bento">
				<article class="cell reveal-cell">
					<FluidReveal
						lazy
						velocityDissipation={0.95}
						pressureIterations={10}
					>
						<div class="reveal-content">scratch</div>
					</FluidReveal>
					<div class="cell-label">SCRATCH TO REVEAL</div>
				</article>
				<article class="cell reveal-cell">
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
						<div class="reveal-content">auto</div>
					</FluidReveal>
					<div class="cell-label">AUTO REVEAL</div>
				</article>
			</div>
		</section>

		<!-- // distortion -->
		<section class="bento-section">
			<div class="section-header">
				<span class="section-label">// distortion</span>
				<span class="section-desc">velocity field warps any image. hover to engage.</span>
			</div>
			<div class="bento distort-bento">
				<article class="cell distort-cell">
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
					<div class="cell-label">SUBTLE · 0.3</div>
				</article>
				<article class="cell distort-cell">
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
					<div class="cell-label">STRONG · 0.45</div>
				</article>
			</div>
		</section>

		<!-- // playground -->
		<section class="bento-section playground-section">
			<div class="section-header">
				<span class="section-label">// playground</span>
				<span class="section-desc">drag the knobs. fluid updates in real time.</span>
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
				<button type="button" class="preset-chip reset-chip" onclick={resetPlayground}>
					reset
				</button>
			</div>

			<div class="playground-grid">
				<div class="playground-canvas-wrap">
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
						<div class="knob-group-title">physics</div>
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
							<span class="knob-label">densityDiss.</span>
							<input type="range" min="0" max="1" step="0.01" bind:value={pgDensityDissipation} oninput={markCustomEdit} />
							<span class="knob-value">{pgDensityDissipation.toFixed(2)}</span>
						</label>
						<label class="knob-row">
							<span class="knob-label">velocityDiss.</span>
							<input type="range" min="0" max="1" step="0.01" bind:value={pgVelocityDissipation} oninput={markCustomEdit} />
							<span class="knob-value">{pgVelocityDissipation.toFixed(2)}</span>
						</label>
					</div>

					<div class="knob-group">
						<div class="knob-group-title">visuals</div>
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
						<div class="knob-group-title">background</div>
						<label class="color-row">
							<span class="knob-label">backColor</span>
							<input type="color" value={pgBackColorHex} oninput={onBackColorInput} aria-label="Background color" />
							<span class="knob-value mono">{pgBackColorHex}</span>
						</label>
					</div>

					<div class="snippet-head">
						<span class="knob-group-title">snippet</span>
						<button class="copy-snippet-btn" onclick={copySnippet} aria-label="Copy playground snippet">
							{copiedSnippet ? 'copied!' : 'copy'}
						</button>
					</div>
					<pre class="snippet-code"><code>{playgroundSnippet}</code></pre>
				</aside>
			</div>
		</section>
	</main>

	<footer class="foot">
		<div class="foot-inner">
			<span>svelte-fluid · MIT</span>
			<span class="foot-credit">
				Derivative work of PavelDoGreat/WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017.
			</span>
		</div>
	</footer>
</div>

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
		background: #0a0a0a;
	}

	.competition-back {
		position: fixed;
		top: 1rem;
		left: 1rem;
		z-index: 200;
		font-size: 0.72rem;
		font-weight: 500;
		color: rgba(255, 248, 231, 0.5);
		text-decoration: none;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 248, 231, 0.12);
		border-radius: 4px;
		padding: 0.3rem 0.65rem;
		font-family: monospace;
		transition: color 0.15s;
	}

	.competition-back:hover {
		color: #fff8e7;
	}

	.page {
		--bg: #0a0a0a;
		--fg: #fafafa;
		--muted: #8a8a8a;
		--hair: rgba(255, 255, 255, 0.08);
		--hair-strong: rgba(255, 255, 255, 0.2);
		--card: #111111;
		--inset: #050505;
		--inset-hair: rgba(255, 255, 255, 0.06);
		--accent: #fff8e7;

		min-height: 100vh;
		background: var(--bg);
		color: var(--fg);
		font-family:
			'Geist', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		font-feature-settings: 'ss01', 'cv11';
		-webkit-font-smoothing: antialiased;
		letter-spacing: -0.01em;
	}

	.nav {
		position: sticky;
		top: 0;
		z-index: 50;
		height: 56px;
		backdrop-filter: blur(18px);
		-webkit-backdrop-filter: blur(18px);
		background: rgba(10, 10, 10, 0.72);
		border-bottom: 1px solid var(--hair);
	}

	.nav-inner {
		max-width: 1200px;
		margin: 0 auto;
		height: 100%;
		padding: 0 32px;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.brand {
		color: var(--fg);
		text-decoration: none;
		font-size: 14px;
		font-weight: 500;
		letter-spacing: -0.015em;
	}

	.nav-links {
		display: flex;
		gap: 24px;
	}

	.nav-links a {
		color: var(--muted);
		text-decoration: none;
		font-size: 13px;
		transition: color 140ms ease;
	}

	.nav-links a:hover {
		color: var(--fg);
	}

	.shell {
		max-width: 1200px;
		margin: 0 auto;
		padding: 32px;
		display: flex;
		flex-direction: column;
		gap: 48px;
	}

	.bento {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		grid-auto-rows: minmax(140px, auto);
		gap: 14px;
	}

	.cell {
		background: var(--card);
		border: 1px solid var(--hair);
		border-radius: 16px;
		padding: 24px;
		position: relative;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		transition:
			border-color 180ms ease,
			transform 220ms ease;
	}

	.hero {
		grid-column: span 4;
		grid-row: span 2;
		min-height: 480px;
		padding: 24px;
		gap: 20px;
	}

	.hero-glow {
		position: absolute;
		inset: -20% -20% auto -20%;
		height: 60%;
		background: radial-gradient(
			ellipse at 50% 0%,
			rgba(255, 248, 231, 0.06) 0%,
			rgba(255, 248, 231, 0) 70%
		);
		pointer-events: none;
	}

	.hero-fluid {
		flex: 1;
		min-height: 260px;
		border-radius: 12px;
		overflow: hidden;
		background: #050505;
		border: 1px solid var(--inset-hair);
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.hero-foot {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.tagline {
		margin: 0;
		font-size: 15px;
		line-height: 1.5;
		color: var(--muted);
		max-width: 56ch;
	}

	.cta-row {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}

	.cta {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 9px 16px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 500;
		text-decoration: none;
		transition:
			background 140ms ease,
			color 140ms ease,
			border-color 140ms ease;
	}

	.cta.primary {
		background: var(--fg);
		color: #0a0a0a;
	}

	.cta.primary:hover {
		background: var(--accent);
	}

	.cta.ghost {
		color: var(--fg);
		border: 1px solid var(--hair);
		background: transparent;
	}

	.cta.ghost:hover {
		border-color: var(--hair-strong);
	}

	.arrow {
		color: var(--accent);
		display: inline-block;
		transform: translateY(-0.5px);
	}

	.cta.primary .arrow {
		color: #0a0a0a;
	}

	.install {
		grid-column: span 2;
		grid-row: span 2;
		min-height: 480px;
		gap: 14px;
	}

	.eyebrow {
		font-family: ui-monospace, 'Geist Mono', 'JetBrains Mono', Menlo, monospace;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: var(--muted);
		font-weight: 500;
	}

	.eyebrow.small {
		margin-top: 4px;
	}

	.tabs {
		display: inline-flex;
		gap: 4px;
		padding: 4px;
		border: 1px solid var(--hair);
		border-radius: 999px;
		align-self: flex-start;
		background: var(--inset);
	}

	.tab {
		background: transparent;
		border: 0;
		color: var(--muted);
		font: inherit;
		font-family: ui-monospace, 'Geist Mono', 'JetBrains Mono', Menlo, monospace;
		font-size: 12px;
		padding: 5px 12px;
		border-radius: 999px;
		cursor: pointer;
		transition:
			background 140ms ease,
			color 140ms ease;
	}

	.tab:hover {
		color: var(--fg);
	}

	.tab.active {
		background: var(--accent);
		color: #0a0a0a;
	}

	.code-inset {
		background: var(--inset);
		border: 1px solid var(--inset-hair);
		border-radius: 8px;
		padding: 14px;
		font-family: ui-monospace, 'Geist Mono', 'JetBrains Mono', Menlo, monospace;
		font-size: 12.5px;
		line-height: 1.55;
		color: var(--fg);
		display: flex;
		align-items: center;
		gap: 10px;
		overflow-x: auto;
	}

	.cmd {
		flex: 1;
		white-space: nowrap;
	}

	.copy {
		background: transparent;
		border: 1px solid var(--hair);
		color: var(--muted);
		font: inherit;
		font-family: ui-monospace, 'Geist Mono', 'JetBrains Mono', Menlo, monospace;
		font-size: 11px;
		padding: 4px 10px;
		border-radius: 6px;
		cursor: pointer;
		transition:
			border-color 140ms ease,
			color 140ms ease;
	}

	.copy:hover {
		color: var(--fg);
		border-color: var(--hair-strong);
	}

	.code-inset.usage {
		display: block;
		margin: 0;
		white-space: pre;
		color: var(--muted);
		font-size: 12px;
		line-height: 1.6;
	}

	.code-inset.usage code {
		color: var(--fg);
	}

	.why {
		grid-column: span 6;
		min-height: 120px;
		flex-direction: row;
		align-items: center;
		justify-content: center;
		gap: 24px;
		flex-wrap: wrap;
		padding: 24px;
	}

	.why-item {
		font-family: ui-monospace, 'Geist Mono', 'JetBrains Mono', Menlo, monospace;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		color: var(--muted);
	}

	.why-sep {
		width: 1px;
		height: 16px;
		background: var(--hair);
	}

	.preset {
		grid-column: span 2;
		min-height: 280px;
		padding: 0;
	}

	.preset:hover {
		border-color: var(--hair-strong);
		transform: translateY(-2px);
	}

	.preset-canvas {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		overflow: hidden;
		background: #050505;
	}

	.preset-meta {
		position: absolute;
		left: 16px;
		right: 16px;
		bottom: 14px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		z-index: 2;
		pointer-events: none;
	}

	.preset-name {
		font-family: ui-monospace, 'Geist Mono', 'JetBrains Mono', Menlo, monospace;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: var(--fg);
		background: rgba(10, 10, 10, 0.6);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		padding: 5px 10px;
		border-radius: 6px;
		border: 1px solid var(--hair);
	}

	.preset-link {
		pointer-events: auto;
		font-family: ui-monospace, 'Geist Mono', 'JetBrains Mono', Menlo, monospace;
		font-size: 11px;
		color: var(--muted);
		text-decoration: none;
		background: rgba(10, 10, 10, 0.6);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		padding: 5px 10px;
		border-radius: 6px;
		border: 1px solid var(--hair);
		transition:
			color 140ms ease,
			border-color 140ms ease;
	}

	.preset-link:hover {
		color: var(--fg);
		border-color: var(--hair-strong);
	}

	/* section wrapper */
	.bento-section {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.section-header {
		display: flex;
		align-items: baseline;
		gap: 16px;
		padding: 0 2px;
	}

	.section-label {
		font-family: ui-monospace, 'Geist Mono', 'JetBrains Mono', Menlo, monospace;
		font-size: 12px;
		color: var(--accent);
		letter-spacing: 0.04em;
	}

	.section-desc {
		font-family: ui-monospace, 'Geist Mono', 'JetBrains Mono', Menlo, monospace;
		font-size: 11px;
		color: var(--muted);
		letter-spacing: 0.02em;
	}

	/* shared cell label */
	.cell-label {
		position: absolute;
		left: 12px;
		bottom: 10px;
		font-family: ui-monospace, 'Geist Mono', 'JetBrains Mono', Menlo, monospace;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		color: var(--muted);
		background: rgba(10, 10, 10, 0.55);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		padding: 3px 8px;
		border-radius: 4px;
		border: 1px solid var(--hair);
		pointer-events: none;
		z-index: 2;
	}

	/* shapes */
	.shapes-bento {
		grid-template-columns: repeat(6, 1fr);
		grid-auto-rows: 260px;
	}

	.shape-cell {
		grid-column: span 2;
		padding: 0;
	}

	.shape-cell :global(canvas),
	.shape-cell > :global(*:not(.cell-label)) {
		position: absolute;
		inset: 0;
		border-radius: inherit;
	}

	/* physics */
	.physics-bento {
		grid-template-columns: repeat(4, 1fr);
		grid-auto-rows: 300px;
	}

	.physics-cell {
		grid-column: span 1;
		padding: 0;
		flex-direction: column;
	}

	.physics-canvas {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		overflow: hidden;
	}

	.physics-canvas :global(*) {
		width: 100%;
		height: 100%;
	}

	.physics-meta {
		position: absolute;
		left: 12px;
		right: 12px;
		bottom: 10px;
		z-index: 2;
		display: flex;
		flex-direction: column;
		gap: 4px;
		pointer-events: none;
	}

	.physics-snippet {
		font-family: ui-monospace, 'Geist Mono', 'JetBrains Mono', Menlo, monospace;
		font-size: 9px;
		color: var(--muted);
		background: rgba(10, 10, 10, 0.55);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		padding: 2px 6px;
		border-radius: 4px;
		border: 1px solid var(--hair);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: block;
	}

	/* glass */
	.glass-bento {
		grid-template-columns: repeat(4, 1fr);
		grid-auto-rows: 320px;
	}

	.glass-cell {
		grid-column: span 1;
		padding: 0;
	}

	.glass-cell :global(canvas),
	.glass-cell > :global(*:not(.cell-label)) {
		position: absolute;
		inset: 0;
		border-radius: inherit;
	}

	/* sticky */
	.sticky-bento {
		grid-template-columns: repeat(2, 1fr);
		grid-auto-rows: 320px;
	}

	.sticky-cell {
		grid-column: span 1;
		padding: 0;
	}

	.sticky-cell :global(canvas),
	.sticky-cell > :global(*:not(.cell-label)) {
		position: absolute;
		inset: 0;
		border-radius: inherit;
	}

	/* reveal */
	.reveal-bento {
		grid-template-columns: repeat(2, 1fr);
		grid-auto-rows: 320px;
	}

	.reveal-cell {
		grid-column: span 1;
		padding: 0;
	}

	.reveal-cell :global(*:not(.cell-label)) {
		position: absolute;
		inset: 0;
		border-radius: inherit;
	}

	.reveal-content {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		font-size: 1.2rem;
		color: #fff8e7;
	}

	/* distortion */
	.distort-bento {
		grid-template-columns: repeat(2, 1fr);
		grid-auto-rows: 360px;
	}

	.distort-cell {
		grid-column: span 1;
		padding: 0;
	}

	.distort-cell :global(canvas),
	.distort-cell > :global(*:not(.cell-label)) {
		position: absolute;
		inset: 0;
		border-radius: inherit;
	}

	/* playground */
	.playground-section {
		gap: 20px;
	}

	.preset-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.preset-chip {
		background: var(--inset);
		border: 1px solid var(--hair);
		color: var(--muted);
		font-family: ui-monospace, 'Geist Mono', 'JetBrains Mono', Menlo, monospace;
		font-size: 11px;
		padding: 5px 12px;
		border-radius: 999px;
		cursor: pointer;
		transition:
			background 140ms ease,
			color 140ms ease,
			border-color 140ms ease;
	}

	.preset-chip:hover {
		color: var(--fg);
		border-color: var(--hair-strong);
	}

	.preset-chip.active {
		background: var(--accent);
		color: #0a0a0a;
		border-color: var(--accent);
	}

	.reset-chip {
		margin-left: auto;
	}

	.playground-grid {
		display: grid;
		grid-template-columns: 1fr 280px;
		gap: 14px;
		min-height: 420px;
	}

	.playground-canvas-wrap {
		background: var(--card);
		border: 1px solid var(--hair);
		border-radius: 16px;
		overflow: hidden;
		position: relative;
	}

	.playground-canvas-wrap :global(*) {
		width: 100%;
		height: 100%;
	}

	.playground-panel {
		background: var(--card);
		border: 1px solid var(--hair);
		border-radius: 16px;
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		overflow-y: auto;
	}

	.knob-group {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.knob-group-title {
		font-family: ui-monospace, 'Geist Mono', 'JetBrains Mono', Menlo, monospace;
		font-size: 10px;
		text-transform: lowercase;
		letter-spacing: 0.12em;
		color: var(--accent);
		margin-bottom: 2px;
	}

	.knob-row {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}

	.knob-label {
		font-family: ui-monospace, 'Geist Mono', 'JetBrains Mono', Menlo, monospace;
		font-size: 10px;
		color: var(--muted);
		width: 80px;
		flex-shrink: 0;
	}

	.knob-row input[type='range'] {
		flex: 1;
		accent-color: var(--accent);
		cursor: pointer;
	}

	.knob-value {
		font-family: ui-monospace, 'Geist Mono', 'JetBrains Mono', Menlo, monospace;
		font-size: 10px;
		color: var(--fg);
		width: 38px;
		text-align: right;
		flex-shrink: 0;
	}

	.knob-value.mono {
		font-size: 9px;
		width: auto;
	}

	.toggle-row {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}

	.toggle-row input[type='checkbox'] {
		display: none;
	}

	.toggle-pill {
		width: 28px;
		height: 16px;
		border-radius: 999px;
		background: var(--inset);
		border: 1px solid var(--hair);
		position: relative;
		flex-shrink: 0;
		transition: background 140ms ease;
	}

	.toggle-pill::after {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--muted);
		transition:
			transform 140ms ease,
			background 140ms ease;
	}

	.toggle-row input:checked + .toggle-pill {
		background: var(--accent);
		border-color: var(--accent);
	}

	.toggle-row input:checked + .toggle-pill::after {
		transform: translateX(12px);
		background: #0a0a0a;
	}

	.color-row {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}

	.color-row input[type='color'] {
		width: 24px;
		height: 24px;
		border: 1px solid var(--hair);
		border-radius: 4px;
		padding: 0;
		background: none;
		cursor: pointer;
	}

	.snippet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.copy-snippet-btn {
		background: transparent;
		border: 1px solid var(--hair);
		color: var(--muted);
		font-family: ui-monospace, 'Geist Mono', 'JetBrains Mono', Menlo, monospace;
		font-size: 10px;
		padding: 3px 8px;
		border-radius: 4px;
		cursor: pointer;
		transition:
			color 140ms ease,
			border-color 140ms ease;
	}

	.copy-snippet-btn:hover {
		color: var(--fg);
		border-color: var(--hair-strong);
	}

	.snippet-code {
		background: var(--inset);
		border: 1px solid var(--inset-hair);
		border-radius: 8px;
		padding: 12px;
		margin: 0;
		font-family: ui-monospace, 'Geist Mono', 'JetBrains Mono', Menlo, monospace;
		font-size: 10px;
		line-height: 1.6;
		color: var(--fg);
		white-space: pre;
		overflow-x: auto;
	}

	.foot {
		border-top: 1px solid var(--hair);
		margin-top: 32px;
	}

	.foot-inner {
		max-width: 1200px;
		margin: 0 auto;
		padding: 24px 32px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 24px;
		flex-wrap: wrap;
		font-family: ui-monospace, 'Geist Mono', 'JetBrains Mono', Menlo, monospace;
		font-size: 11px;
		color: var(--muted);
		letter-spacing: 0.04em;
	}

	.foot-credit {
		color: var(--muted);
	}

	@media (max-width: 1040px) {
		.hero {
			grid-column: span 6;
			grid-row: auto;
			min-height: 440px;
		}
		.install {
			grid-column: span 6;
			grid-row: auto;
			min-height: auto;
		}
		.preset {
			grid-column: span 3;
		}
		.physics-bento {
			grid-template-columns: repeat(2, 1fr);
		}
		.physics-cell {
			grid-column: span 1;
		}
		.glass-bento {
			grid-template-columns: repeat(2, 1fr);
		}
		.glass-cell {
			grid-column: span 1;
		}
		.playground-grid {
			grid-template-columns: 1fr;
		}
		.playground-canvas-wrap {
			min-height: 320px;
		}
	}

	@media (max-width: 800px) {
		.shell {
			padding: 20px;
			gap: 36px;
		}
		.bento {
			grid-template-columns: 1fr;
			gap: 12px;
		}
		.hero,
		.install,
		.why,
		.preset {
			grid-column: span 1;
			min-height: 280px;
		}
		.hero {
			min-height: 420px;
		}
		.why {
			gap: 14px;
			padding: 18px;
		}
		.shapes-bento,
		.physics-bento,
		.glass-bento,
		.sticky-bento,
		.reveal-bento,
		.distort-bento {
			grid-template-columns: 1fr;
		}
		.shape-cell,
		.physics-cell,
		.glass-cell,
		.sticky-cell,
		.reveal-cell,
		.distort-cell {
			grid-column: span 1;
			min-height: 260px;
		}
		.playground-grid {
			grid-template-columns: 1fr;
		}
		.playground-canvas-wrap {
			min-height: 280px;
		}
		.foot-inner {
			padding: 20px;
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
