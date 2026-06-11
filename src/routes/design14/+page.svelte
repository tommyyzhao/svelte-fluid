<script lang="ts">
	import { base } from '$app/paths';
	import type { RGB } from '$lib/index.js';
	import {
		AnnularFluid,
		Aurora,
		CircularFluid,
		Fluid,
		FluidBackground,
		FluidDistortion,
		FluidReveal,
		FluidStick,
		FrameFluid,
		FrozenSwirl,
		InkInWater,
		LavaLamp,
		Plasma,
		Toroidal
	} from '$lib/index.js';

	type PM = 'bun' | 'npm' | 'pnpm' | 'yarn';

	const installCmds: Record<PM, string> = {
		bun: 'bun add svelte-fluid',
		npm: 'npm install svelte-fluid',
		pnpm: 'pnpm add svelte-fluid',
		yarn: 'yarn add svelte-fluid'
	};

	const tabs: PM[] = ['bun', 'npm', 'pnpm', 'yarn'];

	let activeTab = $state<PM>('bun');
	let copiedInstall = $state(false);
	let copiedUsage = $state(false);
	let reducedMotion = $state(false);

	const usageSnippet = `<script>
	import { Fluid } from 'svelte-fluid';
<\/script>

<div style="width: 100%; height: 480px;">
	<Fluid seed={42} splatOnHover />
</div>`;

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
			await navigator.clipboard.writeText(usageSnippet);
			copiedUsage = true;
			setTimeout(() => (copiedUsage = false), 1200);
		} catch {
			copiedUsage = false;
		}
	}

	const stylisticPresets = [
		{ idx: '01', name: 'LavaLamp', component: LavaLamp, seed: 11, id: 'lavalamp' },
		{ idx: '02', name: 'Plasma', component: Plasma, seed: 22, id: 'plasma' },
		{ idx: '03', name: 'InkInWater', component: InkInWater, seed: 33, id: 'inkinwater' },
		{ idx: '04', name: 'FrozenSwirl', component: FrozenSwirl, seed: 44, id: 'frozenswirl' },
		{ idx: '05', name: 'Aurora', component: Aurora, seed: 55, id: 'aurora' },
		{ idx: '06', name: 'Toroidal', component: Toroidal, seed: 66, id: 'toroidal' }
	];

	const compassStar =
		'M 50 4 L 56 35 L 88 22 L 67 50 L 88 78 L 56 65 L 50 96 L 44 65 L 12 78 L 33 50 L 12 22 L 44 35 Z';

	const stickyShowcase = [
		{
			key: 'sticky',
			seed: 701,
			text: 'STICKY',
			font: '900 100px "Geist", "Inter", system-ui, sans-serif',
			caption: 'sans · weight 900'
		},
		{
			key: 'inf',
			seed: 702,
			text: '∞',
			font: '200px "Instrument Serif", "EB Garamond", Georgia, serif',
			caption: 'serif · glyph'
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

	const manifest = [
		'multi-instance',
		'resize-stable',
		'deterministic seeding',
		'MIT licensed',
		'sticky text masks',
		'image distortion'
	];

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
		LavaLamp:         { curl: 8,  splatRadius: 0.55, splatForce: 4800, densityDissipation: 0.18, velocityDissipation: 0.08, bloom: true,  shading: true,  colorful: false, backColor: { r: 8, g: 4, b: 14 } },
		Plasma:           { curl: 50, splatRadius: 0.22, splatForce: 7500, densityDissipation: 0.6,  velocityDissipation: 0.15, bloom: true,  shading: true,  colorful: true,  backColor: { r: 4, g: 2, b: 12 } },
		'Ink in Water':   { curl: 12, splatRadius: 0.32, splatForce: 5200, densityDissipation: 0.4,  velocityDissipation: 0.1,  bloom: false, shading: true,  colorful: false, backColor: { r: 244, g: 240, b: 232 } },
		'Frozen Swirl':   { curl: 35, splatRadius: 0.28, splatForce: 5800, densityDissipation: 0.2,  velocityDissipation: 0.05, bloom: true,  shading: true,  colorful: false, backColor: { r: 2, g: 8, b: 18 } },
		Aurora:           { curl: 22, splatRadius: 0.38, splatForce: 6200, densityDissipation: 0.15, velocityDissipation: 0.08, bloom: true,  shading: true,  colorful: true,  backColor: { r: 0, g: 4, b: 14 } },
		'Toroidal': { curl: 45, splatRadius: 0.3, splatForce: 7000, densityDissipation: 0.25, velocityDissipation: 0.1, bloom: true,  shading: false, colorful: true,  backColor: { r: 6, g: 2, b: 16 } }
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

	let revealEls: HTMLElement[] = $state([]);

	const stickyAutoAnimate = $derived(!reducedMotion);

	$effect(() => {
		if (typeof window === 'undefined') return;
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		reducedMotion = mq.matches;
		const onChange = (e: MediaQueryListEvent) => (reducedMotion = e.matches);
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	});

	$effect(() => {
		if (typeof IntersectionObserver === 'undefined') return;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						(entry.target as HTMLElement).classList.add('is-visible');
						observer.unobserve(entry.target);
					}
				}
			},
			{ threshold: 0.16 }
		);
		for (const el of revealEls) if (el) observer.observe(el);
		return () => observer.disconnect();
	});

	function pad(n: number) {
		return n.toString().padStart(2, '0');
	}
</script>

<svelte:head>
	<title>svelte-fluid — Sticky title flagship</title>
</svelte:head>

<a class="competition-back" href="{base}/design-competition">← Competition</a>

