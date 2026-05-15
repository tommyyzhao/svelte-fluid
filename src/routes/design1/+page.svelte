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
		LavaLamp,
		Plasma,
		InkInWater,
		FrozenSwirl,
		Aurora,
		ToroidalTempest
	} from '$lib/index.js';
	import { base } from '$app/paths';

	let copied = $state(false);
	const installCmd = 'npm install svelte-fluid';

	async function copyInstall() {
		try {
			await navigator.clipboard.writeText(installCmd);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {
			copied = false;
		}
	}

	const presets = [
		{ name: 'InkInWater', component: InkInWater, seed: 11 },
		{ name: 'LavaLamp', component: LavaLamp, seed: 22 },
		{ name: 'Plasma', component: Plasma, seed: 33 },
		{ name: 'Aurora', component: Aurora, seed: 44 },
		{ name: 'FrozenSwirl', component: FrozenSwirl, seed: 55 },
		{ name: 'ToroidalTempest', component: ToroidalTempest, seed: 66 }
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

	const paperColor: RGB = { r: 250, g: 248, b: 245 };

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
	<title>svelte-fluid</title>
</svelte:head>

<a class="competition-back" href="{base}/design-competition">← Competition</a>

<main class="page">
	<header class="topbar">
		<span class="brand">svelte-fluid</span>
		<nav class="links">
			<a href="https://github.com/tommyyzhao/svelte-fluid" target="_blank" rel="noreferrer"
				>GitHub</a
			>
			<a href="{base}/docs">Docs</a>
		</nav>
	</header>

	<section class="bento">
		<article class="cell hero">
			<div class="hero-fluid" aria-hidden="true">
				<FluidText
					text="FLUID"
					font='900 200px "Geist", "Inter", system-ui, sans-serif'
					seed={7}
					bloom
					sunrays
					colorful
					shading
					splatOnHover
					initialSplatCount={20}
					autoSplatRate={stickyAutoAnimate ? 6 : 0}
					autoSplatCount={4}
					autoSplatSwirl={300}
				/>
			</div>
			<h1 class="tagline">
				WebGL fluid simulation as a Svelte 5 component. Multi-instance, resize-stable,
				deterministic seeding.
			</h1>
			<div class="cta-row">
				<a class="cta primary" href="{base}/docs">Read the docs</a>
				<a
					class="cta ghost"
					href="https://github.com/tommyyzhao/svelte-fluid"
					target="_blank"
					rel="noreferrer">View on GitHub</a
				>
			</div>
		</article>

		<article class="cell install">
			<div class="cell-head">
				<span class="eyebrow">Install</span>
				<button class="copy" onclick={copyInstall} aria-label="Copy install command">
					{copied ? 'Copied' : 'Copy'}
				</button>
			</div>
			<pre class="code"><code>{installCmd}</code></pre>
			<div class="alt-cmds">
				<span>bun add svelte-fluid</span>
				<span>pnpm add svelte-fluid</span>
			</div>
			<div class="snippet">
				<span class="eyebrow small">Usage</span>
				<pre class="code"><code>{`<script>
  import { Fluid } from 'svelte-fluid';
<\/script>
<Fluid />`}</code></pre>
			</div>
		</article>

		<article class="cell why">
			<span class="eyebrow">Why?</span>
			<ul>
				<li>Multi-instance, isolated GL</li>
				<li>Resize-stable canvas</li>
				<li>Deterministic seeding</li>
				<li>70+ props, 10 presets</li>
				<li>Zero runtime deps</li>
				<li>MIT licensed</li>
			</ul>
		</article>

		{#each presets as p, i (p.name)}
			{@const C = p.component}
			<article class="cell preset preset-{i}">
				<div class="canvas-wrap">
					<C seed={p.seed} lazy={true} aria-label={p.name} />
				</div>
				<div class="caption">
					<span class="label">{p.name}</span>
					<a class="src" href="{base}/docs/presets">View source <span aria-hidden="true">›</span></a>
				</div>
			</article>
		{/each}
	</section>

	<!-- § shapes -->
	<section class="bento-section">
		<div class="section-header">
			<span class="section-eyebrow">§ SHAPES</span>
			<h2 class="section-title">shapes</h2>
			<p class="section-sub">Pick a boundary. The simulation stays inside it. Circles, frames, annuli, arbitrary SVG paths, and live text glyphs.</p>
		</div>
		<div class="shape-grid">
			<article class="cell shape-cell">
				<div class="canvas-wrap dark">
					<CircularFluid seed={601} lazy splatOnHover aria-label="Circle container demo" />
				</div>
				<div class="caption">
					<span class="label">circle</span>
				</div>
			</article>
			<article class="cell shape-cell">
				<div class="canvas-wrap dark">
					<Fluid
						seed={602}
						colorful
						shading
						bloom
						splatOnHover
						containerShape={{ type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.42, halfH: 0.42, cornerRadius: 0.08 }}
						backColor={paperColor}
						lazy
						aria-label="Rounded rect container demo"
					/>
				</div>
				<div class="caption">
					<span class="label">rounded rect</span>
				</div>
			</article>
			<article class="cell shape-cell">
				<div class="canvas-wrap dark">
					<FrameFluid seed={603} lazy splatOnHover aria-label="Frame container demo" />
				</div>
				<div class="caption">
					<span class="label">frame</span>
				</div>
			</article>
			<article class="cell shape-cell">
				<div class="canvas-wrap dark">
					<AnnularFluid seed={604} lazy splatOnHover aria-label="Annulus container demo" />
				</div>
				<div class="caption">
					<span class="label">annulus</span>
				</div>
			</article>
			<article class="cell shape-cell">
				<div class="canvas-wrap dark">
					<Fluid
						seed={605}
						colorful
						shading
						bloom
						splatOnHover
						containerShape={{ type: 'svgPath', d: lightning, viewBox: [0, 0, 100, 100] }}
						backColor={paperColor}
						lazy
						aria-label="SVG path container demo"
					/>
				</div>
				<div class="caption">
					<span class="label">svg path</span>
				</div>
			</article>
			<article class="cell shape-cell">
				<div class="canvas-wrap dark">
					<Fluid
						seed={606}
						colorful
						shading
						bloom
						splatOnHover
						containerShape={{ type: 'svgPath', text: '&', font: '900 280px Georgia, serif' }}
						backColor={paperColor}
						lazy
						aria-label="Text glyph container demo"
					/>
				</div>
				<div class="caption">
					<span class="label">text glyph</span>
				</div>
			</article>
		</div>
	</section>

	<!-- § physics -->
	<section class="bento-section">
		<div class="section-header">
			<span class="section-eyebrow">§ PHYSICS</span>
			<h2 class="section-title">physics</h2>
			<p class="section-sub">Every prop is optional. Drop in a tag for a finished look; reach for props when you want your own physics.</p>
		</div>
		<div class="physics-grid">
			<article class="cell physics-cell">
				<div class="canvas-wrap dark">
					<Fluid seed={1234} initialSplatCount={12} splatOnHover backColor={paperColor} lazy aria-label="Default fluid configuration" />
				</div>
				<div class="caption">
					<span class="label">default</span>
					<code class="physics-code">{'<Fluid />'}</code>
				</div>
			</article>
			<article class="cell physics-cell">
				<div class="canvas-wrap dark">
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
				<div class="caption">
					<span class="label">flat + soft</span>
					<code class="physics-code">bloom={false} curl={5}</code>
				</div>
			</article>
			<article class="cell physics-cell">
				<div class="canvas-wrap dark">
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
				<div class="caption">
					<span class="label">bold splats</span>
					<code class="physics-code">splatRadius={0.8}</code>
				</div>
			</article>
			<article class="cell physics-cell">
				<div class="canvas-wrap dark">
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
				<div class="caption">
					<span class="label">slow + transparent</span>
					<code class="physics-code">transparent</code>
				</div>
			</article>
		</div>
	</section>

	<!-- § glass -->
	<section class="bento-section">
		<div class="section-header">
			<span class="section-eyebrow">§ GLASS</span>
			<h2 class="section-title">glass</h2>
			<p class="section-sub">A thin optical layer over the container. Light bends at the rim and splits into color at thickness boundaries.</p>
		</div>
		<div class="glass-grid">
			<article class="cell glass-cell">
				<div class="canvas-wrap">
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
				<div class="caption">
					<span class="label">crystal orb</span>
				</div>
			</article>
			<article class="cell glass-cell">
				<div class="canvas-wrap">
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
				<div class="caption">
					<span class="label">soft lens</span>
				</div>
			</article>
			<article class="cell glass-cell">
				<div class="canvas-wrap">
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
				<div class="caption">
					<span class="label">portal ring</span>
				</div>
			</article>
			<article class="cell glass-cell">
				<div class="canvas-wrap">
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
				<div class="caption">
					<span class="label">glass frame</span>
				</div>
			</article>
		</div>
	</section>

	<!-- § sticky -->
	<section class="bento-section">
		<div class="section-header">
			<span class="section-eyebrow">§ STICKY</span>
			<h2 class="section-title">sticky</h2>
			<p class="section-sub">Pin the dye to a shape. Trace the cursor across the mask and the fluid follows the contour.</p>
		</div>
		<div class="sticky-grid">
			<article class="cell sticky-cell">
				<div class="canvas-wrap dark">
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
				<div class="caption">
					<span class="label">FLUID · Geist 900</span>
				</div>
			</article>
			<article class="cell sticky-cell">
				<div class="canvas-wrap dark">
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
				<div class="caption">
					<span class="label">∞ · Georgia 200</span>
				</div>
			</article>
		</div>
	</section>

	<!-- § reveal -->
	<section class="bento-section">
		<div class="section-header">
			<span class="section-eyebrow">§ REVEAL</span>
			<h2 class="section-title">reveal</h2>
			<p class="section-sub">A layer sits over a second image. Where the dye lands, the layer clears.</p>
		</div>
		<div class="reveal-grid">
			<article class="cell reveal-cell">
				<div class="canvas-wrap" style="background: #faf8f5;">
					<FluidReveal
						lazy
						velocityDissipation={0.95}
						pressureIterations={10}
					>
						<div class="reveal-content">Scratch to reveal</div>
					</FluidReveal>
				</div>
				<div class="caption dark-caption">
					<span class="label dark-label">scratch to reveal</span>
				</div>
			</article>
			<article class="cell reveal-cell">
				<div class="canvas-wrap" style="background: #faf8f5;">
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
				<div class="caption dark-caption">
					<span class="label dark-label">auto reveal</span>
				</div>
			</article>
		</div>
	</section>

	<!-- § distortion -->
	<section class="bento-section">
		<div class="section-header">
			<span class="section-eyebrow">§ DISTORTION</span>
			<h2 class="section-title">distortion</h2>
			<p class="section-sub">The velocity field bends an image in place. Stills become liquid; motion settles back to grid.</p>
		</div>
		<div class="distort-grid">
			<article class="cell distort-cell">
				<div class="canvas-wrap">
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
				<div class="caption">
					<span class="label">subtle · strength 0.3</span>
				</div>
			</article>
			<article class="cell distort-cell">
				<div class="canvas-wrap">
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
				<div class="caption">
					<span class="label">strong · strength 0.45</span>
				</div>
			</article>
		</div>
	</section>

	<!-- § playground -->
	<section class="bento-section">
		<div class="section-header">
			<span class="section-eyebrow">§ PLAYGROUND</span>
			<h2 class="section-title">playground</h2>
			<p class="section-sub">Drag the knobs. The fluid updates in real time.</p>
		</div>
		<article class="cell playground-card">
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

			<div class="playground-layout">
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
						<span class="eyebrow small">snippet</span>
						<button class="copy copy-small" onclick={copySnippet} aria-label="Copy playground snippet">
							{copiedSnippet ? 'Copied!' : 'Copy'}
						</button>
					</div>
					<pre class="code snippet-code"><code>{playgroundSnippet}</code></pre>
				</aside>
			</div>
		</article>
	</section>

	<footer class="footer">
		<span
			>Derivative work of
			<a
				href="https://github.com/PavelDoGreat/WebGL-Fluid-Simulation"
				target="_blank"
				rel="noreferrer">PavelDoGreat/WebGL-Fluid-Simulation</a
			>
			by Pavel Dobryakov (c) 2017. MIT licensed.</span
		>
	</footer>
</main>

<style>
	:global(body) {
		background: #faf8f5;
	}

	.competition-back {
		position: fixed;
		top: 1rem;
		left: 1rem;
		z-index: 200;
		font-size: 0.75rem;
		font-weight: 500;
		color: rgba(60, 50, 48, 0.65);
		text-decoration: none;
		background: rgba(251, 245, 238, 0.92);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid rgba(60, 50, 48, 0.12);
		border-radius: 8px;
		padding: 0.35rem 0.7rem;
		transition: color 0.15s;
	}

	.competition-back:hover {
		color: rgba(60, 50, 48, 0.95);
	}

	.page {
		min-height: 100vh;
		max-width: 1200px;
		margin: 0 auto;
		padding: 24px 28px 64px;
		color: #111;
		font-family:
			-apple-system,
			BlinkMacSystemFont,
			'SF Pro Display',
			'Inter',
			'Segoe UI',
			Roboto,
			sans-serif;
		font-feature-settings: 'ss01', 'cv11';
		-webkit-font-smoothing: antialiased;
	}

	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 4px 24px;
	}

	.brand {
		font-weight: 600;
		letter-spacing: -0.01em;
		font-size: 15px;
	}

	.links {
		display: flex;
		gap: 20px;
	}

	.links a {
		color: #111;
		text-decoration: none;
		font-size: 14px;
		opacity: 0.75;
		transition: opacity 120ms ease;
	}

	.links a:hover {
		opacity: 1;
	}

	.bento {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		grid-auto-rows: minmax(140px, auto);
		gap: 20px;
	}

	.cell {
		background: #fff;
		border-radius: 24px;
		border: 1px solid rgba(0, 0, 0, 0.06);
		box-shadow:
			0 1px 2px rgba(0, 0, 0, 0.04),
			0 8px 24px rgba(0, 0, 0, 0.04);
		padding: 28px;
		position: relative;
		overflow: hidden;
		transition:
			transform 220ms ease,
			box-shadow 220ms ease;
		display: flex;
		flex-direction: column;
	}

	.cell:hover {
		transform: translateY(-2px);
		box-shadow:
			0 2px 4px rgba(0, 0, 0, 0.05),
			0 18px 40px rgba(0, 0, 0, 0.08);
	}

	.hero {
		grid-column: span 4;
		grid-row: span 2;
		padding: 36px;
		justify-content: space-between;
		min-height: 380px;
	}

	.hero-fluid {
		border-radius: 16px;
		overflow: hidden;
		background: #0a0a0a;
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 200px;
	}

	.tagline {
		font-size: 22px;
		line-height: 1.35;
		letter-spacing: -0.02em;
		max-width: 36ch;
		margin: 24px 0 0;
		color: #111;
		font-weight: 500;
	}

	.cta-row {
		display: flex;
		gap: 12px;
		margin-top: 20px;
	}

	.cta {
		display: inline-flex;
		align-items: center;
		padding: 10px 18px;
		border-radius: 999px;
		font-size: 14px;
		text-decoration: none;
		font-weight: 500;
		transition:
			background 160ms ease,
			color 160ms ease,
			border-color 160ms ease;
	}

	.cta.primary {
		background: #111;
		color: #fff;
	}

	.cta.primary:hover {
		background: #000;
	}

	.cta.ghost {
		color: #111;
		border: 1px solid rgba(0, 0, 0, 0.12);
	}

	.cta.ghost:hover {
		border-color: rgba(0, 0, 0, 0.28);
	}

	.install {
		grid-column: span 2;
		grid-row: span 2;
		min-height: 380px;
	}

	.cell-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}

	.eyebrow {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #888;
		font-weight: 600;
	}

	.eyebrow.small {
		font-size: 10px;
	}

	.copy {
		font: inherit;
		font-size: 12px;
		font-weight: 500;
		padding: 6px 12px;
		border-radius: 999px;
		border: 1px solid rgba(0, 0, 0, 0.12);
		background: #fff;
		color: #111;
		cursor: pointer;
		transition:
			background 140ms ease,
			border-color 140ms ease;
	}

	.copy:hover {
		background: #f4f4f4;
		border-color: rgba(0, 0, 0, 0.25);
	}

	.copy.copy-small {
		font-size: 11px;
		padding: 4px 10px;
	}

	.code {
		margin: 0;
		padding: 14px 16px;
		background: #f6f5f1;
		border-radius: 12px;
		font-family: 'SF Mono', ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace;
		font-size: 13px;
		line-height: 1.5;
		color: #111;
		overflow-x: auto;
		white-space: pre;
	}

	.alt-cmds {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 10px;
		font-family: 'SF Mono', ui-monospace, monospace;
		font-size: 12px;
		color: #888;
	}

	.snippet {
		margin-top: 20px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex: 1;
	}

	.why {
		grid-column: span 2;
		grid-row: span 2;
		padding: 28px;
		min-height: 300px;
	}

	.why ul {
		list-style: none;
		padding: 0;
		margin: 14px 0 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.why li {
		font-size: 15px;
		letter-spacing: -0.01em;
		color: #111;
		padding-left: 18px;
		position: relative;
	}

	.why li::before {
		content: '';
		position: absolute;
		left: 0;
		top: 9px;
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: #111;
	}

	.preset {
		grid-column: span 2;
		min-height: 280px;
		padding: 0;
	}

	.preset-0 {
		grid-column: span 4;
		min-height: 320px;
	}

	.canvas-wrap {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		overflow: hidden;
	}

	.canvas-wrap.dark {
		background: #faf8f5;
	}

	.caption {
		position: absolute;
		left: 18px;
		bottom: 16px;
		right: 18px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		z-index: 2;
		color: #fff;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
	}

	.caption.dark-caption {
		color: #3a3330;
		text-shadow: none;
	}

	.label {
		font-size: 13px;
		font-weight: 600;
		letter-spacing: -0.01em;
		background: rgba(255, 255, 255, 0.92);
		color: #111;
		padding: 5px 10px;
		border-radius: 999px;
		text-shadow: none;
	}

	.label.dark-label {
		background: rgba(60, 50, 48, 0.08);
		color: #3a3330;
	}

	.src {
		font-size: 12px;
		color: #fff;
		text-decoration: none;
		background: rgba(0, 0, 0, 0.45);
		backdrop-filter: blur(6px);
		padding: 5px 10px;
		border-radius: 999px;
		transition: background 140ms ease;
	}

	.src:hover {
		background: rgba(0, 0, 0, 0.65);
	}

	.src span {
		display: inline-block;
		transform: translateY(-1px);
		margin-left: 2px;
	}

	/* section wrapper */
	.bento-section {
		margin-top: 56px;
	}

	.section-header {
		margin-bottom: 24px;
	}

	.section-eyebrow {
		font-size: 10px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #aaa;
		font-weight: 600;
		font-family: 'SF Mono', ui-monospace, monospace;
		display: block;
		margin-bottom: 6px;
	}

	.section-title {
		font-size: 32px;
		font-weight: 600;
		letter-spacing: -0.03em;
		color: #111;
		margin: 0 0 8px;
		line-height: 1.1;
	}

	.section-sub {
		font-size: 14px;
		color: #888;
		margin: 0;
		max-width: 56ch;
		line-height: 1.55;
	}

	/* shapes grid */
	.shape-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 20px;
	}

	.shape-cell {
		min-height: 260px;
		padding: 0;
	}

	/* physics grid */
	.physics-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 20px;
	}

	.physics-cell {
		min-height: 260px;
		padding: 0;
	}

	.physics-code {
		font-size: 10px;
		font-family: 'SF Mono', ui-monospace, monospace;
		background: rgba(255, 255, 255, 0.88);
		color: #333;
		padding: 3px 8px;
		border-radius: 999px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 140px;
	}

	/* glass grid */
	.glass-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 20px;
	}

	.glass-cell {
		min-height: 280px;
		padding: 0;
	}

	/* sticky grid */
	.sticky-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 20px;
	}

	.sticky-cell {
		min-height: 280px;
		padding: 0;
	}

	/* reveal grid */
	.reveal-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 20px;
	}

	.reveal-cell {
		min-height: 280px;
		padding: 0;
	}

	.reveal-content {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		font-size: 1.4rem;
		color: #3a3330;
		font-weight: 500;
		letter-spacing: -0.02em;
	}

	/* distortion grid */
	.distort-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 20px;
	}

	.distort-cell {
		min-height: 320px;
		padding: 0;
	}

	/* playground */
	.playground-card {
		padding: 28px;
		flex-direction: column;
		gap: 20px;
	}

	.preset-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.preset-chip {
		font: inherit;
		font-size: 12px;
		font-weight: 500;
		padding: 6px 14px;
		border-radius: 999px;
		border: 1px solid rgba(0, 0, 0, 0.12);
		background: #faf8f5;
		color: #555;
		cursor: pointer;
		transition:
			background 140ms ease,
			color 140ms ease,
			border-color 140ms ease;
	}

	.preset-chip:hover {
		background: #f0ece6;
		border-color: rgba(0, 0, 0, 0.2);
		color: #111;
	}

	.preset-chip.active {
		background: #111;
		color: #fff;
		border-color: #111;
	}

	.preset-chip.reset {
		color: #aaa;
	}

	.preset-chip.reset:hover {
		color: #555;
	}

	.playground-layout {
		display: grid;
		grid-template-columns: 1fr 280px;
		gap: 20px;
		min-height: 480px;
	}

	.playground-canvas {
		border-radius: 16px;
		overflow: hidden;
		background: #faf8f5;
		position: relative;
	}

	.playground-panel {
		display: flex;
		flex-direction: column;
		gap: 16px;
		overflow-y: auto;
		max-height: 480px;
	}

	.knob-group {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.knob-group-title {
		font-size: 10px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #aaa;
		font-weight: 600;
		margin-bottom: 2px;
	}

	.knob-row {
		display: grid;
		grid-template-columns: 120px 1fr 42px;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}

	.knob-label {
		font-size: 12px;
		color: #555;
		font-family: 'SF Mono', ui-monospace, monospace;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.knob-value {
		font-size: 11px;
		color: #888;
		font-family: 'SF Mono', ui-monospace, monospace;
		text-align: right;
	}

	.knob-value.mono {
		font-size: 10px;
	}

	.toggle-row {
		display: flex;
		align-items: center;
		gap: 10px;
		cursor: pointer;
	}

	.toggle-row input[type='checkbox'] {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}

	.toggle-pill {
		width: 32px;
		height: 18px;
		border-radius: 999px;
		background: #ddd;
		flex-shrink: 0;
		position: relative;
		transition: background 140ms ease;
	}

	.toggle-pill::after {
		content: '';
		position: absolute;
		left: 2px;
		top: 2px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #fff;
		transition: transform 140ms ease;
	}

	.toggle-row input:checked ~ .toggle-pill {
		background: #111;
	}

	.toggle-row input:checked ~ .toggle-pill::after {
		transform: translateX(14px);
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
		border-radius: 6px;
		border: 1px solid rgba(0, 0, 0, 0.1);
		padding: 2px;
		cursor: pointer;
		background: none;
	}

	.snippet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-top: 4px;
	}

	.snippet-code {
		font-size: 11px;
		min-height: 48px;
		white-space: pre-wrap;
		word-break: break-all;
	}

	input[type='range'] {
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 4px;
		border-radius: 2px;
		background: #e0ddd8;
		outline: none;
		cursor: pointer;
	}

	input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #111;
		cursor: pointer;
	}

	input[type='range']::-moz-range-thumb {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #111;
		cursor: pointer;
		border: none;
	}

	.footer {
		margin-top: 32px;
		text-align: center;
		font-size: 12px;
		color: #888;
		line-height: 1.6;
	}

	.footer a {
		color: #555;
	}

	@media (max-width: 960px) {
		.bento {
			grid-template-columns: repeat(2, 1fr);
		}

		.hero,
		.install,
		.why,
		.preset,
		.preset-0 {
			grid-column: span 2;
			grid-row: auto;
		}

		.shape-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.physics-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.glass-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.playground-layout {
			grid-template-columns: 1fr;
		}

		.playground-panel {
			max-height: none;
		}
	}

	@media (max-width: 720px) {
		.page {
			padding: 16px 16px 48px;
		}

		.bento {
			grid-template-columns: 1fr;
			gap: 16px;
		}

		.hero,
		.install,
		.why,
		.preset,
		.preset-0 {
			grid-column: span 1;
			min-height: 240px;
		}

		.hero {
			min-height: 320px;
			padding: 24px;
		}

		.tagline {
			font-size: 18px;
		}

		.shape-grid,
		.physics-grid,
		.glass-grid,
		.sticky-grid,
		.reveal-grid,
		.distort-grid {
			grid-template-columns: 1fr;
		}

		.section-title {
			font-size: 24px;
		}

		.playground-layout {
			grid-template-columns: 1fr;
		}
	}
</style>
