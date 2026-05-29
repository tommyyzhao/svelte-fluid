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
		ToroidalTempest,
		type RGB
	} from '$lib/index.js';


	const pageColor: RGB = { r: 232, g: 139, b: 162 };
	const surfaceColor: RGB = { r: 255, g: 245, b: 238 };

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
  <Fluid
    seed={42}
    splatOnHover
    curl={45}
    colorful
    bloom
    backColor={{ r: 255, g: 245, b: 238 }}
  />
</div>`;

	const flavors = [
		{ n: '01', t: 'Drop it in', d: 'One component. Zero config. Instant swirl.' },
		{ n: '02', t: 'Multi-instance', d: 'Stack a hundred on a page — no globals shouting at each other.' },
		{ n: '03', t: 'Resize-stable', d: 'Stretch the window. The fluid stretches with you.' },
		{ n: '04', t: 'Seeded', d: 'Same seed in, same swirl out. Frame-perfect, every reload.' },
		{ n: '05', t: 'Tiny', d: 'Pure Svelte 5 + WebGL. No runtime deps to lug around.' },
		{ n: '06', t: '70+ knobs', d: 'Bloom, curl, splat radius, dissipation — all hot-swap.' },
		{ n: '07', t: 'Ten presets', d: 'LavaLamp, Plasma, Aurora… ready out of the box.' }
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
		curl: 45,
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
	<title>svelte-fluid — bubblegum edition</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<a class="competition-back" href="{base}/design-competition">← Competition</a>

<main class="page">
	<header class="hero">
		<div class="hero-top">
			<span class="dot" aria-hidden="true">●</span>
			<span class="kicker">Issue 18 · Bubblegum</span>
			<span class="dot" aria-hidden="true">●</span>
		</div>
		<h1 class="display">
			swirl<span class="lemon">!</span>
			<br />
			<span class="display-row2">it's <em>fluid</em></span>
		</h1>
		<p class="tagline">
			A WebGL fluid simulation that drops into Svelte like a sugar cube into tea.
			Stir vigorously. Hover happily. Repeat.
		</p>

		<div class="install-row">
			<div class="install-tabs">
				<button class="tab" class:active={installTab === 'npm'} onclick={() => (installTab = 'npm')}
					>npm</button
				>
				<button class="tab" class:active={installTab === 'bun'} onclick={() => (installTab = 'bun')}
					>bun</button
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

		<div class="hero-cta">
			<a class="cta cta-primary" href="{base}/docs">Read the docs →</a>
			<a class="cta cta-secondary" href="https://github.com/tommyyzhao/svelte-fluid">GitHub ★</a>
		</div>

		<div class="feature-pills">
			<span class="pill pill-mint">multi-instance</span>
			<span class="pill pill-lemon">resize-stable</span>
			<span class="pill pill-cream">deterministic seed</span>
			<span class="pill pill-mint">70+ props</span>
			<span class="pill pill-lemon">10 presets</span>
			<span class="pill pill-cream">MIT</span>
		</div>
	</header>

	<section class="section flavors-section">
		<div class="section-head">
			<span class="section-tag">01 · Drop it in!</span>
			<h2 class="section-title">Seven happy reasons</h2>
			<p class="section-sub">A quick taste before you commit. Each one a sticker on the lunchbox.</p>
		</div>
		<ul class="flavor-list">
			{#each flavors as f (f.n)}
				<li class="flavor-card">
					<span class="flavor-num">{f.n}</span>
					<div class="flavor-body">
						<strong class="flavor-title">{f.t}</strong>
						<span class="flavor-desc">{f.d}</span>
					</div>
				</li>
			{/each}
		</ul>
	</section>

	<section class="section usage-section">
		<div class="section-head">
			<span class="section-tag">02 · Get gooey</span>
			<h2 class="section-title">Paste, swirl, smile</h2>
			<p class="section-sub">
				Heavy curl. Cream background. Cartoon energy. This is the default we wish was the default.
			</p>
		</div>
		<div class="usage-grid">
			<pre class="snippet"><code>{usage}</code></pre>
			<div class="usage-preview">
				<div class="cell-label">live preview</div>
				<div class="fluid-host">
					<Fluid
						seed={42}
						splatOnHover
						curl={40}
						colorful
						bloom
						initialSplatCount={18}
						backColor={surfaceColor}
					/>
				</div>
			</div>
		</div>
	</section>

	<section class="section presets-section">
		<div class="section-head">
			<span class="section-tag">03 · Six flavors</span>
			<h2 class="section-title">Each preset brings its own ink</h2>
			<p class="section-sub">
				Like stickers in a sticker book. Pull one out, slap it on a div, ship.
			</p>
		</div>
		<div class="preset-grid">
			<article class="preset-card">
				<div class="cell-label">lava lamp</div>
				<div class="cell-canvas"><LavaLamp seed={11} backColor={surfaceColor} aria-label="LavaLamp preset" /></div>
			</article>
			<article class="preset-card">
				<div class="cell-label">plasma</div>
				<div class="cell-canvas"><Plasma seed={22} backColor={surfaceColor} aria-label="Plasma preset" /></div>
			</article>
			<article class="preset-card">
				<div class="cell-label">ink in water</div>
				<div class="cell-canvas">
					<InkInWater seed={33} lazy backColor={surfaceColor} aria-label="InkInWater preset" />
				</div>
			</article>
			<article class="preset-card">
				<div class="cell-label">frozen swirl</div>
				<div class="cell-canvas">
					<FrozenSwirl seed={44} lazy backColor={surfaceColor} aria-label="FrozenSwirl preset" />
				</div>
			</article>
			<article class="preset-card">
				<div class="cell-label">aurora</div>
				<div class="cell-canvas"><Aurora seed={55} lazy backColor={surfaceColor} aria-label="Aurora preset" /></div>
			</article>
			<article class="preset-card">
				<div class="cell-label">toroidal tempest</div>
				<div class="cell-canvas">
					<ToroidalTempest seed={66} lazy backColor={surfaceColor} aria-label="ToroidalTempest preset" />
				</div>
			</article>
		</div>
	</section>

	<section class="section shapes-section">
		<div class="section-head">
			<span class="section-tag">04 · Pick your shape</span>
			<h2 class="section-title">Squish it into anything</h2>
			<p class="section-sub">Six containers. Hover to make them ooze. Some are even letter-shaped.</p>
		</div>
		<div class="shape-grid">
			<article class="shape-card">
				<div class="cell-label">circle</div>
				<div class="shape-canvas">
					<CircularFluid seed={601} lazy backColor={surfaceColor} splatOnHover aria-label="Circle container shape" />
				</div>
			</article>
			<article class="shape-card">
				<div class="cell-label">rounded rect</div>
				<div class="shape-canvas">
					<Fluid
						seed={602}
						colorful
						shading
						bloom
						splatOnHover
						curl={45}
						initialSplatCount={15}
						containerShape={{ type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.42, halfH: 0.42, cornerRadius: 0.12 }}
						backColor={surfaceColor}
						lazy
						aria-label="Rounded rect container shape"
					/>
				</div>
			</article>
			<article class="shape-card">
				<div class="cell-label">frame</div>
				<div class="shape-canvas">
					<FrameFluid seed={603} lazy backColor={surfaceColor} splatOnHover aria-label="Frame container shape" />
				</div>
			</article>
			<article class="shape-card">
				<div class="cell-label">annulus</div>
				<div class="shape-canvas">
					<AnnularFluid seed={604} lazy backColor={surfaceColor} splatOnHover aria-label="Annulus container shape" />
				</div>
			</article>
			<article class="shape-card">
				<div class="cell-label">lightning</div>
				<div class="shape-canvas">
					<Fluid
						seed={605}
						colorful
						shading
						bloom
						splatOnHover
						curl={45}
						initialSplatCount={15}
						containerShape={{ type: 'svgPath', d: lightning, viewBox: [0, 0, 100, 100] }}
						backColor={surfaceColor}
						lazy
						aria-label="Lightning bolt container shape"
					/>
				</div>
			</article>
			<article class="shape-card">
				<div class="cell-label">glyph !</div>
				<div class="shape-canvas">
					<Fluid
						seed={606}
						colorful
						shading
						bloom
						splatOnHover
						curl={45}
						initialSplatCount={15}
						containerShape={{ type: 'svgPath', text: '!', font: '900 280px Georgia, serif' }}
						backColor={surfaceColor}
						lazy
						aria-label="Exclamation glyph container shape"
					/>
				</div>
			</article>
		</div>
	</section>

	<section class="section physics-section">
		<div class="section-head">
			<span class="section-tag">05 · Twist the knobs</span>
			<h2 class="section-title">Same engine, very different vibes</h2>
			<p class="section-sub">Swap a few props and you get a whole new mood. Try them all!</p>
		</div>
		<div class="physics-grid">
			<article class="physics-card">
				<div class="cell-label">defaults</div>
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
			<article class="physics-card">
				<div class="cell-label">swirly</div>
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
			<article class="physics-card">
				<div class="cell-label">bold splats</div>
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
				<code class="physics-snippet">{'splatRadius={0.8} splatForce={9000}'}</code>
			</article>
			<article class="physics-card">
				<div class="cell-label">slow + see-through</div>
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
				<code class="physics-snippet">{'transparent velocityDissipation={0.05}'}</code>
			</article>
		</div>
	</section>

	<section class="section glass-section">
		<div class="section-head">
			<span class="section-tag">06 · Glassy good times</span>
			<h2 class="section-title">Refraction, but make it candy</h2>
			<p class="section-sub">A lens at the wall. Chromatic fringes. Dye that won't sit still.</p>
		</div>
		<div class="glass-grid">
			<article class="glass-card">
				<div class="cell-label">crystal orb</div>
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
						curl={40}
						densityDissipation={0.18}
						velocityDissipation={0.06}
						splatRadius={0.38}
						splatForce={5000}
						shading
						bloom
						colorful
						sunrays={false}
						initialSplatCount={12}
						autoSplatRate={stickyAutoAnimate ? 2.0 : 0}
						autoSplatCenterY={0.5}
						autoSplatBandHeight={0.8}
						autoSplatSwirl={500}
						splatOnHover
						aria-label="Crystal orb glass demo"
					/>
				</div>
			</article>
			<article class="glass-card">
				<div class="cell-label">soft lens</div>
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
						curl={35}
						densityDissipation={0.4}
						velocityDissipation={0.12}
						splatRadius={0.25}
						splatForce={5000}
						shading
						bloom
						colorful
						sunrays
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
			</article>
			<article class="glass-card">
				<div class="cell-label">portal ring</div>
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
						curl={45}
						densityDissipation={0.3}
						velocityDissipation={0.1}
						splatRadius={0.3}
						splatForce={5000}
						shading
						bloom
						colorful
						sunrays={false}
						initialSplatCount={10}
						autoSplatRate={stickyAutoAnimate ? 2.0 : 0}
						autoSplatCenterY={0.5}
						autoSplatBandHeight={0.6}
						autoSplatSwirl={400}
						splatOnHover
						aria-label="Portal ring glass demo"
					/>
				</div>
			</article>
			<article class="glass-card">
				<div class="cell-label">glass frame</div>
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
						curl={30}
						densityDissipation={0.25}
						velocityDissipation={0.1}
						splatRadius={0.35}
						splatForce={5000}
						shading
						bloom
						colorful
						bloomIntensity={1.0}
						sunrays={false}
						initialSplatCount={10}
						autoSplatRate={stickyAutoAnimate ? 2.0 : 0}
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
			<span class="section-tag">07 · Chunky letters</span>
			<h2 class="section-title">Dye that sticks inside the glyphs</h2>
			<p class="section-sub">Move your cursor through the letters. The fluid clings.</p>
		</div>
		<div class="sticky-grid">
			<article class="sticky-card">
				<div class="cell-label">YAY</div>
				<div class="sticky-canvas">
					<FluidStick
						text="YAY!"
						font="900 110px 'Inter', system-ui, sans-serif"
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
			<article class="sticky-card">
				<div class="cell-label">heart</div>
				<div class="sticky-canvas">
					<FluidStick
						text="♥"
						font="180px Georgia, serif"
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
			<span class="section-tag">08 · Surprise behind the curtain</span>
			<h2 class="section-title">Scratch and peek</h2>
			<p class="section-sub">Drag across the cream. The fluid eats its own coat to expose what's beneath.</p>
		</div>
		<div class="reveal-grid">
			<article class="reveal-card">
				<div class="cell-label">scratch to reveal</div>
				<div class="reveal-canvas">
					<FluidReveal
						lazy
						velocityDissipation={0.95}
						pressureIterations={10}
						coverColor={{ r: 1.0, g: 0.96, b: 0.93 }}
						fringeColor={{ r: 0.99, g: 0.91, b: 0.35 }}
						accentColor={{ r: 0.62, g: 0.89, b: 0.78 }}
					>
						<div class="reveal-content">
							<span class="reveal-label">surprise!</span>
						</div>
					</FluidReveal>
				</div>
			</article>
			<article class="reveal-card">
				<div class="cell-label">auto reveal</div>
				<div class="reveal-canvas">
					<FluidReveal
						lazy
						autoReveal={stickyAutoAnimate}
						autoRevealSpeed={0.8}
						fadeBack={false}
						velocityDissipation={0.95}
						sensitivity={0.15}
						coverColor={{ r: 1.0, g: 0.96, b: 0.93 }}
						fringeColor={{ r: 0.99, g: 0.91, b: 0.35 }}
						accentColor={{ r: 0.62, g: 0.89, b: 0.78 }}
					>
						<div class="reveal-content">
							<span class="reveal-label">auto peek</span>
						</div>
					</FluidReveal>
				</div>
			</article>
		</div>
	</section>

	<section class="section distort-section">
		<div class="section-head">
			<span class="section-tag">09 · Warp factor</span>
			<h2 class="section-title">Smush a picture around</h2>
			<p class="section-sub">The velocity field pushes pixels. Drag across to swirl the painting.</p>
		</div>
		<div class="distort-grid">
			<article class="distort-card">
				<div class="cell-label">subtle · 0.3</div>
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
			<article class="distort-card">
				<div class="cell-label">strong · 0.45</div>
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
			<span class="section-tag">10 · Sugar rush</span>
			<h2 class="section-title">Twist every knob</h2>
			<p class="section-sub">Tap a flavor to start. Then push sliders till the fluid yelps.</p>
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
			<button type="button" class="preset-chip reset" onclick={resetPlayground}>reset</button>
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
					<span>snippet</span>
					<button class="copy-btn" onclick={copySnippet} aria-label="Copy playground snippet">
						{copiedSnippet ? 'copied!' : 'copy'}
					</button>
				</div>
				<pre class="snippet-code"><code>{playgroundSnippet}</code></pre>
			</aside>
		</div>
	</section>

	<footer class="page-footer">
		<div class="footer-card">
			<div class="footer-row">
				<div class="footer-left">svelte<span class="lemon">·</span>fluid</div>
				<div class="footer-mid">
					Derivative of PavelDoGreat / WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017.
				</div>
				<div class="footer-right">MIT · 2026</div>
			</div>
			<div class="footer-links">
				<a href="https://github.com/tommyyzhao/svelte-fluid">github</a>
				<a href="{base}/docs">docs</a>
				<a href="{base}/design-competition">competition</a>
			</div>
		</div>
	</footer>
</main>

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
		background: #e88ba2;
	}

	.competition-back {
		position: fixed;
		top: 1rem;
		left: 1rem;
		z-index: 200;
		font-family: 'Fredoka', 'Inter', system-ui, sans-serif;
		font-weight: 700;
		font-size: 0.78rem;
		letter-spacing: 0.02em;
		color: #3a1d2c;
		text-decoration: none;
		background: #fff5ee;
		border: 2.5px solid #3a1d2c;
		border-radius: 999px;
		padding: 0.45rem 0.9rem;
		box-shadow: 3px 3px 0 #3a1d2c;
		transition: transform 0.12s, box-shadow 0.12s;
	}
	.competition-back:hover {
		transform: translate(-1px, -1px);
		box-shadow: 4px 4px 0 #3a1d2c;
	}

	.page {
		--pink: #e88ba2;
		--cream: #fff5ee;
		--ink: #3a1d2c;
		--ink-soft: rgba(58, 29, 44, 0.72);
		--ink-faint: rgba(58, 29, 44, 0.18);
		--lemon: #fce85a;
		--mint: #9ee2c8;
		background: var(--pink);
		color: var(--ink);
		font-family: 'Inter', system-ui, sans-serif;
		font-size: 16px;
		line-height: 1.55;
		max-width: 1320px;
		margin: 0 auto;
		padding: 0 28px;
	}

	.section-tag {
		display: inline-block;
		font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		font-size: 11px;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ink);
		background: var(--lemon);
		border: 2px solid var(--ink);
		border-radius: 999px;
		padding: 4px 12px;
		box-shadow: 2px 2px 0 var(--ink);
	}

	.hero {
		padding: 80px 0 64px;
		text-align: center;
	}
	.hero-top {
		display: inline-flex;
		align-items: center;
		gap: 12px;
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 12px;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--ink);
		background: var(--cream);
		border: 2.5px solid var(--ink);
		border-radius: 999px;
		padding: 6px 16px;
		box-shadow: 3px 3px 0 var(--ink);
	}
	.hero-top .dot {
		color: var(--ink);
		font-size: 8px;
	}
	.kicker {
		font-weight: 700;
	}

	.display {
		font-family: 'Fredoka', 'Inter', system-ui, sans-serif;
		font-weight: 800;
		font-size: clamp(4rem, 14vw, 11rem);
		line-height: 0.92;
		letter-spacing: -0.045em;
		margin: 32px 0 0;
		color: var(--ink);
	}
	.display .lemon {
		color: var(--ink);
		background: var(--lemon);
		display: inline-block;
		padding: 0 0.18em;
		border-radius: 0.18em;
		transform: rotate(-6deg);
		margin: 0 0.04em;
	}
	.display em {
		font-style: italic;
		font-weight: 800;
		color: var(--ink);
		background: var(--mint);
		padding: 0 0.16em;
		border-radius: 0.18em;
		display: inline-block;
		transform: rotate(-2deg);
	}
	.display-row2 {
		font-size: 0.7em;
	}

	.tagline {
		font-family: 'Inter', system-ui, sans-serif;
		font-size: clamp(1.05rem, 1.5vw, 1.25rem);
		max-width: 560px;
		margin: 28px auto 36px;
		color: var(--ink);
		line-height: 1.45;
	}

	.install-row {
		display: inline-flex;
		align-items: stretch;
		max-width: 560px;
		margin: 0 auto 24px;
		border: 2.5px solid var(--ink);
		border-radius: 14px;
		overflow: hidden;
		background: var(--cream);
		box-shadow: 4px 4px 0 var(--ink);
	}
	.install-tabs {
		display: flex;
		border-right: 2.5px solid var(--ink);
	}
	.tab {
		background: var(--cream);
		color: var(--ink);
		border: 0;
		border-right: 2px solid var(--ink);
		padding: 0 16px;
		font: inherit;
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 12px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.tab:last-child {
		border-right: 0;
	}
	.tab.active {
		background: var(--ink);
		color: var(--cream);
	}
	.install-box {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 16px;
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 14px;
	}
	.install-box .prompt {
		color: #d6488a;
		font-weight: 700;
	}

	.hero-cta {
		display: flex;
		gap: 14px;
		justify-content: center;
		flex-wrap: wrap;
		margin: 0 0 36px;
	}
	.cta {
		display: inline-block;
		padding: 14px 26px;
		font-family: 'Fredoka', 'Inter', system-ui, sans-serif;
		font-weight: 700;
		font-size: 1.05rem;
		letter-spacing: -0.01em;
		text-decoration: none;
		border: 3px solid var(--ink);
		border-radius: 999px;
		box-shadow: 4px 4px 0 var(--ink);
		transition: transform 0.12s, box-shadow 0.12s;
	}
	.cta:hover {
		transform: translate(-2px, -2px);
		box-shadow: 6px 6px 0 var(--ink);
	}
	.cta-primary {
		background: var(--ink);
		color: var(--cream);
	}
	.cta-secondary {
		background: var(--cream);
		color: var(--ink);
	}

	.feature-pills {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 10px;
		max-width: 720px;
		margin: 0 auto;
	}
	.pill {
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 12px;
		letter-spacing: 0.06em;
		padding: 6px 14px;
		border: 2px solid var(--ink);
		border-radius: 999px;
		color: var(--ink);
		box-shadow: 2px 2px 0 var(--ink);
	}
	.pill-mint { background: var(--mint); }
	.pill-lemon { background: var(--lemon); }
	.pill-cream { background: var(--cream); }

	.section {
		padding: 64px 0;
	}
	.section-head {
		margin-bottom: 36px;
		max-width: 760px;
	}
	.section-title {
		font-family: 'Fredoka', 'Inter', system-ui, sans-serif;
		font-weight: 800;
		font-size: clamp(2rem, 4.5vw, 3.4rem);
		line-height: 1.02;
		letter-spacing: -0.025em;
		margin: 14px 0 0;
		color: var(--ink);
	}
	.section-sub {
		margin: 12px 0 0;
		max-width: 520px;
		color: var(--ink-soft);
		font-size: 1.02rem;
	}

	.flavor-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
	}
	.flavor-card {
		display: grid;
		grid-template-columns: 56px 1fr;
		gap: 14px;
		align-items: start;
		background: var(--cream);
		border: 3px solid var(--ink);
		border-radius: 24px;
		padding: 18px 20px;
		box-shadow: 4px 4px 0 var(--ink);
	}
	.flavor-num {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		background: var(--lemon);
		border: 2.5px solid var(--ink);
		border-radius: 50%;
		font-family: 'Fredoka', 'Inter', sans-serif;
		font-weight: 700;
		font-size: 14px;
		color: var(--ink);
	}
	.flavor-body {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.flavor-title {
		font-family: 'Fredoka', 'Inter', sans-serif;
		font-weight: 700;
		font-size: 1.15rem;
		color: var(--ink);
	}
	.flavor-desc {
		color: var(--ink-soft);
		font-size: 0.96rem;
		line-height: 1.45;
	}

	.usage-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 20px;
	}
	.snippet {
		margin: 0;
		padding: 22px;
		background: var(--cream);
		border: 3px solid var(--ink);
		border-radius: 24px;
		overflow-x: auto;
		font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;
		font-size: 13px;
		line-height: 1.6;
		color: var(--ink);
		box-shadow: 4px 4px 0 var(--ink);
	}
	.usage-preview {
		display: flex;
		flex-direction: column;
		background: var(--cream);
		border: 3px solid var(--ink);
		border-radius: 24px;
		overflow: hidden;
		box-shadow: 4px 4px 0 var(--ink);
	}
	.cell-label {
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 11px;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		padding: 10px 14px;
		border-bottom: 2.5px solid var(--ink);
		background: var(--cream);
		color: var(--ink);
	}
	.fluid-host {
		flex: 1;
		min-height: 360px;
		position: relative;
	}

	.preset-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 18px;
	}
	.preset-card {
		display: flex;
		flex-direction: column;
		background: var(--cream);
		border: 3px solid var(--ink);
		border-radius: 24px;
		overflow: hidden;
		box-shadow: 4px 4px 0 var(--ink);
	}
	.cell-canvas {
		height: 320px;
		position: relative;
	}

	.shape-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 18px;
	}
	.shape-card {
		display: flex;
		flex-direction: column;
		background: var(--cream);
		border: 3px solid var(--ink);
		border-radius: 24px;
		overflow: hidden;
		box-shadow: 4px 4px 0 var(--ink);
	}
	.shape-canvas {
		height: 280px;
		position: relative;
	}

	.physics-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 18px;
	}
	.physics-card {
		display: flex;
		flex-direction: column;
		background: var(--cream);
		border: 3px solid var(--ink);
		border-radius: 24px;
		overflow: hidden;
		box-shadow: 4px 4px 0 var(--ink);
	}
	.physics-canvas {
		height: 280px;
		position: relative;
	}
	.physics-snippet {
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 11px;
		letter-spacing: 0.04em;
		padding: 10px 14px;
		border-top: 2.5px solid var(--ink);
		background: var(--cream);
		color: var(--ink);
		word-break: break-all;
		white-space: pre-wrap;
	}

	.glass-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 18px;
	}
	.glass-card {
		display: flex;
		flex-direction: column;
		background: var(--cream);
		border: 3px solid var(--ink);
		border-radius: 24px;
		overflow: hidden;
		box-shadow: 4px 4px 0 var(--ink);
	}
	.glass-canvas {
		height: 340px;
		position: relative;
		background: var(--cream);
	}

	.sticky-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 18px;
	}
	.sticky-card {
		display: flex;
		flex-direction: column;
		background: var(--cream);
		border: 3px solid var(--ink);
		border-radius: 24px;
		overflow: hidden;
		box-shadow: 4px 4px 0 var(--ink);
	}
	.sticky-canvas {
		height: 320px;
		position: relative;
	}

	.reveal-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 18px;
	}
	.reveal-card {
		display: flex;
		flex-direction: column;
		background: var(--cream);
		border: 3px solid var(--ink);
		border-radius: 24px;
		overflow: hidden;
		box-shadow: 4px 4px 0 var(--ink);
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
		background: var(--pink);
	}
	.reveal-label {
		font-family: 'Fredoka', 'Inter', system-ui, sans-serif;
		font-weight: 800;
		font-size: 2.2rem;
		letter-spacing: -0.02em;
		color: var(--ink);
	}

	.distort-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 18px;
	}
	.distort-card {
		display: flex;
		flex-direction: column;
		background: var(--cream);
		border: 3px solid var(--ink);
		border-radius: 24px;
		overflow: hidden;
		box-shadow: 4px 4px 0 var(--ink);
	}
	.distort-canvas {
		height: 340px;
		position: relative;
	}

	.preset-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-bottom: 24px;
	}
	.preset-chip {
		background: var(--mint);
		color: var(--ink);
		border: 2.5px solid var(--ink);
		border-radius: 999px;
		padding: 6px 16px;
		font: inherit;
		font-family: 'Fredoka', 'Inter', sans-serif;
		font-weight: 700;
		font-size: 13px;
		cursor: pointer;
		box-shadow: 2px 2px 0 var(--ink);
		transition: transform 0.1s, box-shadow 0.1s;
	}
	.preset-chip:hover {
		transform: translate(-1px, -1px);
		box-shadow: 3px 3px 0 var(--ink);
	}
	.preset-chip.active {
		background: var(--ink);
		color: var(--lemon);
	}
	.preset-chip.reset {
		background: var(--lemon);
	}

	.playground-grid {
		display: grid;
		grid-template-columns: 1fr 340px;
		gap: 18px;
	}
	.playground-canvas {
		min-height: 480px;
		position: relative;
		background: var(--cream);
		border: 3px solid var(--ink);
		border-radius: 24px;
		overflow: hidden;
		box-shadow: 4px 4px 0 var(--ink);
	}
	.playground-panel {
		padding: 22px;
		display: flex;
		flex-direction: column;
		gap: 22px;
		background: var(--cream);
		border: 3px solid var(--ink);
		border-radius: 24px;
		overflow-y: auto;
		max-height: 600px;
		box-shadow: 4px 4px 0 var(--ink);
	}
	.knob-group {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.knob-group-title {
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 11px;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		font-weight: 700;
		color: var(--ink);
		background: var(--mint);
		display: inline-block;
		align-self: flex-start;
		border: 2px solid var(--ink);
		border-radius: 999px;
		padding: 3px 12px;
	}
	.knob-row {
		display: grid;
		grid-template-columns: 110px 1fr 48px;
		align-items: center;
		gap: 10px;
		cursor: pointer;
	}
	.knob-label {
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 12px;
		color: var(--ink);
	}
	.knob-value {
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 12px;
		text-align: right;
		color: var(--ink);
	}
	.knob-value.mono {
		font-family: ui-monospace, 'JetBrains Mono', monospace;
	}
	input[type='range'] {
		width: 100%;
		accent-color: #d6488a;
	}
	.toggle-row {
		display: flex;
		align-items: center;
		gap: 12px;
		cursor: pointer;
	}
	.toggle-row input[type='checkbox'] {
		display: none;
	}
	.toggle-pill {
		width: 40px;
		height: 22px;
		background: var(--cream);
		border: 2.5px solid var(--ink);
		border-radius: 999px;
		position: relative;
		transition: background 0.15s;
		flex-shrink: 0;
	}
	.toggle-pill::after {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: 13px;
		height: 13px;
		background: var(--ink);
		border-radius: 50%;
		transition: transform 0.15s, background 0.15s;
	}
	.toggle-row input[type='checkbox']:checked ~ .toggle-pill {
		background: var(--mint);
	}
	.toggle-row input[type='checkbox']:checked ~ .toggle-pill::after {
		transform: translateX(17px);
		background: var(--ink);
	}
	.color-row {
		display: flex;
		align-items: center;
		gap: 12px;
		cursor: pointer;
	}
	.color-row input[type='color'] {
		width: 36px;
		height: 28px;
		border: 2.5px solid var(--ink);
		border-radius: 8px;
		padding: 1px;
		background: none;
		cursor: pointer;
	}
	.snippet-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 11px;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ink);
	}
	.copy-btn {
		background: var(--lemon);
		color: var(--ink);
		border: 2px solid var(--ink);
		border-radius: 999px;
		padding: 4px 12px;
		font: inherit;
		font-family: 'Fredoka', 'Inter', sans-serif;
		font-weight: 700;
		font-size: 11px;
		letter-spacing: 0.04em;
		cursor: pointer;
		box-shadow: 2px 2px 0 var(--ink);
	}
	.copy-btn:hover {
		background: var(--mint);
	}
	.snippet-code {
		margin: 0;
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 12px;
		line-height: 1.6;
		white-space: pre-wrap;
		word-break: break-all;
		background: var(--pink);
		color: var(--ink);
		padding: 14px;
		border: 2.5px solid var(--ink);
		border-radius: 14px;
	}

	.page-footer {
		padding: 32px 0 64px;
	}
	.footer-card {
		background: var(--cream);
		border: 3px solid var(--ink);
		border-radius: 28px;
		padding: 28px 28px;
		box-shadow: 4px 4px 0 var(--ink);
	}
	.footer-row {
		display: grid;
		grid-template-columns: 1fr 2fr 1fr;
		gap: 24px;
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 12px;
		letter-spacing: 0.06em;
		color: var(--ink);
	}
	.footer-left {
		font-family: 'Fredoka', 'Inter', sans-serif;
		font-weight: 800;
		font-size: 1.1rem;
		letter-spacing: -0.01em;
		color: var(--ink);
		text-transform: lowercase;
	}
	.footer-left .lemon {
		color: var(--ink);
		background: var(--lemon);
		padding: 0 0.18em;
		border-radius: 0.18em;
		margin: 0 0.06em;
	}
	.footer-mid {
		text-align: center;
		color: var(--ink-soft);
	}
	.footer-right {
		text-align: right;
		font-weight: 700;
	}
	.footer-links {
		margin-top: 18px;
		padding-top: 18px;
		border-top: 2px dashed var(--ink-faint);
		display: flex;
		justify-content: center;
		gap: 22px;
		font-family: 'Fredoka', 'Inter', sans-serif;
		font-weight: 700;
	}
	.footer-links a {
		color: var(--ink);
		text-decoration: none;
		background: linear-gradient(transparent 60%, var(--lemon) 60%);
		padding: 0 4px;
	}
	.footer-links a:hover {
		background: linear-gradient(transparent 0%, var(--lemon) 0%);
	}

	@media (max-width: 980px) {
		.usage-grid,
		.preset-grid,
		.shape-grid,
		.physics-grid,
		.glass-grid,
		.sticky-grid,
		.reveal-grid,
		.distort-grid,
		.flavor-list {
			grid-template-columns: 1fr;
		}
		.playground-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 640px) {
		.page {
			padding: 0 16px;
		}
		.section {
			padding: 44px 0;
		}
		.hero {
			padding: 56px 0 40px;
		}
		.display {
			font-size: clamp(3rem, 17vw, 5.5rem);
		}
		.tagline {
			font-size: 1rem;
			margin: 22px auto 28px;
		}
		.cta {
			padding: 12px 22px;
			font-size: 1rem;
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
		.footer-row {
			grid-template-columns: 1fr;
			text-align: left;
		}
		.footer-mid,
		.footer-right {
			text-align: left;
		}
		.knob-row {
			grid-template-columns: 100px 1fr 44px;
		}
	}
</style>
