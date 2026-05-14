<script lang="ts">
	import {
		AnnularFluid,
		Aurora,
		CircularFluid,
		Fluid,
		FluidDistortion,
		FluidReveal,
		FluidStick,
		FrameFluid,
		FrozenSwirl,
		InkInWater,
		LavaLamp,
		Plasma,
		ToroidalTempest
	} from '$lib/index.js';
	import { base } from '$app/paths';

	type TabKey = 'bun' | 'npm' | 'pnpm' | 'yarn';

	const installCmds: Record<TabKey, string> = {
		bun: 'bun add svelte-fluid',
		npm: 'npm install svelte-fluid',
		pnpm: 'pnpm add svelte-fluid',
		yarn: 'yarn add svelte-fluid'
	};

	let activeTab = $state<TabKey>('npm');
	let copied = $state(false);
	let scrolled = $state(false);
	let reducedMotion = $state(false);

	async function copyInstall() {
		try {
			await navigator.clipboard.writeText(installCmds[activeTab]);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {
			copied = false;
		}
	}

	$effect(() => {
		const onScroll = () => {
			scrolled = window.scrollY > 8;
		};
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		reducedMotion = mq.matches;
		const onChange = (e: MediaQueryListEvent) => (reducedMotion = e.matches);
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	});

	const stickyAutoAnimate = $derived(!reducedMotion);

	const presets = [
		{
			name: 'LavaLamp',
			component: LavaLamp,
			seed: 12,
			desc: 'Slow molten blobs in a warm palette.',
			snippet: '<LavaLamp />'
		},
		{
			name: 'Plasma',
			component: Plasma,
			seed: 24,
			desc: 'High-energy chromatic turbulence.',
			snippet: '<Plasma />'
		},
		{
			name: 'InkInWater',
			component: InkInWater,
			seed: 36,
			desc: 'Cold ink curling through clear water.',
			snippet: '<InkInWater />'
		},
		{
			name: 'FrozenSwirl',
			component: FrozenSwirl,
			seed: 48,
			desc: 'Crystalline pale-blue vortex.',
			snippet: '<FrozenSwirl />'
		},
		{
			name: 'Aurora',
			component: Aurora,
			seed: 60,
			desc: 'Soft polar light ribbons drifting.',
			snippet: '<Aurora />'
		},
		{
			name: 'ToroidalTempest',
			component: ToroidalTempest,
			seed: 72,
			desc: 'Annular storm with circulating bands.',
			snippet: '<ToroidalTempest />'
		}
	];

	const features = [
		{
			title: 'Multi-instance',
			desc: 'Mount as many simulations as you need. No shared GL state.',
			path: 'M3 7h7v10H3zM14 7h7v10h-7z'
		},
		{
			title: 'Resize-stable',
			desc: 'Container changes, device rotation, DPR shifts — all handled.',
			path: 'M4 4h6M4 4v6M20 20h-6M20 20v-6M4 20l6-6M20 4l-6 6'
		},
		{
			title: 'Deterministic seeding',
			desc: 'Same seed, same first frame. Reproducible across reloads.',
			path: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1'
		},
		{
			title: 'Zero runtime deps',
			desc: 'Just Svelte. No bundler tricks, no peer dependency drama.',
			path: 'M12 2v20M2 12h20'
		},
		{
			title: '70+ props',
			desc: 'Tune physics, shading, splats, masks, distortion, glass.',
			path: 'M4 6h16M4 12h10M4 18h16'
		},
		{
			title: '10 presets',
			desc: 'Curated looks ready to drop into landings and dashboards.',
			path: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'
		}
	];

	const usage = `<script>
  import { Aurora } from 'svelte-fluid';
<\/script>

<div style="width: 100%; height: 480px;">
  <Aurora seed={42} aria-label="Aurora background" />
</div>`;

	const lightning = 'M 55 5 L 25 55 L 45 55 L 35 95 L 75 40 L 55 40 L 70 5 Z';

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
	<title>svelte-fluid — WebGL fluid simulation for Svelte 5</title>
</svelte:head>

<a class="competition-back" href="{base}/design-competition">← Competition</a>

<div class="page">
	<header class="nav" class:nav-scrolled={scrolled}>
		<div class="nav-inner">
			<a href="{base}/" class="brand">
				<span class="brand-dot" aria-hidden="true"></span>
				<span class="brand-name">svelte-fluid</span>
				<span class="badge">v0.2.2</span>
			</a>
			<nav class="nav-links" aria-label="Primary">
				<a href="{base}/docs">Docs</a>
				<a href="{base}/docs/components">Components</a>
				<a href="https://github.com/tommyyzhao/svelte-fluid" target="_blank" rel="noreferrer">
					GitHub
				</a>
			</nav>
			<div class="nav-right">
				<span class="kbd" aria-hidden="true">⌘K</span>
				<a class="btn btn-primary" href="{base}/docs">Get Started</a>
			</div>
		</div>
	</header>

	<main>
		<section class="hero">
			<a class="announce" href="{base}/docs">
				<span class="announce-tag">New</span>
				Now publicly available on npm
				<span class="announce-arrow" aria-hidden="true">→</span>
			</a>
			<h1 class="title">WebGL fluid simulation, as a Svelte 5 component.</h1>
			<p class="lede">
				Multi-instance, resize-stable, deterministic seeding. Drop one component into your Svelte
				app and ship a fluid background, hero, or interactive surface in minutes.
			</p>
			<div class="hero-cta">
				<a class="btn btn-primary" href="{base}/docs">Get Started</a>
				<a
					class="btn btn-outline"
					href="https://github.com/tommyyzhao/svelte-fluid"
					target="_blank"
					rel="noreferrer"
				>
					View on GitHub
				</a>
			</div>
		</section>

		<section class="hero-demo-wrap">
			<div class="hero-demo">
				<Aurora seed={101} lazy={false} aria-label="Aurora preset demo" />
				<div class="hero-demo-tag">
					<span class="dot" aria-hidden="true"></span>
					Aurora — live
				</div>
			</div>
		</section>

		<section class="install">
			<div class="install-card">
				<div class="tabs" role="tablist" aria-label="Install command">
					{#each ['bun', 'npm', 'pnpm', 'yarn'] as t (t)}
						<button
							class="tab"
							class:tab-active={activeTab === t}
							role="tab"
							aria-selected={activeTab === t}
							onclick={() => (activeTab = t as TabKey)}
						>
							{t}
						</button>
					{/each}
				</div>
				<div class="install-row">
					<code class="install-cmd">
						<span class="prompt">$</span>
						{installCmds[activeTab]}
					</code>
					<button class="copy" onclick={copyInstall} aria-label="Copy install command">
						{#if copied}
							<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
								><path d="M5 12l4 4L19 6" stroke-width="2" stroke-linecap="round" /></svg
							>
							Copied
						{:else}
							<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
								><rect x="9" y="9" width="11" height="11" rx="2" stroke-width="1.7" /><path
									d="M5 15V6a2 2 0 012-2h9"
									stroke-width="1.7"
								/></svg
							>
							Copy
						{/if}
					</button>
				</div>
			</div>
		</section>

		<div class="rule"></div>

		<section class="features">
			<p class="eyebrow">Why svelte-fluid</p>
			<h2 class="section-title">Built for production Svelte apps.</h2>
			<div class="features-grid">
				{#each features as f (f.title)}
					<div class="feature">
						<div class="feature-icon">
							<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor">
								<path d={f.path} stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						</div>
						<h3>{f.title}</h3>
						<p>{f.desc}</p>
					</div>
				{/each}
			</div>
		</section>

		<div class="rule"></div>

		<section class="gallery">
			<p class="eyebrow">Presets</p>
			<h2 class="section-title">Drop-in components. Tweak when you need to.</h2>
			<p class="section-lede">
				Ten curated looks built on the same engine. Each accepts <code>seed</code>,
				<code>lazy</code>, and an <code>aria-label</code>.
			</p>
			<div class="presets-grid">
				{#each presets as p (p.name)}
					<article class="preset-card">
						<div class="preset-canvas">
							<p.component seed={p.seed} lazy aria-label="{p.name} preset preview" />
						</div>
						<div class="preset-meta">
							<div class="preset-head">
								<h3>{p.name}</h3>
								<span class="preset-arrow" aria-hidden="true">→</span>
							</div>
							<p>{p.desc}</p>
							<code class="preset-snippet">{p.snippet}</code>
						</div>
					</article>
				{/each}
			</div>
		</section>

		<div class="rule"></div>

		<section class="quickstart">
			<p class="eyebrow">Quick start</p>
			<h2 class="section-title">Two lines of code. One Svelte component.</h2>
			<div class="quickstart-grid">
				<div class="code-card">
					<div class="code-head">
						<span class="dot-red"></span>
						<span class="dot-yellow"></span>
						<span class="dot-green"></span>
						<span class="code-file">+page.svelte</span>
					</div>
					<pre class="code-body"><code>{usage}</code></pre>
				</div>
				<div class="live-card">
					<Fluid seed={7} splatOnHover aria-label="Interactive Fluid demo" />
					<div class="live-tag">Interactive — hover to splat</div>
				</div>
			</div>
		</section>

		<div class="rule"></div>

		<section class="shapes-section">
			<p class="eyebrow">Shapes</p>
			<h2 class="section-title">Shape primitives.</h2>
			<p class="section-lede">
				Six container types — circle, rounded rect, frame, annulus, SVG path, and text glyph. Pass a <code>containerShape</code> prop and the simulation is clipped to the SDF.
			</p>
			<div class="shapes-grid">
				<figure class="shape-card">
					<div class="shape-canvas">
						<CircularFluid seed={601} lazy splatOnHover aria-label="Circle container demo" />
					</div>
					<figcaption class="shape-label">Circle</figcaption>
				</figure>
				<figure class="shape-card">
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
					<figcaption class="shape-label">Rounded Rect</figcaption>
				</figure>
				<figure class="shape-card">
					<div class="shape-canvas">
						<FrameFluid seed={603} lazy splatOnHover aria-label="Frame container demo" />
					</div>
					<figcaption class="shape-label">Frame</figcaption>
				</figure>
				<figure class="shape-card">
					<div class="shape-canvas">
						<AnnularFluid seed={604} lazy splatOnHover aria-label="Annulus container demo" />
					</div>
					<figcaption class="shape-label">Annulus</figcaption>
				</figure>
				<figure class="shape-card">
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
					<figcaption class="shape-label">SVG Path</figcaption>
				</figure>
				<figure class="shape-card">
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
					<figcaption class="shape-label">Text Glyph</figcaption>
				</figure>
			</div>
		</section>

		<div class="rule"></div>

		<section class="physics-section">
			<p class="eyebrow">Physics</p>
			<h2 class="section-title">Physics, prop by prop.</h2>
			<p class="section-lede">
				Every prop has a sensible default. Override <code>curl</code>, <code>splatRadius</code>, <code>splatForce</code>, and dissipation to shape the simulation to your design.
			</p>
			<div class="physics-grid">
				<figure class="physics-card">
					<div class="physics-canvas">
						<Fluid
							seed={1234}
							initialSplatCount={12}
							splatOnHover
							lazy
							aria-label="Default fluid configuration"
						/>
					</div>
					<code class="physics-snippet">{'<Fluid />'}</code>
					<figcaption class="physics-label">Default</figcaption>
				</figure>
				<figure class="physics-card">
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
					<code class="physics-snippet">bloom={'{false}'} curl={'{5}'} densityDissipation={'{0.4}'}</code>
					<figcaption class="physics-label">Flat + Soft</figcaption>
				</figure>
				<figure class="physics-card">
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
					<code class="physics-snippet">shading={'{false}'} splatRadius={'{0.8}'} splatForce={'{9000}'}</code>
					<figcaption class="physics-label">Bold Splats</figcaption>
				</figure>
				<figure class="physics-card">
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
					<code class="physics-snippet">velocityDissipation={'{0.05}'} densityDissipation={'{0.5}'} transparent</code>
					<figcaption class="physics-label">Slow + Transparent</figcaption>
				</figure>
			</div>
		</section>

		<div class="rule"></div>

		<section class="glass-section">
			<p class="eyebrow">Glass</p>
			<h2 class="section-title">Glass refraction.</h2>
			<p class="section-lede">
				Enable <code>glass</code> to render the fluid behind a refractive surface. Tune <code>glassRefraction</code>, <code>glassReflectivity</code>, and <code>glassChromatic</code> for lens behavior on any container shape.
			</p>
			<div class="glass-grid">
				<figure class="glass-card">
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
					<figcaption class="glass-label">Crystal Orb</figcaption>
				</figure>
				<figure class="glass-card">
					<div class="glass-canvas">
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
					<figcaption class="glass-label">Soft Lens</figcaption>
				</figure>
				<figure class="glass-card">
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
					<figcaption class="glass-label">Portal Ring</figcaption>
				</figure>
				<figure class="glass-card">
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
					<figcaption class="glass-label">Glass Frame</figcaption>
				</figure>
			</div>
		</section>

		<div class="rule"></div>

		<section class="sticky-section">
			<p class="eyebrow">Sticky</p>
			<h2 class="section-title">Sticky masks.</h2>
			<p class="section-lede">
				<code>FluidStick</code> confines dye to a text string or SVG path. Pair with <code>autoAnimate</code> for ambient motion or leave it cursor-driven.
			</p>
			<div class="sticky-grid">
				<figure class="sticky-card">
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
							lazy
						/>
					</div>
					<figcaption class="sticky-label">Geist · 900</figcaption>
				</figure>
				<figure class="sticky-card">
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
							lazy
						/>
					</div>
					<figcaption class="sticky-label">Georgia · ∞</figcaption>
				</figure>
			</div>
		</section>

		<div class="rule"></div>

		<section class="reveal-section">
			<p class="eyebrow">Reveal</p>
			<h2 class="section-title">Reveal layers.</h2>
			<p class="section-lede">
				<code>FluidReveal</code> wraps any slot and drives its opacity from the velocity field. Use <code>autoReveal</code> for hands-off animation or let pointer motion clear the cover.
			</p>
			<div class="reveal-grid">
				<figure class="reveal-card">
					<div class="reveal-canvas" aria-label="Scratch-to-reveal demo">
						<FluidReveal lazy velocityDissipation={0.95} pressureIterations={10}>
							<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:1.4rem;">Revealed</div>
						</FluidReveal>
					</div>
					<figcaption class="reveal-label">Scratch to Reveal</figcaption>
				</figure>
				<figure class="reveal-card">
					<div class="reveal-canvas" aria-label="Auto-reveal demo">
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
							<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:1.4rem;">Auto Reveal</div>
						</FluidReveal>
					</div>
					<figcaption class="reveal-label">Auto Reveal</figcaption>
				</figure>
			</div>
		</section>

		<div class="rule"></div>

		<section class="distort-section">
			<p class="eyebrow">Distortion</p>
			<h2 class="section-title">Velocity-field distortion.</h2>
			<p class="section-lede">
				<code>FluidDistortion</code> samples an image through the live velocity field. Control the warp with <code>strength</code> and <code>intensity</code>; <code>fit</code> matches CSS conventions.
			</p>
			<div class="distort-grid">
				<figure class="distort-card">
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
					<figcaption class="distort-label">Subtle · strength 0.3</figcaption>
				</figure>
				<figure class="distort-card">
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
					<figcaption class="distort-label">Strong · strength 0.45</figcaption>
				</figure>
			</div>
		</section>

		<div class="rule"></div>

		<section class="playground-section">
			<p class="eyebrow">Playground</p>
			<h2 class="section-title">Try it live.</h2>
			<p class="section-lede">Drag the knobs. The fluid updates in real time.</p>

			<div class="preset-chips" role="tablist" aria-label="Quick-start presets">
				{#each presetNames as name (name)}
					<button
						type="button"
						class="preset-chip"
						class:preset-chip-active={activePreset === name}
						aria-pressed={activePreset === name}
						onclick={() => applyPreset(name)}
					>
						{name}
					</button>
				{/each}
				<button type="button" class="preset-chip preset-chip-reset" onclick={resetPlayground}>
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

		<div class="rule"></div>

		<section class="cta">
			<h2>Ready to build?</h2>
			<p>Read the docs, copy a preset, ship the page.</p>
			<div class="cta-buttons">
				<a class="btn btn-primary" href="{base}/docs">Read the docs</a>
				<a
					class="btn btn-outline"
					href="https://github.com/tommyyzhao/svelte-fluid"
					target="_blank"
					rel="noreferrer">Star on GitHub</a
				>
			</div>
		</section>
	</main>

	<footer class="footer">
		<div class="footer-inner">
			<div class="footer-brand">
				<div class="brand">
					<span class="brand-dot" aria-hidden="true"></span>
					<span class="brand-name">svelte-fluid</span>
				</div>
				<p class="footer-tag">WebGL fluid simulation for Svelte 5.</p>
				<p class="footer-theme">
					<span class="theme-dot" aria-hidden="true"></span>
					Auto theme · MIT
				</p>
			</div>
			<div class="footer-col">
				<h4>Library</h4>
				<a href="{base}/docs">Getting started</a>
				<a href="{base}/docs/components">Components</a>
				<a href="{base}/docs/configuration">Configuration</a>
				<a href="{base}/docs/presets">Presets</a>
			</div>
			<div class="footer-col">
				<h4>Resources</h4>
				<a href="{base}/docs/api">API</a>
				<a href="{base}/docs/shapes">Shapes</a>
				<a href="{base}/skills.md">LLM reference</a>
			</div>
			<div class="footer-col">
				<h4>Project</h4>
				<a href="https://github.com/tommyyzhao/svelte-fluid" target="_blank" rel="noreferrer">
					GitHub
				</a>
				<a href="https://www.npmjs.com/package/svelte-fluid" target="_blank" rel="noreferrer">
					npm
				</a>
			</div>
			<div class="footer-col">
				<h4>Legal</h4>
				<a
					href="https://github.com/tommyyzhao/svelte-fluid/blob/main/LICENSE"
					target="_blank"
					rel="noreferrer"
				>
					MIT License
				</a>
			</div>
		</div>
		<div class="footer-base">
			<p>
				Derivative work of PavelDoGreat/WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017.
			</p>
			<p class="copyright">© 2026 svelte-fluid contributors</p>
		</div>
	</footer>
</div>

<style>
	:global(html),
	:global(body) {
		background: var(--bg);
		color: var(--fg);
	}

	.competition-back {
		position: fixed;
		top: 1rem;
		left: 1rem;
		z-index: 200;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--muted, rgba(100, 100, 100, 0.7));
		text-decoration: none;
		background: var(--card, rgba(255, 255, 255, 0.9));
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid var(--border, rgba(0, 0, 0, 0.1));
		border-radius: 6px;
		padding: 0.35rem 0.7rem;
		transition: color 0.15s;
	}

	.competition-back:hover {
		color: var(--fg, rgba(0, 0, 0, 0.9));
	}

	.page {
		--bg: #ffffff;
		--fg: #0a0a0a;
		--muted: #737373;
		--subtle: #525252;
		--border: #e5e5e5;
		--border-strong: #d4d4d4;
		--card: #fafafa;
		--card-2: #f5f5f5;
		--accent: #0a0a0a;
		--accent-fg: #ffffff;
		--ring: rgba(10, 10, 10, 0.08);
		font-family: 'Geist', 'Inter', system-ui, -apple-system, sans-serif;
		font-feature-settings: 'cv11', 'ss01';
		background: var(--bg);
		color: var(--fg);
		min-height: 100vh;
		letter-spacing: -0.01em;
	}

	@media (prefers-color-scheme: dark) {
		.page {
			--bg: #0a0a0a;
			--fg: #fafafa;
			--muted: #a3a3a3;
			--subtle: #d4d4d4;
			--border: #262626;
			--border-strong: #404040;
			--card: #111111;
			--card-2: #161616;
			--accent: #fafafa;
			--accent-fg: #0a0a0a;
			--ring: rgba(250, 250, 250, 0.08);
		}
	}

	.nav {
		position: sticky;
		top: 0;
		z-index: 50;
		border-bottom: 1px solid transparent;
		background: transparent;
		transition: background 200ms, border-color 200ms, backdrop-filter 200ms;
	}

	.nav-scrolled {
		background: color-mix(in srgb, var(--bg) 75%, transparent);
		backdrop-filter: saturate(180%) blur(12px);
		-webkit-backdrop-filter: saturate(180%) blur(12px);
		border-bottom-color: var(--border);
	}

	.nav-inner {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 24px;
		height: 56px;
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 24px;
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		text-decoration: none;
		color: var(--fg);
	}

	.brand-dot {
		width: 16px;
		height: 16px;
		border-radius: 4px;
		background:
			radial-gradient(circle at 30% 30%, #a78bfa, #6366f1 60%, #0ea5e9);
		box-shadow: 0 0 0 1px var(--border) inset;
	}

	.brand-name {
		font-family: 'Geist Mono', ui-monospace, 'JetBrains Mono', monospace;
		font-size: 0.875rem;
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	.badge {
		font-family: 'Geist Mono', ui-monospace, monospace;
		font-size: 0.6875rem;
		color: var(--muted);
		padding: 2px 6px;
		border: 1px solid var(--border);
		border-radius: 999px;
		line-height: 1;
	}

	.nav-links {
		display: flex;
		justify-content: center;
		gap: 24px;
	}

	.nav-links a {
		color: var(--subtle);
		text-decoration: none;
		font-size: 0.875rem;
		transition: color 120ms;
	}

	.nav-links a:hover {
		color: var(--fg);
	}

	.nav-right {
		display: inline-flex;
		align-items: center;
		gap: 12px;
	}

	.kbd {
		font-family: 'Geist Mono', ui-monospace, monospace;
		font-size: 0.6875rem;
		color: var(--muted);
		padding: 3px 8px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--card);
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 36px;
		padding: 0 14px;
		font-size: 0.875rem;
		font-weight: 500;
		border-radius: 8px;
		text-decoration: none;
		border: 1px solid transparent;
		cursor: pointer;
		transition: background 120ms, border-color 120ms, color 120ms;
		white-space: nowrap;
	}

	.btn-primary {
		background: var(--accent);
		color: var(--accent-fg);
	}

	.btn-primary:hover {
		background: color-mix(in srgb, var(--accent) 88%, transparent);
	}

	.btn-outline {
		background: transparent;
		color: var(--fg);
		border-color: var(--border-strong);
	}

	.btn-outline:hover {
		background: var(--card);
	}

	main {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 24px;
	}

	.hero {
		max-width: 768px;
		margin: 0 auto;
		padding: 96px 0 32px;
		text-align: center;
	}

	.announce {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 4px 12px 4px 4px;
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: 0.8125rem;
		color: var(--subtle);
		text-decoration: none;
		margin-bottom: 32px;
		background: var(--card);
		transition: border-color 120ms;
	}

	.announce:hover {
		border-color: var(--border-strong);
	}

	.announce-tag {
		background: var(--accent);
		color: var(--accent-fg);
		font-size: 0.6875rem;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 999px;
		line-height: 1;
	}

	.announce-arrow {
		color: var(--muted);
	}

	.title {
		font-size: clamp(2.25rem, 5vw, 3.5rem);
		line-height: 1.05;
		letter-spacing: -0.035em;
		font-weight: 600;
		margin: 0 0 20px;
	}

	.lede {
		font-size: 1.125rem;
		line-height: 1.55;
		color: var(--muted);
		max-width: 620px;
		margin: 0 auto 28px;
	}

	.hero-cta {
		display: inline-flex;
		gap: 10px;
	}

	.hero-demo-wrap {
		max-width: 1100px;
		margin: 24px auto 0;
		padding: 0 0 16px;
	}

	.hero-demo {
		position: relative;
		height: 480px;
		border: 1px solid var(--border);
		border-radius: 16px;
		overflow: hidden;
		box-shadow: 0 1px 0 var(--ring), 0 24px 60px -32px rgba(0, 0, 0, 0.25);
		background: var(--card);
	}

	.hero-demo-tag {
		position: absolute;
		top: 12px;
		left: 12px;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		font-family: 'Geist Mono', ui-monospace, monospace;
		font-size: 0.6875rem;
		color: var(--fg);
		background: color-mix(in srgb, var(--bg) 70%, transparent);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid var(--border);
		border-radius: 999px;
	}

	.dot {
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: #22c55e;
		box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.18);
	}

	.install {
		max-width: 720px;
		margin: 24px auto 56px;
	}

	.install-card {
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--card);
		overflow: hidden;
	}

	.tabs {
		display: flex;
		gap: 0;
		border-bottom: 1px solid var(--border);
		padding: 0 4px;
	}

	.tab {
		background: transparent;
		border: none;
		color: var(--muted);
		font-family: 'Geist Mono', ui-monospace, monospace;
		font-size: 0.75rem;
		padding: 10px 14px;
		cursor: pointer;
		position: relative;
		transition: color 120ms;
	}

	.tab:hover {
		color: var(--fg);
	}

	.tab-active {
		color: var(--fg);
	}

	.tab-active::after {
		content: '';
		position: absolute;
		left: 8px;
		right: 8px;
		bottom: -1px;
		height: 2px;
		background: var(--accent);
		border-radius: 2px 2px 0 0;
	}

	.install-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px;
		gap: 16px;
	}

	.install-cmd {
		font-family: 'Geist Mono', ui-monospace, monospace;
		font-size: 0.875rem;
		color: var(--fg);
	}

	.prompt {
		color: var(--muted);
		margin-right: 8px;
		user-select: none;
	}

	.copy {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 30px;
		padding: 0 10px;
		background: transparent;
		border: 1px solid var(--border);
		color: var(--subtle);
		font-size: 0.75rem;
		font-family: inherit;
		border-radius: 6px;
		cursor: pointer;
		transition: border-color 120ms, color 120ms, background 120ms;
	}

	.copy:hover {
		border-color: var(--border-strong);
		color: var(--fg);
		background: var(--card-2);
	}

	.rule {
		height: 1px;
		background: var(--border);
		margin: 16px 0;
	}

	.eyebrow {
		font-family: 'Geist Mono', ui-monospace, monospace;
		font-size: 0.6875rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
		margin: 0 0 12px;
	}

	.section-title {
		font-size: clamp(1.5rem, 2.5vw, 2rem);
		line-height: 1.15;
		letter-spacing: -0.025em;
		font-weight: 600;
		margin: 0 0 12px;
	}

	.section-lede {
		color: var(--muted);
		font-size: 0.9375rem;
		max-width: 620px;
		margin: 0 0 28px;
	}

	.section-lede code {
		font-family: 'Geist Mono', ui-monospace, monospace;
		font-size: 0.8125rem;
		padding: 1px 6px;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--subtle);
	}

	.features {
		padding: 64px 0;
	}

	.features-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 12px;
		margin-top: 24px;
	}

	.feature {
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 20px;
		background: var(--card);
		transition: border-color 120ms;
	}

	.feature:hover {
		border-color: var(--border-strong);
	}

	.feature-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		background: var(--card-2);
		border: 1px solid var(--border);
		color: var(--subtle);
		margin-bottom: 16px;
	}

	.feature h3 {
		font-size: 0.9375rem;
		font-weight: 600;
		margin: 0 0 6px;
		letter-spacing: -0.01em;
	}

	.feature p {
		font-size: 0.875rem;
		color: var(--muted);
		line-height: 1.5;
		margin: 0;
	}

	.gallery {
		padding: 64px 0;
	}

	.presets-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 16px;
	}

	.preset-card {
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--card);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		transition: border-color 160ms, transform 160ms;
	}

	.preset-card:hover {
		border-color: var(--accent);
	}

	.preset-canvas {
		height: 280px;
		position: relative;
		overflow: hidden;
		border-bottom: 1px solid var(--border);
		background: #000;
	}

	.preset-meta {
		padding: 16px;
	}

	.preset-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 4px;
	}

	.preset-head h3 {
		font-size: 0.9375rem;
		font-weight: 500;
		margin: 0;
		letter-spacing: -0.01em;
	}

	.preset-arrow {
		opacity: 0;
		color: var(--fg);
		font-size: 0.875rem;
		transition: opacity 160ms, transform 160ms;
	}

	.preset-card:hover .preset-arrow {
		opacity: 1;
		transform: translateX(2px);
	}

	.preset-meta p {
		margin: 0 0 10px;
		color: var(--muted);
		font-size: 0.8125rem;
		line-height: 1.5;
	}

	.preset-snippet {
		display: block;
		opacity: 0;
		transform: translateY(2px);
		font-family: 'Geist Mono', ui-monospace, monospace;
		font-size: 0.75rem;
		color: var(--subtle);
		background: var(--card-2);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 6px 10px;
		transition: opacity 160ms, transform 160ms;
	}

	.preset-card:hover .preset-snippet {
		opacity: 1;
		transform: translateY(0);
	}

	.quickstart {
		padding: 64px 0;
	}

	.quickstart-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		margin-top: 24px;
	}

	.code-card {
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--card);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.code-head {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
		background: var(--card-2);
	}

	.dot-red,
	.dot-yellow,
	.dot-green {
		width: 10px;
		height: 10px;
		border-radius: 999px;
		background: var(--border-strong);
	}

	.code-file {
		margin-left: 8px;
		font-family: 'Geist Mono', ui-monospace, monospace;
		font-size: 0.75rem;
		color: var(--muted);
	}

	.code-body {
		margin: 0;
		padding: 16px 18px;
		font-family: 'Geist Mono', ui-monospace, monospace;
		font-size: 0.8125rem;
		line-height: 1.65;
		color: var(--subtle);
		overflow: auto;
		flex: 1;
		white-space: pre;
	}

	.live-card {
		position: relative;
		height: 360px;
		border: 1px solid var(--border);
		border-radius: 12px;
		overflow: hidden;
		background: #000;
	}

	.live-tag {
		position: absolute;
		left: 12px;
		bottom: 12px;
		font-family: 'Geist Mono', ui-monospace, monospace;
		font-size: 0.6875rem;
		color: var(--fg);
		padding: 4px 10px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: color-mix(in srgb, var(--bg) 70%, transparent);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
	}

	/* Shapes section */

	.shapes-section {
		padding: 64px 0;
	}

	.shapes-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 16px;
	}

	.shape-card {
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--card);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		margin: 0;
		transition: border-color 160ms;
	}

	.shape-card:hover {
		border-color: var(--border-strong);
	}

	.shape-canvas {
		height: 220px;
		position: relative;
		overflow: hidden;
		background: #000;
		border-bottom: 1px solid var(--border);
	}

	.shape-label {
		padding: 10px 14px;
		font-family: 'Geist Mono', ui-monospace, monospace;
		font-size: 0.75rem;
		color: var(--muted);
		letter-spacing: 0.04em;
		margin: 0;
	}

	/* Physics section */

	.physics-section {
		padding: 64px 0;
	}

	.physics-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 16px;
	}

	.physics-card {
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--card);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		margin: 0;
		transition: border-color 160ms;
	}

	.physics-card:hover {
		border-color: var(--border-strong);
	}

	.physics-canvas {
		height: 200px;
		position: relative;
		overflow: hidden;
		background: #000;
		border-bottom: 1px solid var(--border);
	}

	.physics-snippet {
		display: block;
		font-family: 'Geist Mono', ui-monospace, monospace;
		font-size: 0.6875rem;
		color: var(--subtle);
		padding: 8px 12px;
		border-bottom: 1px solid var(--border);
		background: var(--card-2);
		white-space: normal;
		word-break: break-all;
		line-height: 1.5;
	}

	.physics-label {
		padding: 8px 12px;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--fg);
		margin: 0;
		letter-spacing: -0.005em;
	}

	/* Glass section */

	.glass-section {
		padding: 64px 0;
	}

	.glass-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 16px;
	}

	.glass-card {
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--card);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		margin: 0;
		transition: border-color 160ms;
	}

	.glass-card:hover {
		border-color: var(--border-strong);
	}

	.glass-canvas {
		height: 220px;
		position: relative;
		overflow: hidden;
		background: #000;
		border-bottom: 1px solid var(--border);
	}

	.glass-label {
		padding: 10px 14px;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--fg);
		margin: 0;
		letter-spacing: -0.005em;
	}

	/* Sticky section */

	.sticky-section {
		padding: 64px 0;
	}

	.sticky-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
	}

	.sticky-card {
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--card);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		margin: 0;
		transition: border-color 160ms;
	}

	.sticky-card:hover {
		border-color: var(--border-strong);
	}

	.sticky-canvas {
		height: 220px;
		position: relative;
		overflow: hidden;
		background: #000;
		border-bottom: 1px solid var(--border);
	}

	.sticky-label {
		padding: 10px 14px;
		font-family: 'Geist Mono', ui-monospace, monospace;
		font-size: 0.75rem;
		color: var(--muted);
		letter-spacing: 0.04em;
		margin: 0;
	}

	/* Reveal section */

	.reveal-section {
		padding: 64px 0;
	}

	.reveal-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
	}

	.reveal-card {
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--card);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		margin: 0;
		transition: border-color 160ms;
	}

	.reveal-card:hover {
		border-color: var(--border-strong);
	}

	.reveal-canvas {
		height: 280px;
		position: relative;
		overflow: hidden;
		border-bottom: 1px solid var(--border);
		background: var(--card-2);
		color: var(--fg);
	}

	.reveal-label {
		padding: 10px 14px;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--fg);
		margin: 0;
		letter-spacing: -0.005em;
	}

	/* Distortion section */

	.distort-section {
		padding: 64px 0;
	}

	.distort-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
	}

	.distort-card {
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--card);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		margin: 0;
		transition: border-color 160ms;
	}

	.distort-card:hover {
		border-color: var(--border-strong);
	}

	.distort-canvas {
		height: 320px;
		position: relative;
		overflow: hidden;
		border-bottom: 1px solid var(--border);
		background: #000;
	}

	.distort-label {
		padding: 10px 14px;
		font-family: 'Geist Mono', ui-monospace, monospace;
		font-size: 0.75rem;
		color: var(--muted);
		letter-spacing: 0.04em;
		margin: 0;
	}

	/* Playground section */

	.playground-section {
		padding: 64px 0;
	}

	.preset-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 20px;
	}

	.preset-chip {
		height: 30px;
		padding: 0 12px;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: 0.75rem;
		font-family: inherit;
		color: var(--subtle);
		cursor: pointer;
		transition: border-color 120ms, color 120ms, background 120ms;
	}

	.preset-chip:hover {
		border-color: var(--border-strong);
		color: var(--fg);
	}

	.preset-chip-active {
		background: var(--accent);
		color: var(--accent-fg);
		border-color: var(--accent);
	}

	.preset-chip-reset {
		color: var(--muted);
	}

	.playground-grid {
		display: grid;
		grid-template-columns: 1fr 280px;
		gap: 16px;
		align-items: start;
	}

	.playground-canvas {
		height: 480px;
		border: 1px solid var(--border);
		border-radius: 12px;
		overflow: hidden;
		background: #000;
	}

	.playground-panel {
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--card);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.knob-group {
		padding: 14px 16px;
		border-bottom: 1px solid var(--border);
	}

	.knob-group-title {
		font-family: 'Geist Mono', ui-monospace, monospace;
		font-size: 0.6875rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
		margin-bottom: 10px;
	}

	.knob-row {
		display: grid;
		grid-template-columns: 100px 1fr 44px;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
		cursor: pointer;
	}

	.knob-row:last-child {
		margin-bottom: 0;
	}

	.knob-label {
		font-family: 'Geist Mono', ui-monospace, monospace;
		font-size: 0.6875rem;
		color: var(--subtle);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.knob-row input[type='range'] {
		width: 100%;
		accent-color: var(--accent);
	}

	.knob-value {
		font-family: 'Geist Mono', ui-monospace, monospace;
		font-size: 0.6875rem;
		color: var(--muted);
		text-align: right;
	}

	.knob-value.mono {
		font-size: 0.625rem;
	}

	.toggle-row {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 8px;
		cursor: pointer;
		position: relative;
	}

	.toggle-row:last-child {
		margin-bottom: 0;
	}

	.toggle-row input[type='checkbox'] {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}

	.toggle-pill {
		display: inline-block;
		width: 28px;
		height: 16px;
		border-radius: 999px;
		background: var(--border-strong);
		position: relative;
		flex-shrink: 0;
		transition: background 120ms;
	}

	.toggle-pill::after {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: 12px;
		height: 12px;
		border-radius: 999px;
		background: var(--bg);
		transition: transform 120ms;
	}

	.toggle-row input[type='checkbox']:checked + .toggle-pill {
		background: var(--accent);
	}

	.toggle-row input[type='checkbox']:checked + .toggle-pill::after {
		transform: translateX(12px);
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
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 2px;
		background: var(--card-2);
		cursor: pointer;
	}

	.snippet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
		font-family: 'Geist Mono', ui-monospace, monospace;
		font-size: 0.6875rem;
		color: var(--muted);
		background: var(--card-2);
	}

	.copy-btn {
		height: 22px;
		padding: 0 8px;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 4px;
		font-size: 0.6875rem;
		font-family: inherit;
		color: var(--subtle);
		cursor: pointer;
		transition: border-color 120ms, color 120ms;
	}

	.copy-btn:hover {
		border-color: var(--border-strong);
		color: var(--fg);
	}

	.snippet-code {
		margin: 0;
		padding: 12px 14px;
		font-family: 'Geist Mono', ui-monospace, monospace;
		font-size: 0.6875rem;
		line-height: 1.6;
		color: var(--subtle);
		white-space: pre;
		overflow-x: auto;
	}

	/* CTA */

	.cta {
		padding: 80px 0;
		text-align: center;
		border: 1px solid var(--border);
		border-radius: 16px;
		background: var(--card);
		margin: 16px 0 64px;
	}

	.cta h2 {
		font-size: clamp(1.75rem, 3vw, 2.25rem);
		letter-spacing: -0.03em;
		margin: 0 0 8px;
	}

	.cta p {
		color: var(--muted);
		margin: 0 0 24px;
	}

	.cta-buttons {
		display: inline-flex;
		gap: 10px;
	}

	.footer {
		border-top: 1px solid var(--border);
		background: var(--bg);
	}

	.footer-inner {
		max-width: 1200px;
		margin: 0 auto;
		padding: 56px 24px 32px;
		display: grid;
		grid-template-columns: 1.4fr repeat(4, 1fr);
		gap: 32px;
	}

	.footer-brand .brand {
		margin-bottom: 12px;
	}

	.footer-tag {
		font-size: 0.8125rem;
		color: var(--muted);
		margin: 0 0 12px;
		max-width: 240px;
		line-height: 1.5;
	}

	.footer-theme {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-family: 'Geist Mono', ui-monospace, monospace;
		font-size: 0.6875rem;
		color: var(--muted);
		margin: 0;
		padding: 4px 10px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--card);
	}

	.theme-dot {
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: linear-gradient(90deg, #fafafa 50%, #0a0a0a 50%);
		border: 1px solid var(--border-strong);
	}

	.footer-col h4 {
		font-size: 0.8125rem;
		font-weight: 600;
		margin: 0 0 12px;
		letter-spacing: -0.005em;
	}

	.footer-col a {
		display: block;
		font-size: 0.8125rem;
		color: var(--muted);
		text-decoration: none;
		padding: 4px 0;
		transition: color 120ms;
	}

	.footer-col a:hover {
		color: var(--fg);
	}

	.footer-base {
		max-width: 1200px;
		margin: 0 auto;
		padding: 20px 24px 32px;
		border-top: 1px solid var(--border);
		display: flex;
		justify-content: space-between;
		gap: 16px;
		font-size: 0.75rem;
		color: var(--muted);
	}

	.footer-base p {
		margin: 0;
	}

	@media (max-width: 1100px) {
		.physics-grid,
		.glass-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 900px) {
		.nav-links {
			display: none;
		}
		.kbd {
			display: none;
		}
		.hero {
			padding: 64px 0 24px;
		}
		.hero-demo {
			height: 320px;
		}
		.features-grid,
		.presets-grid,
		.quickstart-grid,
		.shapes-grid,
		.sticky-grid,
		.reveal-grid,
		.distort-grid {
			grid-template-columns: 1fr;
		}
		.physics-grid,
		.glass-grid {
			grid-template-columns: 1fr 1fr;
		}
		.playground-grid {
			grid-template-columns: 1fr;
		}
		.playground-canvas {
			height: 320px;
		}
		.footer-inner {
			grid-template-columns: 1fr 1fr;
		}
		.footer-base {
			flex-direction: column;
		}
	}

	@media (max-width: 560px) {
		.nav-inner {
			grid-template-columns: auto 1fr;
		}
		.title {
			font-size: 2rem;
		}
		.footer-inner {
			grid-template-columns: 1fr;
		}
		.hero-demo {
			height: 280px;
		}
		.physics-grid,
		.glass-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
