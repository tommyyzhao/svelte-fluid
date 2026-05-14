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

	type PM = 'bun' | 'npm' | 'pnpm' | 'yarn';

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

	async function copyInstall() {
		try {
			await navigator.clipboard.writeText(installCmds[activeTab]);
			copiedInstall = true;
			setTimeout(() => (copiedInstall = false), 1600);
		} catch {
			copiedInstall = false;
		}
	}

	async function copyUsage() {
		try {
			await navigator.clipboard.writeText(usage);
			copiedUsage = true;
			setTimeout(() => (copiedUsage = false), 1600);
		} catch {
			copiedUsage = false;
		}
	}

	const specs = [
		{ label: 'Version', value: '0.2.2' },
		{ label: 'License', value: 'MIT' },
		{ label: 'Instances', value: 'multiple per page' },
		{ label: 'Resolution', value: 'resize-stable' },
		{ label: 'Framework', value: 'Svelte 5 runes' },
		{ label: 'Runtime deps', value: 'zero' },
		{ label: 'Presets', value: 'ten built-in' },
		{ label: 'Config props', value: 'seventy plus' }
	];

	const presets = [
		{ idx: '01', name: 'LavaLamp', component: LavaLamp, seed: 11, lazy: false },
		{ idx: '02', name: 'Plasma', component: Plasma, seed: 22, lazy: false },
		{ idx: '03', name: 'InkInWater', component: InkInWater, seed: 33, lazy: false },
		{ idx: '04', name: 'FrozenSwirl', component: FrozenSwirl, seed: 44, lazy: true },
		{ idx: '05', name: 'Aurora', component: Aurora, seed: 55, lazy: true },
		{ idx: '06', name: 'ToroidalTempest', component: ToroidalTempest, seed: 66, lazy: true }
	];

	const features = [
		{ n: '01', t: 'Multi-instance', d: 'Many engines coexist on one page with isolated GL state.' },
		{ n: '02', t: 'Resize-stable', d: 'FBOs rebuild on stable size; survives observer storms.' },
		{ n: '03', t: 'Deterministic', d: 'A seed in. The same fluid out. Frame for frame.' },
		{ n: '04', t: 'Configurable', d: 'Seventy-plus props, hot-swappable at runtime.' },
		{ n: '05', t: 'Zero deps', d: 'Pure Svelte 5 and WebGL. Nothing else in your bundle.' },
		{ n: '06', t: 'MIT licensed', d: 'Use it, fork it, ship it. Attribution kept honest.' }
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
	<title>svelte-fluid — Editorial Dark</title>
</svelte:head>

<a class="competition-back" href="{base}/design-competition">← Competition</a>

<main class="page">
	<header class="topbar">
		<span class="wordmark">svelte-fluid</span>
		<nav class="topnav">
			<a href="{base}/docs">DOCS</a>
			<span class="dot">·</span>
			<a href="https://github.com/tommyyzhao/svelte-fluid" target="_blank" rel="noreferrer">GITHUB</a>
			<span class="dot">·</span>
			<a href="{base}/docs">README</a>
		</nav>
	</header>

	<section class="hero">
		<div class="gutter">§ 01</div>
		<div class="hero-grid">
			<div class="hero-copy">
				<div class="eyebrow">WebGL fluid for Svelte 5</div>
				<h1 class="display">Fluid, as a component.</h1>
				<p class="subtitle">
					WebGL fluid simulation as a Svelte 5 component. Multi-instance, resize-stable,
					deterministic seeding.
				</p>
				<div class="hero-links">
					<a class="hero-link" href="{base}/docs">Read the documentation</a>
					<a
						class="hero-link"
						href="https://github.com/tommyyzhao/svelte-fluid"
						target="_blank"
						rel="noreferrer">View on GitHub</a
					>
				</div>
			</div>
			<div class="hero-stage">
				<Fluid
					seed={7}
					autoSplatRate={6}
					autoSplatCount={4}
					autoSplatSwirl={300}
					splatOnHover
					colorful
					shading
				/>
			</div>
		</div>
	</section>

	<section class="install">
		<div class="gutter">§ 02</div>
		<div class="install-grid">
			<div class="install-head">
				<div class="eyebrow">01</div>
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
						{copiedInstall ? 'Copied' : 'Copy'}
					</button>
				</div>
				<div class="rule"></div>
				<div class="snippet-head">
					<span class="eyebrow">Minimal usage</span>
					<button class="copy" onclick={copyUsage} aria-label="Copy usage snippet">
						{copiedUsage ? 'Copied' : 'Copy'}
					</button>
				</div>
				<pre class="snippet"><code>{usage}</code></pre>
			</div>
		</div>
	</section>

	<section class="specs">
		<div class="gutter">§ 03</div>
		<div class="spec-grid">
			{#each specs as s (s.label)}
				<div class="spec-row">
					<dt>{s.label}</dt>
					<dd>{s.value}</dd>
				</div>
			{/each}
		</div>
	</section>

	<section class="presets-head">
		<div class="gutter">§ 04</div>
		<h2 class="serif center">Six preset components.</h2>
		<p class="center muted">Each fills its parent. Each accepts a seed. Each ships ready.</p>
	</section>

	<section class="presets">
		<div class="gutter">§ 05</div>
		<div class="preset-grid">
			{#each presets as p, i (p.name)}
				{@const C = p.component}
				<article class="preset-cell">
					<div class="cell-label">§ 05.{p.idx} / {p.name.toUpperCase()}</div>
					<div class="cell-canvas">
						{#if p.lazy}
							<C seed={p.seed} lazy aria-label="{p.name} preset" />
						{:else}
							<C seed={p.seed} aria-label="{p.name} preset" />
						{/if}
					</div>
					<a class="cell-link" href="{base}/docs/presets">→</a>
					{#if i % 3 !== 2}<div class="cell-vline"></div>{/if}
				</article>
			{/each}
		</div>
	</section>

	<section class="features">
		<div class="gutter">§ 06</div>
		<ol class="feature-list">
			{#each features as f (f.n)}
				<li>
					<span class="f-n">{f.n}</span>
					<span class="f-t">{f.t}</span>
					<span class="f-d">— {f.d}</span>
				</li>
			{/each}
		</ol>
	</section>

	<!-- Shapes -->
	<section class="shapes-section">
		<div class="gutter">§ 07</div>
		<div class="section-head">
			<div class="section-numeral">07</div>
			<h2 class="serif section-h2">Container shapes.</h2>
			<p class="section-sub muted">Six primitives — circle, rounded rect, frame, annulus, SVG path, and text glyph. Hover to splat.</p>
		</div>
		<div class="shapes-grid">
			<article class="shape-cell">
				<div class="cell-label">§ 07.01 Circle</div>
				<div class="cell-canvas">
					<CircularFluid seed={601} lazy splatOnHover aria-label="Circle container demo" />
				</div>
			</article>
			<article class="shape-cell">
				<div class="cell-label">§ 07.02 Rounded Rect</div>
				<div class="cell-canvas">
					<Fluid
						seed={602}
						colorful
						shading
						bloom
						splatOnHover
						lazy
						containerShape={{ type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.42, halfH: 0.42, cornerRadius: 0.08 }}
						aria-label="Rounded rect container demo"
					/>
				</div>
			</article>
			<article class="shape-cell">
				<div class="cell-label">§ 07.03 Frame</div>
				<div class="cell-canvas">
					<FrameFluid seed={603} lazy splatOnHover aria-label="Frame container demo" />
				</div>
			</article>
			<article class="shape-cell">
				<div class="cell-label">§ 07.04 Annulus</div>
				<div class="cell-canvas">
					<AnnularFluid seed={604} lazy splatOnHover aria-label="Annulus container demo" />
				</div>
			</article>
			<article class="shape-cell">
				<div class="cell-label">§ 07.05 SVG Path</div>
				<div class="cell-canvas">
					<Fluid
						seed={605}
						colorful
						shading
						bloom
						splatOnHover
						lazy
						containerShape={{ type: 'svgPath', d: lightning, viewBox: [0, 0, 100, 100] }}
						aria-label="SVG path lightning container demo"
					/>
				</div>
			</article>
			<article class="shape-cell">
				<div class="cell-label">§ 07.06 Text Glyph</div>
				<div class="cell-canvas">
					<Fluid
						seed={606}
						colorful
						shading
						bloom
						splatOnHover
						lazy
						containerShape={{ type: 'svgPath', text: '&', font: '900 280px Georgia, serif' }}
						aria-label="Text glyph container demo"
					/>
				</div>
			</article>
		</div>
	</section>

	<!-- Physics -->
	<section class="physics-section">
		<div class="gutter">§ 08</div>
		<div class="section-head">
			<div class="section-numeral">08</div>
			<h2 class="serif section-h2">Physics controls.</h2>
			<p class="section-sub muted">Every prop is optional. Drop in a tag for a finished look; reach for props when you want your own physics.</p>
		</div>
		<div class="physics-grid">
			<article class="physics-cell">
				<div class="cell-label">§ 08.01 Default</div>
				<div class="cell-canvas">
					<Fluid seed={1234} initialSplatCount={12} splatOnHover lazy aria-label="Default fluid configuration" />
				</div>
				<code class="physics-code">{'<Fluid />'}</code>
			</article>
			<article class="physics-cell">
				<div class="cell-label">§ 08.02 Flat + Soft</div>
				<div class="cell-canvas">
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
				<code class="physics-code">{'bloom={false} curl={5} densityDissipation={0.4}'}</code>
			</article>
			<article class="physics-cell">
				<div class="cell-label">§ 08.03 Bold Splats</div>
				<div class="cell-canvas">
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
				<code class="physics-code">{'shading={false} splatRadius={0.8} splatForce={9000}'}</code>
			</article>
			<article class="physics-cell">
				<div class="cell-label">§ 08.04 Slow + Transparent</div>
				<div class="cell-canvas">
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
				<code class="physics-code">{'velocityDissipation={0.05} densityDissipation={0.5} transparent'}</code>
			</article>
		</div>
	</section>

	<!-- Glass -->
	<section class="glass-section">
		<div class="gutter">§ 09</div>
		<div class="section-head">
			<div class="section-numeral">09</div>
			<h2 class="serif section-h2">Refraction.</h2>
			<p class="section-sub muted">Glass adds a lens — refraction at the wall, chromatic fringes at the edge. Use with any container shape.</p>
		</div>
		<div class="glass-grid">
			<article class="glass-cell">
				<div class="cell-label">§ 09.01 Crystal Orb</div>
				<div class="cell-canvas">
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
			</article>
			<article class="glass-cell">
				<div class="cell-label">§ 09.02 Soft Lens</div>
				<div class="cell-canvas">
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
			</article>
			<article class="glass-cell">
				<div class="cell-label">§ 09.03 Portal Ring</div>
				<div class="cell-canvas">
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
			</article>
			<article class="glass-cell">
				<div class="cell-label">§ 09.04 Glass Frame</div>
				<div class="cell-canvas">
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
			</article>
		</div>
	</section>

	<!-- Sticky -->
	<section class="sticky-section">
		<div class="gutter">§ 10</div>
		<div class="section-head">
			<div class="section-numeral">10</div>
			<h2 class="serif section-h2">Sticky text masks.</h2>
			<p class="section-sub muted">FluidStick masks the simulation with text or SVG paths. Hover to engage.</p>
		</div>
		<div class="sticky-grid">
			<article class="sticky-cell">
				<div class="cell-label">§ 10.01 Geist 900</div>
				<div class="cell-canvas">
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
			</article>
			<article class="sticky-cell">
				<div class="cell-label">§ 10.02 Georgia · ∞</div>
				<div class="cell-canvas">
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
			</article>
		</div>
	</section>

	<!-- Reveal -->
	<section class="reveal-section">
		<div class="gutter">§ 11</div>
		<div class="section-head">
			<div class="section-numeral">11</div>
			<h2 class="serif section-h2">FluidReveal.</h2>
			<p class="section-sub muted">FluidReveal uses the simulation as an opacity mask. Move the cursor to uncover what's underneath.</p>
		</div>
		<div class="reveal-grid">
			<article class="reveal-cell">
				<div class="cell-label">§ 11.01 Scratch to Reveal</div>
				<div class="cell-canvas">
					<FluidReveal lazy velocityDissipation={0.95} pressureIterations={10}>
						<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:1.5rem;color:#f0ede8;">Revealed</div>
					</FluidReveal>
				</div>
			</article>
			<article class="reveal-cell">
				<div class="cell-label">§ 11.02 Auto Reveal</div>
				<div class="cell-canvas">
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
						<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:1.5rem;color:#f0ede8;">Auto Reveal</div>
					</FluidReveal>
				</div>
			</article>
		</div>
	</section>

	<!-- Distortion -->
	<section class="distort-section">
		<div class="gutter">§ 12</div>
		<div class="section-head">
			<div class="section-numeral">12</div>
			<h2 class="serif section-h2">Image distortion.</h2>
			<p class="section-sub muted">FluidDistortion warps any source with the velocity field. Hover to engage.</p>
		</div>
		<div class="distort-grid">
			<article class="distort-cell">
				<div class="cell-label">§ 12.01 Subtle · Strength 0.3</div>
				<div class="cell-canvas">
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
				<div class="cell-label">§ 12.02 Strong · Strength 0.45</div>
				<div class="cell-canvas">
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

	<!-- Playground -->
	<section class="play-section">
		<div class="gutter">§ 13</div>
		<div class="section-head">
			<div class="section-numeral">13</div>
			<h2 class="serif section-h2">Playground.</h2>
			<p class="section-sub muted">Drag the knobs. The fluid updates in real time.</p>
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

				<div class="snippet-head-pg">
					<span>snippet</span>
					<button class="copy-btn" onclick={copySnippet} aria-label="Copy playground snippet">
						{copiedSnippet ? 'Copied!' : 'Copy'}
					</button>
				</div>
				<pre class="snippet-code"><code>{playgroundSnippet}</code></pre>
			</aside>
		</div>
	</section>

	<section class="quote">
		<div class="gutter">§ 14</div>
		<blockquote>
			<span class="oq" aria-hidden="true">&ldquo;</span>
			<p class="q-text">
				Multi-instance, resize-stable, deterministic seeding.
			</p>
			<footer class="q-cite">— ON THE DESIGN BRIEF</footer>
		</blockquote>
	</section>

	<footer class="page-footer">
		<div class="footer-rule"></div>
		<div class="footer-row">
			<div class="f-left">S V E L T E &nbsp;·&nbsp; F L U I D</div>
			<div class="f-mid">
				Derivative work of PavelDoGreat/WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017.
			</div>
			<div class="f-right">M I T &nbsp;·&nbsp; 2 0 2 6</div>
		</div>
	</footer>
</main>

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
		font-size: 0.75rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.45);
		text-decoration: none;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		padding: 0.35rem 0.7rem;
		transition: color 0.15s;
	}
	.competition-back:hover {
		color: #ffb84d;
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

	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 18px 0;
		border-bottom: 1px solid var(--hair);
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

	.center {
		text-align: center;
	}
	.muted {
		color: var(--muted);
	}

	.hero {
		position: relative;
		border-bottom: 1px solid var(--hair);
	}

	.hero-grid {
		display: grid;
		grid-template-columns: 40% 60%;
		min-height: 520px;
	}

	.hero-copy {
		padding: 56px 48px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 24px;
		border-right: 1px solid var(--hair);
	}

	.display {
		font-family: var(--serif);
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 0.95;
		font-size: clamp(2.6rem, 5vw, 4.4rem);
		margin: 0;
	}

	.subtitle {
		font-family: var(--serif);
		font-style: italic;
		font-weight: 400;
		font-size: 1.05rem;
		line-height: 1.5;
		color: var(--muted);
		max-width: 36ch;
		margin: 0;
	}

	.hero-links {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-top: 8px;
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
	}
	.hero-link:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	.hero-stage {
		position: relative;
		min-height: 520px;
	}

	.install {
		position: relative;
		border-bottom: 1px solid var(--hair);
	}

	.install-grid {
		display: grid;
		grid-template-columns: 33% 67%;
		min-height: 200px;
	}

	.install-head {
		padding: 40px 48px;
		border-right: 1px solid var(--hair);
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.install-head h2 {
		font-size: clamp(2.2rem, 3.8vw, 3rem);
	}

	.install-body {
		padding: 32px 48px;
		display: flex;
		flex-direction: column;
		gap: 18px;
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
		font-size: 1.05rem;
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

	.specs {
		position: relative;
		border-bottom: 1px solid var(--hair);
		padding: 36px 48px;
	}

	.spec-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		column-gap: 64px;
		margin: 0;
	}

	.spec-row {
		display: grid;
		grid-template-columns: 160px 1fr;
		gap: 16px;
		padding: 12px 0;
		border-bottom: 1px solid var(--hair);
		align-items: baseline;
	}
	.spec-row:nth-last-child(-n + 2) {
		border-bottom: 0;
	}

	.spec-row dt {
		font-family: var(--mono);
		font-size: 0.68rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.spec-row dd {
		margin: 0;
		font-family: var(--serif);
		font-style: italic;
		font-size: 1.05rem;
		color: var(--paper);
	}

	.presets-head {
		position: relative;
		padding: 56px 48px 32px;
		border-bottom: 1px solid var(--hair);
	}
	.presets-head h2 {
		font-size: clamp(2rem, 4vw, 3.2rem);
		margin: 0 0 12px;
	}

	.presets {
		position: relative;
		border-bottom: 1px solid var(--hair);
	}

	.preset-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
	}

	.preset-cell {
		position: relative;
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--hair);
	}
	.preset-cell:nth-child(-n + 3) {
		border-top: 0;
	}

	.cell-vline {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		width: 1px;
		background: var(--hair);
	}

	.cell-label {
		font-family: var(--mono);
		font-size: 0.66rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--muted);
		position: absolute;
		top: 12px;
		left: 14px;
		z-index: 2;
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
	}

	.cell-canvas {
		height: 320px;
		position: relative;
		background: #050505;
	}

	.cell-link {
		position: absolute;
		bottom: 12px;
		right: 14px;
		z-index: 2;
		color: var(--accent);
		text-decoration: none;
		font-family: var(--mono);
		font-size: 0.95rem;
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
		transition: transform 140ms ease;
	}
	.cell-link:hover {
		transform: translateX(4px);
	}

	.features {
		position: relative;
		border-bottom: 1px solid var(--hair);
		padding: 48px 48px;
	}

	.feature-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.feature-list li {
		display: grid;
		grid-template-columns: 56px 220px 1fr;
		gap: 16px;
		align-items: baseline;
		padding: 14px 0;
		border-bottom: 1px solid var(--hair);
	}
	.feature-list li:last-child {
		border-bottom: 0;
	}
	.f-n {
		font-family: var(--mono);
		font-size: 0.72rem;
		letter-spacing: 0.22em;
		color: var(--accent);
	}
	.f-t {
		font-family: var(--serif);
		font-style: italic;
		font-weight: 500;
		font-size: 1.1rem;
		color: var(--paper);
	}
	.f-d {
		font-size: 0.85rem;
		color: var(--muted);
	}

	/* Shared section structure for new sections */
	.section-head {
		padding: 56px 48px 40px;
		border-bottom: 1px solid var(--hair);
	}

	.section-numeral {
		font-family: var(--serif);
		font-weight: 700;
		font-size: clamp(4rem, 10vw, 8rem);
		line-height: 0.85;
		color: var(--accent);
		opacity: 0.18;
		margin-bottom: 8px;
		letter-spacing: -0.04em;
	}

	.section-h2 {
		font-size: clamp(2rem, 4vw, 3.2rem);
		margin: 0 0 14px;
	}

	.section-sub {
		font-family: var(--serif);
		font-style: italic;
		font-size: 1rem;
		line-height: 1.5;
		max-width: 60ch;
		margin: 0;
	}

	/* Shapes */
	.shapes-section {
		position: relative;
		border-bottom: 1px solid var(--hair);
	}

	.shapes-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
	}

	.shape-cell {
		position: relative;
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--hair);
	}
	.shape-cell:nth-child(-n + 3) {
		border-top: 0;
	}
	.shape-cell:not(:nth-child(3n)) {
		border-right: 1px solid var(--hair);
	}

	/* Physics */
	.physics-section {
		position: relative;
		border-bottom: 1px solid var(--hair);
	}

	.physics-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
	}

	.physics-cell {
		position: relative;
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--hair);
	}
	.physics-cell:nth-child(-n + 2) {
		border-top: 0;
	}
	.physics-cell:nth-child(odd) {
		border-right: 1px solid var(--hair);
	}

	.physics-code {
		font-family: var(--mono);
		font-size: 0.72rem;
		color: var(--muted);
		padding: 10px 14px;
		border-top: 1px solid var(--hair);
		background: rgba(255, 255, 255, 0.02);
		white-space: pre-wrap;
		word-break: break-all;
	}

	/* Glass */
	.glass-section {
		position: relative;
		border-bottom: 1px solid var(--hair);
	}

	.glass-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
	}

	.glass-cell {
		position: relative;
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--hair);
	}
	.glass-cell:nth-child(-n + 2) {
		border-top: 0;
	}
	.glass-cell:nth-child(odd) {
		border-right: 1px solid var(--hair);
	}

	/* Sticky */
	.sticky-section {
		position: relative;
		border-bottom: 1px solid var(--hair);
	}

	.sticky-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
	}

	.sticky-cell {
		position: relative;
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--hair);
	}
	.sticky-cell:nth-child(-n + 2) {
		border-top: 0;
	}
	.sticky-cell:nth-child(odd) {
		border-right: 1px solid var(--hair);
	}

	/* Reveal */
	.reveal-section {
		position: relative;
		border-bottom: 1px solid var(--hair);
	}

	.reveal-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
	}

	.reveal-cell {
		position: relative;
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--hair);
	}
	.reveal-cell:nth-child(-n + 2) {
		border-top: 0;
	}
	.reveal-cell:nth-child(odd) {
		border-right: 1px solid var(--hair);
	}

	/* Distortion */
	.distort-section {
		position: relative;
		border-bottom: 1px solid var(--hair);
	}

	.distort-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
	}

	.distort-cell {
		position: relative;
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--hair);
	}
	.distort-cell:nth-child(-n + 2) {
		border-top: 0;
	}
	.distort-cell:nth-child(odd) {
		border-right: 1px solid var(--hair);
	}

	/* Playground */
	.play-section {
		position: relative;
		border-bottom: 1px solid var(--hair);
	}

	.preset-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding: 24px 48px 0;
	}

	.preset-chip {
		font: inherit;
		font-family: var(--mono);
		font-size: 0.7rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		background: transparent;
		color: var(--muted);
		border: 1px solid var(--hair);
		padding: 6px 14px;
		cursor: pointer;
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
		color: #ffb84d;
		border-color: #ffb84d;
		background: rgba(255, 184, 77, 0.08);
	}
	.preset-chip.reset {
		margin-left: 8px;
	}
	.preset-chip.reset:hover {
		color: var(--paper);
		border-color: rgba(245, 241, 234, 0.3);
	}

	.playground-grid {
		display: grid;
		grid-template-columns: 1fr 340px;
		gap: 0;
		border-top: 1px solid var(--hair);
		margin-top: 24px;
	}

	.playground-canvas {
		height: 480px;
		position: relative;
		background: #050505;
		border-right: 1px solid var(--hair);
	}

	.playground-panel {
		padding: 24px 28px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		overflow-y: auto;
		max-height: 480px;
	}

	.knob-group {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.knob-group-title {
		font-family: var(--mono);
		font-size: 0.66rem;
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: var(--accent);
		padding-bottom: 6px;
		border-bottom: 1px solid var(--hair);
	}

	.knob-row {
		display: grid;
		grid-template-columns: 130px 1fr 48px;
		gap: 10px;
		align-items: center;
		cursor: pointer;
	}

	.knob-label {
		font-family: var(--mono);
		font-size: 0.7rem;
		color: var(--muted);
		white-space: nowrap;
	}

	.knob-value {
		font-family: var(--mono);
		font-size: 0.7rem;
		color: var(--paper);
		text-align: right;
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
		gap: 12px;
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
		width: 32px;
		height: 18px;
		border-radius: 9px;
		background: var(--hair);
		border: 1px solid rgba(245, 241, 234, 0.2);
		flex-shrink: 0;
		position: relative;
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
			transform 140ms ease,
			background 140ms ease;
	}
	.toggle-row input[type='checkbox']:checked + .toggle-pill {
		background: rgba(255, 184, 77, 0.2);
		border-color: var(--accent);
	}
	.toggle-row input[type='checkbox']:checked + .toggle-pill::after {
		transform: translateX(14px);
		background: var(--accent);
	}

	.color-row {
		display: flex;
		align-items: center;
		gap: 12px;
		cursor: pointer;
	}

	input[type='color'] {
		width: 32px;
		height: 24px;
		border: 1px solid var(--hair);
		border-radius: 2px;
		background: none;
		cursor: pointer;
		padding: 0;
	}

	.snippet-head-pg {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-family: var(--mono);
		font-size: 0.66rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--muted);
		border-top: 1px solid var(--hair);
		padding-top: 16px;
	}

	.copy-btn {
		font: inherit;
		font-family: var(--mono);
		font-size: 0.66rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		background: transparent;
		color: var(--muted);
		border: 1px solid var(--hair);
		padding: 4px 10px;
		cursor: pointer;
		transition:
			color 140ms ease,
			border-color 140ms ease;
	}
	.copy-btn:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	.snippet-code {
		margin: 0;
		font-family: var(--mono);
		font-size: 0.72rem;
		color: var(--paper);
		line-height: 1.6;
		overflow-x: auto;
		white-space: pre;
		background: rgba(255, 255, 255, 0.02);
		padding: 10px 12px;
		border: 1px solid var(--hair);
	}

	/* Quote */
	.quote {
		position: relative;
		padding: 80px 48px 96px;
		border-bottom: 1px solid var(--hair);
	}
	.quote blockquote {
		margin: 0;
		max-width: 920px;
		padding-left: 120px;
		position: relative;
	}
	.oq {
		font-family: var(--serif);
		font-weight: 700;
		font-size: clamp(7rem, 14vw, 12rem);
		line-height: 0.7;
		color: var(--accent);
		position: absolute;
		left: 0;
		top: -10px;
	}
	.q-text {
		font-family: var(--serif);
		font-style: italic;
		font-weight: 500;
		font-size: clamp(1.5rem, 3vw, 2.4rem);
		line-height: 1.2;
		margin: 0;
		color: var(--paper);
	}
	.q-cite {
		font-family: var(--mono);
		font-style: normal;
		font-size: 0.7rem;
		letter-spacing: 0.28em;
		color: var(--muted);
		margin-top: 22px;
	}

	.page-footer {
		padding: 32px 0 56px;
	}
	.footer-rule {
		height: 1px;
		background: var(--hair);
		margin-bottom: 22px;
	}
	.footer-row {
		display: grid;
		grid-template-columns: 1fr 2fr 1fr;
		gap: 24px;
		font-family: var(--mono);
		font-size: 0.68rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.f-mid {
		text-align: center;
		text-transform: none;
		letter-spacing: 0.04em;
	}
	.f-right {
		text-align: right;
	}

	@media (max-width: 960px) {
		.hero-grid,
		.install-grid {
			grid-template-columns: 1fr;
		}
		.hero-copy,
		.install-head {
			border-right: 0;
			border-bottom: 1px solid var(--hair);
		}
		.hero-copy,
		.install-head,
		.install-body,
		.specs,
		.presets-head,
		.features,
		.quote,
		.section-head,
		.preset-chips {
			padding-left: 24px;
			padding-right: 24px;
		}
		.spec-grid {
			grid-template-columns: 1fr;
			column-gap: 0;
		}
		.spec-row {
			border-bottom: 1px solid var(--hair);
		}
		.spec-row:nth-last-child(-n + 2) {
			border-bottom: 1px solid var(--hair);
		}
		.spec-row:last-child {
			border-bottom: 0;
		}
		.preset-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.preset-cell:nth-child(-n + 3) {
			border-top: 1px solid var(--hair);
		}
		.preset-cell:nth-child(-n + 2) {
			border-top: 0;
		}
		.cell-vline {
			display: none;
		}
		.preset-cell:nth-child(odd)::after {
			content: '';
			position: absolute;
			top: 0;
			right: 0;
			bottom: 0;
			width: 1px;
			background: var(--hair);
		}
		.quote blockquote {
			padding-left: 64px;
		}
		.feature-list li {
			grid-template-columns: 48px 1fr;
		}
		.f-d {
			grid-column: 1 / -1;
			padding-left: 64px;
		}
		.footer-row {
			grid-template-columns: 1fr;
			text-align: left;
		}
		.f-mid,
		.f-right {
			text-align: left;
		}
		.shapes-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.shape-cell:nth-child(-n + 3) {
			border-top: 1px solid var(--hair);
		}
		.shape-cell:nth-child(-n + 2) {
			border-top: 0;
		}
		.shape-cell:not(:nth-child(3n)) {
			border-right: 0;
		}
		.shape-cell:nth-child(odd) {
			border-right: 1px solid var(--hair);
		}
		.playground-grid {
			grid-template-columns: 1fr;
		}
		.playground-canvas {
			border-right: 0;
			border-bottom: 1px solid var(--hair);
		}
		.playground-panel {
			max-height: none;
		}
	}

	@media (max-width: 720px) {
		.page {
			padding: 0 16px;
		}
		.preset-grid {
			grid-template-columns: 1fr;
		}
		.preset-cell:nth-child(-n + 2) {
			border-top: 1px solid var(--hair);
		}
		.preset-cell:first-child {
			border-top: 0;
		}
		.preset-cell:nth-child(odd)::after {
			display: none;
		}
		.cell-canvas {
			height: 260px;
		}
		.hero-stage {
			min-height: 360px;
		}
		.topnav {
			gap: 8px;
		}
		.shapes-grid,
		.physics-grid,
		.glass-grid,
		.sticky-grid,
		.reveal-grid,
		.distort-grid {
			grid-template-columns: 1fr;
		}
		.shape-cell:nth-child(odd),
		.physics-cell:nth-child(odd),
		.glass-cell:nth-child(odd),
		.sticky-cell:nth-child(odd),
		.reveal-cell:nth-child(odd),
		.distort-cell:nth-child(odd) {
			border-right: 0;
		}
		.shape-cell,
		.physics-cell,
		.glass-cell,
		.sticky-cell,
		.reveal-cell,
		.distort-cell {
			border-top: 1px solid var(--hair);
		}
		.shape-cell:first-child,
		.physics-cell:first-child,
		.glass-cell:first-child,
		.sticky-cell:first-child,
		.reveal-cell:first-child,
		.distort-cell:first-child {
			border-top: 0;
		}
		.shape-cell:not(:nth-child(3n)) {
			border-right: 0;
		}
		.section-numeral {
			font-size: clamp(3rem, 15vw, 5rem);
		}
		.knob-row {
			grid-template-columns: 110px 1fr 44px;
		}
	}
</style>