<div class="page">
	<header class="nav-bar">
		<div class="nav-inner">
			<a class="brand" href="{base}/">svelte<span class="dash">—</span>fluid</a>
			<nav class="nav-links">
				<a href="{base}/docs">Docs</a>
				<a href="{base}/docs/presets">Presets</a>
				<a href="https://github.com/tommyyzhao/svelte-fluid" target="_blank" rel="noreferrer">
					GitHub
				</a>
			</nav>
		</div>
	</header>

	<section class="hero">
		<FluidBackground
			seed={2026}
			simResolution={128}
			dyeResolution={1024}
			pressureIterations={20}
			bloomIterations={8}
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
			sticky
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
			exclude=".hero-overlay-card, .nav-bar"
			excludeRadius={20}
		/>

		<div class="hero-scrim"></div>

		<div class="hero-eyebrow">WebGL · Svelte 5 · MIT</div>

		<div class="hero-overlay-card">
			<h1 class="tagline">
				WebGL fluid simulation as a Svelte 5 component.
				<span class="italic">Multi-instance, resize-stable, deterministic seeding.</span>
			</h1>
			<div class="cta-row">
				<a class="cta primary" href="{base}/docs">Read the docs</a>
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
	</section>

	<section class="install-section" bind:this={revealEls[0]}>
		<div class="install-inner">
			<div class="eyebrow centered">§ 02 — Install</div>
			<div class="install-card">
				<div class="install-tabs" role="tablist">
					{#each tabs as t (t)}
						<button
							role="tab"
							class="install-tab"
							class:active={activeTab === t}
							aria-selected={activeTab === t}
							onclick={() => (activeTab = t)}
						>
							{t}
						</button>
					{/each}
				</div>
				<div class="code-row">
					<code class="install-code">{installCmds[activeTab]}</code>
					<button class="copy-btn" onclick={copyInstall} aria-label="Copy install command">
						{copiedInstall ? 'Copied!' : 'copy'}
					</button>
				</div>
				<div class="divider"></div>
				<div class="usage-head">
					<span>minimal usage</span>
					<button class="copy-btn small" onclick={copyUsage} aria-label="Copy usage snippet">
						{copiedUsage ? 'Copied!' : 'copy'}
					</button>
				</div>
				<pre class="usage-code"><code>{usageSnippet}</code></pre>
			</div>
		</div>
	</section>

	<section class="bleed" bind:this={revealEls[1]}>
		<div class="bleed-canvas">
			<Plasma seed={303} lazy aria-label="Plasma preset" backColor={{ r: 10, g: 10, b: 10 }} />
		</div>
		<aside class="glass-caption">
			<div class="eyebrow muted">§ 03 — Preset · electric</div>
			<h3 class="display-head small">
				<span class="italic">Plasma</span>.
			</h3>
			<p class="body-copy small">
				High-frequency curl, saturated to the edge of the gamut. Best deployed sparingly — a single
				fluorescent accent across an otherwise muted page.
			</p>
			<a class="source-link" href="{base}/docs/presets#plasma">→ View source</a>
		</aside>
	</section>

	<section class="preset-grid-section" bind:this={revealEls[2]}>
		<div class="section-inner">
			<div class="eyebrow centered">§ 04 — Presets</div>
		</div>
		<div class="preset-grid">
			{#each stylisticPresets as p (p.name)}
				{@const C = p.component}
				<article class="preset-cell">
					<div class="cell-label">§ {p.idx} / {p.name.toUpperCase()}</div>
					<div class="cell-canvas">
						<C seed={p.seed} lazy aria-label="{p.name} preset" backColor={{ r: 10, g: 10, b: 10 }} />
					</div>
					<div class="cell-hover">
						<code class="cell-snippet">&lt;{p.name} /&gt;</code>
						<a class="cell-source" href="{base}/docs/presets#{p.id}">→ View source</a>
					</div>
				</article>
			{/each}
		</div>
	</section>

	<section class="shape-section" bind:this={revealEls[3]}>
		<div class="section-inner">
			<h2 class="display-head centered-head">
				Confine fluid to <span class="italic">any shape</span>.
			</h2>
			<div class="shape-grid">
				<div class="shape-cell">
					<div class="shape-stage">
						<CircularFluid seed={601} lazy aria-label="Circle container" backColor={{ r: 10, g: 10, b: 10 }} />
					</div>
					<div class="shape-caption">Circle</div>
				</div>
				<div class="shape-cell">
					<div class="shape-stage">
						<Fluid
							seed={602}
							lazy
							containerShape={{
								type: 'roundedRect',
								cx: 0.5,
								cy: 0.5,
								halfW: 0.42,
								halfH: 0.42,
								cornerRadius: 0.08
							}}
							initialSplatCount={15}
							aria-label="Rounded rect container"
						/>
					</div>
					<div class="shape-caption">RoundedRect</div>
				</div>
				<div class="shape-cell">
					<div class="shape-stage">
						<FrameFluid seed={603} lazy aria-label="Frame container" backColor={{ r: 10, g: 10, b: 10 }} />
					</div>
					<div class="shape-caption">Frame</div>
				</div>
				<div class="shape-cell">
					<div class="shape-stage">
						<AnnularFluid seed={604} lazy aria-label="Annulus container" backColor={{ r: 10, g: 10, b: 10 }} />
					</div>
					<div class="shape-caption">Annulus</div>
				</div>
				<div class="shape-cell">
					<div class="shape-stage">
						<Fluid
							seed={605}
							lazy
							containerShape={{ type: 'svgPath', d: compassStar, viewBox: [0, 0, 100, 100] }}
							initialSplatCount={15}
							aria-label="SVG path container"
						/>
					</div>
					<div class="shape-caption">SvgPath</div>
				</div>
				<div class="shape-cell">
					<div class="shape-stage">
						<Fluid
							seed={606}
							lazy
							containerShape={{ type: 'svgPath', text: '&', font: '900 280px Georgia, serif' }}
							initialSplatCount={15}
							aria-label="Text glyph container"
						/>
					</div>
					<div class="shape-caption">TextGlyph</div>
				</div>
			</div>
		</div>
	</section>

	<section class="sticky-section" bind:this={revealEls[4]}>
		<div class="section-inner">
			<h2 class="display-head centered-head">
				<span class="italic">Dye</span> that clings to glyphs.
			</h2>
			<div class="sticky-grid">
				{#each stickyShowcase as s (s.key)}
					<div class="sticky-cell">
						<div class="sticky-stage">
							<FluidStick
								text={s.text}
								font={s.font}
								seed={s.seed}
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
						<div class="shape-caption">{s.caption}</div>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<section class="distort-section" bind:this={revealEls[5]}>
		<div class="section-inner">
			<h2 class="display-head centered-head">
				<span class="italic">Warp</span> an image.
			</h2>
			<div class="distort-grid">
				{#each distortCells as cell (cell.seed)}
					<div class="distort-cell">
						<div class="distort-stage">
							<FluidDistortion
								seed={cell.seed}
								src={`${base}/${cell.src}`}
								strength={cell.strength}
								intensity={cell.intensity}
								scale={cell.scale}
								lazy
							/>
						</div>
						<div class="shape-caption">{cell.caption}</div>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<section class="physics-section" bind:this={revealEls[7]}>
		<div class="section-inner">
			<div class="eyebrow centered">§ 05 — Build with &lt;Fluid /&gt;</div>
			<div class="physics-grid">
				<article class="physics-cell">
					<div class="cell-label">§ 05.01 / DEFAULT</div>
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
				</article>
				<article class="physics-cell">
					<div class="cell-label">§ 05.02 / FLAT + SOFT</div>
					<div class="physics-canvas">
						<Fluid
							seed={5678}
							bloom={false}
							curl={5}
							densityDissipation={0.4}
							initialSplatCount={10}
							splatOnHover
							lazy
							aria-label="Flat soft fluid"
						/>
					</div>
					<code class="physics-snippet">{'<Fluid bloom={false} curl={5} densityDissipation={0.4} />'}</code>
				</article>
				<article class="physics-cell">
					<div class="cell-label">§ 05.03 / BOLD SPLATS</div>
					<div class="physics-canvas">
						<Fluid
							seed={9012}
							shading={false}
							splatRadius={0.8}
							splatForce={9000}
							initialSplatCount={8}
							splatOnHover
							lazy
							aria-label="Bold splat fluid"
						/>
					</div>
					<code class="physics-snippet">{'<Fluid shading={false} splatRadius={0.8} splatForce={9000} />'}</code>
				</article>
				<article class="physics-cell">
					<div class="cell-label">§ 05.04 / SLOW + TRANSPARENT</div>
					<div class="physics-canvas">
						<Fluid
							seed={3456}
							velocityDissipation={0.05}
							densityDissipation={0.5}
							transparent
							initialSplatCount={14}
							splatOnHover
							lazy
							aria-label="Slow transparent fluid"
						/>
					</div>
					<code class="physics-snippet">{'<Fluid velocityDissipation={0.05} densityDissipation={0.5} transparent />'}</code>
				</article>
			</div>
		</div>
	</section>

	<section class="glass-section" bind:this={revealEls[8]}>
		<div class="section-inner">
			<div class="eyebrow centered">§ 06 — Refraction</div>
			<h2 class="display-head centered-head">
				Refract through <span class="italic">glass</span>.
			</h2>
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
							aria-label="Crystal orb glass effect"
						/>
					</div>
					<figcaption>§ 06.01 / CRYSTAL ORB</figcaption>
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
							aria-label="Soft lens glass effect"
						/>
					</div>
					<figcaption>§ 06.02 / SOFT LENS</figcaption>
				</figure>
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
							aria-label="Portal ring glass effect"
						/>
					</div>
					<figcaption>§ 06.03 / PORTAL RING</figcaption>
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
							aria-label="Glass frame effect"
						/>
					</div>
					<figcaption>§ 06.04 / GLASS FRAME</figcaption>
				</figure>
			</div>
		</div>
	</section>

	<section class="flreveal-section" bind:this={revealEls[9]}>
		<div class="section-inner">
			<div class="eyebrow centered">§ 07 — Reveal</div>
			<h2 class="display-head centered-head">
				Uncover with <span class="italic">FluidReveal</span>.
			</h2>
			<div class="flreveal-grid">
				<figure class="flreveal-cell">
					<div class="flreveal-canvas" aria-label="Scratch-to-reveal demo">
						<FluidReveal
							lazy
							velocityDissipation={0.95}
							pressureIterations={10}
						>
							<div class="reveal-gradient">
								<span class="reveal-label">Revealed!</span>
							</div>
						</FluidReveal>
					</div>
					<figcaption>§ 07.01 / SCRATCH TO REVEAL</figcaption>
				</figure>
				<figure class="flreveal-cell">
					<div class="flreveal-canvas" aria-label="Auto-reveal demo">
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
							<div class="reveal-stars">
								<span class="reveal-label">Auto Reveal</span>
							</div>
						</FluidReveal>
					</div>
					<figcaption>§ 07.02 / AUTO-REVEAL</figcaption>
				</figure>
			</div>
		</div>
	</section>

	<section class="play-section" bind:this={revealEls[10]}>
		<div class="play-inner">
			<div class="eyebrow centered">§ 08 — Play</div>
			<h2 class="display-head centered-head">
				<span class="italic">Try</span> it.
			</h2>
			<p class="play-desc">
				Drag the knobs. The fluid updates in real time.
			</p>

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
						<div class="knob-group-title">Physics</div>
						<label class="knob-row">
							<span class="knob-label">curl</span>
							<input
								type="range"
								min="0"
								max="50"
								step="1"
								bind:value={pgCurl}
								oninput={markCustomEdit}
							/>
							<span class="knob-value">{pgCurl}</span>
						</label>
						<label class="knob-row">
							<span class="knob-label">splatRadius</span>
							<input
								type="range"
								min="0.05"
								max="1"
								step="0.01"
								bind:value={pgSplatRadius}
								oninput={markCustomEdit}
							/>
							<span class="knob-value">{pgSplatRadius.toFixed(2)}</span>
						</label>
						<label class="knob-row">
							<span class="knob-label">splatForce</span>
							<input
								type="range"
								min="1000"
								max="9000"
								step="100"
								bind:value={pgSplatForce}
								oninput={markCustomEdit}
							/>
							<span class="knob-value">{pgSplatForce}</span>
						</label>
						<label class="knob-row">
							<span class="knob-label">densityDiss.</span>
							<input
								type="range"
								min="0"
								max="1"
								step="0.01"
								bind:value={pgDensityDissipation}
								oninput={markCustomEdit}
							/>
							<span class="knob-value">{pgDensityDissipation.toFixed(2)}</span>
						</label>
						<label class="knob-row">
							<span class="knob-label">velocityDiss.</span>
							<input
								type="range"
								min="0"
								max="1"
								step="0.01"
								bind:value={pgVelocityDissipation}
								oninput={markCustomEdit}
							/>
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
							<input
								type="color"
								value={pgBackColorHex}
								oninput={onBackColorInput}
								aria-label="Background color"
							/>
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
			</div>
		</div>
	</section>

	<section class="manifest-section" bind:this={revealEls[6]}>
		<div class="manifest-inner">
			<div class="eyebrow">§ 09 — Manifest</div>
			<ol class="manifest-list">
				{#each manifest as f, i (f)}
					<li>
						<span class="m-num">{pad(i + 1)}</span>
						<span class="m-dash">—</span>
						<span class="m-text italic">{f}.</span>
					</li>
				{/each}
			</ol>
		</div>
	</section>

	<footer class="footer">
		<div class="footer-rule"></div>
		<div class="footer-top">
			<div class="footer-brand">svelte<span class="dash">—</span>fluid</div>
			<div class="footer-version">v0.2.2</div>
		</div>
		<div class="footer-grid">
			<div class="footer-col">
				<div class="footer-col-head">Library</div>
				<a href="https://github.com/tommyyzhao/svelte-fluid" target="_blank" rel="noreferrer">
					GitHub
				</a>
				<a href="{base}/docs">Docs</a>
				<a
					href="https://github.com/tommyyzhao/svelte-fluid/issues"
					target="_blank"
					rel="noreferrer"
				>
					Issues
				</a>
				<a
					href="https://github.com/tommyyzhao/svelte-fluid/blob/main/LICENSE"
					target="_blank"
					rel="noreferrer"
				>
					MIT License
				</a>
			</div>
			<div class="footer-col">
				<div class="footer-col-head">Project</div>
				<a
					href="https://github.com/tommyyzhao/svelte-fluid/blob/main/CONTRIBUTING.md"
					target="_blank"
					rel="noreferrer"
				>
					Contributing
				</a>
				<a
					href="https://github.com/tommyyzhao/svelte-fluid/blob/main/CHANGELOG.md"
					target="_blank"
					rel="noreferrer"
				>
					Changelog
				</a>
				<a
					href="https://github.com/tommyyzhao/svelte-fluid/discussions"
					target="_blank"
					rel="noreferrer"
				>
					Discussions
				</a>
			</div>
			<div class="footer-col">
				<div class="footer-col-head">Credit</div>
				<p class="footer-credit-body">
					Derivative work of
					<a
						href="https://github.com/PavelDoGreat/WebGL-Fluid-Simulation"
						target="_blank"
						rel="noreferrer"
					>
						PavelDoGreat/WebGL-Fluid-Simulation
					</a>
					by Pavel Dobryakov (c) 2017.
				</p>
			</div>
		</div>
		<div class="footer-bottom">© {new Date().getFullYear()} svelte-fluid contributors.</div>
	</footer>
</div>

<style>
	:global(html) {
		scroll-behavior: smooth;
	}

	:global(html, body) {
		margin: 0;
		padding: 0;
		background: #0a0a0a;
	}

	.page {
		min-height: 100vh;
		background: #0a0a0a;
		color: #fafafa;
		font-family: 'Geist', 'Inter', system-ui, -apple-system, sans-serif;
		font-feature-settings: 'ss01', 'cv11';
		-webkit-font-smoothing: antialiased;
		letter-spacing: -0.005em;
	}

	.italic {
		font-family: 'Instrument Serif', 'EB Garamond', Georgia, serif;
		font-style: italic;
		font-weight: 400;
		letter-spacing: 0;
	}

	.nav-bar {
		position: sticky;
		top: 0;
		z-index: 50;
		height: 56px;
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		background: rgba(10, 10, 10, 0.55);
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}

	.nav-inner {
		max-width: 1280px;
		height: 100%;
		margin: 0 auto;
		padding: 0 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.brand {
		color: #fafafa;
		text-decoration: none;
		font-size: 0.95rem;
		font-weight: 500;
		letter-spacing: -0.01em;
	}

	.dash {
		opacity: 0.55;
		margin: 0 0.05em;
	}

	.nav-links {
		display: flex;
		align-items: center;
		gap: 1.75rem;
	}

	.nav-links a {
		color: rgba(255, 255, 255, 0.6);
		text-decoration: none;
		font-size: 0.85rem;
		font-weight: 500;
		transition: color 0.18s ease;
	}

	.nav-links a:hover {
		color: #fff8e7;
	}

	.hero {
		position: relative;
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: space-between;
		overflow: hidden;
		background: #050505;
	}

	.hero-scrim {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 40%;
		z-index: 1;
		background: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.5) 100%);
		pointer-events: none;
	}

	.hero-eyebrow {
		position: relative;
		z-index: 2;
		margin-top: clamp(1.5rem, 4vh, 3rem);
		font-family: ui-monospace, 'Geist Mono', 'JetBrains Mono', Menlo, monospace;
		font-size: 0.7rem;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.55);
		pointer-events: none;
	}

	.hero-overlay-card {
		position: relative;
		z-index: 2;
		margin-bottom: clamp(2rem, 6vh, 4rem);
		max-width: 640px;
		padding: 24px 32px;
		background: rgba(8, 8, 10, 0.55);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.1rem;
		text-align: center;
	}

	.tagline {
		margin: 0;
		font-size: clamp(0.98rem, 1.2vw, 1.1rem);
		line-height: 1.55;
		color: rgba(255, 255, 255, 0.78);
		max-width: 50ch;
	}

	.tagline .italic {
		color: rgba(255, 255, 255, 0.92);
		font-size: 1.08em;
	}

	.cta-row {
		display: flex;
		gap: 0.7rem;
		flex-wrap: wrap;
		justify-content: center;
	}

	.cta {
		display: inline-flex;
		align-items: center;
		padding: 0.65rem 1.3rem;
		border-radius: 999px;
		font-size: 0.84rem;
		font-weight: 500;
		text-decoration: none;
		letter-spacing: 0.02em;
		transition:
			background 0.18s ease,
			border-color 0.18s ease,
			color 0.18s ease;
	}

	.cta.primary {
		background: #fafafa;
		color: #0a0a0a;
	}

	.cta.primary:hover {
		background: #fff8e7;
	}

	.cta.ghost {
		color: #fafafa;
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.cta.ghost:hover {
		border-color: #fff8e7;
		color: #fff8e7;
	}

	.eyebrow {
		font-family: ui-monospace, 'Geist Mono', 'JetBrains Mono', monospace;
		font-size: 0.7rem;
		letter-spacing: 0.24em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.55);
	}

	.eyebrow.muted {
		color: rgba(255, 255, 255, 0.65);
	}

	.eyebrow.centered {
		display: block;
		text-align: center;
		margin-bottom: 2.4rem;
	}

	.display-head {
		font-family: 'Geist', 'Inter', system-ui, sans-serif;
		font-weight: 600;
		font-size: clamp(2.2rem, 4.6vw, 3.6rem);
		line-height: 1.04;
		letter-spacing: -0.025em;
		margin: 0 0 1.4rem;
		color: #fafafa;
	}

	.display-head.small {
		font-size: clamp(1.6rem, 2.6vw, 2.2rem);
		margin-bottom: 0.8rem;
	}

	.centered-head {
		text-align: center;
		margin-bottom: 3rem;
	}

	.body-copy {
		font-size: 1rem;
		line-height: 1.65;
		color: rgba(255, 255, 255, 0.7);
		max-width: 42ch;
		margin: 0 0 1.6rem;
	}

	.body-copy.small {
		font-size: 0.88rem;
		margin-bottom: 1rem;
	}

	.source-link {
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.78rem;
		letter-spacing: 0.1em;
		text-transform: lowercase;
		color: #fafafa;
		text-decoration: none;
		border-bottom: 1px solid rgba(255, 255, 255, 0.3);
		padding-bottom: 0.2rem;
		align-self: flex-start;
		transition:
			color 0.18s ease,
			border-color 0.18s ease;
	}

	.source-link:hover {
		color: #fff8e7;
		border-bottom-color: #fff8e7;
	}

	/* Install */
	.install-section {
		padding-block: 7rem;
		padding-inline: 1.5rem;
		display: flex;
		justify-content: center;
		background: #0a0a0a;
	}

	.install-inner {
		width: 100%;
		max-width: 720px;
	}

	.install-card {
		background: #0d0d0e;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 6px;
		overflow: hidden;
		text-align: left;
	}

	.install-tabs {
		display: flex;
		gap: 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		background: rgba(255, 255, 255, 0.015);
	}

	.install-tab {
		flex: 1;
		padding: 0.7rem 0.6rem;
		background: transparent;
		border: 0;
		border-right: 1px solid rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.55);
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.78rem;
		letter-spacing: 0.08em;
		cursor: pointer;
		transition:
			color 0.18s ease,
			background 0.18s ease;
	}

	.install-tab:last-child {
		border-right: 0;
	}

	.install-tab:hover {
		color: #fafafa;
	}

	.install-tab.active {
		background: rgba(255, 255, 255, 0.05);
		color: #fafafa;
	}

	.code-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.15rem 1.3rem;
		background: #060607;
	}

	.install-code {
		flex: 1;
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.95rem;
		color: #fafafa;
		overflow-x: auto;
		white-space: nowrap;
	}

	.copy-btn {
		padding: 0.4rem 0.85rem;
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.14);
		color: rgba(255, 255, 255, 0.7);
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.7rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		border-radius: 4px;
		cursor: pointer;
		transition:
			border-color 0.18s ease,
			color 0.18s ease;
		min-width: 4.5rem;
	}

	.copy-btn:hover {
		border-color: #fff8e7;
		color: #fff8e7;
	}

	.copy-btn.small {
		padding: 0.26rem 0.6rem;
		font-size: 0.64rem;
		min-width: 4rem;
	}

	.divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.06);
	}

	.usage-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.7rem 1rem;
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.7rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.65);
		border-bottom: 1px solid rgba(255, 255, 255, 0.04);
	}

	.usage-code {
		margin: 0;
		padding: 1rem 1.25rem 1.2rem;
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.82rem;
		line-height: 1.6;
		color: rgba(255, 255, 255, 0.86);
		background: #060607;
		overflow-x: auto;
		white-space: pre;
	}

	/* Full-bleed plasma showcase */
	.bleed {
		position: relative;
		min-height: 80vh;
		background: #000;
		overflow: hidden;
	}

	.bleed-canvas {
		position: absolute;
		inset: 0;
	}

	.glass-caption {
		position: absolute;
		left: clamp(1.25rem, 4vw, 3rem);
		bottom: clamp(1.5rem, 5vw, 3rem);
		max-width: 36ch;
		padding: 1.5rem 1.6rem;
		background: rgba(8, 8, 10, 0.55);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		z-index: 2;
		display: flex;
		flex-direction: column;
	}

	.glass-caption .eyebrow {
		margin-bottom: 0.8rem;
	}

	/* Preset grid: 3×2 stylistic, zero-gap shared borders, ≥380px cells */
	.preset-grid-section {
		background: #0a0a0a;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		padding-top: 5rem;
	}

	.preset-grid-section .section-inner {
		max-width: 1280px;
		margin: 0 auto;
		padding-inline: 1.5rem;
	}

	.preset-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0;
	}

	.preset-cell {
		position: relative;
		border-right: 1px solid rgba(255, 255, 255, 0.06);
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		overflow: hidden;
	}

	.preset-cell:nth-child(3n) {
		border-right: 0;
	}

	.preset-cell:nth-last-child(-n + 3) {
		border-bottom: 0;
	}

	.cell-label {
		position: absolute;
		top: 12px;
		left: 14px;
		z-index: 2;
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.64rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.78);
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.7);
	}

	.cell-canvas {
		position: relative;
		height: 380px;
		background: #050505;
	}

	.cell-hover {
		position: absolute;
		bottom: 12px;
		right: 14px;
		z-index: 2;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.4rem;
		opacity: 0;
		transition: opacity 0.2s ease;
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.7);
	}

	.preset-cell:hover .cell-hover,
	.preset-cell:focus-within .cell-hover {
		opacity: 1;
	}

	.cell-snippet {
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.72rem;
		color: rgba(255, 255, 255, 0.85);
		background: rgba(0, 0, 0, 0.45);
		padding: 0.25rem 0.55rem;
		border-radius: 3px;
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
	}

	.cell-source {
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.85);
		text-decoration: none;
		letter-spacing: 0.08em;
	}

	.cell-source:hover {
		color: #fff8e7;
	}

	/* Shape, sticky, distort common */
	.shape-section,
	.sticky-section,
	.distort-section {
		padding-block: 7rem;
		padding-inline: 1.5rem;
		background: #0a0a0a;
	}

	.section-inner {
		max-width: 1280px;
		margin: 0 auto;
	}

	/* Shape grid: 3×2 SQUARE cells (aspect-ratio:1 critical for circles) */
	.shape-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
	}

	.shape-cell {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}

	.shape-stage {
		position: relative;
		aspect-ratio: 1 / 1;
		background: #050505;
		border: 1px solid rgba(255, 255, 255, 0.05);
		border-radius: 4px;
		overflow: hidden;
	}

	.shape-caption {
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.55);
	}

	.sticky-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.25rem;
	}

	.sticky-cell {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}

	.sticky-stage {
		position: relative;
		height: 320px;
		background: #050505;
		border: 1px solid rgba(255, 255, 255, 0.05);
		border-radius: 4px;
		overflow: hidden;
	}

	.distort-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.25rem;
	}

	.distort-cell {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}

	.distort-stage {
		position: relative;
		height: 480px;
		background: #050505;
		border: 1px solid rgba(255, 255, 255, 0.05);
		border-radius: 4px;
		overflow: hidden;
	}

	/* Manifest */
	.manifest-section {
		padding-block: 9rem;
		padding-inline: 1.5rem;
		display: flex;
		justify-content: center;
		background: #0a0a0a;
	}

	.manifest-inner {
		width: 100%;
		max-width: 720px;
	}

	.manifest-inner .eyebrow {
		margin-bottom: 2.6rem;
	}

	.manifest-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.manifest-list li {
		display: flex;
		align-items: baseline;
		gap: 0.6em;
		font-family: 'Instrument Serif', 'EB Garamond', Georgia, serif;
		font-style: italic;
		font-weight: 400;
		font-size: clamp(1.6rem, 3.6vw, 2.6rem);
		line-height: 1.2;
		letter-spacing: -0.005em;
		color: #fafafa;
	}

	.m-num {
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-style: normal;
		font-size: 0.38em;
		letter-spacing: 0.2em;
		color: rgba(255, 255, 255, 0.65);
		min-width: 2.5em;
	}

	.m-dash {
		opacity: 0.45;
		font-style: normal;
	}

	/* Footer */
	.footer {
		padding: 2.4rem 1.5rem 3.4rem;
		background: #0a0a0a;
	}

	.footer-rule {
		max-width: 1280px;
		margin: 0 auto 1.6rem;
		height: 1px;
		background: rgba(255, 255, 255, 0.08);
	}

	.footer-top {
		max-width: 1280px;
		margin: 0 auto 2rem;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
	}

	.footer-brand {
		font-size: 0.95rem;
		font-weight: 500;
		color: #fafafa;
	}

	.footer-version {
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.74rem;
		letter-spacing: 0.14em;
		color: rgba(255, 255, 255, 0.65);
	}

	.footer-grid {
		max-width: 1280px;
		margin: 0 auto;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 2rem;
	}

	.footer-col {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.footer-col-head {
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.65);
		margin-bottom: 0.4rem;
	}

	.footer-col a {
		color: rgba(255, 255, 255, 0.7);
		text-decoration: none;
		font-size: 0.82rem;
		transition: color 0.18s ease;
	}

	.footer-col a:hover {
		color: #fff8e7;
	}

	.footer-credit-body {
		margin: 0;
		font-size: 0.76rem;
		line-height: 1.55;
		color: rgba(255, 255, 255, 0.65);
	}

	.footer-credit-body a {
		color: rgba(255, 255, 255, 0.7);
		text-decoration: underline;
		text-decoration-color: rgba(255, 255, 255, 0.2);
	}

	.footer-credit-body a:hover {
		color: #fff8e7;
	}

	.footer-bottom {
		max-width: 1280px;
		margin: 2.4rem auto 0;
		font-size: 0.74rem;
		color: rgba(255, 255, 255, 0.65);
	}

	/* Competition back-link */
	.competition-back {
		position: fixed;
		top: 1rem;
		left: 1rem;
		z-index: 200;
		font-size: 0.75rem;
		font-weight: 500;
		letter-spacing: 0.05em;
		color: rgba(255, 255, 255, 0.65);
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

	/* Physics section */
	.physics-section {
		padding-block: 7rem;
		padding-inline: 1.5rem;
		background: #0a0a0a;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}

	.physics-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1.25rem;
		margin-top: 2.4rem;
	}

	.physics-cell {
		display: flex;
		flex-direction: column;
		position: relative;
	}

	.physics-canvas {
		position: relative;
		height: 280px;
		background: #050505;
		border: 1px solid rgba(255, 255, 255, 0.05);
		border-radius: 4px;
		overflow: hidden;
	}

	.physics-snippet {
		display: block;
		margin-top: 0.7rem;
		padding: 0.45rem 0.6rem;
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.68rem;
		line-height: 1.4;
		color: rgba(255, 255, 255, 0.65);
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 4px;
		overflow-x: auto;
		white-space: nowrap;
	}

	/* Glass section */
	.glass-section {
		padding-block: 7rem;
		padding-inline: 1.5rem;
		background: #0a0a0a;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}

	.glass-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.25rem;
	}

	.glass-cell {
		margin: 0;
	}

	.glass-canvas {
		position: relative;
		height: 360px;
		background: #050505;
		border: 1px solid rgba(255, 255, 255, 0.05);
		border-radius: 4px;
		overflow: hidden;
		cursor: crosshair;
	}

	.glass-cell figcaption {
		margin-top: 0.65rem;
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.2em;
		color: rgba(255, 255, 255, 0.55);
	}

	/* Reveal section */
	.flreveal-section {
		padding-block: 7rem;
		padding-inline: 1.5rem;
		background: #0a0a0a;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}

	.flreveal-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.25rem;
	}

	.flreveal-cell {
		margin: 0;
	}

	.flreveal-canvas {
		position: relative;
		height: 360px;
		background: #050505;
		border: 1px solid rgba(255, 255, 255, 0.05);
		border-radius: 4px;
		overflow: hidden;
		cursor: crosshair;
	}

	.flreveal-cell figcaption {
		margin-top: 0.65rem;
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.2em;
		color: rgba(255, 255, 255, 0.55);
	}

	.reveal-gradient {
		width: 100%;
		height: 100%;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: inherit;
	}

	.reveal-stars {
		width: 100%;
		height: 100%;
		background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: inherit;
	}

	.reveal-label {
		font-family: 'Geist', 'Inter', system-ui, sans-serif;
		font-weight: 700;
		font-size: clamp(1.6rem, 3.2vw, 2.4rem);
		color: #ffffff;
		letter-spacing: -0.02em;
		text-align: center;
	}

	/* Playground section */
	.play-section {
		padding-block: 7rem;
		padding-inline: 1.5rem;
		background: #0a0a0a;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}

	.play-inner {
		max-width: 1100px;
		margin: 0 auto;
	}

	.play-desc {
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.78rem;
		letter-spacing: 0.05em;
		color: rgba(255, 255, 255, 0.55);
		text-align: center;
		margin: 0 auto 2rem;
		max-width: 48ch;
		line-height: 1.6;
	}

	.preset-chips {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
		margin: 0 auto 1.8rem;
		max-width: 100%;
	}

	.preset-chip {
		padding: 0.42rem 0.95rem;
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.12);
		color: rgba(255, 255, 255, 0.7);
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border-radius: 999px;
		cursor: pointer;
		transition:
			border-color 0.18s ease,
			color 0.18s ease,
			background 0.18s ease;
	}

	.preset-chip:hover {
		border-color: rgba(255, 248, 231, 0.6);
		color: #fff8e7;
	}

	.preset-chip.active {
		background: rgba(255, 248, 231, 0.08);
		border-color: #fff8e7;
		color: #fff8e7;
	}

	.preset-chip.reset {
		opacity: 0.7;
	}

	.playground-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 320px;
		gap: 1.25rem;
		align-items: stretch;
	}

	.playground-canvas {
		position: relative;
		height: 520px;
		background: #050505;
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 6px;
		overflow: hidden;
		cursor: crosshair;
	}

	.playground-panel {
		background: rgba(13, 13, 14, 0.95);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 6px;
		padding: 1.1rem 1.1rem 1.2rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		overflow: hidden;
	}

	.knob-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.knob-group-title {
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.55);
		margin-bottom: 0.2rem;
	}

	.knob-row {
		display: grid;
		grid-template-columns: 7rem minmax(0, 1fr) 3.2rem;
		align-items: center;
		gap: 0.55rem;
	}

	.knob-label {
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.72rem;
		color: rgba(255, 255, 255, 0.72);
		letter-spacing: 0.02em;
	}

	.knob-value {
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.72rem;
		color: rgba(255, 255, 255, 0.55);
		text-align: right;
	}

	.knob-value.mono {
		text-transform: lowercase;
	}

	.knob-row input[type='range'] {
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 2px;
		background: rgba(255, 255, 255, 0.14);
		border-radius: 1px;
		outline: none;
		cursor: pointer;
	}

	.knob-row input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #fafafa;
		border: 1px solid rgba(0, 0, 0, 0.4);
		cursor: pointer;
		transition: transform 0.15s ease;
	}

	.knob-row input[type='range']::-moz-range-thumb {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #fafafa;
		border: 1px solid rgba(0, 0, 0, 0.4);
		cursor: pointer;
	}

	.knob-row input[type='range']:hover::-webkit-slider-thumb {
		transform: scale(1.18);
	}

	.toggle-row {
		display: grid;
		grid-template-columns: 32px auto 1fr;
		align-items: center;
		gap: 0.55rem;
		cursor: pointer;
		padding: 0.18rem 0;
	}

	.toggle-row input[type='checkbox'] {
		position: absolute;
		opacity: 0;
		pointer-events: none;
		width: 0;
		height: 0;
	}

	.toggle-pill {
		position: relative;
		display: inline-block;
		width: 28px;
		height: 16px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.14);
		transition:
			background 0.18s ease,
			border-color 0.18s ease;
	}

	.toggle-pill::after {
		content: '';
		position: absolute;
		top: 1px;
		left: 1px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.55);
		transition:
			transform 0.18s ease,
			background 0.18s ease;
	}

	.toggle-row input[type='checkbox']:checked ~ .toggle-pill {
		background: rgba(255, 248, 231, 0.18);
		border-color: rgba(255, 248, 231, 0.5);
	}

	.toggle-row input[type='checkbox']:checked ~ .toggle-pill::after {
		transform: translateX(12px);
		background: #fff8e7;
	}

	.color-row {
		display: grid;
		grid-template-columns: 7rem 28px minmax(0, 1fr);
		align-items: center;
		gap: 0.55rem;
		cursor: pointer;
	}

	.color-row input[type='color'] {
		appearance: none;
		-webkit-appearance: none;
		width: 28px;
		height: 22px;
		padding: 0;
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 4px;
		background: transparent;
		cursor: pointer;
	}

	.color-row input[type='color']::-webkit-color-swatch-wrapper {
		padding: 0;
	}

	.color-row input[type='color']::-webkit-color-swatch {
		border: 0;
		border-radius: 3px;
	}

	.snippet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.55rem 0.1rem 0;
		margin-top: 0.4rem;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.65);
	}

	.snippet-code {
		margin: 0;
		padding: 0.7rem 0.85rem;
		font-family: ui-monospace, 'Geist Mono', monospace;
		font-size: 0.74rem;
		line-height: 1.55;
		color: rgba(255, 255, 255, 0.85);
		background: #050505;
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 4px;
		overflow-x: auto;
		white-space: pre;
	}

	/* Scroll-reveal animation */
	.install-section,
	.bleed,
	.preset-grid-section,
	.shape-section,
	.sticky-section,
	.distort-section,
	.physics-section,
	.glass-section,
	.flreveal-section,
	.play-section,
	.manifest-section {
		opacity: 0;
		transform: translateY(14px);
		transition:
			opacity 0.7s ease,
			transform 0.7s ease;
	}

	:global(.install-section.is-visible),
	:global(.bleed.is-visible),
	:global(.preset-grid-section.is-visible),
	:global(.shape-section.is-visible),
	:global(.sticky-section.is-visible),
	:global(.distort-section.is-visible),
	:global(.physics-section.is-visible),
	:global(.glass-section.is-visible),
	:global(.flreveal-section.is-visible),
	:global(.play-section.is-visible),
	:global(.manifest-section.is-visible) {
		opacity: 1;
		transform: translateY(0);
	}

	/* 3-col → 2-col at <960px */
	@media (max-width: 960px) {
		.preset-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.preset-cell {
			border-right: 1px solid rgba(255, 255, 255, 0.06);
			border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		}
		.preset-cell:nth-child(3n) {
			border-right: 1px solid rgba(255, 255, 255, 0.06);
		}
		.preset-cell:nth-child(2n) {
			border-right: 0;
		}
		.preset-cell:nth-last-child(-n + 3) {
			border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		}
		.preset-cell:nth-last-child(-n + 2) {
			border-bottom: 0;
		}
		.footer-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.physics-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.playground-grid {
			grid-template-columns: 1fr;
		}
		.playground-canvas {
			height: 400px;
		}
	}

	/* Shape grid: 3-col → 2-col at <720px, never 1-col (keep square) */
	@media (max-width: 720px) {
		.shape-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.glass-grid,
		.flreveal-grid {
			grid-template-columns: 1fr;
		}
	}

	/* 2-col → 1-col at <640px */
	@media (max-width: 640px) {
		.nav-links {
			gap: 1.1rem;
		}
		.nav-links a {
			font-size: 0.8rem;
		}
		.preset-grid {
			grid-template-columns: 1fr;
		}
		.preset-cell {
			border-right: 0;
		}
		.preset-cell:nth-child(3n),
		.preset-cell:nth-child(2n) {
			border-right: 0;
		}
		.sticky-grid {
			grid-template-columns: 1fr;
		}
		.distort-grid {
			grid-template-columns: 1fr;
		}
		.distort-stage {
			height: 360px;
		}
		.footer-grid {
			grid-template-columns: 1fr;
		}
		.install-section,
		.shape-section,
		.sticky-section,
		.distort-section,
		.physics-section,
		.glass-section,
		.flreveal-section,
		.play-section {
			padding-block: 5rem;
		}
		.manifest-section {
			padding-block: 6rem;
		}
		.hero-overlay-card {
			margin-inline: 1rem;
			padding: 18px 22px;
		}
		.cell-canvas {
			height: 320px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		:global(html) {
			scroll-behavior: auto;
		}
		.install-section,
		.bleed,
		.preset-grid-section,
		.shape-section,
		.sticky-section,
		.distort-section,
		.physics-section,
		.glass-section,
		.flreveal-section,
		.play-section,
		.manifest-section {
			opacity: 1;
			transform: none;
			transition: none;
		}
	}
</style>
