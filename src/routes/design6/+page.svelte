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
		Toroidal,
		type RGB
	} from '$lib/index.js';

	type PkgManager = 'bun' | 'npm' | 'pnpm' | 'yarn';

	let installTab = $state<PkgManager>('bun');

	const installCmds: Record<PkgManager, string> = {
		bun: 'bun add svelte-fluid',
		npm: 'npm install svelte-fluid',
		pnpm: 'pnpm add svelte-fluid',
		yarn: 'yarn add svelte-fluid'
	};

	const installCmd = $derived(installCmds[installTab]);

	let copiedKey = $state<string | null>(null);

	async function copy(text: string, key: string) {
		try {
			await navigator.clipboard.writeText(text);
			copiedKey = key;
			setTimeout(() => {
				if (copiedKey === key) copiedKey = null;
			}, 1400);
		} catch {
			copiedKey = null;
		}
	}

	const usage = `<script lang="ts">
  import { Fluid } from 'svelte-fluid';
<\/script>

<div style="width: 100%; height: 480px;">
  <Fluid seed={42} splatOnHover />
</div>`;

	const presets = [
		{
			name: 'LavaLamp',
			seed: 7,
			caption: 'slow warm blobs · density 0.5',
			component: LavaLamp
		},
		{
			name: 'Plasma',
			seed: 12,
			caption: 'high curl · electric palette',
			component: Plasma
		},
		{
			name: 'InkInWater',
			seed: 21,
			caption: 'dye bloom · clear medium',
			component: InkInWater
		},
		{
			name: 'FrozenSwirl',
			seed: 33,
			caption: 'low velocity · cyan field',
			component: FrozenSwirl
		},
		{
			name: 'Aurora',
			seed: 44,
			caption: 'auto-splat · vertical drift',
			component: Aurora
		},
		{
			name: 'Toroidal',
			seed: 58,
			caption: 'annular bounds · rotation',
			component: Toroidal
		}
	];

	const features = [
		'multi-instance',
		'resize-stable',
		'deterministic seeding',
		'MIT licensed',
		'zero runtime deps',
		'70+ props',
		'10 presets',
		'Svelte 5 runes'
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
	<title>svelte-fluid — terminal</title>
</svelte:head>

<a class="competition-back" href="{base}/design-competition">← Competition</a>

<main class="page">
	<div class="terminal">
		<header class="chrome">
			<div class="dots" aria-hidden="true">
				<span class="dot dot-r"></span>
				<span class="dot dot-y"></span>
				<span class="dot dot-g"></span>
			</div>
			<div class="title">~/svelte-fluid — bun</div>
			<div class="chrome-right" aria-hidden="true">utf-8 · main</div>
		</header>

		<div class="screen">
			<section class="hero">
				<h1 class="sr-only">svelte-fluid — WebGL fluid simulation as a Svelte 5 component</h1>
				<pre class="block prompt-block">
<span class="prompt">$</span> bun add svelte-fluid
<span class="ok">✓</span> Installed svelte-fluid in 0.42s

<span class="dim">&gt;</span> WebGL fluid simulation as a Svelte 5 component
<span class="dim">&gt;</span> Multi-instance · resize-stable · deterministic seeding<span class="cursor">▊</span></pre>

				<div class="hero-actions">
					<a class="link primary" href="https://github.com/tommyyzhao/svelte-fluid">
						→ github.com/tommyyzhao/svelte-fluid
					</a>
					<a class="link" href="{base}/docs">→ ./docs</a>
				</div>
			</section>

			<section class="section">
				<div class="rule">╭─ install ─────────────────────────────────────────────────────╮</div>
				<div class="comment">// pick your package manager</div>

				<div class="install">
					<div class="tabs" role="tablist" aria-label="package manager">
						{#each ['bun', 'npm', 'pnpm', 'yarn'] as pm (pm)}
							<button
								role="tab"
								aria-selected={installTab === pm}
								class="tab"
								class:active={installTab === pm}
								onclick={() => (installTab = pm as PkgManager)}
							>
								{pm}
							</button>
						{/each}
					</div>
					<div class="cmd">
						<span class="prompt">$</span>
						<code>{installCmd}</code>
						<button
							class="copy"
							onclick={() => copy(installCmd, 'install')}
							aria-label="copy install command"
						>
							{copiedKey === 'install' ? '[ok]' : '[copy]'}
						</button>
					</div>
				</div>
				<div class="rule">╰───────────────────────────────────────────────────────────────╯</div>
			</section>

			<section class="section">
				<div class="rule">╭─ usage ───────────────────────────────────────────────────────╮</div>
				<div class="comment">// minimal example — Fluid fills its parent</div>
				<div class="code-card">
					<div class="code-head">
						<span class="filename">── App.svelte ──</span>
						<button
							class="copy"
							onclick={() => copy(usage, 'usage')}
							aria-label="copy usage snippet"
						>
							{copiedKey === 'usage' ? '[ok]' : '[copy]'}
						</button>
					</div>
					<pre class="code-body"><code>{usage}</code></pre>
				</div>
				<div class="rule">╰───────────────────────────────────────────────────────────────╯</div>
			</section>

			<section class="section">
				<div class="rule">╭─ presets ─────────────────────────────────────────────────────╮</div>
				<div class="comment">// 10 opinionated wrappers — each fills its container</div>

				<div class="preset-grid">
					{#each presets as preset, i (preset.name)}
						{@const SvelteComp = preset.component}
						<article class="preset">
							<div class="preset-head">
								<span class="preset-file">─ {preset.name}.svelte ─</span>
							</div>
							<pre
								class="preset-import"><code><span class="kw">import</span> {'{ '}<span
											class="ident">{preset.name}</span>{' }'} <span class="kw">from</span> <span
											class="str">'svelte-fluid'</span>;</code></pre>
							<div class="preset-canvas">
								<SvelteComp
									seed={preset.seed}
									lazy={i > 1}
									aria-label="{preset.name} preset"
								/>
							</div>
							<div class="preset-foot">
								<span class="dim">// {preset.caption}</span>
							</div>
						</article>
					{/each}
				</div>
				<div class="rule">╰───────────────────────────────────────────────────────────────╯</div>
			</section>

			<section class="section">
				<div class="rule">╭─ § 04 ── shapes ──────────────────────────────────────────────╮</div>
				<div class="comment">// confine fluid to any container shape — hover to splat</div>

				<div class="shape-grid">
					<article class="shape-pane">
						<div class="pane-head">
							<span class="pane-dots" aria-hidden="true">●●●</span>
							<span class="pane-title">╭─ CircularFluid ────╮</span>
						</div>
						<div class="shape-canvas">
							<CircularFluid seed={601} lazy splatOnHover aria-label="Circle container shape" backColor={{ r: 10, g: 10, b: 10 }} />
						</div>
						<div class="pane-foot"><span class="dim">// type: 'circle'</span></div>
					</article>

					<article class="shape-pane">
						<div class="pane-head">
							<span class="pane-dots" aria-hidden="true">●●●</span>
							<span class="pane-title">╭─ FrameFluid ───────╮</span>
						</div>
						<div class="shape-canvas">
							<FrameFluid seed={603} lazy splatOnHover aria-label="Frame container shape" backColor={{ r: 10, g: 10, b: 10 }} />
						</div>
						<div class="pane-foot"><span class="dim">// type: 'frame'</span></div>
					</article>

					<article class="shape-pane">
						<div class="pane-head">
							<span class="pane-dots" aria-hidden="true">●●●</span>
							<span class="pane-title">╭─ AnnularFluid ─────╮</span>
						</div>
						<div class="shape-canvas">
							<AnnularFluid seed={604} lazy splatOnHover aria-label="Annulus container shape" backColor={{ r: 10, g: 10, b: 10 }} />
						</div>
						<div class="pane-foot"><span class="dim">// type: 'annulus'</span></div>
					</article>

					<article class="shape-pane">
						<div class="pane-head">
							<span class="pane-dots" aria-hidden="true">●●●</span>
							<span class="pane-title">╭─ roundedRect ──────╮</span>
						</div>
						<div class="shape-canvas">
							<Fluid
								seed={602}
								colorful
								shading
								bloom
								splatOnHover
								initialSplatCount={15}
								containerShape={{
									type: 'roundedRect',
									cx: 0.5,
									cy: 0.5,
									halfW: 0.42,
									halfH: 0.42,
									cornerRadius: 0.08
								}}
								lazy
								aria-label="Rounded rect container shape"
							/>
						</div>
						<div class="pane-foot"><span class="dim">// type: 'roundedRect'</span></div>
					</article>

					<article class="shape-pane">
						<div class="pane-head">
							<span class="pane-dots" aria-hidden="true">●●●</span>
							<span class="pane-title">╭─ svgPath.d ────────╮</span>
						</div>
						<div class="shape-canvas">
							<Fluid
								seed={605}
								colorful
								shading
								bloom
								splatOnHover
								initialSplatCount={15}
								containerShape={{ type: 'svgPath', d: lightning, viewBox: [0, 0, 100, 100] }}
								lazy
								aria-label="SVG path lightning shape"
							/>
						</div>
						<div class="pane-foot"><span class="dim">// type: 'svgPath' · d</span></div>
					</article>

					<article class="shape-pane">
						<div class="pane-head">
							<span class="pane-dots" aria-hidden="true">●●●</span>
							<span class="pane-title">╭─ svgPath.text ─────╮</span>
						</div>
						<div class="shape-canvas">
							<Fluid
								seed={606}
								colorful
								shading
								bloom
								splatOnHover
								initialSplatCount={15}
								containerShape={{ type: 'svgPath', text: '&', font: '900 280px Georgia, serif' }}
								lazy
								aria-label="Text glyph container shape"
							/>
						</div>
						<div class="pane-foot"><span class="dim">// type: 'svgPath' · text</span></div>
					</article>
				</div>

				<div class="rule">╰───────────────────────────────────────────────────────────────╯</div>
			</section>

			<section class="section">
				<div class="rule">╭─ § 05 ── physics ─────────────────────────────────────────────╮</div>
				<div class="comment">// every prop is optional — tune physics at runtime</div>

				<div class="physics-grid">
					<article class="physics-pane">
						<div class="pane-head">
							<span class="pane-dots" aria-hidden="true">●●●</span>
							<span class="pane-title">╭─ fluid.default ────╮</span>
						</div>
						<div class="physics-canvas">
							<Fluid
								seed={1234}
								initialSplatCount={12}
								splatOnHover
								lazy
								aria-label="Default fluid physics"
							/>
						</div>
						<div class="pane-foot">
							<code class="physics-snippet"><span class="prompt">$</span> {'<Fluid />'}</code>
						</div>
					</article>

					<article class="physics-pane">
						<div class="pane-head">
							<span class="pane-dots" aria-hidden="true">●●●</span>
							<span class="pane-title">╭─ fluid.flat ───────╮</span>
						</div>
						<div class="physics-canvas">
							<Fluid
								seed={5678}
								bloom={false}
								curl={5}
								densityDissipation={0.4}
								initialSplatCount={10}
								splatOnHover
								lazy
								aria-label="Flat soft fluid physics"
							/>
						</div>
						<div class="pane-foot">
							<code class="physics-snippet"><span class="prompt">$</span> bloom=false curl=5 density=0.4</code>
						</div>
					</article>

					<article class="physics-pane">
						<div class="pane-head">
							<span class="pane-dots" aria-hidden="true">●●●</span>
							<span class="pane-title">╭─ fluid.bold ───────╮</span>
						</div>
						<div class="physics-canvas">
							<Fluid
								seed={9012}
								shading={false}
								splatRadius={0.8}
								splatForce={9000}
								initialSplatCount={8}
								splatOnHover
								lazy
								aria-label="Bold splats fluid physics"
							/>
						</div>
						<div class="pane-foot">
							<code class="physics-snippet"><span class="prompt">$</span> shading=false radius=0.8 force=9000</code>
						</div>
					</article>

					<article class="physics-pane">
						<div class="pane-head">
							<span class="pane-dots" aria-hidden="true">●●●</span>
							<span class="pane-title">╭─ fluid.slow ───────╮</span>
						</div>
						<div class="physics-canvas">
							<Fluid
								seed={3456}
								velocityDissipation={0.05}
								densityDissipation={0.5}
								transparent
								initialSplatCount={14}
								splatOnHover
								lazy
								aria-label="Slow transparent fluid physics"
							/>
						</div>
						<div class="pane-foot">
							<code class="physics-snippet"><span class="prompt">$</span> vel=0.05 density=0.5 transparent</code>
						</div>
					</article>
				</div>

				<div class="rule">╰───────────────────────────────────────────────────────────────╯</div>
			</section>

			<section class="section">
				<div class="rule">╭─ § 06 ── refract ─────────────────────────────────────────────╮</div>
				<div class="comment">// glass adds a lens — refraction · chromatic fringes · any shape</div>

				<div class="glass-grid">
					<article class="glass-pane">
						<div class="pane-head">
							<span class="pane-dots" aria-hidden="true">●●●</span>
							<span class="pane-title">╭─ refract ──────────╮</span>
						</div>
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
						<div class="pane-foot"><span class="dim">// crystal orb · refraction=0.7</span></div>
					</article>

					<article class="glass-pane">
						<div class="pane-head">
							<span class="pane-dots" aria-hidden="true">●●●</span>
							<span class="pane-title">╭─ refract ──────────╮</span>
						</div>
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
						<div class="pane-foot"><span class="dim">// soft lens · refraction=0.25</span></div>
					</article>

					<article class="glass-pane">
						<div class="pane-head">
							<span class="pane-dots" aria-hidden="true">●●●</span>
							<span class="pane-title">╭─ refract ──────────╮</span>
						</div>
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
						<div class="pane-foot"><span class="dim">// portal ring · chromatic=0.7</span></div>
					</article>

					<article class="glass-pane">
						<div class="pane-head">
							<span class="pane-dots" aria-hidden="true">●●●</span>
							<span class="pane-title">╭─ refract ──────────╮</span>
						</div>
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
						<div class="pane-foot"><span class="dim">// glass frame · reflectivity=0.18</span></div>
					</article>
				</div>

				<div class="rule">╰───────────────────────────────────────────────────────────────╯</div>
			</section>

			<section class="section">
				<div class="rule">╭─ § 07 ── stick ───────────────────────────────────────────────╮</div>
				<div class="comment">// [stick] $ FLUID &gt; .text — dye clings to letterforms</div>

				<div class="sticky-grid">
					<article class="sticky-pane">
						<div class="pane-head">
							<span class="pane-dots" aria-hidden="true">●●●</span>
							<span class="pane-title">╭─ FluidStick ───────╮</span>
						</div>
						<div class="sticky-canvas">
							<FluidStick
								text="FLUID"
								font="900 100px monospace"
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
						<div class="pane-foot"><span class="dim">// $ FLUID &gt; monospace · 900</span></div>
					</article>

					<article class="sticky-pane">
						<div class="pane-head">
							<span class="pane-dots" aria-hidden="true">●●●</span>
							<span class="pane-title">╭─ FluidStick ───────╮</span>
						</div>
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
						<div class="pane-foot"><span class="dim">// $ ∞ &gt; Georgia · 200</span></div>
					</article>
				</div>

				<div class="rule">╰───────────────────────────────────────────────────────────────╯</div>
			</section>

			<section class="section">
				<div class="rule">╭─ § 08 ── reveal ──────────────────────────────────────────────╮</div>
				<div class="comment">// [reveal] $ uncover — fluid as opacity mask</div>

				<div class="reveal-grid">
					<article class="reveal-pane">
						<div class="pane-head">
							<span class="pane-dots" aria-hidden="true">●●●</span>
							<span class="pane-title">╭─ FluidReveal ──────╮</span>
						</div>
						<div class="reveal-canvas">
							<FluidReveal lazy velocityDissipation={0.95} pressureIterations={10}>
								<div class="reveal-content">$ revealed</div>
							</FluidReveal>
						</div>
						<div class="pane-foot"><span class="dim">// scratch to reveal</span></div>
					</article>

					<article class="reveal-pane">
						<div class="pane-head">
							<span class="pane-dots" aria-hidden="true">●●●</span>
							<span class="pane-title">╭─ FluidReveal ──────╮</span>
						</div>
						<div class="reveal-canvas">
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
								<div class="reveal-content">$ auto_reveal</div>
							</FluidReveal>
						</div>
						<div class="pane-foot"><span class="dim">// autoReveal · fadeBack=false</span></div>
					</article>
				</div>

				<div class="rule">╰───────────────────────────────────────────────────────────────╯</div>
			</section>

			<section class="section">
				<div class="rule">╭─ § 09 ── distort ─────────────────────────────────────────────╮</div>
				<div class="comment">// [distort] $ warp image — velocity field warps any source</div>

				<div class="distort-grid">
					<article class="distort-pane">
						<div class="pane-head">
							<span class="pane-dots" aria-hidden="true">●●●</span>
							<span class="pane-title">╭─ FluidDistortion ──╮</span>
						</div>
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
						<div class="pane-foot"><span class="dim">// strength=0.3 · subtle</span></div>
					</article>

					<article class="distort-pane">
						<div class="pane-head">
							<span class="pane-dots" aria-hidden="true">●●●</span>
							<span class="pane-title">╭─ FluidDistortion ──╮</span>
						</div>
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
						<div class="pane-foot"><span class="dim">// strength=0.45 · strong</span></div>
					</article>
				</div>

				<div class="rule">╰───────────────────────────────────────────────────────────────╯</div>
			</section>

			<section class="section">
				<div class="rule">╭─ § 10 ── repl ────────────────────────────────────────────────╮</div>
				<div class="comment">// $ repl --interactive — drag knobs, fluid updates live</div>

				<div class="repl-chips" role="tablist" aria-label="Quick-start presets">
					{#each presetNames as name (name)}
						<button
							type="button"
							class="repl-chip"
							class:active={activePreset === name}
							aria-pressed={activePreset === name}
							onclick={() => applyPreset(name)}
						>
							&gt; {name}
						</button>
					{/each}
					<button type="button" class="repl-chip reset" onclick={resetPlayground}>
						&gt; reset
					</button>
				</div>

				<div class="repl-grid">
					<div class="repl-viewport" aria-label="Interactive REPL stage">
						<div class="repl-viewport-head">
							<span class="pane-dots" aria-hidden="true">●●●</span>
							<span class="pane-title">╭─ fluid.canvas ─────╮</span>
						</div>
						<div class="repl-canvas">
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
								aria-label="Interactive REPL playground"
							/>
						</div>
					</div>

					<aside class="repl-panel">
						<div class="repl-panel-head">
							<span class="pane-dots" aria-hidden="true">●●●</span>
							<span class="pane-title">╭─ controls ─────────╮</span>
						</div>

						<div class="knob-group">
							<div class="knob-group-title">&gt; physics</div>
							<label class="knob-row">
								<span class="knob-label">&gt; curl</span>
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
								<span class="knob-label">&gt; splatRadius</span>
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
								<span class="knob-label">&gt; splatForce</span>
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
								<span class="knob-label">&gt; density</span>
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
								<span class="knob-label">&gt; velocity</span>
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
							<div class="knob-group-title">&gt; visuals</div>
							<label class="toggle-row">
								<input type="checkbox" bind:checked={pgBloom} onchange={markCustomEdit} />
								<span class="toggle-pill" aria-hidden="true"></span>
								<span class="knob-label">&gt; bloom</span>
							</label>
							<label class="toggle-row">
								<input type="checkbox" bind:checked={pgShading} onchange={markCustomEdit} />
								<span class="toggle-pill" aria-hidden="true"></span>
								<span class="knob-label">&gt; shading</span>
							</label>
							<label class="toggle-row">
								<input type="checkbox" bind:checked={pgColorful} onchange={markCustomEdit} />
								<span class="toggle-pill" aria-hidden="true"></span>
								<span class="knob-label">&gt; colorful</span>
							</label>
						</div>

						<div class="knob-group">
							<div class="knob-group-title">&gt; background</div>
							<label class="color-row">
								<span class="knob-label">&gt; backColor</span>
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
							<span class="dim">// output</span>
							<button class="copy" onclick={copySnippet} aria-label="Copy playground snippet">
								{copiedSnippet ? '[ok]' : '[copy]'}
							</button>
						</div>
						<pre class="snippet-code"><code>{playgroundSnippet}</code></pre>
					</aside>
				</div>

				<div class="rule">╰───────────────────────────────────────────────────────────────╯</div>
			</section>

			<section class="section">
				<div class="rule">╭─ why? ────────────────────────────────────────────────────────╮</div>
				<div class="comment">// built-in guarantees</div>
				<ul class="checks">
					{#each features as f (f)}
						<li>
							<span class="box">[x]</span>
							<span>{f}</span>
						</li>
					{/each}
				</ul>
				<div class="rule">╰───────────────────────────────────────────────────────────────╯</div>
			</section>

			<section class="section">
				<div class="rule">╭─ credit ──────────────────────────────────────────────────────╮</div>
				<pre class="block credit-block"><span class="dim">&gt;</span> Derivative work of <a
						href="https://github.com/PavelDoGreat/WebGL-Fluid-Simulation"
						class="inline-link">PavelDoGreat/WebGL-Fluid-Simulation</a>
<span class="dim">&gt;</span> by Pavel Dobryakov (c) 2017. MIT.</pre>
				<div class="rule">╰───────────────────────────────────────────────────────────────╯</div>
			</section>
		</div>

		<footer class="statusbar">
			<span>─── svelte-fluid v0.2.2</span>
			<span>─── MIT</span>
			<span>─── github.com/tommyyzhao/svelte-fluid</span>
			<span>───</span>
		</footer>
	</div>
</main>

<style>
	:global(html, body) {
		background: #0a0a0a;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

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
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 4px;
		padding: 0.35rem 0.7rem;
		font-family: monospace;
		transition: color 0.15s;
	}

	.competition-back:hover {
		color: rgba(160, 255, 160, 0.9);
	}

	.page {
		--bg: #0a0a0a;
		--panel: #0d0f12;
		--screen: #0d0f12;
		--fg: #e6e6e6;
		--dim: #8b949e;
		--muted: #585e6a;
		--accent: #4ade80;
		--accent-dim: #4ade8033;
		--rule: #1f242c;
		--border: #1a1f26;

		font-family: ui-monospace, 'JetBrains Mono', 'Berkeley Mono', 'SF Mono', 'Cascadia Mono',
			Menlo, Consolas, monospace;
		font-size: 14px;
		line-height: 1.55;
		color: var(--fg);
		background: var(--bg);
		min-height: 100vh;
		padding: 32px 20px 64px;
		display: flex;
		justify-content: center;
		background-image: repeating-linear-gradient(
			0deg,
			rgba(255, 255, 255, 0.012) 0px,
			rgba(255, 255, 255, 0.012) 1px,
			transparent 1px,
			transparent 3px
		);
	}

	.terminal {
		width: 100%;
		max-width: 1180px;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.04) inset,
			0 30px 80px -20px rgba(0, 0, 0, 0.7);
		overflow: hidden;
	}

	.chrome {
		display: grid;
		grid-template-columns: 80px 1fr 160px;
		align-items: center;
		padding: 10px 16px;
		background: linear-gradient(#13171c, #0f1318);
		border-bottom: 1px solid var(--border);
	}

	.dots {
		display: flex;
		gap: 8px;
	}

	.dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		display: inline-block;
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4) inset;
	}

	.dot-r {
		background: #ff5f57;
	}
	.dot-y {
		background: #febc2e;
	}
	.dot-g {
		background: #28c840;
	}

	.title {
		text-align: center;
		color: var(--dim);
		font-size: 12.5px;
		letter-spacing: 0.02em;
	}

	.chrome-right {
		text-align: right;
		color: var(--muted);
		font-size: 11.5px;
	}

	.screen {
		padding: 28px 28px 12px;
	}

	.hero {
		padding: 12px 0 28px;
	}

	.block {
		margin: 0;
		padding: 0;
		white-space: pre-wrap;
		font: inherit;
		color: var(--fg);
	}

	.prompt-block {
		font-size: 14.5px;
		line-height: 1.7;
	}

	.prompt {
		color: var(--accent);
		font-weight: 600;
	}

	.ok {
		color: var(--accent);
	}

	.dim {
		color: var(--dim);
	}

	.cursor {
		display: inline-block;
		color: var(--accent);
		animation: blink 1s steps(1) infinite;
		margin-left: 2px;
	}

	@keyframes blink {
		0%,
		50% {
			opacity: 1;
		}
		51%,
		100% {
			opacity: 0;
		}
	}

	.hero-actions {
		margin-top: 20px;
		display: flex;
		gap: 24px;
		flex-wrap: wrap;
	}

	.link {
		color: var(--dim);
		text-decoration: none;
		border-bottom: 1px dashed transparent;
		transition: color 0.15s, border-color 0.15s;
	}

	.link:hover {
		color: var(--accent);
		border-bottom-color: var(--accent-dim);
	}

	.link.primary {
		color: var(--fg);
	}

	.section {
		margin: 28px 0;
	}

	.rule {
		color: var(--rule);
		white-space: nowrap;
		overflow: hidden;
		font-size: 13px;
		letter-spacing: 0;
	}

	.comment {
		color: var(--muted);
		margin: 8px 2px 14px;
		font-size: 13px;
	}

	.install {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin: 4px 0 14px;
	}

	.tabs {
		display: flex;
		gap: 0;
		border: 1px solid var(--border);
		width: fit-content;
	}

	.tab {
		background: transparent;
		border: 0;
		color: var(--dim);
		font: inherit;
		padding: 6px 14px;
		cursor: pointer;
		border-right: 1px solid var(--border);
		transition: color 0.15s, background 0.15s;
	}

	.tab:last-child {
		border-right: 0;
	}

	.tab:hover {
		color: var(--fg);
	}

	.tab.active {
		color: #0a0a0a;
		background: var(--accent);
	}

	.cmd {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		background: #07090c;
		border: 1px solid var(--border);
	}

	.cmd code {
		color: var(--fg);
		flex: 1;
		font: inherit;
	}

	.copy {
		background: transparent;
		border: 1px solid var(--border);
		color: var(--dim);
		font: inherit;
		font-size: 12px;
		padding: 3px 10px;
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s;
	}

	.copy:hover {
		color: var(--accent);
		border-color: var(--accent-dim);
	}

	.code-card {
		border: 1px solid var(--border);
		background: #07090c;
		margin: 4px 0 14px;
	}

	.code-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 12px;
		border-bottom: 1px solid var(--border);
	}

	.filename {
		color: var(--muted);
		font-size: 12.5px;
	}

	.code-body {
		margin: 0;
		padding: 14px 16px;
		color: var(--fg);
		font: inherit;
		font-size: 13.5px;
		overflow-x: auto;
	}

	.preset-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 16px;
		margin: 4px 0 14px;
	}

	.preset {
		border: 1px solid var(--border);
		background: #07090c;
		display: flex;
		flex-direction: column;
	}

	.preset-head {
		padding: 8px 12px;
		border-bottom: 1px solid var(--border);
		color: var(--muted);
		font-size: 12.5px;
	}

	.preset-import {
		margin: 0;
		padding: 10px 12px;
		font: inherit;
		font-size: 12.5px;
		color: var(--dim);
		border-bottom: 1px solid var(--border);
		overflow-x: auto;
		white-space: nowrap;
	}

	.kw {
		color: var(--accent);
	}

	.ident {
		color: var(--fg);
	}

	.str {
		color: #facc15;
	}

	.preset-canvas {
		width: 100%;
		height: 280px;
		background: #000;
		position: relative;
	}

	.preset-foot {
		padding: 8px 12px;
		border-top: 1px solid var(--border);
		font-size: 12.5px;
	}

	.pane-head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 12px;
		border-bottom: 1px solid var(--border);
		background: #0a0c10;
	}

	.pane-dots {
		color: var(--muted);
		font-size: 9px;
		letter-spacing: 2px;
	}

	.pane-title {
		color: var(--muted);
		font-size: 12px;
		flex: 1;
		overflow: hidden;
		white-space: nowrap;
	}

	.pane-foot {
		padding: 7px 12px;
		border-top: 1px solid var(--border);
		font-size: 12px;
		background: #0a0c10;
	}

	.shape-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 16px;
		margin: 4px 0 14px;
	}

	.shape-pane {
		border: 1px solid var(--border);
		background: #07090c;
		display: flex;
		flex-direction: column;
	}

	.shape-canvas {
		width: 100%;
		height: 240px;
		background: #000;
		position: relative;
	}

	.physics-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
		margin: 4px 0 14px;
	}

	.physics-pane {
		border: 1px solid var(--border);
		background: #07090c;
		display: flex;
		flex-direction: column;
	}

	.physics-canvas {
		width: 100%;
		height: 280px;
		background: #000;
		position: relative;
	}

	.physics-snippet {
		font: inherit;
		font-size: 12px;
		color: var(--dim);
	}

	.glass-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
		margin: 4px 0 14px;
	}

	.glass-pane {
		border: 1px solid var(--border);
		background: #07090c;
		display: flex;
		flex-direction: column;
	}

	.glass-canvas {
		width: 100%;
		height: 320px;
		background: #000;
		position: relative;
	}

	.sticky-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
		margin: 4px 0 14px;
	}

	.sticky-pane {
		border: 1px solid var(--border);
		background: #07090c;
		display: flex;
		flex-direction: column;
	}

	.sticky-canvas {
		width: 100%;
		height: 300px;
		background: #000;
		position: relative;
	}

	.reveal-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
		margin: 4px 0 14px;
	}

	.reveal-pane {
		border: 1px solid var(--border);
		background: #07090c;
		display: flex;
		flex-direction: column;
	}

	.reveal-canvas {
		width: 100%;
		height: 280px;
		background: #0d1117;
		position: relative;
	}

	.reveal-content {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		font-family: monospace;
		font-size: 1.2rem;
		color: #a0ffaa;
	}

	.distort-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
		margin: 4px 0 14px;
	}

	.distort-pane {
		border: 1px solid var(--border);
		background: #07090c;
		display: flex;
		flex-direction: column;
	}

	.distort-canvas {
		width: 100%;
		height: 300px;
		background: #000;
		position: relative;
	}

	.repl-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 8px 0 16px;
	}

	.repl-chip {
		background: transparent;
		border: 1px solid var(--border);
		color: var(--dim);
		font: inherit;
		font-size: 12px;
		padding: 4px 12px;
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s, background 0.15s;
	}

	.repl-chip:hover {
		color: var(--accent);
		border-color: var(--accent-dim);
	}

	.repl-chip.active {
		color: #0a0a0a;
		background: var(--accent);
		border-color: var(--accent);
	}

	.repl-chip.reset {
		color: var(--muted);
	}

	.repl-chip.reset:hover {
		color: var(--fg);
		border-color: var(--fg);
	}

	.repl-grid {
		display: grid;
		grid-template-columns: 1fr 320px;
		gap: 16px;
		margin: 4px 0 14px;
		align-items: start;
	}

	.repl-viewport {
		border: 1px solid var(--border);
		background: #07090c;
		display: flex;
		flex-direction: column;
	}

	.repl-viewport-head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 12px;
		border-bottom: 1px solid var(--border);
		background: #0a0c10;
	}

	.repl-canvas {
		width: 100%;
		height: 420px;
		background: #000;
		position: relative;
	}

	.repl-panel {
		border: 1px solid var(--border);
		background: #07090c;
		display: flex;
		flex-direction: column;
	}

	.repl-panel-head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 12px;
		border-bottom: 1px solid var(--border);
		background: #0a0c10;
	}

	.knob-group {
		padding: 10px 12px;
		border-bottom: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.knob-group-title {
		color: var(--accent);
		font-size: 11.5px;
		letter-spacing: 0.05em;
		margin-bottom: 2px;
	}

	.knob-row {
		display: grid;
		grid-template-columns: 110px 1fr 48px;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}

	.knob-label {
		color: var(--dim);
		font-size: 12px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.knob-value {
		color: var(--fg);
		font-size: 12px;
		text-align: right;
	}

	.knob-value.mono {
		font-family: inherit;
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
	}

	.toggle-row input[type='checkbox'] {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}

	.toggle-pill {
		width: 32px;
		height: 16px;
		border-radius: 8px;
		background: var(--border);
		border: 1px solid var(--muted);
		position: relative;
		flex-shrink: 0;
		transition: background 0.15s, border-color 0.15s;
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
		transition: transform 0.15s, background 0.15s;
	}

	.toggle-row input:checked ~ .toggle-pill {
		background: var(--accent-dim);
		border-color: var(--accent);
	}

	.toggle-row input:checked ~ .toggle-pill::after {
		transform: translateX(16px);
		background: var(--accent);
	}

	.color-row {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}

	input[type='color'] {
		width: 28px;
		height: 22px;
		border: 1px solid var(--border);
		background: none;
		cursor: pointer;
		padding: 1px;
	}

	.snippet-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 12px;
		border-bottom: 1px solid var(--border);
	}

	.snippet-code {
		margin: 0;
		padding: 12px 14px;
		font: inherit;
		font-size: 12px;
		color: var(--fg);
		overflow-x: auto;
		white-space: pre;
	}

	.checks {
		list-style: none;
		padding: 0;
		margin: 4px 0 14px;
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 6px 24px;
	}

	.checks li {
		display: flex;
		gap: 10px;
		align-items: baseline;
		color: var(--fg);
	}

	.box {
		color: var(--accent);
	}

	.credit-block {
		font-size: 13px;
		color: var(--fg);
		padding: 4px 0 8px;
	}

	.inline-link {
		color: var(--fg);
		text-decoration: none;
		border-bottom: 1px dashed var(--muted);
	}

	.inline-link:hover {
		color: var(--accent);
		border-bottom-color: var(--accent-dim);
	}

	.statusbar {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		padding: 8px 16px;
		border-top: 1px solid var(--border);
		background: #07090c;
		color: var(--muted);
		font-size: 12px;
	}

	@media (max-width: 900px) {
		.preset-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.shape-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.repl-grid {
			grid-template-columns: 1fr;
		}
		.chrome {
			grid-template-columns: 80px 1fr;
		}
		.chrome-right {
			display: none;
		}
	}

	@media (max-width: 600px) {
		.page {
			padding: 12px 8px 32px;
		}
		.screen {
			padding: 18px 16px 8px;
		}
		.preset-grid {
			grid-template-columns: 1fr;
		}
		.shape-grid {
			grid-template-columns: 1fr;
		}
		.physics-grid {
			grid-template-columns: 1fr;
		}
		.glass-grid {
			grid-template-columns: 1fr;
		}
		.sticky-grid {
			grid-template-columns: 1fr;
		}
		.reveal-grid {
			grid-template-columns: 1fr;
		}
		.distort-grid {
			grid-template-columns: 1fr;
		}
		.checks {
			grid-template-columns: 1fr;
		}
		.rule {
			font-size: 11px;
		}
	}
</style>
