<script lang="ts">
	import {
		AnnularFluid,
		CircularFluid,
		Fluid,
		FluidBackground,
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
		ToroidalTempest,
		type RGB
	} from '$lib/index.js';
	import { base } from '$app/paths';

	const installCmds = {
		bun: 'bun add svelte-fluid',
		npm: 'npm install svelte-fluid',
		pnpm: 'pnpm add svelte-fluid'
	};

	const usageSnippet = `<script>
	import { Fluid } from 'svelte-fluid';
<\/script>

<div style="width: 100%; height: 480px;">
	<Fluid seed={42} colorful bloom sunrays />
</div>`;

	let activeTab = $state<'bun' | 'npm' | 'pnpm'>('npm');
	let copied = $state(false);
	let copiedUsage = $state(false);
	let currentSection = $state(1);

	async function copyInstall() {
		try {
			await navigator.clipboard.writeText(installCmds[activeTab]);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {}
	}

	async function copyUsage() {
		try {
			await navigator.clipboard.writeText(usageSnippet);
			copiedUsage = true;
			setTimeout(() => (copiedUsage = false), 1600);
		} catch {}
	}

	const features = [
		'multi-instance',
		'resize-stable',
		'deterministic seeding',
		'MIT',
		'zero runtime deps',
		'70+ props',
		'10 presets'
	];

	const lightning = 'M 55 5 L 25 55 L 45 55 L 35 95 L 75 40 L 55 40 L 70 5 Z';

	let sections: HTMLElement[] = $state([]);
	const totalSections = $derived(sections.filter(Boolean).length || 21);

	$effect(() => {
		if (typeof IntersectionObserver === 'undefined') return;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						const idx = sections.indexOf(entry.target as HTMLElement);
						if (idx >= 0) currentSection = idx + 1;
					}
				}
			},
			{ threshold: 0.5 }
		);
		for (const s of sections) if (s) observer.observe(s);
		return () => observer.disconnect();
	});

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

	function pad(n: number) {
		return n.toString().padStart(2, '0');
	}


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
		LavaLamp: { curl: 8, splatRadius: 0.55, splatForce: 4800, densityDissipation: 0.18, velocityDissipation: 0.08, bloom: true, shading: true, colorful: false, backColor: { r: 8, g: 4, b: 14 } },
		Plasma: { curl: 50, splatRadius: 0.22, splatForce: 7500, densityDissipation: 0.6, velocityDissipation: 0.15, bloom: true, shading: true, colorful: true, backColor: { r: 4, g: 2, b: 12 } },
		'Ink in Water': { curl: 12, splatRadius: 0.32, splatForce: 5200, densityDissipation: 0.4, velocityDissipation: 0.1, bloom: false, shading: true, colorful: false, backColor: { r: 244, g: 240, b: 232 } },
		'Frozen Swirl': { curl: 35, splatRadius: 0.28, splatForce: 5800, densityDissipation: 0.2, velocityDissipation: 0.05, bloom: true, shading: true, colorful: false, backColor: { r: 2, g: 8, b: 18 } },
		Aurora: { curl: 22, splatRadius: 0.38, splatForce: 6200, densityDissipation: 0.15, velocityDissipation: 0.08, bloom: true, shading: true, colorful: true, backColor: { r: 0, g: 4, b: 14 } },
		'Toroidal Tempest': { curl: 45, splatRadius: 0.3, splatForce: 7000, densityDissipation: 0.25, velocityDissipation: 0.1, bloom: true, shading: false, colorful: true, backColor: { r: 6, g: 2, b: 16 } }
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

	let scrollRoot: HTMLElement | undefined = $state();

	function scrollToTop() {
		scrollRoot?.scrollTo({ top: 0, behavior: 'smooth' });
	}
</script>

<svelte:head>
	<title>svelte-fluid — Editorial</title>
</svelte:head>

<a class="competition-back" href="{base}/design-competition">← Competition</a>

<div class="counter">
	<span class="cur">{pad(currentSection)}</span>
	<span class="slash">/</span>
	<span class="total">{pad(totalSections)}</span>
</div>

