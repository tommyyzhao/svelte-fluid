<script lang="ts">
	import {
		Aurora,
		Fluid,
		FluidBackground,
		FluidDistortion,
		FluidReveal,
		FluidStick,
		FrozenSwirl,
		InkInWater,
		LavaLamp,
		Plasma,
		ToroidalTempest,
		type RGB
	} from '$lib/index.js';
	import { base } from '$app/paths';

	const paperColor: RGB = { r: 244, g: 237, b: 224 };
	const cardColor: RGB = { r: 235, g: 227, b: 210 };

	const installCmd = 'npm install svelte-fluid';
	let copied = $state(false);

	async function copyInstall() {
		try {
			await navigator.clipboard.writeText(installCmd);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {}
	}

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

	// Card dimensions used by the engine's glass shader (normalized UV).
	// Tuned to read as ~14px corners at typical card heights of 240–320px.
	const cardCorner = 0.07;
	const cardHalfW = 0.5;
	const cardHalfH = 0.5;

	// ---- Comprehensive playground state ----
	type Mode = 'fluid' | 'reveal' | 'sticky' | 'distortion';

	let mode = $state<Mode>('fluid');

	let curl = $state(30);
	let splatRadius = $state(0.25);
	let splatForce = $state(6000);
	let densityDissipation = $state(1.0);
	let velocityDissipation = $state(0.2);
	let pressure = $state(0.8);

	let bloom = $state(true);
	let shading = $state(true);
	let sunrays = $state(true);
	let colorful = $state(true);
	let splatOnHover = $state(false);
	let transparent = $state(false);

	let backColor = $state<RGB>({ ...paperColor });

	let containerType = $state<'none' | 'circle' | 'roundedRect' | 'frame' | 'annulus'>('none');
	let glass = $state(false);

	// Reveal-only
	let revealSensitivity = $state(0.18);
	let revealAutoReveal = $state(false);
	let revealAutoRevealSpeed = $state(0.8);
	let revealFadeBack = $state(true);

	// Sticky-only
	let stickyText = $state('FLUID');
	let stickyAutoAnimateOn = $state(true);

	// Distortion-only
	let distortionStrength = $state(0.35);
	let distortionIntensity = $state(24);

	let activePreset = $state<string | null>(null);
	let copiedSnippet = $state(false);
	let stickyKey = $state(0);
	let distortKey = $state(0);
	let revealKey = $state(0);

	type Preset = {
		mode: Mode;
		curl?: number;
		splatRadius?: number;
		splatForce?: number;
		densityDissipation?: number;
		velocityDissipation?: number;
		bloom?: boolean;
		shading?: boolean;
		sunrays?: boolean;
		colorful?: boolean;
		splatOnHover?: boolean;
		transparent?: boolean;
		backColor?: RGB;
		containerType?: 'none' | 'circle' | 'roundedRect' | 'frame' | 'annulus';
		glass?: boolean;
		stickyText?: string;
		distortionStrength?: number;
		distortionIntensity?: number;
		revealAutoReveal?: boolean;
		revealFadeBack?: boolean;
	};

	const PRESETS: Record<string, Preset> = {
		Default: {
			mode: 'fluid',
			curl: 30,
			splatRadius: 0.25,
			splatForce: 6000,
			densityDissipation: 1.0,
			velocityDissipation: 0.2,
			bloom: true,
			shading: true,
			sunrays: true,
			colorful: true,
			splatOnHover: true,
			backColor: paperColor,
			containerType: 'none',
			glass: false
		},
		'Flat + Soft': {
			mode: 'fluid',
			curl: 5,
			densityDissipation: 0.4,
			bloom: false,
			shading: true,
			sunrays: false,
			splatOnHover: true,
			backColor: paperColor,
			containerType: 'none',
			glass: false
		},
		'Bold Splats': {
			mode: 'fluid',
			splatRadius: 0.8,
			splatForce: 9000,
			shading: false,
			bloom: true,
			sunrays: false,
			splatOnHover: true,
			backColor: paperColor,
			containerType: 'none',
			glass: false
		},
		Glass: {
			mode: 'fluid',
			curl: 28,
			splatRadius: 0.32,
			splatForce: 4500,
			densityDissipation: 0.35,
			velocityDissipation: 0.1,
			bloom: true,
			shading: true,
			sunrays: false,
			colorful: true,
			splatOnHover: true,
			backColor: paperColor,
			containerType: 'roundedRect',
			glass: true
		},
		Reveal: {
			mode: 'reveal',
			curl: 0,
			velocityDissipation: 0.95,
			splatRadius: 0.2,
			bloom: false,
			shading: false,
			sunrays: false,
			colorful: true,
			splatOnHover: false,
			backColor: paperColor,
			containerType: 'none',
			glass: false,
			revealAutoReveal: false,
			revealFadeBack: true
		},
		Sticky: {
			mode: 'sticky',
			curl: 20,
			splatRadius: 1.0,
			densityDissipation: 0.98,
			velocityDissipation: 0.2,
			bloom: false,
			shading: true,
			sunrays: false,
			colorful: true,
			splatOnHover: true,
			backColor: paperColor,
			containerType: 'none',
			glass: false,
			stickyText: 'FLUID'
		},
		Distortion: {
			mode: 'distortion',
			curl: 0,
			velocityDissipation: 0.97,
			splatRadius: 1.0,
			bloom: false,
			shading: false,
			sunrays: false,
			colorful: false,
			splatOnHover: false,
			backColor: paperColor,
			containerType: 'none',
			glass: false,
			distortionStrength: 0.4,
			distortionIntensity: 24
		}
	};

	const presetNames = Object.keys(PRESETS);

	function applyPreset(name: string) {
		const p = PRESETS[name];
		if (!p) return;
		mode = p.mode;
		if (p.curl !== undefined) curl = p.curl;
		if (p.splatRadius !== undefined) splatRadius = p.splatRadius;
		if (p.splatForce !== undefined) splatForce = p.splatForce;
		if (p.densityDissipation !== undefined) densityDissipation = p.densityDissipation;
		if (p.velocityDissipation !== undefined) velocityDissipation = p.velocityDissipation;
		if (p.bloom !== undefined) bloom = p.bloom;
		if (p.shading !== undefined) shading = p.shading;
		if (p.sunrays !== undefined) sunrays = p.sunrays;
		if (p.colorful !== undefined) colorful = p.colorful;
		if (p.splatOnHover !== undefined) splatOnHover = p.splatOnHover;
		if (p.transparent !== undefined) transparent = p.transparent;
		if (p.backColor !== undefined) backColor = { ...p.backColor };
		if (p.containerType !== undefined) containerType = p.containerType;
		if (p.glass !== undefined) glass = p.glass;
		if (p.stickyText !== undefined) stickyText = p.stickyText;
		if (p.distortionStrength !== undefined) distortionStrength = p.distortionStrength;
		if (p.distortionIntensity !== undefined) distortionIntensity = p.distortionIntensity;
		if (p.revealAutoReveal !== undefined) revealAutoReveal = p.revealAutoReveal;
		if (p.revealFadeBack !== undefined) revealFadeBack = p.revealFadeBack;
		activePreset = name;
		if (mode === 'sticky') stickyKey++;
		if (mode === 'distortion') distortKey++;
		if (mode === 'reveal') revealKey++;
	}

	function resetPlayground() {
		applyPreset('Default');
		activePreset = null;
	}

	function markCustom() {
		activePreset = null;
	}

	function rgbToHex(c: RGB) {
		const h = (n: number) =>
			Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
		return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
	}
	function hexToRgb(hex: string): RGB {
		const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		if (!m) return { r: 0, g: 0, b: 0 };
		return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
	}
	const backColorHex = $derived(rgbToHex(backColor));
	function onBackColorInput(e: Event) {
		backColor = hexToRgb((e.target as HTMLInputElement).value);
		markCustom();
	}

	const containerShape = $derived.by(() => {
		if (containerType === 'circle') return { type: 'circle' as const, cx: 0.5, cy: 0.5, radius: 0.45 };
		if (containerType === 'roundedRect')
			return {
				type: 'roundedRect' as const,
				cx: 0.5,
				cy: 0.5,
				halfW: cardHalfW,
				halfH: cardHalfH,
				cornerRadius: 0.06
			};
		if (containerType === 'frame')
			return {
				type: 'frame' as const,
				cx: 0.5,
				cy: 0.5,
				halfW: 0.22,
				halfH: 0.22,
				outerHalfW: 0.48,
				outerHalfH: 0.48,
				innerCornerRadius: 0.04,
				outerCornerRadius: 0.06
			};
		if (containerType === 'annulus')
			return { type: 'annulus' as const, cx: 0.5, cy: 0.5, innerRadius: 0.16, outerRadius: 0.42 };
		return null;
	});

	// Glass requires a shape — flip on roundedRect when user turns glass on with no shape.
	$effect(() => {
		if (glass && containerType === 'none') containerType = 'roundedRect';
	});

	const playgroundSnippet = $derived.by(() => {
		const lines: string[] = [];
		const tag =
			mode === 'reveal'
				? 'FluidReveal'
				: mode === 'sticky'
					? 'FluidStick'
					: mode === 'distortion'
						? 'FluidDistortion'
						: 'Fluid';
		if (curl !== 30) lines.push(`\tcurl={${curl}}`);
		if (splatRadius !== 0.25) lines.push(`\tsplatRadius={${splatRadius}}`);
		if (splatForce !== 6000) lines.push(`\tsplatForce={${splatForce}}`);
		if (densityDissipation !== 1.0) lines.push(`\tdensityDissipation={${densityDissipation}}`);
		if (velocityDissipation !== 0.2) lines.push(`\tvelocityDissipation={${velocityDissipation}}`);
		if (!bloom) lines.push(`\tbloom={false}`);
		if (!shading) lines.push(`\tshading={false}`);
		if (!sunrays) lines.push(`\tsunrays={false}`);
		if (!colorful) lines.push(`\tcolorful={false}`);
		if (splatOnHover) lines.push(`\tsplatOnHover`);
		if (transparent) lines.push(`\ttransparent`);
		const d = paperColor;
		if (backColor.r !== d.r || backColor.g !== d.g || backColor.b !== d.b)
			lines.push(`\tbackColor={{ r: ${backColor.r}, g: ${backColor.g}, b: ${backColor.b} }}`);
		if (containerType !== 'none' && containerShape) {
			const cs = containerShape;
			lines.push(`\tcontainerShape={${JSON.stringify(cs).replace(/"([^"]+)":/g, '$1: ')}}`);
		}
		if (glass) lines.push(`\tglass`);
		if (mode === 'sticky') lines.push(`\ttext="${stickyText}"`);
		if (mode === 'distortion') {
			lines.push(`\tsrc="${base}/bosch-garden.jpg"`);
			lines.push(`\tstrength={${distortionStrength}}`);
			lines.push(`\tintensity={${distortionIntensity}}`);
		}
		if (mode === 'reveal') {
			if (revealAutoReveal) lines.push(`\tautoReveal`);
			if (!revealFadeBack) lines.push(`\tfadeBack={false}`);
		}
		if (lines.length === 0) return `<${tag} />`;
		return `<${tag}\n${lines.join('\n')}\n/>`;
	});

	async function copySnippet() {
		try {
			await navigator.clipboard.writeText(playgroundSnippet);
			copiedSnippet = true;
			setTimeout(() => (copiedSnippet = false), 1200);
		} catch {}
	}

	function setMode(m: Mode) {
		if (m === mode) return;
		mode = m;
		activePreset = null;
		if (m === 'sticky') stickyKey++;
		if (m === 'distortion') distortKey++;
		if (m === 'reveal') revealKey++;
	}
</script>

<svelte:head>
	<title>svelte-fluid — fluid simulation for Svelte 5</title>
</svelte:head>

<a class="competition-back" href="{base}/design-competition">← Competition</a>

<FluidBackground
	exclude=".card, .panel, .nav, .install, .footer"
	excludeRadius={20}
	excludePad={6}
	colorful={false}
	shading
	bloom
	bloomIntensity={0.3}
	sunrays={false}
	autoSplatRate={stickyAutoAnimate ? 0.18 : 0}
	autoSplatCount={2}
	autoSplatSwirl={0.5}
	velocityDissipation={0.18}
	densityDissipation={0.7}
	splatRadius={0.4}
	backColor={paperColor}
	seed={777}
>
	<main class="page">
		<nav class="nav" aria-label="Primary">
			<a class="brand" href="{base}/">
				<span class="brand-mark" aria-hidden="true"></span>
				<span class="brand-name">svelte-fluid</span>
			</a>
			<div class="nav-links">
				<a href="{base}/docs">Docs</a>
				<a href="{base}/docs/presets">Presets</a>
				<a href="{base}/docs/api">API</a>
				<a href="https://github.com/tommyyzhao/svelte-fluid" target="_blank" rel="noopener">GitHub</a>
			</div>
		</nav>

		<section class="hero">
			<h1 class="display">
				WebGL fluid simulation,<br />
				as a Svelte&nbsp;5 component.
			</h1>
			<p class="lede">
				Multi-instance, resize-stable, deterministic seeding. Drop one tag into any sized
				container and ship a fluid hero, background, or interactive surface.
			</p>
			<div class="cta-row">
				<a class="btn btn-primary" href="{base}/docs">Get started</a>
				<a
					class="btn"
					href="https://github.com/tommyyzhao/svelte-fluid"
					target="_blank"
					rel="noopener"
				>
					GitHub
				</a>
			</div>
		</section>

		<section class="install" aria-label="Install">
			<code class="install-cmd">
				<span class="prompt">$</span>
				{installCmd}
			</code>
			<button class="copy-btn" type="button" onclick={copyInstall} aria-label="Copy install command">
				{copied ? 'Copied' : 'Copy'}
			</button>
		</section>

		<!-- PRESETS -->
		<section class="section">
			<header class="section-head">
				<h2>Presets</h2>
				<p>Six drop-in wrappers. Each fills its parent. Each accepts a seed.</p>
			</header>
			<div class="grid grid-3">
				<figure class="card preset-card">
					<div class="card-fluid">
						<LavaLamp seed={11} lazy backColor={cardColor} aria-label="LavaLamp preset" />
					</div>
					<figcaption>
						<span class="card-name">LavaLamp</span>
						<span class="card-blurb">Slow warm blobs.</span>
					</figcaption>
				</figure>
				<figure class="card preset-card">
					<div class="card-fluid">
						<Plasma seed={22} lazy backColor={cardColor} aria-label="Plasma preset" />
					</div>
					<figcaption>
						<span class="card-name">Plasma</span>
						<span class="card-blurb">High-energy chromatic turbulence.</span>
					</figcaption>
				</figure>
				<figure class="card preset-card">
					<div class="card-fluid">
						<InkInWater seed={33} lazy backColor={cardColor} aria-label="InkInWater preset" />
					</div>
					<figcaption>
						<span class="card-name">InkInWater</span>
						<span class="card-blurb">Saturated dye dispersing.</span>
					</figcaption>
				</figure>
				<figure class="card preset-card">
					<div class="card-fluid">
						<FrozenSwirl seed={44} lazy backColor={cardColor} aria-label="FrozenSwirl preset" />
					</div>
					<figcaption>
						<span class="card-name">FrozenSwirl</span>
						<span class="card-blurb">Crystalline vortex.</span>
					</figcaption>
				</figure>
				<figure class="card preset-card">
					<div class="card-fluid">
						<Aurora seed={55} lazy backColor={cardColor} aria-label="Aurora preset" />
					</div>
					<figcaption>
						<span class="card-name">Aurora</span>
						<span class="card-blurb">Drifting polar ribbons.</span>
					</figcaption>
				</figure>
				<figure class="card preset-card">
					<div class="card-fluid">
						<ToroidalTempest seed={66} lazy backColor={cardColor} aria-label="ToroidalTempest preset" />
					</div>
					<figcaption>
						<span class="card-name">ToroidalTempest</span>
						<span class="card-blurb">Annular storm.</span>
					</figcaption>
				</figure>
			</div>
		</section>

		<!-- SHAPES -->
		<section class="section">
			<header class="section-head">
				<h2>Shapes</h2>
				<p>Six container primitives. Each card uses the engine's glass shader at its edge.</p>
			</header>
			<div class="grid grid-3">
				<figure class="card shape-card">
					<div class="card-fluid">
						<Fluid
							seed={601}
							lazy
							glass
							glassRefraction={0.45}
							glassReflectivity={0.12}
							glassChromatic={0.25}
							glassThickness={0.05}
							containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.42 }}
							backColor={cardColor}
							curl={28}
							densityDissipation={0.35}
							velocityDissipation={0.1}
							splatRadius={0.32}
							splatForce={4500}
							shading
							bloom
							bloomIntensity={0.5}
							sunrays={false}
							colorful
							initialSplatCount={10}
							splatOnHover
							aria-label="Circle container demo"
						/>
					</div>
					<figcaption>
						<span class="card-name">Circle</span>
					</figcaption>
				</figure>
				<figure class="card shape-card">
					<div class="card-fluid">
						<Fluid
							seed={602}
							lazy
							glass
							glassRefraction={0.45}
							glassReflectivity={0.12}
							glassChromatic={0.25}
							glassThickness={0.05}
							containerShape={{
								type: 'roundedRect',
								cx: 0.5,
								cy: 0.5,
								halfW: cardHalfW,
								halfH: cardHalfH,
								cornerRadius: cardCorner
							}}
							backColor={cardColor}
							curl={28}
							densityDissipation={0.35}
							velocityDissipation={0.1}
							splatRadius={0.32}
							splatForce={4500}
							shading
							bloom
							bloomIntensity={0.5}
							sunrays={false}
							colorful
							initialSplatCount={10}
							splatOnHover
							aria-label="Rounded rect container demo"
						/>
					</div>
					<figcaption>
						<span class="card-name">Rounded Rect</span>
					</figcaption>
				</figure>
				<figure class="card shape-card">
					<div class="card-fluid">
						<Fluid
							seed={603}
							lazy
							glass
							glassRefraction={0.45}
							glassReflectivity={0.12}
							glassChromatic={0.25}
							glassThickness={0.05}
							containerShape={{
								type: 'frame',
								cx: 0.5,
								cy: 0.5,
								halfW: 0.22,
								halfH: 0.22,
								innerCornerRadius: 0.04,
								outerHalfW: 0.48,
								outerHalfH: 0.48,
								outerCornerRadius: 0.06
							}}
							backColor={cardColor}
							curl={28}
							densityDissipation={0.3}
							velocityDissipation={0.1}
							splatRadius={0.3}
							splatForce={4500}
							shading
							bloom
							bloomIntensity={0.5}
							sunrays={false}
							colorful
							initialSplatCount={10}
							splatOnHover
							aria-label="Frame container demo"
						/>
					</div>
					<figcaption>
						<span class="card-name">Frame</span>
					</figcaption>
				</figure>
				<figure class="card shape-card">
					<div class="card-fluid">
						<Fluid
							seed={604}
							lazy
							glass
							glassRefraction={0.45}
							glassReflectivity={0.12}
							glassChromatic={0.3}
							glassThickness={0.05}
							containerShape={{
								type: 'annulus',
								cx: 0.5,
								cy: 0.5,
								innerRadius: 0.16,
								outerRadius: 0.42
							}}
							backColor={cardColor}
							curl={32}
							densityDissipation={0.3}
							velocityDissipation={0.1}
							splatRadius={0.3}
							splatForce={4500}
							shading
							bloom
							bloomIntensity={0.55}
							sunrays={false}
							colorful
							initialSplatCount={10}
							splatOnHover
							aria-label="Annulus container demo"
						/>
					</div>
					<figcaption>
						<span class="card-name">Annulus</span>
					</figcaption>
				</figure>
				<figure class="card shape-card">
					<div class="card-fluid">
						<Fluid
							seed={605}
							lazy
							glass
							glassRefraction={0.45}
							glassReflectivity={0.1}
							glassChromatic={0.35}
							glassThickness={0.05}
							containerShape={{ type: 'svgPath', d: lightning, viewBox: [0, 0, 100, 100] }}
							backColor={cardColor}
							curl={32}
							densityDissipation={0.3}
							velocityDissipation={0.1}
							splatRadius={0.3}
							splatForce={4500}
							shading
							bloom
							bloomIntensity={0.55}
							sunrays={false}
							colorful
							initialSplatCount={10}
							splatOnHover
							aria-label="SVG path lightning container demo"
						/>
					</div>
					<figcaption>
						<span class="card-name">SVG Path</span>
					</figcaption>
				</figure>
				<figure class="card shape-card">
					<div class="card-fluid">
						<Fluid
							seed={606}
							lazy
							glass
							glassRefraction={0.45}
							glassReflectivity={0.1}
							glassChromatic={0.35}
							glassThickness={0.05}
							containerShape={{ type: 'svgPath', text: '&', font: '900 280px Geist, Inter, sans-serif' }}
							backColor={cardColor}
							curl={28}
							densityDissipation={0.3}
							velocityDissipation={0.1}
							splatRadius={0.32}
							splatForce={4500}
							shading
							bloom
							bloomIntensity={0.55}
							sunrays={false}
							colorful
							initialSplatCount={10}
							splatOnHover
							aria-label="Text glyph container demo"
						/>
					</div>
					<figcaption>
						<span class="card-name">Text Glyph</span>
					</figcaption>
				</figure>
			</div>
		</section>

		<!-- GLASS -->
		<section class="section">
			<header class="section-head">
				<h2>Glass</h2>
				<p>Refraction, reflectivity, and chromatic fringe. The shader does the work.</p>
			</header>
			<div class="grid grid-2">
				<figure class="card glass-card">
					<div class="card-fluid">
						<Fluid
							seed={1111}
							lazy
							glass
							glassRefraction={0.85}
							glassReflectivity={0.18}
							glassChromatic={0.6}
							glassThickness={0.1}
							containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.42 }}
							backColor={cardColor}
							curl={32}
							densityDissipation={0.18}
							velocityDissipation={0.06}
							splatRadius={0.35}
							splatForce={4500}
							shading
							bloom
							bloomIntensity={0.4}
							sunrays={false}
							colorful
							initialSplatCount={12}
							autoSplatRate={stickyAutoAnimate ? 1.0 : 0}
							autoSplatCenterY={0.5}
							autoSplatBandHeight={0.8}
							autoSplatSwirl={500}
							splatOnHover
							aria-label="Crystal orb glass demo"
						/>
					</div>
					<figcaption>
						<span class="card-name">Crystal orb</span>
						<span class="card-blurb">High refraction, vivid chroma.</span>
					</figcaption>
				</figure>
				<figure class="card glass-card">
					<div class="card-fluid">
						<Fluid
							seed={1212}
							lazy
							glass
							glassRefraction={0.3}
							glassReflectivity={0.08}
							glassChromatic={0.12}
							glassThickness={0.04}
							containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.42 }}
							backColor={cardColor}
							curl={28}
							densityDissipation={0.4}
							velocityDissipation={0.12}
							splatRadius={0.25}
							splatForce={4500}
							shading
							bloom
							bloomIntensity={0.4}
							sunrays
							sunraysWeight={0.4}
							colorful
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
					<figcaption>
						<span class="card-name">Soft lens</span>
						<span class="card-blurb">Low refraction, gentle chroma.</span>
					</figcaption>
				</figure>
				<figure class="card glass-card">
					<div class="card-fluid">
						<Fluid
							seed={1313}
							lazy
							glass
							glassRefraction={0.7}
							glassReflectivity={0.18}
							glassChromatic={0.7}
							glassThickness={0.06}
							containerShape={{
								type: 'annulus',
								cx: 0.5,
								cy: 0.5,
								innerRadius: 0.18,
								outerRadius: 0.42
							}}
							backColor={cardColor}
							curl={36}
							densityDissipation={0.25}
							velocityDissipation={0.1}
							splatRadius={0.3}
							splatForce={4500}
							shading
							bloom
							bloomIntensity={0.45}
							sunrays={false}
							colorful
							initialSplatCount={10}
							autoSplatRate={stickyAutoAnimate ? 1.2 : 0}
							autoSplatCenterY={0.5}
							autoSplatBandHeight={0.6}
							autoSplatSwirl={400}
							splatOnHover
							aria-label="Portal ring glass demo"
						/>
					</div>
					<figcaption>
						<span class="card-name">Portal ring</span>
						<span class="card-blurb">Annular shape, prismatic edges.</span>
					</figcaption>
				</figure>
				<figure class="card glass-card">
					<div class="card-fluid">
						<Fluid
							seed={1414}
							lazy
							glass
							glassRefraction={0.6}
							glassReflectivity={0.2}
							glassChromatic={0.5}
							glassThickness={0.07}
							containerShape={{
								type: 'frame',
								cx: 0.5,
								cy: 0.5,
								halfW: 0.22,
								halfH: 0.22,
								innerCornerRadius: 0.04,
								outerHalfW: 0.48,
								outerHalfH: 0.48,
								outerCornerRadius: 0.05
							}}
							backColor={cardColor}
							curl={24}
							densityDissipation={0.22}
							velocityDissipation={0.1}
							splatRadius={0.32}
							splatForce={4500}
							shading
							bloom
							bloomIntensity={0.55}
							sunrays={false}
							colorful
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
					<figcaption>
						<span class="card-name">Glass frame</span>
						<span class="card-blurb">Frame shape, framed.</span>
					</figcaption>
				</figure>
			</div>
		</section>

		<!-- STICKY -->
		<section class="section">
			<header class="section-head">
				<h2>Sticky</h2>
				<p>Dye clings to text or SVG paths.</p>
			</header>
			<div class="grid grid-2">
				<div class="card sticky-card">
					<div class="card-fluid">
						<FluidStick
							text="FLUID"
							font="900 110px Geist, Inter, sans-serif"
							seed={211}
							autoAnimate={stickyAutoAnimate}
							autoAnimateDuration={4}
							colorful
							shading
							bloom={false}
							densityDissipation={0.92}
							splatRadius={0.18}
							backColor={cardColor}
							lazy
						/>
					</div>
				</div>
				<div class="card sticky-card">
					<div class="card-fluid">
						<FluidStick
							text="∞"
							font="220px Georgia, serif"
							seed={222}
							autoAnimate={stickyAutoAnimate}
							autoAnimateDuration={4}
							colorful
							shading
							bloom={false}
							densityDissipation={0.92}
							splatRadius={0.18}
							backColor={cardColor}
							lazy
						/>
					</div>
				</div>
			</div>
		</section>

		<!-- REVEAL -->
		<section class="section">
			<header class="section-head">
				<h2>Reveal</h2>
				<p>The simulation as an opacity mask. Move the cursor to uncover.</p>
			</header>
			<div class="grid grid-2">
				<div class="card reveal-card">
					<div class="card-fluid">
						<FluidReveal
							lazy
							velocityDissipation={0.95}
							pressureIterations={10}
							coverColor={{ r: 0.92, g: 0.89, b: 0.82 }}
							fringeColor={{ r: 0.85, g: 0.78, b: 0.62 }}
							accentColor={{ r: 0.65, g: 0.4, b: 0.2 }}
						>
							<div class="reveal-content">Revealed</div>
						</FluidReveal>
					</div>
					<div class="card-caption-row">
						<span class="card-name">Scratch to reveal</span>
					</div>
				</div>
				<div class="card reveal-card">
					<div class="card-fluid">
						<FluidReveal
							lazy
							autoReveal={stickyAutoAnimate}
							autoRevealSpeed={0.8}
							fadeBack={false}
							velocityDissipation={0.95}
							sensitivity={0.15}
							coverColor={{ r: 0.92, g: 0.89, b: 0.82 }}
							fringeColor={{ r: 0.85, g: 0.78, b: 0.62 }}
							accentColor={{ r: 0.65, g: 0.4, b: 0.2 }}
						>
							<div class="reveal-content">Auto reveal</div>
						</FluidReveal>
					</div>
					<div class="card-caption-row">
						<span class="card-name">Auto-reveal</span>
					</div>
				</div>
			</div>
		</section>

		<!-- DISTORTION -->
		<section class="section">
			<header class="section-head">
				<h2>Distortion</h2>
				<p>An image, warped by the velocity field.</p>
			</header>
			<div class="grid grid-2">
				<div class="card distort-card">
					<div class="card-fluid">
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
					<div class="card-caption-row">
						<span class="card-name">Subtle</span>
						<code class="card-code">strength=&#123;0.3&#125;</code>
					</div>
				</div>
				<div class="card distort-card">
					<div class="card-fluid">
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
					<div class="card-caption-row">
						<span class="card-name">Strong</span>
						<code class="card-code">strength=&#123;0.45&#125;</code>
					</div>
				</div>
			</div>
		</section>

		<!-- PLAYGROUND -->
		<section class="section playground-section" id="playground">
			<header class="section-head">
				<h2>Playground</h2>
				<p>
					Switch modes. Drag the knobs. The snippet on the right is what you'd write.
				</p>
			</header>

			<div class="mode-tabs" role="tablist" aria-label="Playground mode">
				{#each (['fluid', 'reveal', 'sticky', 'distortion'] as Mode[]) as m (m)}
					<button
						type="button"
						class="mode-tab"
						class:active={mode === m}
						aria-selected={mode === m}
						role="tab"
						onclick={() => setMode(m)}
					>
						{m === 'fluid'
							? '<Fluid>'
							: m === 'reveal'
								? '<FluidReveal>'
								: m === 'sticky'
									? '<FluidStick>'
									: '<FluidDistortion>'}
					</button>
				{/each}
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
				<button type="button" class="preset-chip reset" onclick={resetPlayground}>Reset</button>
			</div>

			<div class="playground-grid">
				<div class="card playground-stage" aria-label="Interactive playground stage">
					<div class="card-fluid playground-canvas">
						{#if mode === 'reveal'}
							{#key revealKey}
								<FluidReveal
									lazy
									sensitivity={revealSensitivity}
									autoReveal={revealAutoReveal && stickyAutoAnimate}
									autoRevealSpeed={revealAutoRevealSpeed}
									fadeBack={revealFadeBack}
									{curl}
									{splatRadius}
									{splatForce}
									{densityDissipation}
									{velocityDissipation}
									{pressure}
									{bloom}
									{shading}
									{sunrays}
									{colorful}
									{splatOnHover}
									{transparent}
									{backColor}
									coverColor={{ r: 0.92, g: 0.89, b: 0.82 }}
									fringeColor={{ r: 0.85, g: 0.78, b: 0.62 }}
									accentColor={{ r: 0.65, g: 0.4, b: 0.2 }}
									containerShape={containerType !== 'none' ? containerShape : undefined}
									{glass}
								>
									<div class="reveal-content">Reveal me</div>
								</FluidReveal>
							{/key}
						{:else if mode === 'sticky'}
							{#key stickyKey}
								<FluidStick
									lazy
									seed={42}
									text={stickyText}
									font="900 110px Geist, Inter, sans-serif"
									autoAnimate={stickyAutoAnimateOn && stickyAutoAnimate}
									autoAnimateDuration={4}
									{curl}
									{splatRadius}
									{splatForce}
									{densityDissipation}
									{velocityDissipation}
									{pressure}
									{bloom}
									{shading}
									{sunrays}
									{colorful}
									{splatOnHover}
									{transparent}
									{backColor}
									containerShape={containerType !== 'none' ? containerShape : undefined}
									{glass}
								/>
							{/key}
						{:else if mode === 'distortion'}
							{#key distortKey}
								<FluidDistortion
									lazy
									seed={42}
									src="{base}/bosch-garden.jpg"
									strength={distortionStrength}
									intensity={distortionIntensity}
									scale={1.0}
									fit="cover"
									initialSplats={6}
									{curl}
									{splatRadius}
									{splatForce}
									{densityDissipation}
									{velocityDissipation}
									{pressure}
									{splatOnHover}
									{transparent}
								/>
							{/key}
						{:else}
							<Fluid
								lazy
								seed={4242}
								initialSplatCount={20}
								{curl}
								{splatRadius}
								{splatForce}
								{densityDissipation}
								{velocityDissipation}
								{pressure}
								{bloom}
								{shading}
								{sunrays}
								{colorful}
								{splatOnHover}
								{transparent}
								{backColor}
								containerShape={containerType !== 'none' ? containerShape : undefined}
								{glass}
								aria-label="Interactive playground"
							/>
						{/if}
					</div>
				</div>

				<aside class="panel playground-panel" aria-label="Playground controls">
					<div class="knob-group">
						<div class="knob-group-title">Physics</div>
						<label class="knob-row">
							<span class="knob-label">curl</span>
							<input
								type="range"
								min="0"
								max="50"
								step="1"
								bind:value={curl}
								oninput={markCustom}
							/>
							<span class="knob-value">{curl}</span>
						</label>
						<label class="knob-row">
							<span class="knob-label">splatRadius</span>
							<input
								type="range"
								min="0.05"
								max="1"
								step="0.01"
								bind:value={splatRadius}
								oninput={markCustom}
							/>
							<span class="knob-value">{splatRadius.toFixed(2)}</span>
						</label>
						<label class="knob-row">
							<span class="knob-label">splatForce</span>
							<input
								type="range"
								min="1000"
								max="9000"
								step="100"
								bind:value={splatForce}
								oninput={markCustom}
							/>
							<span class="knob-value">{splatForce}</span>
						</label>
						<label class="knob-row">
							<span class="knob-label">densityDissipation</span>
							<input
								type="range"
								min="0"
								max="1"
								step="0.01"
								bind:value={densityDissipation}
								oninput={markCustom}
							/>
							<span class="knob-value">{densityDissipation.toFixed(2)}</span>
						</label>
						<label class="knob-row">
							<span class="knob-label">velocityDissipation</span>
							<input
								type="range"
								min="0"
								max="1"
								step="0.01"
								bind:value={velocityDissipation}
								oninput={markCustom}
							/>
							<span class="knob-value">{velocityDissipation.toFixed(2)}</span>
						</label>
						<label class="knob-row">
							<span class="knob-label">pressure</span>
							<input
								type="range"
								min="0"
								max="1"
								step="0.01"
								bind:value={pressure}
								oninput={markCustom}
							/>
							<span class="knob-value">{pressure.toFixed(2)}</span>
						</label>
					</div>

					<div class="knob-group">
						<div class="knob-group-title">Visuals</div>
						<label class="toggle-row">
							<input type="checkbox" bind:checked={bloom} onchange={markCustom} />
							<span class="toggle-pill" aria-hidden="true"></span>
							<span class="knob-label">bloom</span>
						</label>
						<label class="toggle-row">
							<input type="checkbox" bind:checked={shading} onchange={markCustom} />
							<span class="toggle-pill" aria-hidden="true"></span>
							<span class="knob-label">shading</span>
						</label>
						<label class="toggle-row">
							<input type="checkbox" bind:checked={sunrays} onchange={markCustom} />
							<span class="toggle-pill" aria-hidden="true"></span>
							<span class="knob-label">sunrays</span>
						</label>
						<label class="toggle-row">
							<input type="checkbox" bind:checked={colorful} onchange={markCustom} />
							<span class="toggle-pill" aria-hidden="true"></span>
							<span class="knob-label">colorful</span>
						</label>
						<label class="toggle-row">
							<input type="checkbox" bind:checked={splatOnHover} onchange={markCustom} />
							<span class="toggle-pill" aria-hidden="true"></span>
							<span class="knob-label">splatOnHover</span>
						</label>
						<label class="toggle-row">
							<input type="checkbox" bind:checked={transparent} onchange={markCustom} />
							<span class="toggle-pill" aria-hidden="true"></span>
							<span class="knob-label">transparent</span>
						</label>
					</div>

					<div class="knob-group">
						<div class="knob-group-title">Container</div>
						<label class="knob-row">
							<span class="knob-label">shape</span>
							<select bind:value={containerType} onchange={markCustom} class="select">
								<option value="none">none</option>
								<option value="circle">circle</option>
								<option value="roundedRect">roundedRect</option>
								<option value="frame">frame</option>
								<option value="annulus">annulus</option>
							</select>
						</label>
						<label class="toggle-row">
							<input type="checkbox" bind:checked={glass} onchange={markCustom} />
							<span class="toggle-pill" aria-hidden="true"></span>
							<span class="knob-label">glass</span>
						</label>
					</div>

					<div class="knob-group">
						<div class="knob-group-title">Background</div>
						<label class="color-row">
							<span class="knob-label">backColor</span>
							<input
								type="color"
								value={backColorHex}
								oninput={onBackColorInput}
								aria-label="Background color"
							/>
							<span class="knob-value mono">{backColorHex}</span>
						</label>
					</div>

					{#if mode === 'reveal'}
						<div class="knob-group">
							<div class="knob-group-title">Reveal</div>
							<label class="knob-row">
								<span class="knob-label">sensitivity</span>
								<input
									type="range"
									min="0"
									max="1"
									step="0.01"
									bind:value={revealSensitivity}
									oninput={markCustom}
								/>
								<span class="knob-value">{revealSensitivity.toFixed(2)}</span>
							</label>
							<label class="knob-row">
								<span class="knob-label">autoSpeed</span>
								<input
									type="range"
									min="0.1"
									max="3"
									step="0.05"
									bind:value={revealAutoRevealSpeed}
									oninput={markCustom}
								/>
								<span class="knob-value">{revealAutoRevealSpeed.toFixed(2)}</span>
							</label>
							<label class="toggle-row">
								<input type="checkbox" bind:checked={revealAutoReveal} onchange={() => { revealKey++; markCustom(); }} />
								<span class="toggle-pill" aria-hidden="true"></span>
								<span class="knob-label">autoReveal</span>
							</label>
							<label class="toggle-row">
								<input type="checkbox" bind:checked={revealFadeBack} onchange={() => { revealKey++; markCustom(); }} />
								<span class="toggle-pill" aria-hidden="true"></span>
								<span class="knob-label">fadeBack</span>
							</label>
						</div>
					{/if}

					{#if mode === 'sticky'}
						<div class="knob-group">
							<div class="knob-group-title">Sticky</div>
							<label class="knob-row">
								<span class="knob-label">text</span>
								<input
									type="text"
									class="text-input"
									bind:value={stickyText}
									oninput={() => { stickyKey++; markCustom(); }}
									maxlength="16"
								/>
							</label>
							<label class="toggle-row">
								<input type="checkbox" bind:checked={stickyAutoAnimateOn} onchange={markCustom} />
								<span class="toggle-pill" aria-hidden="true"></span>
								<span class="knob-label">autoAnimate</span>
							</label>
						</div>
					{/if}

					{#if mode === 'distortion'}
						<div class="knob-group">
							<div class="knob-group-title">Distortion</div>
							<label class="knob-row">
								<span class="knob-label">strength</span>
								<input
									type="range"
									min="0"
									max="0.5"
									step="0.01"
									bind:value={distortionStrength}
									oninput={() => { distortKey++; markCustom(); }}
								/>
								<span class="knob-value">{distortionStrength.toFixed(2)}</span>
							</label>
							<label class="knob-row">
								<span class="knob-label">intensity</span>
								<input
									type="range"
									min="0"
									max="60"
									step="1"
									bind:value={distortionIntensity}
									oninput={() => { distortKey++; markCustom(); }}
								/>
								<span class="knob-value">{distortionIntensity}</span>
							</label>
						</div>
					{/if}

					<div class="snippet-head">
						<span>snippet</span>
						<button class="copy-btn small" onclick={copySnippet} aria-label="Copy playground snippet">
							{copiedSnippet ? 'Copied' : 'Copy'}
						</button>
					</div>
					<pre class="snippet-code"><code>{playgroundSnippet}</code></pre>
				</aside>
			</div>
		</section>

		<footer class="footer">
			<div class="footer-row">
				<span>svelte-fluid</span>
				<span class="footer-mid">
					Derivative of
					<a
						href="https://github.com/PavelDoGreat/WebGL-Fluid-Simulation"
						target="_blank"
						rel="noopener"
					>PavelDoGreat / WebGL-Fluid-Simulation</a>
					· Pavel Dobryakov (c) 2017
				</span>
				<span>MIT · 2026</span>
			</div>
		</footer>
	</main>
</FluidBackground>

<style>
	:global(html),
	:global(body) {
		background: #f4ede0;
		color: #1a1814;
	}
	:global(body) {
		margin: 0;
		font-family: 'Geist', 'Inter', system-ui, -apple-system, sans-serif;
		-webkit-font-smoothing: antialiased;
		text-rendering: optimizeLegibility;
		font-feature-settings: 'cv11', 'ss01';
	}

	.page {
		--paper: #f4ede0;
		--card: #ebe3d2;
		--ink: #1a1814;
		--ink-soft: rgba(26, 24, 20, 0.62);
		--ink-faint: rgba(26, 24, 20, 0.16);
		--rule: rgba(26, 24, 20, 0.88);
		--accent: #8c2a1d;
		--mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
		position: relative;
		min-height: 100vh;
		padding: 28px 24px 64px;
		max-width: 1180px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 56px;
		pointer-events: none;
	}
	.page > * {
		pointer-events: auto;
	}

	.competition-back {
		position: fixed;
		top: 1rem;
		left: 1rem;
		z-index: 200;
		font-size: 0.72rem;
		font-weight: 500;
		letter-spacing: 0.06em;
		color: rgba(26, 24, 20, 0.62);
		text-decoration: none;
		background: rgba(244, 237, 224, 0.92);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid rgba(26, 24, 20, 0.85);
		border-radius: 4px;
		padding: 0.4rem 0.75rem;
		font-family: var(--mono);
		transition: color 0.15s;
	}
	.competition-back:hover {
		color: #1a1814;
	}

	/* ---- Nav ---- */
	.nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 22px;
		background: var(--card);
		border: 1px solid var(--rule);
		border-radius: 999px;
		max-width: max-content;
		align-self: center;
		gap: 32px;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		color: var(--ink);
		text-decoration: none;
		font-weight: 600;
		font-size: 14px;
		letter-spacing: -0.01em;
	}
	.brand-mark {
		width: 14px;
		height: 14px;
		border-radius: 3px;
		background: var(--ink);
	}
	.brand-name {
		font-weight: 600;
	}
	.nav-links {
		display: flex;
		gap: 4px;
	}
	.nav-links a {
		color: var(--ink-soft);
		text-decoration: none;
		font-size: 13px;
		font-weight: 500;
		padding: 6px 12px;
		border-radius: 999px;
		transition:
			color 0.15s,
			background 0.15s;
	}
	.nav-links a:hover {
		color: var(--ink);
		background: rgba(26, 24, 20, 0.05);
	}

	/* ---- Hero ---- */
	.hero {
		padding: 56px 32px 40px;
		text-align: center;
		max-width: 880px;
		margin: 0 auto;
	}
	.display {
		font-family: 'Geist', 'Inter', system-ui, sans-serif;
		font-size: clamp(40px, 6.2vw, 76px);
		font-weight: 600;
		line-height: 1.04;
		letter-spacing: -0.035em;
		margin: 0 0 24px;
		color: var(--ink);
	}
	.lede {
		font-size: clamp(16px, 1.4vw, 19px);
		line-height: 1.55;
		color: var(--ink-soft);
		max-width: 580px;
		margin: 0 auto 32px;
		font-weight: 400;
	}
	.cta-row {
		display: inline-flex;
		gap: 10px;
		flex-wrap: wrap;
		justify-content: center;
	}
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 38px;
		padding: 0 18px;
		font-size: 13.5px;
		font-weight: 500;
		border-radius: 999px;
		background: var(--card);
		border: 1px solid var(--rule);
		color: var(--ink);
		text-decoration: none;
		letter-spacing: -0.005em;
		transition:
			background 0.15s,
			color 0.15s,
			border-color 0.15s;
	}
	.btn:hover {
		background: var(--ink);
		color: var(--paper);
	}
	.btn-primary {
		background: var(--ink);
		color: var(--paper);
	}
	.btn-primary:hover {
		background: var(--accent);
		border-color: var(--accent);
	}

	/* ---- Install ---- */
	.install {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 14px 18px 14px 20px;
		background: var(--card);
		border: 1px solid var(--rule);
		border-radius: 10px;
		max-width: 640px;
		margin: 0 auto;
		width: 100%;
		box-sizing: border-box;
	}
	.install-cmd {
		font-family: var(--mono);
		font-size: 13.5px;
		color: var(--ink);
	}
	.prompt {
		color: var(--ink-soft);
		margin-right: 8px;
		user-select: none;
	}

	/* ---- Section primitives ---- */
	.section {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.section-head {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 0 4px;
	}
	.section-head h2 {
		margin: 0;
		font-size: clamp(24px, 2.6vw, 32px);
		font-weight: 600;
		letter-spacing: -0.025em;
		color: var(--ink);
		line-height: 1.1;
	}
	.section-head p {
		margin: 0;
		font-size: 14.5px;
		color: var(--ink-soft);
		max-width: 580px;
		line-height: 1.5;
	}

	/* ---- Card primitive (the "framed box") ----
	   Card bg is intentionally distinct (--card) from the page (--paper)
	   so the fluid plate reads as a printed surface — like a polaroid on
	   linen, not a tile on linoleum. Ink border + paper page gives the
	   editorial frame, the engine's glass shader handles the rounded
	   corner refraction inside.
	*/
	.card {
		position: relative;
		background: var(--card);
		border: 1px solid var(--rule);
		border-radius: 12px;
		overflow: hidden;
	}
	.card-fluid {
		position: relative;
		width: 100%;
		display: block;
		background: var(--card);
	}
	.card figcaption,
	.card-caption-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 14px;
		padding: 12px 16px 14px;
		border-top: 1px solid var(--rule);
		font-size: 13px;
	}
	.card-name {
		color: var(--ink);
		font-weight: 600;
		letter-spacing: -0.005em;
	}
	.card-blurb {
		color: var(--ink-soft);
		font-size: 12.5px;
	}
	.card-code {
		font-family: var(--mono);
		font-size: 11.5px;
		color: var(--ink-soft);
	}

	/* ---- Grids ---- */
	.grid {
		display: grid;
		gap: 18px;
	}
	.grid-3 {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.grid-2 {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	.preset-card .card-fluid,
	.glass-card .card-fluid {
		height: 300px;
	}
	.shape-card .card-fluid {
		height: 220px;
	}
	.sticky-card .card-fluid {
		height: 240px;
	}
	.reveal-card .card-fluid {
		height: 260px;
	}
	.distort-card .card-fluid {
		height: 280px;
	}

	.reveal-content {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		font-family: 'Geist', sans-serif;
		font-weight: 600;
		font-size: 1.4rem;
		color: var(--ink);
		background: var(--paper);
	}

	/* ---- Copy button (shared) ---- */
	.copy-btn {
		appearance: none;
		border: 1px solid var(--rule);
		background: var(--paper);
		color: var(--ink);
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 500;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 6px 14px;
		border-radius: 999px;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s;
	}
	.copy-btn:hover {
		background: var(--ink);
		color: var(--paper);
	}
	.copy-btn.small {
		font-size: 10px;
		padding: 4px 10px;
	}

	/* ---- Playground ---- */
	.playground-section {
		gap: 18px;
	}
	.mode-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 6px;
		background: var(--card);
		border: 1px solid var(--rule);
		border-radius: 10px;
		max-width: max-content;
	}
	.mode-tab {
		appearance: none;
		border: 0;
		background: transparent;
		color: var(--ink-soft);
		font-family: var(--mono);
		font-size: 12px;
		font-weight: 500;
		padding: 8px 14px;
		border-radius: 7px;
		cursor: pointer;
		transition: color 0.15s, background 0.15s;
	}
	.mode-tab:hover {
		color: var(--ink);
	}
	.mode-tab.active {
		background: var(--ink);
		color: var(--paper);
	}
	.preset-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.preset-chip {
		appearance: none;
		border: 1px solid var(--ink-faint);
		background: transparent;
		color: var(--ink-soft);
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 500;
		letter-spacing: 0.04em;
		padding: 6px 12px;
		border-radius: 999px;
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s,
			color 0.15s;
	}
	.preset-chip:hover {
		background: rgba(26, 24, 20, 0.05);
		color: var(--ink);
		border-color: var(--rule);
	}
	.preset-chip.active {
		background: var(--ink);
		border-color: var(--ink);
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
		grid-template-columns: 1fr 340px;
		gap: 22px;
		align-items: stretch;
	}
	.playground-stage {
		display: flex;
		flex-direction: column;
	}
	.playground-canvas {
		height: 520px;
	}
	.panel {
		background: var(--card);
		border: 1px solid var(--rule);
		border-radius: 12px;
		padding: 18px 18px 20px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.knob-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.knob-group-title {
		font-family: var(--mono);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-soft);
		padding-bottom: 6px;
		border-bottom: 1px solid var(--ink-faint);
	}
	.knob-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.knob-label {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--ink);
		min-width: 130px;
		letter-spacing: 0.01em;
	}
	.knob-row input[type='range'] {
		flex: 1;
		accent-color: var(--accent);
	}
	.knob-value {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--ink-soft);
		min-width: 38px;
		text-align: right;
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
		border-radius: 999px;
		background: transparent;
		border: 1px solid var(--rule);
		position: relative;
		transition: background 0.2s;
		flex-shrink: 0;
	}
	.toggle-pill::after {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: 12px;
		height: 12px;
		border-radius: 999px;
		background: var(--ink);
		transition:
			transform 0.2s,
			background 0.2s;
	}
	.toggle-row input:checked + .toggle-pill {
		background: var(--ink);
		border-color: var(--ink);
	}
	.toggle-row input:checked + .toggle-pill::after {
		transform: translateX(14px);
		background: var(--paper);
	}
	.select {
		appearance: none;
		background: var(--paper);
		color: var(--ink);
		border: 1px solid var(--rule);
		border-radius: 6px;
		font-family: var(--mono);
		font-size: 11px;
		padding: 4px 8px;
		cursor: pointer;
		flex: 1;
	}
	.text-input {
		flex: 1;
		appearance: none;
		background: var(--paper);
		color: var(--ink);
		border: 1px solid var(--rule);
		border-radius: 6px;
		font-family: var(--mono);
		font-size: 11.5px;
		padding: 5px 8px;
	}
	.color-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.color-row input[type='color'] {
		width: 28px;
		height: 28px;
		border: 1px solid var(--rule);
		border-radius: 4px;
		background: none;
		cursor: pointer;
		padding: 0;
	}
	.mono {
		font-family: var(--mono);
	}
	.snippet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-family: var(--mono);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-soft);
		padding-bottom: 6px;
		border-bottom: 1px solid var(--ink-faint);
	}
	.snippet-code {
		background: var(--paper);
		border: 1px solid var(--ink-faint);
		border-radius: 8px;
		padding: 12px 14px;
		margin: 0;
		font-family: var(--mono);
		font-size: 11px;
		color: var(--ink);
		overflow-x: auto;
		line-height: 1.55;
		white-space: pre;
	}

	/* ---- Footer ---- */
	.footer {
		padding: 22px 26px;
		background: var(--card);
		border: 1px solid var(--rule);
		border-radius: 10px;
	}
	.footer-row {
		display: grid;
		grid-template-columns: 1fr 2fr 1fr;
		gap: 24px;
		font-family: var(--mono);
		font-size: 11px;
		color: var(--ink-soft);
		letter-spacing: 0.04em;
	}
	.footer-mid {
		text-align: center;
	}
	.footer-mid a {
		color: var(--ink);
		text-decoration: underline;
		text-decoration-color: var(--ink-faint);
		text-underline-offset: 3px;
	}
	.footer-row > :last-child {
		text-align: right;
	}

	/* ---- Responsive ---- */
	@media (max-width: 1000px) {
		.playground-grid {
			grid-template-columns: 1fr;
		}
		.playground-canvas {
			height: 380px;
		}
	}
	@media (max-width: 860px) {
		.grid-3 {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 700px) {
		.page {
			padding: 20px 14px 40px;
			gap: 44px;
		}
		.hero {
			padding: 36px 16px 24px;
		}
		.nav {
			gap: 14px;
			padding: 10px 16px;
			align-self: stretch;
			max-width: none;
			justify-content: space-between;
			border-radius: 14px;
			flex-wrap: wrap;
		}
		.nav-links {
			gap: 0;
			flex-wrap: wrap;
		}
		.nav-links a {
			padding: 5px 8px;
			font-size: 12px;
		}
		.grid-3,
		.grid-2 {
			grid-template-columns: 1fr;
		}
		.preset-card .card-fluid,
		.glass-card .card-fluid {
			height: 260px;
		}
		.footer-row {
			grid-template-columns: 1fr;
			text-align: left;
		}
		.footer-mid,
		.footer-row > :last-child {
			text-align: left;
		}
	}
</style>