<main class="scroll-root" bind:this={scrollRoot}>

	<!-- 01 Hero -->
	<section class="snap hero" bind:this={sections[0]}>
		<div class="hero-bg">
			<FluidBackground colorful bloom sunrays seed={777} />
		</div>
		<div class="hero-overlay">
			<div class="kicker">Issue No. 01 — Spring 2026</div>
			<h1 class="hero-title">
				<span class="serif-prefix">svelte&mdash;</span>
				<span class="fluid-word">
					<FluidText
						text="FLUID"
						font='900 220px "Playfair Display", Georgia, serif'
						bloom
						sunrays
						colorful
						seed={2026}
					/>
				</span>
			</h1>
			<p class="hero-sub">
				WebGL fluid simulation as a Svelte 5 component. Multi-instance, resize-stable,
				deterministic seeding.
			</p>
			<div class="cta-row">
				<a class="cta cta-light" href="{base}/docs">Read the docs</a>
				<a class="cta cta-outline" href="https://github.com/tommyyzhao/svelte-fluid">GitHub</a>
			</div>
			<div class="scroll-indicator" aria-hidden="true">
				<span>scroll</span>
				<span class="arrow">&darr;</span>
			</div>
		</div>
	</section>

	<!-- 02 Editorial -->
	<section class="snap editorial cream" bind:this={sections[1]}>
		<div class="section-num">01</div>
		<div class="editorial-col">
			<div class="kicker dark">A note from the editors</div>
			<h2 class="editorial-h">The case for fluid in the browser.</h2>
			<p class="editorial-body">
				The Navier&ndash;Stokes equations were never meant for marketing pages. And yet, when
				you compile them down to a fragment shader and let them loose across a viewport,
				something happens that no static gradient or canned video loop can mimic. The image
				breathes. It responds. <em>It is alive in the only way the web can be alive.</em>
				svelte-fluid is a small, opinionated wrapper around a battle-tested simulation that
				makes this discipline available to any Svelte 5 application&mdash;without ceremony,
				without dependencies, and without losing your seed.
			</p>
		</div>
	</section>

	<!-- 03 Preset: LavaLamp -->
	<section class="snap split warm" bind:this={sections[2]}>
		<div class="split-canvas">
			<LavaLamp lazy seed={101} aria-label="LavaLamp preset" backColor={{ r: 10, g: 10, b: 10 }} />
		</div>
		<div class="split-text">
			<div class="kicker">Preset 02 &mdash; warm</div>
			<h2 class="display-h">Lava Lamp.</h2>
			<p class="split-body">
				Slow, viscous, hypnotic. A nostalgic palette of amber and crimson, tuned for hero
				panels and ambient feature sections where motion should suggest depth rather than
				demand it.
			</p>
			<a class="inline-link" href="{base}/docs/presets">View source &rarr;</a>
		</div>
	</section>

	<!-- 04 Preset: Aurora -->
	<section class="snap split navy" bind:this={sections[3]}>
		<div class="split-text light">
			<div class="kicker">Preset 03 &mdash; cold</div>
			<h2 class="display-h">Aurora.</h2>
			<p class="split-body">
				A polar palette of teal and violet, drifting in long curling sheets. The default for
				dark, technical surfaces&mdash;dashboards, splash screens, terminals that wish they
				were a little more cinematic.
			</p>
			<a class="inline-link light" href="{base}/docs/presets">View source &rarr;</a>
		</div>
		<div class="split-canvas">
			<Aurora lazy seed={202} aria-label="Aurora preset" backColor={{ r: 10, g: 10, b: 10 }} />
		</div>
	</section>

	<!-- 05 Preset: Plasma (full-bleed) -->
	<section class="snap full-bleed" bind:this={sections[4]}>
		<div class="bleed-canvas">
			<Plasma lazy seed={303} aria-label="Plasma preset" backColor={{ r: 10, g: 10, b: 10 }} />
		</div>
		<aside class="bleed-caption">
			<div class="kicker light">Preset 04 &mdash; electric</div>
			<h3 class="caption-h">Plasma.</h3>
			<p class="caption-body">
				High-frequency curl, saturated to the edge of the gamut. Best deployed sparingly, the
				way a designer might use a single fluorescent accent across an otherwise muted spread.
			</p>
			<a class="inline-link light" href="{base}/docs/presets">View source &rarr;</a>
		</aside>
	</section>

	<!-- 06 Preset: InkInWater -->
	<section class="snap split white" bind:this={sections[5]}>
		<div class="split-canvas">
			<InkInWater lazy seed={404} aria-label="InkInWater preset" backColor={{ r: 10, g: 10, b: 10 }} />
		</div>
		<div class="split-text">
			<div class="kicker dark">Preset 05 &mdash; quiet</div>
			<h2 class="display-h dark">Ink in Water.</h2>
			<p class="split-body dark">
				Indigo blooms in clear water. A study in restraint&mdash;low density dissipation,
				generous splat radius, a single color family. The closest thing in the catalogue to a
				still life.
			</p>
			<a class="inline-link dark" href="{base}/docs/presets">View source &rarr;</a>
		</div>
	</section>

	<!-- 07 Preset: FrozenSwirl -->
	<section class="snap split deep-blue" bind:this={sections[6]}>
		<div class="split-text light">
			<div class="kicker">Preset 06 &mdash; frozen</div>
			<h2 class="display-h">Frozen Swirl.</h2>
			<p class="split-body">
				Crystalline curl at the edge of stillness. A winter palette of icy blue and deep
				indigo, held in slow suspension&mdash;the simulation at its most meditative.
			</p>
			<a class="inline-link light" href="{base}/docs/presets">View source &rarr;</a>
		</div>
		<div class="split-canvas">
			<FrozenSwirl lazy seed={505} aria-label="FrozenSwirl preset" backColor={{ r: 10, g: 10, b: 10 }} />
		</div>
	</section>

	<!-- 08 Preset: ToroidalTempest (full-bleed) -->
	<section class="snap full-bleed" bind:this={sections[7]}>
		<div class="bleed-canvas">
			<ToroidalTempest lazy seed={606} aria-label="ToroidalTempest preset" backColor={{ r: 10, g: 10, b: 10 }} />
		</div>
		<aside class="bleed-caption">
			<div class="kicker light">Preset 07 &mdash; tempest</div>
			<h3 class="caption-h">Toroidal Tempest.</h3>
			<p class="caption-body">
				Maximum curl in a toroidal topology&mdash;fluid wraps edge to edge in an endless
				storm. The preset for when restraint is not an option.
			</p>
			<a class="inline-link light" href="{base}/docs/presets">View source &rarr;</a>
		</aside>
	</section>

	<!-- 09 Shapes -->
	<section class="snap shapes-section" bind:this={sections[8]}>
		<div class="section-inner">
			<div class="kicker light">04 &mdash; Shapes</div>
			<h2 class="display-h center-h">Confine fluid to <em>any shape</em>.</h2>
			<p class="section-sub">Six primitives — circle, rounded rect, frame, annulus, SVG path, and text glyph.</p>
			<div class="shape-grid">
				<figure class="shape-cell">
					<div class="shape-canvas">
						<CircularFluid seed={601} lazy splatOnHover aria-label="Circle container demo" backColor={{ r: 10, g: 10, b: 10 }} />
					</div>
					<figcaption>CIRCLE</figcaption>
				</figure>
				<figure class="shape-cell">
					<div class="shape-canvas">
						<Fluid
							seed={602}
							colorful
							shading
							bloom
							splatOnHover
							containerShape={{ type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.42, halfH: 0.42, cornerRadius: 0.08 }}
							lazy
							aria-label="Rounded rect container demo"
						/>
					</div>
					<figcaption>ROUNDED RECT</figcaption>
				</figure>
				<figure class="shape-cell">
					<div class="shape-canvas">
						<FrameFluid seed={603} lazy splatOnHover aria-label="Frame container demo" backColor={{ r: 10, g: 10, b: 10 }} />
					</div>
					<figcaption>FRAME</figcaption>
				</figure>
				<figure class="shape-cell">
					<div class="shape-canvas">
						<AnnularFluid seed={604} lazy splatOnHover aria-label="Annulus container demo" backColor={{ r: 10, g: 10, b: 10 }} />
					</div>
					<figcaption>ANNULUS</figcaption>
				</figure>
				<figure class="shape-cell">
					<div class="shape-canvas">
						<Fluid
							seed={605}
							colorful
							shading
							bloom
							splatOnHover
							containerShape={{ type: 'svgPath', d: lightning, viewBox: [0, 0, 100, 100] }}
							lazy
							aria-label="SVG path lightning demo"
						/>
					</div>
					<figcaption>SVG PATH</figcaption>
				</figure>
				<figure class="shape-cell">
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
					<figcaption>TEXT GLYPH</figcaption>
				</figure>
			</div>
		</div>
	</section>

	<!-- 10 Physics -->
	<section class="snap physics-section" bind:this={sections[9]}>
		<div class="section-inner">
			<div class="kicker light">05 &mdash; Physics</div>
			<h2 class="display-h center-h">Build with <em>&lt;Fluid /&gt;</em>.</h2>
			<p class="section-sub">Every prop is optional. Drop in a tag for a finished look; reach for props when you want your own physics.</p>
			<div class="physics-grid">
				<figure class="physics-cell">
					<div class="physics-canvas">
						<Fluid seed={1234} initialSplatCount={12} splatOnHover lazy aria-label="Default fluid configuration" />
					</div>
					<code class="physics-snippet">{'<Fluid />'}</code>
					<figcaption>DEFAULT</figcaption>
				</figure>
				<figure class="physics-cell">
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
					<code class="physics-snippet">{'<Fluid bloom={false} curl={5} densityDissipation={0.4} />'}</code>
					<figcaption>FLAT + SOFT</figcaption>
				</figure>
				<figure class="physics-cell">
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
					<code class="physics-snippet">{'<Fluid shading={false} splatRadius={0.8} splatForce={9000} />'}</code>
					<figcaption>BOLD SPLATS</figcaption>
				</figure>
				<figure class="physics-cell">
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
					<code class="physics-snippet">{'<Fluid velocityDissipation={0.05} densityDissipation={0.5} transparent />'}</code>
					<figcaption>SLOW + TRANSPARENT</figcaption>
				</figure>
			</div>
		</div>
	</section>

	<!-- 11 Glass: Crystal Orb + Soft Lens -->
	<section class="snap glass-section dark-section" bind:this={sections[10]}>
		<div class="section-inner">
			<div class="kicker light">06 &mdash; Glass</div>
			<h2 class="display-h center-h light-h">Refract through <em>glass</em>.</h2>
			<p class="section-sub light-sub">Glass adds a lens — refraction at the wall, chromatic fringes at the edge.</p>
			<div class="glass-grid">
				<figure class="glass-cell">
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
					<figcaption>CRYSTAL ORB</figcaption>
				</figure>
				<figure class="glass-cell">
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
					<figcaption>SOFT LENS</figcaption>
				</figure>
			</div>
		</div>
	</section>

	<!-- 12 Glass: Portal Ring + Glass Frame -->
	<section class="snap glass-section dark-section" bind:this={sections[11]}>
		<div class="section-inner">
			<div class="kicker light">06 &mdash; Glass (cont.)</div>
			<h2 class="display-h center-h light-h">Combine glass with <em>any container</em>.</h2>
			<p class="section-sub light-sub">Works with annulus, frame, and every other primitive.</p>
			<div class="glass-grid">
				<figure class="glass-cell">
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
					<figcaption>PORTAL RING</figcaption>
				</figure>
				<figure class="glass-cell">
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
					<figcaption>GLASS FRAME</figcaption>
				</figure>
			</div>
		</div>
	</section>

	<!-- 13 Sticky -->
	<section class="snap split sticky-section dark-bg" bind:this={sections[12]}>
		<div class="split-canvas sticky-canvas-wrap">
			<div class="sticky-pair">
				<div class="sticky-half">
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
				<div class="sticky-half">
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
			</div>
		</div>
		<div class="split-text">
			<div class="kicker">07 &mdash; Sticky</div>
			<h2 class="display-h">Make dye cling to <em>letterforms</em>.</h2>
			<p class="split-body">
				FluidStick masks the simulation with text or SVG paths, trapping dye inside the
				letterform. Hover to engage; the fluid auto-animates when idle.
			</p>
			<a class="inline-link" href="{base}/docs/components">View docs &rarr;</a>
		</div>
	</section>

	<!-- 14 Reveal -->
	<section class="snap reveal-section dark-section" bind:this={sections[13]}>
		<div class="section-inner">
			<div class="kicker light">08 &mdash; Reveal</div>
			<h2 class="display-h center-h light-h">Uncover with <em>FluidReveal</em>.</h2>
			<p class="section-sub light-sub">FluidReveal uses the simulation as an opacity mask. Move the cursor to reveal what's underneath.</p>
			<div class="reveal-grid">
				<figure class="reveal-cell">
					<div class="reveal-canvas" aria-label="Scratch-to-reveal demo">
						<FluidReveal lazy velocityDissipation={0.95} pressureIterations={10}>
							<div class="reveal-inner-content">
								<span class="reveal-label-text" style="font-family:'Playfair Display',serif;font-style:italic;">Revealed</span>
							</div>
						</FluidReveal>
					</div>
					<figcaption>SCRATCH TO REVEAL</figcaption>
				</figure>
				<figure class="reveal-cell">
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
							<div class="reveal-inner-content">
								<span class="reveal-label-text" style="font-family:'Playfair Display',serif;font-style:italic;">Auto Reveal</span>
							</div>
						</FluidReveal>
					</div>
					<figcaption>AUTO-REVEAL</figcaption>
				</figure>
			</div>
		</div>
	</section>

	<!-- 15 Distortion -->
	<section class="snap split distort-section dark-bg" bind:this={sections[14]}>
		<div class="split-canvas">
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
		<div class="split-text">
			<div class="kicker">09 &mdash; Distortion</div>
			<h2 class="display-h">Distort an <em>image</em>.</h2>
			<p class="split-body">
				FluidDistortion warps any source image with the velocity field. Hover to stir
				the simulation; watch the image bend at the edges of movement.
			</p>
			<p class="split-body" style="font-size:0.85em;opacity:0.7;">strength={0.3} · subtle</p>
			<a class="inline-link" href="{base}/docs/components">View docs &rarr;</a>
		</div>
	</section>

	<!-- 16 Distortion strong -->
	<section class="snap split distort-section dark-bg" bind:this={sections[15]}>
		<div class="split-text" style="order:1;">
			<div class="kicker">09 &mdash; Distortion (cont.)</div>
			<h2 class="display-h">Push the <em>warp</em> further.</h2>
			<p class="split-body">
				Higher strength and intensity produce a more dramatic liquid-lens effect&mdash;the
				image tears and reconstitutes with each stroke.
			</p>
			<p class="split-body" style="font-size:0.85em;opacity:0.7;">strength={0.45} · strong</p>
			<a class="inline-link" href="{base}/docs/components">View docs &rarr;</a>
		</div>
		<div class="split-canvas" style="order:2;">
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
	</section>

	<!-- 17 Install -->
	<section class="snap install cream" bind:this={sections[16]}>
		<div class="install-inner">
			<div class="kicker dark">10 &mdash; Install</div>
			<h2 class="display-h center">Three lines of setup.</h2>
			<div class="tabs">
				<button
					class="tab"
					class:active={activeTab === 'bun'}
					onclick={() => (activeTab = 'bun')}>bun</button
				>
				<button
					class="tab"
					class:active={activeTab === 'npm'}
					onclick={() => (activeTab = 'npm')}>npm</button
				>
				<button
					class="tab"
					class:active={activeTab === 'pnpm'}
					onclick={() => (activeTab = 'pnpm')}>pnpm</button
				>
			</div>
			<div class="code-block">
				<code>{installCmds[activeTab]}</code>
				<button class="copy-btn" onclick={copyInstall} aria-label="Copy install command">
					{copied ? 'copied' : 'copy'}
				</button>
			</div>
			<div class="code-block code-usage">
				<pre><code>{usageSnippet}</code></pre>
				<button class="copy-btn" onclick={copyUsage} aria-label="Copy usage snippet">
					{copiedUsage ? 'copied' : 'copy'}
				</button>
			</div>
		</div>
	</section>

	<!-- 18 Playground controls -->
	<section class="snap playground-section dark-bg" bind:this={sections[17]}>
		<div class="playground-split">
			<aside class="playground-panel">
				<div class="kicker">11 &mdash; Playground</div>
				<h2 class="display-h" style="font-size:clamp(2rem,4vw,3.5rem);margin-bottom:1.2rem;">
					<em>Try</em> it live.
				</h2>
				<p class="split-body" style="font-size:0.9rem;margin-bottom:1.6rem;">Drag the knobs. The fluid updates in real time.</p>

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
					<button class="copy-btn small" onclick={copySnippet} aria-label="Copy playground snippet">
						{copiedSnippet ? 'Copied!' : 'Copy'}
					</button>
				</div>
				<pre class="snippet-code"><code>{playgroundSnippet}</code></pre>
			</aside>

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
		</div>
	</section>

	<!-- 19 Manifest -->
	<section class="snap manifest" bind:this={sections[18]}>
		<div class="kicker">12 &mdash; Colophon</div>
		<h2 class="visually-hidden">Manifest</h2>
		<ol class="manifest-list">
			{#each features as f, i}
				<li class="manifest-item">
					<span class="m-num">{pad(i + 1)}</span>
					<span class="m-dash">&mdash;</span>
					<span class="m-text">{f}.</span>
				</li>
			{/each}
		</ol>
	</section>

	<!-- 20 Footer -->
	<section class="snap footer-section" bind:this={sections[19]}>
		<div class="footer-inner">
			<div class="footer-mark">svelte&mdash;fluid</div>
			<div class="footer-links">
				<a href="https://github.com/tommyyzhao/svelte-fluid">GitHub</a>
				<a href="{base}/docs">Docs</a>
				<a href="https://www.npmjs.com/package/svelte-fluid">npm</a>
			</div>
			<p class="footer-credit">
				Derivative work of PavelDoGreat/WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017.
			</p>
			<p class="footer-year">MMXXVI</p>
		</div>
	</section>

	<!-- 21 Back to top -->
	<section class="snap back-top-section" bind:this={sections[20]}>
		<button class="back-top-btn" onclick={scrollToTop} aria-label="Back to top">
			<span class="back-top-arrow">↑</span>
			<span class="back-top-label">Back to top</span>
		</button>
		<p class="back-top-sub">svelte&mdash;fluid &mdash; Spring 2026</p>
	</section>

</main>

<style>
	:global(html),
	:global(body) {
		margin: 0;
		padding: 0;
		background: #0a0a0a;
		height: 100%;
		overflow: hidden;
	}

	.scroll-root {
		scroll-snap-type: y mandatory;
		overflow-y: scroll;
		height: 100%;
		font-family: 'Inter', 'Söhne', system-ui, -apple-system, sans-serif;
		color: #f5f1e8;
	}

	.snap {
		scroll-snap-align: start;
		scroll-snap-stop: always;
		min-height: 100vh;
		position: relative;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
	}

	.competition-back {
		position: fixed;
		top: 1rem;
		left: 1rem;
		z-index: 200;
		font-size: 0.75rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.45);
		text-decoration: none;
		background: rgba(0, 0, 0, 0.55);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		padding: 0.35rem 0.7rem;
		font-family: 'Playfair Display', serif;
		font-style: italic;
		transition: color 0.15s;
	}
	.competition-back:hover {
		color: rgba(255, 255, 255, 0.9);
	}

	.counter {
		position: fixed;
		top: 1.6rem;
		right: 2rem;
		z-index: 50;
		font-family: 'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace;
		font-size: 0.72rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: #f5f1e8;
		mix-blend-mode: difference;
		display: flex;
		gap: 0.4em;
		align-items: baseline;
	}
	.counter .slash {
		opacity: 0.5;
	}
	.counter .total {
		opacity: 0.6;
	}

	.kicker {
		text-transform: uppercase;
		letter-spacing: 0.22em;
		font-size: 0.7rem;
		font-family: 'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace;
		color: rgba(245, 241, 232, 0.7);
		margin-bottom: 1.2rem;
	}
	.kicker.dark {
		color: rgba(20, 20, 20, 0.65);
	}
	.kicker.light {
		color: rgba(245, 241, 232, 0.8);
	}

	/* ── Hero ── */
	.hero {
		background: #050505;
		overflow: hidden;
	}
	.hero-bg {
		position: absolute;
		inset: 0;
		z-index: 0;
	}
	.hero-overlay {
		position: relative;
		z-index: 1;
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		text-align: center;
		padding: 6rem 2rem 4rem;
		pointer-events: none;
	}
	.hero-overlay .cta,
	.hero-overlay a {
		pointer-events: auto;
	}
	.hero-title {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 0.1em;
		margin: 0.6rem 0 1.4rem;
		line-height: 0.95;
	}
	.serif-prefix {
		font-family: 'Playfair Display', 'Cormorant Garamond', 'EB Garamond', Georgia, serif;
		font-style: italic;
		font-weight: 400;
		font-size: clamp(2.4rem, 6vw, 5rem);
		color: #f5f1e8;
		letter-spacing: -0.02em;
	}
	.fluid-word {
		display: inline-block;
		height: clamp(4rem, 10vw, 9rem);
		width: clamp(10rem, 36vw, 28rem);
	}
	.hero-sub {
		font-family: 'Playfair Display', Georgia, serif;
		font-style: italic;
		font-size: clamp(1rem, 1.4vw, 1.3rem);
		max-width: 38ch;
		line-height: 1.5;
		color: rgba(245, 241, 232, 0.92);
		margin: 0 0 2rem;
	}
	.cta-row {
		display: flex;
		gap: 0.9rem;
	}
	.cta {
		text-decoration: none;
		font-size: 0.82rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		padding: 0.95rem 1.6rem;
		border-radius: 999px;
		transition: transform 0.2s ease, background 0.2s ease;
	}
	.cta-light {
		background: #f5f1e8;
		color: #0a0a0a;
	}
	.cta-outline {
		border: 1px solid rgba(245, 241, 232, 0.6);
		color: #f5f1e8;
	}
	.cta:hover {
		transform: translateY(-2px);
	}
	.scroll-indicator {
		position: absolute;
		bottom: 2.2rem;
		left: 50%;
		transform: translateX(-50%);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: rgba(245, 241, 232, 0.65);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
	}
	.scroll-indicator .arrow {
		font-size: 1.1rem;
		animation: bob 2s ease-in-out infinite;
	}
	@keyframes bob {
		0%, 100% { transform: translateY(0); }
		50% { transform: translateY(6px); }
	}

	/* ── Editorial ── */
	.editorial.cream {
		background: #f5f1e8;
		color: #141414;
		justify-content: center;
		align-items: center;
		padding: 6rem 2rem;
		position: relative;
	}
	.section-num {
		position: absolute;
		top: 4rem;
		left: 3rem;
		font-family: 'Playfair Display', Georgia, serif;
		font-style: italic;
		font-size: clamp(3rem, 8vw, 7rem);
		color: rgba(20, 20, 20, 0.12);
		line-height: 1;
	}
	.editorial-col {
		max-width: 60ch;
		text-align: left;
	}
	.editorial-h {
		font-family: 'Playfair Display', 'EB Garamond', Georgia, serif;
		font-weight: 700;
		font-size: clamp(2.4rem, 5vw, 4.2rem);
		line-height: 1.05;
		letter-spacing: -0.02em;
		margin: 0 0 1.8rem;
		color: #141414;
	}
	.editorial-body {
		font-family: 'Playfair Display', 'EB Garamond', Georgia, serif;
		font-size: clamp(1.05rem, 1.3vw, 1.3rem);
		line-height: 1.7;
		color: #2a2a2a;
		margin: 0;
	}
	.editorial-body em {
		font-style: italic;
		color: #141414;
	}

	/* ── Split layout ── */
	.split {
		display: grid;
		grid-template-columns: 1fr 1fr;
	}
	.split.warm {
		background: #1a1008;
	}
	.split.navy {
		background: #0c1424;
	}
	.split.white {
		background: #fafaf7;
	}
	.split.deep-blue {
		background: #080f1e;
	}
	.split.dark-bg {
		background: #0a0a0a;
	}
	.split-canvas {
		position: relative;
		height: 100vh;
		min-height: 100vh;
		overflow: hidden;
	}
	.split-text {
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 4rem clamp(2rem, 6vw, 6rem);
		color: #f5f1e8;
	}
	.split-text.light {
		color: #f5f1e8;
	}
	.display-h {
		font-family: 'Playfair Display', 'EB Garamond', Georgia, serif;
		font-weight: 700;
		font-size: clamp(3rem, 7vw, 6rem);
		line-height: 1;
		letter-spacing: -0.025em;
		margin: 0 0 1.6rem;
	}
	.display-h em {
		font-style: italic;
	}
	.display-h.dark {
		color: #141414;
	}
	.display-h.center {
		text-align: center;
	}
	.split-body {
		font-family: 'Playfair Display', 'EB Garamond', Georgia, serif;
		font-size: clamp(1rem, 1.2vw, 1.2rem);
		line-height: 1.65;
		color: rgba(245, 241, 232, 0.85);
		max-width: 40ch;
		margin: 0 0 2rem;
	}
	.split-body.dark {
		color: #2a2a2a;
	}
	.inline-link {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.78rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		text-decoration: none;
		color: #f5f1e8;
		border-bottom: 1px solid rgba(245, 241, 232, 0.5);
		padding-bottom: 0.3rem;
		align-self: flex-start;
		transition: border-color 0.2s ease;
	}
	.inline-link.dark {
		color: #141414;
		border-bottom-color: rgba(20, 20, 20, 0.4);
	}
	.inline-link:hover {
		border-bottom-color: currentColor;
	}

	/* ── Full bleed ── */
	.full-bleed {
		background: #000;
		position: relative;
		overflow: hidden;
	}
	.bleed-canvas {
		position: absolute;
		inset: 0;
	}
	.bleed-caption {
		position: absolute;
		bottom: 4rem;
		left: 3rem;
		max-width: 32ch;
		padding: 1.6rem;
		background: rgba(10, 10, 10, 0.62);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		border: 1px solid rgba(245, 241, 232, 0.18);
		z-index: 2;
	}
	.caption-h {
		font-family: 'Playfair Display', Georgia, serif;
		font-size: 2.4rem;
		font-weight: 700;
		margin: 0 0 0.8rem;
		color: #f5f1e8;
		letter-spacing: -0.02em;
	}
	.caption-body {
		font-family: 'Playfair Display', Georgia, serif;
		font-size: 0.98rem;
		line-height: 1.55;
		color: rgba(245, 241, 232, 0.85);
		margin: 0 0 1.2rem;
	}

	/* ── Section inner (grid sections) ── */
	.dark-section {
		background: #080808;
	}
	.section-inner {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3.5rem clamp(1.5rem, 5vw, 5rem);
		width: 100%;
		box-sizing: border-box;
		overflow: hidden;
	}
	.center-h {
		text-align: center;
	}
	.light-h {
		color: #f5f1e8;
	}
	.section-sub {
		font-family: 'Playfair Display', Georgia, serif;
		font-style: italic;
		font-size: clamp(0.95rem, 1.1vw, 1.1rem);
		color: rgba(245, 241, 232, 0.6);
		text-align: center;
		max-width: 55ch;
		margin: 0 0 2.4rem;
		line-height: 1.5;
	}
	.light-sub {
		color: rgba(245, 241, 232, 0.6);
	}

	/* ── Shapes section ── */
	.shapes-section {
		background: #0c0c12;
	}
	.shapes-section .kicker {
		color: rgba(245, 241, 232, 0.8);
	}
	.shapes-section .display-h {
		color: #f5f1e8;
	}
	.shape-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
		width: 100%;
		max-width: 900px;
	}
	.shape-cell {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.shape-canvas {
		aspect-ratio: 1;
		position: relative;
		overflow: hidden;
		border-radius: 4px;
		background: #111;
	}
	.shape-cell figcaption {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.65rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: rgba(245, 241, 232, 0.55);
		text-align: center;
	}

	/* ── Physics section ── */
	.physics-section {
		background: #0a0a0a;
	}
	.physics-section .kicker {
		color: rgba(245, 241, 232, 0.8);
	}
	.physics-section .display-h {
		color: #f5f1e8;
	}
	.physics-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
		width: 100%;
		max-width: 900px;
	}
	.physics-cell {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.physics-canvas {
		aspect-ratio: 4 / 3;
		position: relative;
		overflow: hidden;
		border-radius: 4px;
		background: #111;
	}
	.physics-snippet {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.62rem;
		color: rgba(245, 241, 232, 0.5);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.physics-cell figcaption {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.65rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: rgba(245, 241, 232, 0.55);
	}

	/* ── Glass section ── */
	.glass-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.5rem;
		width: 100%;
		max-width: 820px;
	}
	.glass-cell {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.glass-canvas {
		aspect-ratio: 1;
		position: relative;
		overflow: hidden;
		border-radius: 4px;
		background: #050510;
	}
	.glass-cell figcaption {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.65rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: rgba(245, 241, 232, 0.55);
		text-align: center;
	}

	/* ── Sticky section ── */
	.sticky-section {
		background: #0a0a0a;
	}
	.sticky-canvas-wrap {
		display: flex;
		flex-direction: column;
	}
	.sticky-pair {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
	}
	.sticky-half {
		flex: 1;
		position: relative;
		overflow: hidden;
	}

	/* ── Reveal section ── */
	.reveal-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.5rem;
		width: 100%;
		max-width: 820px;
	}
	.reveal-cell {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.reveal-canvas {
		aspect-ratio: 4 / 3;
		position: relative;
		overflow: hidden;
		border-radius: 4px;
		background: #111;
	}
	.reveal-inner-content {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		font-size: clamp(2rem, 5vw, 4rem);
		background: linear-gradient(135deg, #1a2a4a, #0f1a2e);
	}
	.reveal-label-text {
		color: #f5f1e8;
		font-size: clamp(1.8rem, 4vw, 3rem);
	}
	.reveal-cell figcaption {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.65rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: rgba(245, 241, 232, 0.55);
	}

	/* ── Distortion section ── */
	.distort-section {
		background: #0a0a0a;
	}

	/* ── Install section ── */
	.install.cream {
		background: #f5f1e8;
		color: #141414;
		justify-content: center;
		align-items: center;
		padding: 5rem 2rem;
	}
	.install-inner {
		width: 100%;
		max-width: 720px;
		text-align: center;
	}
	.tabs {
		display: inline-flex;
		gap: 0;
		margin: 2rem 0 1.4rem;
		border: 1px solid rgba(20, 20, 20, 0.15);
		border-radius: 999px;
		padding: 0.3rem;
	}
	.tab {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.78rem;
		letter-spacing: 0.1em;
		text-transform: lowercase;
		background: transparent;
		border: 0;
		padding: 0.55rem 1.2rem;
		border-radius: 999px;
		color: rgba(20, 20, 20, 0.65);
		cursor: pointer;
		transition: background 0.2s ease, color 0.2s ease;
	}
	.tab.active {
		background: #141414;
		color: #f5f1e8;
	}
	.code-block {
		position: relative;
		text-align: left;
		background: #141414;
		color: #f5f1e8;
		border-radius: 8px;
		padding: 1.2rem 5rem 1.2rem 1.4rem;
		font-family: 'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace;
		font-size: 0.92rem;
		line-height: 1.55;
		overflow-x: auto;
		margin-bottom: 1rem;
	}
	.code-usage pre {
		margin: 0;
		white-space: pre-wrap;
	}
	.copy-btn {
		position: absolute;
		top: 0.9rem;
		right: 0.9rem;
		background: transparent;
		border: 1px solid rgba(245, 241, 232, 0.3);
		color: rgba(245, 241, 232, 0.85);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.7rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		padding: 0.35rem 0.7rem;
		border-radius: 4px;
		cursor: pointer;
	}
	.copy-btn:hover {
		background: rgba(245, 241, 232, 0.1);
	}

	/* ── Playground section ── */
	.playground-section {
		background: #0a0a0a;
	}
	.playground-split {
		flex: 1;
		display: grid;
		grid-template-columns: 380px 1fr;
		min-height: 100vh;
	}
	.playground-panel {
		padding: 3rem 2rem;
		overflow-y: auto;
		border-right: 1px solid rgba(245, 241, 232, 0.08);
		display: flex;
		flex-direction: column;
		gap: 0;
	}
	.playground-canvas {
		position: relative;
		overflow: hidden;
	}
	.preset-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 1.6rem;
	}
	.preset-chip {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.08em;
		background: rgba(245, 241, 232, 0.07);
		border: 1px solid rgba(245, 241, 232, 0.15);
		color: rgba(245, 241, 232, 0.7);
		padding: 0.3rem 0.7rem;
		border-radius: 3px;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.preset-chip.active,
	.preset-chip:hover {
		background: rgba(245, 241, 232, 0.18);
		color: #f5f1e8;
	}
	.preset-chip.reset {
		border-color: rgba(245, 241, 232, 0.08);
		color: rgba(245, 241, 232, 0.4);
	}
	.knob-group {
		margin-bottom: 1.4rem;
	}
	.knob-group-title {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.62rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: rgba(245, 241, 232, 0.4);
		margin-bottom: 0.8rem;
		padding-bottom: 0.4rem;
		border-bottom: 1px solid rgba(245, 241, 232, 0.08);
	}
	.knob-row {
		display: grid;
		grid-template-columns: 130px 1fr 52px;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 0.55rem;
		cursor: pointer;
	}
	.knob-label {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.68rem;
		color: rgba(245, 241, 232, 0.7);
	}
	.knob-row input[type='range'] {
		width: 100%;
		accent-color: #f5f1e8;
	}
	.knob-value {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.68rem;
		color: rgba(245, 241, 232, 0.55);
		text-align: right;
	}
	.knob-value.mono {
		font-size: 0.62rem;
	}
	.toggle-row {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		margin-bottom: 0.5rem;
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
		border-radius: 9px;
		background: rgba(245, 241, 232, 0.15);
		position: relative;
		flex-shrink: 0;
		transition: background 0.18s;
	}
	.toggle-pill::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 3px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: rgba(245, 241, 232, 0.5);
		transition: transform 0.18s, background 0.18s;
	}
	.toggle-row input:checked ~ .toggle-pill {
		background: rgba(245, 241, 232, 0.35);
	}
	.toggle-row input:checked ~ .toggle-pill::after {
		transform: translateX(14px);
		background: #f5f1e8;
	}
	.color-row {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		margin-bottom: 0.5rem;
		cursor: pointer;
	}
	.color-row input[type='color'] {
		width: 28px;
		height: 28px;
		border: none;
		background: none;
		cursor: pointer;
		padding: 0;
		border-radius: 3px;
	}
	.snippet-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.65rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: rgba(245, 241, 232, 0.4);
		margin-bottom: 0.5rem;
		margin-top: 1rem;
	}
	.copy-btn.small {
		position: static;
		font-size: 0.62rem;
		padding: 0.2rem 0.5rem;
	}
	.snippet-code {
		background: rgba(245, 241, 232, 0.04);
		border: 1px solid rgba(245, 241, 232, 0.08);
		border-radius: 4px;
		padding: 0.8rem;
		margin: 0;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.68rem;
		color: rgba(245, 241, 232, 0.7);
		white-space: pre-wrap;
		line-height: 1.55;
	}

	/* ── Manifest ── */
	.manifest {
		background: #0a0a0a;
		color: #f5f1e8;
		justify-content: center;
		padding: 6rem clamp(2rem, 8vw, 8rem);
		gap: 2rem;
	}
	.manifest-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.manifest-item {
		font-family: 'Playfair Display', 'EB Garamond', Georgia, serif;
		font-style: italic;
		font-size: clamp(2rem, 5vw, 4rem);
		line-height: 1.15;
		letter-spacing: -0.015em;
		display: flex;
		gap: 0.6em;
		align-items: baseline;
		color: #f5f1e8;
	}
	.m-num {
		font-family: 'JetBrains Mono', monospace;
		font-style: normal;
		font-size: 0.4em;
		letter-spacing: 0.2em;
		color: rgba(245, 241, 232, 0.55);
		min-width: 2.5em;
	}
	.m-dash {
		opacity: 0.5;
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}

	/* ── Footer ── */
	.footer-section {
		background: #000;
		color: #f5f1e8;
		justify-content: center;
		align-items: center;
		padding: 5rem 2rem;
	}
	.footer-inner {
		text-align: center;
		max-width: 640px;
	}
	.footer-mark {
		font-family: 'Playfair Display', Georgia, serif;
		font-style: italic;
		font-size: clamp(2.4rem, 5vw, 4rem);
		margin-bottom: 2rem;
		letter-spacing: -0.02em;
	}
	.footer-links {
		display: flex;
		gap: 2rem;
		justify-content: center;
		margin-bottom: 3rem;
	}
	.footer-links a {
		color: #f5f1e8;
		text-decoration: none;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.78rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		border-bottom: 1px solid rgba(245, 241, 232, 0.3);
		padding-bottom: 0.25rem;
	}
	.footer-links a:hover {
		border-bottom-color: #f5f1e8;
	}
	.footer-credit {
		font-family: 'Playfair Display', Georgia, serif;
		font-style: italic;
		font-size: 0.95rem;
		line-height: 1.6;
		color: rgba(245, 241, 232, 0.7);
		margin: 0 0 2rem;
	}
	.footer-year {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.78rem;
		letter-spacing: 0.3em;
		color: rgba(245, 241, 232, 0.55);
		margin: 0;
	}

	/* ── Back to top ── */
	.back-top-section {
		background: #050505;
		justify-content: center;
		align-items: center;
		gap: 1.2rem;
	}
	.back-top-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
		background: transparent;
		border: 1px solid rgba(245, 241, 232, 0.25);
		color: #f5f1e8;
		cursor: pointer;
		padding: 2rem 3rem;
		border-radius: 4px;
		transition: border-color 0.2s, transform 0.2s;
	}
	.back-top-btn:hover {
		border-color: rgba(245, 241, 232, 0.7);
		transform: translateY(-4px);
	}
	.back-top-arrow {
		font-size: clamp(3rem, 8vw, 7rem);
		font-family: 'Playfair Display', Georgia, serif;
		font-style: italic;
		line-height: 1;
		color: rgba(245, 241, 232, 0.8);
	}
	.back-top-label {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
		letter-spacing: 0.25em;
		text-transform: uppercase;
		color: rgba(245, 241, 232, 0.55);
	}
	.back-top-sub {
		font-family: 'Playfair Display', Georgia, serif;
		font-style: italic;
		font-size: 0.9rem;
		color: rgba(245, 241, 232, 0.3);
		margin: 0;
	}

	/* ── Responsive ── */
	@media (max-width: 900px) {
		.playground-split {
			grid-template-columns: 1fr;
			grid-template-rows: auto 50vh;
		}
		.playground-panel {
			border-right: none;
			border-bottom: 1px solid rgba(245, 241, 232, 0.08);
			max-height: 50vh;
		}
	}

	@media (max-width: 760px) {
		.split {
			grid-template-columns: 1fr;
			grid-template-rows: 50vh auto;
		}
		.split-canvas {
			height: 50vh;
			min-height: 50vh;
		}
		.split.navy {
			grid-template-rows: auto 50vh;
		}
		.split.navy .split-text {
			order: 2;
		}
		.split.navy .split-canvas {
			order: 1;
		}
		.split.deep-blue {
			grid-template-rows: auto 50vh;
		}
		.split.deep-blue .split-text {
			order: 1;
		}
		.split.deep-blue .split-canvas {
			order: 2;
		}
		.section-num {
			top: 2rem;
			left: 1.4rem;
		}
		.bleed-caption {
			left: 1.2rem;
			right: 1.2rem;
			bottom: 2rem;
			max-width: none;
		}
		.manifest {
			padding: 5rem 1.4rem;
		}
		.shape-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.glass-grid {
			grid-template-columns: 1fr;
		}
		.reveal-grid {
			grid-template-columns: 1fr;
		}
		.sticky-pair {
			flex-direction: row;
		}
	}
</style>
