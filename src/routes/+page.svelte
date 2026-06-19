<script lang="ts">
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
			GasFlare,
			InkInWater,
			LavaLamp,
			Plasma,
			Karman,
			SvgPathFluid,
			TeslaValve,
			Toroidal,
			Venturi,
			type FlowConfig,
			type RGB
		} from '$lib/index.js';
	import { base } from '$app/paths';
	import { PRESETS as REGISTRY_PRESETS, PRESET_BY_ID } from '$lib/presets/registry.js';
	import { presetUsageSnippet, presetScaffoldSnippet } from '$lib/presets/snippet.js';
	import { parsePresetParam, presetToEditorState } from './components/presetTransfer.js';
	import Card from './components/Card.svelte';
	import {
		DEFAULT_THEME_ID,
		THEME_GROUPS,
		THEME_STORAGE_KEY,
		THEMES,
		hexToRgb255,
		hexToRgb01,
		mix01,
		themeById,
		themeStyle
	} from './components/themes.js';

	// ---- Theme (unified palette switcher across all design entries) ----
	let themeId = $state(DEFAULT_THEME_ID);
	const theme = $derived(themeById(themeId));
	// Non-reactive snapshot used only for $state initializers below.
	const defaultPaper = hexToRgb255(themeById(DEFAULT_THEME_ID).paper);
	const paperColor = $derived(hexToRgb255(theme.paper));
	const cardColor = $derived(hexToRgb255(theme.card));
	// Reveal cover layers derive from the theme so the covered state reads
	// as "card surface" in every palette.
	const revealCoverColor = $derived(hexToRgb01(theme.card));
	const revealFringeColor = $derived(mix01(theme.card, theme.accent, 0.35));
	const revealAccentColor = $derived(hexToRgb01(theme.accent));

	$effect(() => {
		if (typeof window === 'undefined') return;
		const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
		if (saved && THEMES.some((t) => t.id === saved) && saved !== themeId) {
			themeId = saved;
			backColor = { ...hexToRgb255(themeById(saved).paper) };
		}
	});

	function selectTheme(e: Event) {
		const next = (e.target as HTMLSelectElement).value;
		themeId = next;
		// Re-anchor the playground background to the new palette.
		backColor = { ...paperColor };
		try {
			window.localStorage.setItem(THEME_STORAGE_KEY, next);
		} catch {}
	}

	$effect(() => {
		// Paint the document behind the centered column too (the layout
		// default is a fixed near-black).
		if (typeof document === 'undefined') return;
		document.documentElement.style.background = theme.paper;
		document.body.style.background = theme.paper;
		document.body.style.color = theme.ink;
	});

	const installCmd = 'npm install svelte-fluid';
	let copied = $state(false);

	async function copyInstall() {
		try {
			await navigator.clipboard.writeText(installCmd);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {}
	}

	// Above-the-fold quickstart: the minimal end-to-end usage.
	const quickstartCode = `<` + `script>
  import { Fluid } from 'svelte-fluid';
</` + `script>

<div style="width: 100%; height: 420px">
  <Fluid />
</div>`;
	let copiedQuick = $state(false);
	async function copyQuickstart() {
		try {
			await navigator.clipboard.writeText(quickstartCode);
			copiedQuick = true;
			setTimeout(() => (copiedQuick = false), 1600);
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
	type Mode = 'fluid' | 'flow' | 'reveal' | 'sticky' | 'distortion';
	type FlowScene = 'GasFlare' | 'Venturi' | 'Karman' | 'TeslaValve' | 'CustomFlow';
	type FlowBoundaryPreset = 'channel' | 'open' | 'box';
	type FlowVisualizationChoice = 'dye' | 'speed' | 'temperature';
	type FlowTransferChoice = 'ink' | 'water' | 'fire' | 'cfd';

	let mode = $state<Mode>('fluid');
	let flowScene = $state<FlowScene>('Venturi');

	let curl = $state(30);
	let splatRadius = $state(0.25);
	let splatForce = $state(6000);
	let densityDissipation = $state(1.0);
	let velocityDissipation = $state(0.2);
	let pressure = $state(0.8);
	let maxTimeStep = $state(1 / 60);
	let substeps = $state(1);
	let viscosity = $state(0);
	let viscosityIterations = $state(8);
	let wallFriction = $state(0);
	let wallFrictionWidth = $state(1);
	let pressureIterations = $state(20);

	let autoSplatRate = $state(0.45);
	let autoSplatCount = $state(1);
	let autoSplatVelocityX = $state(0);
	let autoSplatVelocityY = $state(0);
	let autoSplatCenterX = $state(0.5);
	let autoSplatCenterY = $state(0.5);
	let autoSplatBandWidth = $state(1.0);
	let autoSplatBandHeight = $state(1.6);
	let autoSplatSwirl = $state(350);
	let autoSplatEvenX = $state(false);

	let bloom = $state(true);
	let shading = $state(true);
	let sunrays = $state(true);
	let colorful = $state(true);
	let splatOnHover = $state(true);
	let transparent = $state(false);

	let backColor = $state<RGB>({ ...defaultPaper });

	let containerType = $state<'none' | 'circle' | 'roundedRect' | 'frame' | 'annulus'>('none');
	let glass = $state(false);

	// Reveal-only (defaults mirror the FluidReveal component + showcase cards)
	let revealSensitivity = $state(0.1);
	let revealAutoReveal = $state(false);
	let revealAutoRevealSpeed = $state(0.8);
	let revealFadeBack = $state(true);

	// Sticky-only
	let stickyText = $state('FLUID');
	let stickyAutoAnimateOn = $state(true);

	// Distortion-only
	let distortionStrength = $state(0.35);
	let distortionIntensity = $state(24);

	// Flow playground
	let flowBoundaryPreset = $state<FlowBoundaryPreset>('channel');
	let flowSourceRate = $state(44);
	let flowSourceVelocity = $state(360);
	let flowSourceWidth = $state(0.58);
	let flowOutletWidth = $state(0.04);
	let flowScalarHeat = $state(1.4);
	let flowPressureForce = $state(18);
	let flowBuoyancy = $state(55);
	let flowVisualization = $state<FlowVisualizationChoice>('dye');
	let flowTransfer = $state<FlowTransferChoice>('ink');

	let activePreset = $state<string | null>(null);
	// When set, the stage renders the exact registry preset (full fidelity).
	// Adjusting any control or switching modes forks into the editor.
	let presetView = $state<string | null>(null);
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
		maxTimeStep?: number;
		substeps?: number;
		viscosity?: number;
		viscosityIterations?: number;
		wallFriction?: number;
		wallFrictionWidth?: number;
		pressure?: number;
		pressureIterations?: number;
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
		revealSensitivity?: number;
		flowScene?: FlowScene;
	};

	const PRESETS: Record<string, Preset> = {
		Default: {
			mode: 'fluid',
			curl: 30,
			splatRadius: 0.25,
			splatForce: 6000,
			densityDissipation: 1.0,
			velocityDissipation: 0.2,
			maxTimeStep: 1 / 60,
			substeps: 1,
			viscosity: 0,
			viscosityIterations: 8,
			wallFriction: 0,
			wallFrictionWidth: 1,
			pressure: 0.8,
			pressureIterations: 20,
			bloom: true,
			shading: true,
			sunrays: true,
			colorful: true,
			splatOnHover: true,
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
			containerType: 'roundedRect',
			glass: true
		},
		GasFlare: {
			mode: 'flow',
			flowScene: 'GasFlare'
		},
		Venturi: {
			mode: 'flow',
			flowScene: 'Venturi'
		},
		Karman: {
			mode: 'flow',
			flowScene: 'Karman'
		},
		TeslaValve: {
			mode: 'flow',
			flowScene: 'TeslaValve'
		},
		Reveal: {
			mode: 'reveal',
			curl: 0,
			velocityDissipation: 0.95,
			splatRadius: 0.2,
			pressure: 1.0,
			pressureIterations: 10,
			bloom: false,
			shading: false,
			sunrays: false,
			colorful: true,
			splatOnHover: false,
			containerType: 'none',
			glass: false,
			revealAutoReveal: false,
			revealFadeBack: true,
			revealSensitivity: 0.1
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
		presetView = null;
		mode = p.mode;
		if (p.curl !== undefined) curl = p.curl;
		if (p.splatRadius !== undefined) splatRadius = p.splatRadius;
		if (p.splatForce !== undefined) splatForce = p.splatForce;
		if (p.densityDissipation !== undefined) densityDissipation = p.densityDissipation;
		if (p.velocityDissipation !== undefined) velocityDissipation = p.velocityDissipation;
		if (p.maxTimeStep !== undefined) maxTimeStep = p.maxTimeStep;
		if (p.substeps !== undefined) substeps = p.substeps;
		if (p.viscosity !== undefined) viscosity = p.viscosity;
		if (p.viscosityIterations !== undefined) viscosityIterations = p.viscosityIterations;
		if (p.wallFriction !== undefined) wallFriction = p.wallFriction;
		if (p.wallFrictionWidth !== undefined) wallFrictionWidth = p.wallFrictionWidth;
		if (p.pressure !== undefined) pressure = p.pressure;
		if (p.pressureIterations !== undefined) pressureIterations = p.pressureIterations;
		if (p.bloom !== undefined) bloom = p.bloom;
		if (p.shading !== undefined) shading = p.shading;
		if (p.sunrays !== undefined) sunrays = p.sunrays;
		if (p.colorful !== undefined) colorful = p.colorful;
		if (p.splatOnHover !== undefined) splatOnHover = p.splatOnHover;
		if (p.transparent !== undefined) transparent = p.transparent;
		// Presets re-anchor the background to the active theme unless they
		// pin an explicit color.
		backColor = { ...(p.backColor ?? paperColor) };
		if (p.containerType !== undefined) containerType = p.containerType;
		if (p.glass !== undefined) glass = p.glass;
		if (p.stickyText !== undefined) stickyText = p.stickyText;
		if (p.distortionStrength !== undefined) distortionStrength = p.distortionStrength;
		if (p.distortionIntensity !== undefined) distortionIntensity = p.distortionIntensity;
		if (p.revealAutoReveal !== undefined) revealAutoReveal = p.revealAutoReveal;
		if (p.revealFadeBack !== undefined) revealFadeBack = p.revealFadeBack;
		if (p.revealSensitivity !== undefined) revealSensitivity = p.revealSensitivity;
		if (p.flowScene !== undefined) flowScene = p.flowScene;
		activePreset = name;
		if (mode === 'sticky') stickyKey++;
		if (mode === 'distortion') distortKey++;
		if (mode === 'reveal') revealKey++;
	}

	function resetPlayground() {
		applyPreset('Default');
		activePreset = null;
	}

	/**
	 * "Open in playground" on showcase cards: apply the nearest playground
	 * preset (optionally overriding the container shape for shape/glass
	 * cards) and scroll down to the playground stage.
	 */
	function openInPlayground(preset: string, container?: typeof containerType) {
		applyPreset(preset);
		if (container !== undefined) {
			containerType = container;
			markCustom();
		}
		document.getElementById('playground')?.scrollIntoView({ behavior: 'smooth' });
	}

	// "View code" snippets for the showcase cards. Wrapper presets are
	// zero-config one-liners; raw <Fluid> cards mirror their live props
	// (minus seed/lazy/backColor, which are site presentation concerns).
	const SHAPE_GLASS_PROPS =
		'\tglass\n\tglassRefraction={0.45}\n\tglassReflectivity={0.12}\n\tglassChromatic={0.25}\n\tglassThickness={0.05}\n';
	const SHAPE_PHYSICS_PROPS =
		'\tcurl={28}\n\tdensityDissipation={0.35}\n\tvelocityDissipation={0.1}\n\tsplatRadius={0.32}\n\tsplatForce={4500}\n\tbloomIntensity={0.5}\n\tsunrays={false}\n\tinitialSplatCount={10}\n\tautoSplatRate={0.45}\n\tautoSplatSwirl={350}\n\tsplatOnHover\n';
	const SNIPPETS = {
		roundedRect:
			'<Fluid\n' +
			SHAPE_GLASS_PROPS +
			"\tcontainerShape={{ type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.5, halfH: 0.5, cornerRadius: 0.07 }}\n" +
			SHAPE_PHYSICS_PROPS +
			'/>',
		svgPath:
			'<Fluid\n' +
			SHAPE_GLASS_PROPS +
			"\tcontainerShape={{ type: 'svgPath', d: lightningPath, viewBox: [0, 0, 100, 100] }}\n" +
			SHAPE_PHYSICS_PROPS +
			'/>',
		crystalOrb:
			"<Fluid\n\tglass\n\tglassRefraction={0.85}\n\tglassReflectivity={0.18}\n\tglassChromatic={0.6}\n\tglassThickness={0.1}\n\tcontainerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.42 }}\n\tcurl={32}\n\tdensityDissipation={0.18}\n\tvelocityDissipation={0.06}\n\tsplatRadius={0.35}\n\tsplatForce={4500}\n\tbloomIntensity={0.4}\n\tsunrays={false}\n\tinitialSplatCount={12}\n\tautoSplatRate={1.0}\n\tautoSplatBandHeight={0.8}\n\tautoSplatSwirl={500}\n\tsplatOnHover\n/>",
		softLens:
			"<Fluid\n\tglass\n\tglassRefraction={0.3}\n\tglassReflectivity={0.08}\n\tglassChromatic={0.12}\n\tglassThickness={0.04}\n\tcontainerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.42 }}\n\tcurl={28}\n\tdensityDissipation={0.4}\n\tvelocityDissipation={0.12}\n\tsplatRadius={0.25}\n\tsplatForce={4500}\n\tbloomIntensity={0.4}\n\tsunraysWeight={0.4}\n\tinitialSplatCount={15}\n\tautoSplatRate={2.0}\n\tautoSplatCount={2}\n\tautoSplatBandHeight={0.8}\n\tautoSplatSwirl={400}\n\tsplatOnHover\n/>",
		portalRing:
			"<Fluid\n\tglass\n\tglassRefraction={0.7}\n\tglassReflectivity={0.18}\n\tglassChromatic={0.7}\n\tglassThickness={0.06}\n\tcontainerShape={{ type: 'annulus', cx: 0.5, cy: 0.5, innerRadius: 0.18, outerRadius: 0.42 }}\n\tcurl={36}\n\tdensityDissipation={0.25}\n\tvelocityDissipation={0.1}\n\tsplatRadius={0.3}\n\tsplatForce={4500}\n\tbloomIntensity={0.45}\n\tsunrays={false}\n\tinitialSplatCount={10}\n\tautoSplatRate={1.2}\n\tautoSplatBandHeight={0.6}\n\tautoSplatSwirl={400}\n\tsplatOnHover\n/>",
		glassFrame:
			"<Fluid\n\tglass\n\tglassRefraction={0.6}\n\tglassReflectivity={0.2}\n\tglassChromatic={0.5}\n\tglassThickness={0.07}\n\tcontainerShape={{\n\t\ttype: 'frame',\n\t\tcx: 0.5, cy: 0.5,\n\t\thalfW: 0.22, halfH: 0.22, innerCornerRadius: 0.04,\n\t\touterHalfW: 0.48, outerHalfH: 0.48, outerCornerRadius: 0.05\n\t}}\n\tcurl={24}\n\tdensityDissipation={0.22}\n\tvelocityDissipation={0.1}\n\tsplatRadius={0.32}\n\tsplatForce={4500}\n\tbloomIntensity={0.55}\n\tsunrays={false}\n\tinitialSplatCount={10}\n\tautoSplatRate={2.5}\n\tautoSplatCount={2}\n\tautoSplatBandHeight={1.5}\n\tautoSplatSwirl={350}\n\tsplatOnHover\n/>",
		stickyFluid:
			'<FluidStick\n\ttext="FLUID"\n\tfont="900 110px Geist, Inter, sans-serif"\n\tautoAnimateDuration={4}\n\tdensityDissipation={0.92}\n\tsplatRadius={0.18}\n\tbloom={false}\n/>',
		stickyInfinity:
			'<FluidStick\n\ttext="∞"\n\tfont="220px Georgia, serif"\n\tautoAnimateDuration={4}\n\tdensityDissipation={0.997}\n\tsplatRadius={0.18}\n\tbloom={false}\n/>',
		revealScratch:
			'<FluidReveal velocityDissipation={0.95} pressureIterations={10}>\n\t<div>Revealed</div>\n</FluidReveal>',
		revealAuto:
			'<FluidReveal\n\tautoReveal\n\tautoRevealSpeed={0.8}\n\tfadeBack={false}\n\tsensitivity={0.15}\n\tvelocityDissipation={0.95}\n>\n\t<div>Auto reveal</div>\n</FluidReveal>',
		distortSubtle:
			'<FluidDistortion src="/bosch-garden.jpg" strength={0.3} intensity={20} fit="cover" initialSplats={6} />',
		distortStrong:
			'<FluidDistortion src="/bosch-garden.jpg" strength={0.45} intensity={28} fit="cover" initialSplats={6} />'
	};

	function markCustom() {
		activePreset = null;
		// Touching a control forks out of the faithful preset render into the editor.
		presetView = null;
	}

	/**
	 * "Open in Playground" for a registry preset: render the EXACT preset for
	 * full fidelity (presetView) and hydrate the editable controls from its
	 * config so adjusting any control forks into the editor. Flow/SVG presets
	 * keep dimensions the sliders can't represent (presetSplats, flow scene,
	 * obstruction masks) until you fork.
	 */
	function openRegistryPreset(id: string) {
		const def = PRESET_BY_ID[id];
		if (!def) return;
		const s = presetToEditorState(def);
		mode = s.mode;
		if (s.flowScene) flowScene = s.flowScene;
		containerType = s.containerType;
		glass = s.glass;
		if (s.backColor) backColor = { ...s.backColor };
		const sc = s.scalars;
		if (sc.curl !== undefined) curl = sc.curl;
		if (sc.splatRadius !== undefined) splatRadius = sc.splatRadius;
		if (sc.splatForce !== undefined) splatForce = sc.splatForce;
		if (sc.densityDissipation !== undefined) densityDissipation = sc.densityDissipation;
		if (sc.velocityDissipation !== undefined) velocityDissipation = sc.velocityDissipation;
		if (sc.maxTimeStep !== undefined) maxTimeStep = sc.maxTimeStep;
		if (sc.substeps !== undefined) substeps = sc.substeps;
		if (sc.viscosity !== undefined) viscosity = sc.viscosity;
		if (sc.viscosityIterations !== undefined) viscosityIterations = sc.viscosityIterations;
		if (sc.wallFriction !== undefined) wallFriction = sc.wallFriction;
		if (sc.wallFrictionWidth !== undefined) wallFrictionWidth = sc.wallFrictionWidth;
		if (sc.pressure !== undefined) pressure = sc.pressure;
		if (sc.pressureIterations !== undefined) pressureIterations = sc.pressureIterations;
		if (sc.autoSplatRate !== undefined) autoSplatRate = sc.autoSplatRate;
		if (sc.autoSplatCount !== undefined) autoSplatCount = sc.autoSplatCount;
		if (sc.autoSplatVelocityX !== undefined) autoSplatVelocityX = sc.autoSplatVelocityX;
		if (sc.autoSplatVelocityY !== undefined) autoSplatVelocityY = sc.autoSplatVelocityY;
		if (sc.autoSplatCenterX !== undefined) autoSplatCenterX = sc.autoSplatCenterX;
		if (sc.autoSplatCenterY !== undefined) autoSplatCenterY = sc.autoSplatCenterY;
		if (sc.autoSplatBandWidth !== undefined) autoSplatBandWidth = sc.autoSplatBandWidth;
		if (sc.autoSplatBandHeight !== undefined) autoSplatBandHeight = sc.autoSplatBandHeight;
		if (sc.autoSplatSwirl !== undefined) autoSplatSwirl = sc.autoSplatSwirl;
		const bo = s.bools;
		if (bo.bloom !== undefined) bloom = bo.bloom;
		if (bo.shading !== undefined) shading = bo.shading;
		if (bo.sunrays !== undefined) sunrays = bo.sunrays;
		if (bo.colorful !== undefined) colorful = bo.colorful;
		if (bo.splatOnHover !== undefined) splatOnHover = bo.splatOnHover;
		if (bo.transparent !== undefined) transparent = bo.transparent;
		if (bo.autoSplatEvenX !== undefined) autoSplatEvenX = bo.autoSplatEvenX;
		activePreset = id;
		presetView = id;
		document.getElementById('playground')?.scrollIntoView({ behavior: 'smooth' });
	}

	// Deep link: `/?preset=<id>#playground` opens that preset in the playground.
	let deepLinkHandled = false;
	$effect(() => {
		if (deepLinkHandled || typeof window === 'undefined') return;
		deepLinkHandled = true;
		const param = new URLSearchParams(window.location.search).get('preset');
		const id = parsePresetParam(
			param,
			REGISTRY_PRESETS.map((p) => p.id)
		);
		if (id) openRegistryPreset(id);
	});

	const flowBoundary = $derived.by(() => {
		if (flowBoundaryPreset === 'open') {
			return { left: 'open', right: 'open', top: 'open', bottom: 'open' } as const;
		}
		if (flowBoundaryPreset === 'box') {
			return { left: 'wall', right: 'wall', top: 'wall', bottom: 'wall' } as const;
		}
		return { left: 'open', right: 'open', top: 'wall', bottom: 'wall' } as const;
	});

	const customFlowConfig = $derived.by<FlowConfig>(() => {
		const halfSource = Math.min(0.48, flowSourceWidth / 2);
		const visualization =
			flowVisualization === 'temperature'
				? {
						colorBy: 'temperature' as const,
						scalar: 'temperature',
						glowBy: 'scalar' as const,
						transfer: flowTransfer === 'cfd' ? ('fire' as const) : flowTransfer,
						range: [0, 2.6] as [number, number],
						scale: 1
					}
				: flowVisualization === 'speed'
					? {
							colorBy: 'speed' as const,
							glowBy: 'none' as const,
							transfer: 'cfd' as const,
							range: [0, 340] as [number, number],
							scale: 1
						}
					: {
							colorBy: 'dye' as const,
							glowBy: 'none' as const,
							transfer: flowTransfer,
							range: [0, 1.4] as [number, number],
							scale: 1
						};

		return {
			mode: 'live',
			boundary: flowBoundary,
			sources: [
				{
					kind: 'line',
					from: { x: 0.08, y: 0.5 - halfSource },
					to: { x: 0.08, y: 0.5 + halfSource },
					thickness: 0.035,
					velocity: { x: flowSourceVelocity, y: 0 },
					dye: { r: 0.12, g: 0.55, b: 1.0 },
					scalars: { temperature: flowScalarHeat },
					rate: flowSourceRate,
					radius: 0.055,
					profile: 'parabolic'
				}
			],
			outlets: [
				{
					edge: 'right',
					from: 0,
					to: 1,
					width: flowOutletWidth,
					clearDye: 0.18,
					clearScalars: true,
					clearVelocity: true
				},
				...(flowBoundaryPreset === 'open'
					? [
							{ edge: 'top' as const, from: 0, to: 1, width: 0.025, clearDye: 0.12, clearScalars: true },
							{ edge: 'bottom' as const, from: 0, to: 1, width: 0.025, clearDye: 0.12, clearScalars: true }
						]
					: [])
			],
			scalarFields: [
				{
					name: 'temperature',
					dissipation: 0.36,
					advection: 'standard',
					color: { r: 1.0, g: 0.46, b: 0.12 },
					range: [0, 2.6]
				}
			],
			forces: [
				{ kind: 'pressureGradient', vector: { x: flowPressureForce, y: 0 } },
				{
					kind: 'buoyancy',
					scalar: 'temperature',
					direction: { x: 0, y: 1 },
					strength: flowBuoyancy,
					ambient: 0.02
				}
			],
			visualization
		};
	});

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
	let backColorHex = $state(rgbToHex(defaultPaper));
	$effect(() => {
		const next = rgbToHex(backColor);
		if (backColorHex !== next) backColorHex = next;
	});
	function onBackColorInput(e: Event) {
		backColorHex = (e.target as HTMLInputElement).value;
		if (/^#[a-f\d]{6}$/i.test(backColorHex)) backColor = hexToRgb(backColorHex);
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
		// Viewing a library preset: the code is the zero-config wrapper.
		if (presetView) return presetUsageSnippet(presetView);
		if (mode === 'flow' && flowScene !== 'CustomFlow') return `<${flowScene} />`;
		const lines: string[] = [];
		const tag =
			mode === 'flow'
				? 'Fluid'
				: mode === 'reveal'
					? 'FluidReveal'
					: mode === 'sticky'
						? 'FluidStick'
						: mode === 'distortion'
							? 'FluidDistortion'
							: 'Fluid';
		const fmt = (n: number) => Number(n.toFixed(4)).toString();
		if (mode === 'flow') {
			lines.push(`\tflow={${formatFlowConfig(customFlowConfig)}}`);
			lines.push(`\topenBoundary`);
			lines.push(`\tshading={false}`);
			lines.push(`\tcolorful={false}`);
			lines.push(`\tbloom={false}`);
			lines.push(`\tsunrays={false}`);
			lines.push(`\tinitialSplatCount={0}`);
			lines.push(`\tpointerInput={false}`);
			lines.push(`\tsplatOnHover={false}`);
		}
		if (curl !== 30) lines.push(`\tcurl={${curl}}`);
		if (splatRadius !== 0.25) lines.push(`\tsplatRadius={${fmt(splatRadius)}}`);
		if (splatForce !== 6000) lines.push(`\tsplatForce={${splatForce}}`);
		// In reveal mode densityDissipation is owned by fadeBack, not the slider.
		if (mode !== 'reveal' && densityDissipation !== 1.0)
			lines.push(`\tdensityDissipation={${fmt(densityDissipation)}}`);
		if (velocityDissipation !== 0.2) lines.push(`\tvelocityDissipation={${fmt(velocityDissipation)}}`);
		if (Math.abs(maxTimeStep - 1 / 60) > 0.0008) lines.push(`\tmaxTimeStep={${fmt(maxTimeStep)}}`);
		if (substeps !== 1) lines.push(`\tsubsteps={${substeps}}`);
		if (viscosity !== 0) lines.push(`\tviscosity={${fmt(viscosity)}}`);
		if (viscosityIterations !== 8) lines.push(`\tviscosityIterations={${viscosityIterations}}`);
		if (wallFriction !== 0) lines.push(`\twallFriction={${fmt(wallFriction)}}`);
		if (wallFrictionWidth !== 1) lines.push(`\twallFrictionWidth={${fmt(wallFrictionWidth)}}`);
		if (pressure !== 0.8) lines.push(`\tpressure={${fmt(pressure)}}`);
		if (pressureIterations !== 20) lines.push(`\tpressureIterations={${pressureIterations}}`);
		if (mode === 'fluid') {
			if (autoSplatRate !== 0.45) lines.push(`\tautoSplatRate={${fmt(autoSplatRate)}}`);
			if (autoSplatCount !== 1) lines.push(`\tautoSplatCount={${autoSplatCount}}`);
			if (autoSplatVelocityX !== 0) lines.push(`\tautoSplatVelocityX={${autoSplatVelocityX}}`);
			if (autoSplatVelocityY !== 0) lines.push(`\tautoSplatVelocityY={${autoSplatVelocityY}}`);
			if (autoSplatCenterX !== 0.5) lines.push(`\tautoSplatCenterX={${fmt(autoSplatCenterX)}}`);
			if (autoSplatCenterY !== 0.5) lines.push(`\tautoSplatCenterY={${fmt(autoSplatCenterY)}}`);
			if (autoSplatBandWidth !== 1.0) lines.push(`\tautoSplatBandWidth={${fmt(autoSplatBandWidth)}}`);
			if (autoSplatBandHeight !== 1.6) lines.push(`\tautoSplatBandHeight={${fmt(autoSplatBandHeight)}}`);
			if (autoSplatSwirl !== 350) lines.push(`\tautoSplatSwirl={${autoSplatSwirl}}`);
			if (autoSplatEvenX) lines.push(`\tautoSplatEvenX`);
		}
			if (mode !== 'flow') {
				if (!bloom) lines.push(`\tbloom={false}`);
				if (!shading) lines.push(`\tshading={false}`);
				if (!sunrays) lines.push(`\tsunrays={false}`);
				if (!colorful) lines.push(`\tcolorful={false}`);
				if (splatOnHover) lines.push(`\tsplatOnHover`);
				if (transparent) lines.push(`\ttransparent`);
				const d = paperColor;
				if (
					mode !== 'reveal' &&
					(backColor.r !== d.r || backColor.g !== d.g || backColor.b !== d.b)
				)
					lines.push(`\tbackColor={{ r: ${backColor.r}, g: ${backColor.g}, b: ${backColor.b} }}`);
				if (containerType !== 'none' && containerShape) {
					const cs = containerShape;
					lines.push(`\tcontainerShape={${JSON.stringify(cs).replace(/"([^"]+)":/g, '$1: ')}}`);
				}
				if (glass) lines.push(`\tglass`);
			}
			if (mode === 'sticky') lines.push(`\ttext="${stickyText}"`);
			if (mode === 'sticky' && !stickyAutoAnimateOn) lines.push(`\tautoAnimate={false}`);
		if (mode === 'distortion') {
			lines.push(`\tsrc="${base}/bosch-garden.jpg"`);
			lines.push(`\tstrength={${distortionStrength}}`);
			lines.push(`\tintensity={${distortionIntensity}}`);
		}
		if (mode === 'reveal') {
			if (revealAutoReveal) lines.push(`\tautoReveal`);
			// Compare against FluidReveal component defaults, not playground state defaults.
			if (revealSensitivity !== 0.1) lines.push(`\tsensitivity={${fmt(revealSensitivity)}}`);
			if (revealAutoRevealSpeed !== 1.0) lines.push(`\tautoRevealSpeed={${fmt(revealAutoRevealSpeed)}}`);
			if (!revealFadeBack) lines.push(`\tfadeBack={false}`);
			const rgb01 = (c: RGB) => `{{ r: ${fmt(c.r)}, g: ${fmt(c.g)}, b: ${fmt(c.b)} }}`;
			lines.push(`\tcoverColor=${rgb01(revealCoverColor)}`);
			lines.push(`\tfringeColor=${rgb01(revealFringeColor)}`);
			lines.push(`\taccentColor=${rgb01(revealAccentColor)}`);
		}
		if (lines.length === 0) return `<${tag} />`;
		return `<${tag}\n${lines.join('\n')}\n/>`;
	});

	function formatFlowConfig(flow: FlowConfig) {
		const j = JSON.stringify(flow, null, 2);
		return j
			.replace(/"([A-Za-z_$][\w$]*)":/g, '$1:')
			.replace(/\n/g, '\n\t')
			.replace(/^\{/, '{')
			.replace(/\}$/, '}');
	}

	async function copySnippet() {
		try {
			await navigator.clipboard.writeText(playgroundSnippet);
			copiedSnippet = true;
			setTimeout(() => (copiedSnippet = false), 1200);
		} catch {}
	}

	function setMode(m: Mode) {
		presetView = null;
		if (m === mode) return;
		mode = m;
		activePreset = m === 'flow' ? flowScene : null;
		if (m === 'sticky') stickyKey++;
		if (m === 'distortion') distortKey++;
		if (m === 'reveal') revealKey++;
	}

	function selectFlowScene(e: Event) {
		presetView = null;
		flowScene = (e.currentTarget as HTMLSelectElement).value as FlowScene;
		activePreset = flowScene;
	}
</script>

<svelte:head>
	<title>svelte-fluid — fluid simulation for Svelte 5</title>
	<meta
		name="description"
		content="A Svelte 5 WebGL fluid component with backgrounds, reveal masks, sticky text, distortion, glass containers, flow sources, scalar fields, and obstruction presets."
	/>
</svelte:head>

<FluidBackground
	exclude=".card, .panel, .nav, .install, .footer"
	excludeRadius={20}
	excludePad={6}
	colorful={false}
	shading
	bloom
	bloomIntensity={0.3}
	sunrays={false}
	simResolution={96}
	dyeResolution={768}
	autoSplatRate={stickyAutoAnimate ? 0.18 : 0}
	autoSplatCount={2}
	autoSplatSwirl={0.5}
	velocityDissipation={0.18}
	densityDissipation={0.7}
	splatRadius={0.15}
	backColor={paperColor}
	seed={777}
>
	<main class="page" style={themeStyle(theme)}>
		<nav class="nav" aria-label="Primary">
			<a class="brand" href="{base}/">
				<span class="brand-mark" aria-hidden="true"></span>
				<span class="brand-name">svelte-fluid</span>
			</a>
			<div class="nav-links">
				<a href="{base}/docs">Docs</a>
				<a href="{base}/for-agents">For Agents</a>
				<a href="{base}/#flow-scenes">Flow</a>
				<a href="{base}/docs/presets">Presets</a>
				<a href="{base}/docs/api">API</a>
				<a href="https://github.com/tommyyzhao/svelte-fluid" target="_blank" rel="noopener">GitHub</a>
			</div>
			<label class="theme-switcher" title="Color theme">
				<span class="theme-dot" style={`background: ${theme.accent}`} aria-hidden="true"></span>
				<select value={themeId} onchange={selectTheme} aria-label="Color theme">
					{#each THEME_GROUPS as group (group)}
						<optgroup label={group}>
							{#each THEMES.filter((t) => t.group === group) as t (t.id)}
								<option value={t.id}>{t.name}</option>
							{/each}
						</optgroup>
					{/each}
				</select>
			</label>
		</nav>

		<section class="hero">
			<h1 class="display">
				WebGL fluid simulation,<br />
				as a Svelte&nbsp;5 component.
			</h1>
			<p class="lede">
				Multi-instance, resize-stable, deterministic seeding. Drop one tag into any sized
				container and ship a fluid hero, background, interactive surface, or solver-native
				flow scene.
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

		<section class="quickstart" aria-label="Quick start">
			<div class="quickstart-head">
				<span class="quickstart-title">Get started in 10 seconds</span>
				<button
					class="copy-btn"
					type="button"
					onclick={copyQuickstart}
					aria-label="Copy quick-start code"
				>
					{copiedQuick ? 'Copied' : 'Copy'}
				</button>
			</div>
			<pre class="quickstart-code"><code>{quickstartCode}</code></pre>
			<p class="quickstart-note">
				No props required — <code>&lt;Fluid /&gt;</code> fills its parent. Requires Svelte 5, zero
				runtime dependencies. See the <a href="{base}/docs">docs</a> for presets, container shapes,
				and the imperative API.
			</p>
		</section>

		<!-- PRESETS -->
			<section class="section">
				<header class="section-head">
					<h2>Visual presets</h2>
					<p>Six featured visual wrappers from the 14 exported presets.</p>
				</header>
				<div class="grid grid-3">
					<Card title="LavaLamp" blurb="Slow warm blobs." snippet="<LavaLamp />" fullSnippet={presetScaffoldSnippet('LavaLamp')}>
						<LavaLamp seed={11} lazy backColor={cardColor} aria-label="LavaLamp preset" />
					</Card>
					<Card title="Plasma" blurb="High-energy chromatic turbulence." snippet="<Plasma />" fullSnippet={presetScaffoldSnippet('Plasma')}>
						<Plasma seed={22} lazy backColor={cardColor} aria-label="Plasma preset" />
					</Card>
					<Card title="InkInWater" blurb="Saturated dye dispersing." snippet="<InkInWater />" fullSnippet={presetScaffoldSnippet('InkInWater')}>
						<InkInWater seed={33} lazy backColor={cardColor} aria-label="InkInWater preset" />
					</Card>
					<Card title="FrozenSwirl" blurb="Crystalline vortex." snippet="<FrozenSwirl />" fullSnippet={presetScaffoldSnippet('FrozenSwirl')}>
						<FrozenSwirl seed={44} lazy backColor={cardColor} aria-label="FrozenSwirl preset" />
					</Card>
					<Card title="Aurora" blurb="Drifting polar ribbons." snippet="<Aurora />" fullSnippet={presetScaffoldSnippet('Aurora')}>
						<Aurora seed={55} lazy backColor={cardColor} aria-label="Aurora preset" />
					</Card>
					<Card title="Toroidal" blurb="Annular storm." snippet="<Toroidal />" fullSnippet={presetScaffoldSnippet('Toroidal')}>
						<Toroidal seed={66} lazy backColor={cardColor} aria-label="Toroidal preset" />
					</Card>
				</div>
			</section>

			<!-- FLOW SCENES -->
		<section class="section" id="flow-scenes">
			<header class="section-head">
				<h2>Flow scenes</h2>
				<p>
					Persistent sources, scalar fields, outlets, and physical obstruction masks. Move the
					cursor through a scene to stir it.
				</p>
			</header>
			<div class="grid grid-2">
				<Card
					title="GasFlare"
					blurb="Temperature scalar with buoyancy."
					snippet="<GasFlare />" fullSnippet={presetScaffoldSnippet('GasFlare')}
					onCustomize={() => openInPlayground('GasFlare')}
				>
					<GasFlare seed={701} lazy aria-label="GasFlare flow scene" />
				</Card>
				<Card
					title="Venturi"
					blurb="Pressure-driven throat speed-up."
					snippet="<Venturi />" fullSnippet={presetScaffoldSnippet('Venturi')}
					onCustomize={() => openInPlayground('Venturi')}
				>
					<Venturi seed={702} lazy backColor={cardColor} aria-label="Venturi flow scene" />
				</Card>
				<Card
					title="Karman"
					blurb="Streakline rake shedding around a painted cylinder."
					snippet="<Karman />" fullSnippet={presetScaffoldSnippet('Karman')}
					onCustomize={() => openInPlayground('Karman')}
				>
					<Karman seed={703} lazy aria-label="Karman flow scene" />
				</Card>
				<Card
					title="TeslaValve"
					blurb="Forward routing with bypass recirculation."
					snippet="<TeslaValve />" fullSnippet={presetScaffoldSnippet('TeslaValve')}
					onCustomize={() => openInPlayground('TeslaValve')}
				>
					<TeslaValve seed={704} lazy aria-label="TeslaValve flow scene" />
				</Card>
			</div>
		</section>

		<!-- SHAPES (merged: exported shape wrappers + raw containerShape configs) -->
		<section class="section">
			<header class="section-head">
				<h2>Shapes</h2>
				<p>
					Six container primitives — as exported shape wrappers where one exists, or raw
					<code>containerShape</code> configs otherwise.
				</p>
			</header>
			<div class="grid grid-3">
				<Card
					title="CircularFluid"
					blurb="Vivid fluid in a circular boundary."
					snippet="<CircularFluid />" fullSnippet={presetScaffoldSnippet('CircularFluid')}
					height={220}
					onCustomize={() => openInPlayground('Glass', 'circle')}
				>
					<CircularFluid seed={81} lazy backColor={cardColor} aria-label="CircularFluid preset" />
				</Card>
				<Card
					title="Rounded Rect"
					blurb="Raw containerShape with a glass edge."
					snippet={SNIPPETS.roundedRect}
					height={220}
					onCustomize={() => openInPlayground('Glass', 'roundedRect')}
				>
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
						autoSplatRate={stickyAutoAnimate ? 0.45 : 0}
						autoSplatCount={1}
						autoSplatBandHeight={1.6}
						autoSplatSwirl={350}
						splatOnHover
						aria-label="Rounded rect container demo"
					/>
				</Card>
				<Card
					title="FrameFluid"
					blurb="Circulation around an inner cutout."
					snippet="<FrameFluid />" fullSnippet={presetScaffoldSnippet('FrameFluid')}
					height={220}
					onCustomize={() => openInPlayground('Glass', 'frame')}
				>
					<FrameFluid seed={82} lazy backColor={cardColor} aria-label="FrameFluid preset" />
				</Card>
				<Card
					title="AnnularFluid"
					blurb="Ring vortex between two circles."
					snippet="<AnnularFluid />" fullSnippet={presetScaffoldSnippet('AnnularFluid')}
					height={220}
					onCustomize={() => openInPlayground('Glass', 'annulus')}
				>
					<AnnularFluid seed={83} lazy backColor={cardColor} aria-label="AnnularFluid preset" />
				</Card>
				<Card
					title="SVG Path"
					blurb="Raw svgPath container (lightning)."
					snippet={SNIPPETS.svgPath}
					height={220}
				>
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
						autoSplatRate={stickyAutoAnimate ? 0.45 : 0}
						autoSplatCount={1}
						autoSplatBandHeight={1.6}
						autoSplatSwirl={350}
						splatOnHover
						aria-label="SVG path lightning container demo"
					/>
				</Card>
				<Card
					title="SvgPathFluid"
					blurb="Text-mode SVG mask container."
					snippet="<SvgPathFluid />" fullSnippet={presetScaffoldSnippet('SvgPathFluid')}
					height={220}
				>
					<SvgPathFluid seed={84} lazy backColor={cardColor} aria-label="SvgPathFluid preset" />
				</Card>
			</div>
		</section>

		<!-- GLASS -->
		<section class="section">
			<header class="section-head">
				<h2>Glass</h2>
				<p>Refraction, reflectivity, and chromatic fringe. The shader does the work.</p>
			</header>
			<div class="grid grid-2">
				<Card
					title="Crystal orb"
					blurb="High refraction, vivid chroma."
					snippet={SNIPPETS.crystalOrb}
					onCustomize={() => openInPlayground('Glass', 'circle')}
				>
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
				</Card>
				<Card
					title="Soft lens"
					blurb="Low refraction, gentle chroma."
					snippet={SNIPPETS.softLens}
					onCustomize={() => openInPlayground('Glass', 'circle')}
				>
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
				</Card>
				<Card
					title="Portal ring"
					blurb="Annular shape, prismatic edges."
					snippet={SNIPPETS.portalRing}
					onCustomize={() => openInPlayground('Glass', 'annulus')}
				>
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
				</Card>
				<Card
					title="Glass frame"
					blurb="Frame shape, framed."
					snippet={SNIPPETS.glassFrame}
					onCustomize={() => openInPlayground('Glass', 'frame')}
				>
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
				</Card>
			</div>
		</section>

		<!-- STICKY -->
		<section class="section">
			<header class="section-head">
				<h2>Sticky</h2>
				<p>Dye clings to text or SVG paths.</p>
			</header>
			<div class="grid grid-2">
				<Card
					title="Quick fade"
					blurb="Trails evaporate within a second."
					snippet={SNIPPETS.stickyFluid}
					height={240}
					onCustomize={() => openInPlayground('Sticky')}
				>
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
				</Card>
				<Card
					title="Long-lasting dye"
					blurb="Slow dissipation keeps cursor trails around."
					snippet={SNIPPETS.stickyInfinity}
					height={240}
					onCustomize={() => openInPlayground('Sticky')}
				>
					<FluidStick
						text="∞"
						font="220px Georgia, serif"
						seed={222}
						autoAnimate={stickyAutoAnimate}
						autoAnimateDuration={4}
						colorful
						shading
						bloom={false}
						densityDissipation={0.997}
						splatRadius={0.18}
						backColor={cardColor}
						lazy
					/>
				</Card>
			</div>
		</section>

		<!-- REVEAL -->
		<section class="section">
			<header class="section-head">
				<h2>Reveal</h2>
				<p>The simulation as an opacity mask. Move the cursor to uncover.</p>
			</header>
			<div class="grid grid-2">
				<Card
					title="Scratch to reveal"
					snippet={SNIPPETS.revealScratch}
					height={260}
					onCustomize={() => openInPlayground('Reveal')}
				>
					<FluidReveal
						lazy
						velocityDissipation={0.95}
						pressureIterations={10}
						coverColor={revealCoverColor}
						fringeColor={revealFringeColor}
						accentColor={revealAccentColor}
					>
						<div class="reveal-content">Revealed</div>
					</FluidReveal>
				</Card>
				<Card
					title="Auto-reveal"
					snippet={SNIPPETS.revealAuto}
					height={260}
					onCustomize={() => openInPlayground('Reveal')}
				>
					<FluidReveal
						lazy
						autoReveal={stickyAutoAnimate}
						autoRevealSpeed={0.8}
						fadeBack={false}
						velocityDissipation={0.95}
						sensitivity={0.15}
						coverColor={revealCoverColor}
						fringeColor={revealFringeColor}
						accentColor={revealAccentColor}
					>
						<div class="reveal-content">Auto reveal</div>
					</FluidReveal>
				</Card>
			</div>
		</section>

		<!-- DISTORTION -->
		<section class="section">
			<header class="section-head">
				<h2>Distortion</h2>
				<p>An image, warped by the velocity field.</p>
			</header>
			<div class="grid grid-2">
				<Card
					title="Subtle"
					blurb="strength 0.3, intensity 20."
					snippet={SNIPPETS.distortSubtle}
					height={280}
					onCustomize={() => openInPlayground('Distortion')}
				>
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
				</Card>
				<Card
					title="Strong"
					blurb="strength 0.45, intensity 28."
					snippet={SNIPPETS.distortStrong}
					height={280}
					onCustomize={() => openInPlayground('Distortion')}
				>
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
				</Card>
			</div>
		</section>

		<!-- PLAYGROUND -->
		<section class="section playground-section" id="playground">
			<header class="section-head">
				<h2>Playground</h2>
				<p>
					Live component previews with copyable Svelte snippets.
				</p>
			</header>

			<div class="mode-tabs" role="tablist" aria-label="Playground mode">
				{#each (['fluid', 'flow', 'reveal', 'sticky', 'distortion'] as Mode[]) as m (m)}
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
							: m === 'flow'
								? 'Flow scenes'
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

			<div class="preset-chips library-chips" role="group" aria-label="Library presets">
				<span style="opacity:0.6;font-size:0.8rem;align-self:center;margin-right:0.25rem;">Library presets</span>
				{#each REGISTRY_PRESETS as p (p.id)}
					<button
						type="button"
						class="preset-chip"
						class:active={presetView === p.id}
						aria-pressed={presetView === p.id}
						title={p.blurb}
						onclick={() => openRegistryPreset(p.id)}
					>
						{p.name}
					</button>
				{/each}
			</div>

			{#if presetView}
				<p style="margin:0 0 0.75rem;font-size:0.85rem;opacity:0.8;" aria-live="polite">
					Viewing the <strong>{PRESET_BY_ID[presetView].name}</strong> preset, rendered from its exact
					config. Adjust any control or switch tabs to fork it into an editable &lt;Fluid&gt;.
				</p>
			{/if}

			<div class="playground-grid">
				<div class="card playground-stage" aria-label="Interactive playground stage">
					<div class="card-fluid playground-canvas">
						{#if presetView}
							{#key presetView}
								<Fluid
									{...PRESET_BY_ID[presetView].config}
									lazy
									seed={4242}
									aria-label={`${PRESET_BY_ID[presetView].name} preset`}
								/>
							{/key}
						{:else if mode === 'reveal'}
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
										{velocityDissipation}
										{maxTimeStep}
										{substeps}
										{viscosity}
										{viscosityIterations}
										{wallFriction}
										{wallFrictionWidth}
										{pressure}
										{pressureIterations}
										{bloom}
									{shading}
									{sunrays}
									{colorful}
									{splatOnHover}
									{transparent}
									coverColor={revealCoverColor}
									fringeColor={revealFringeColor}
									accentColor={revealAccentColor}
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
										{maxTimeStep}
										{substeps}
										{viscosity}
										{viscosityIterations}
										{wallFriction}
										{wallFrictionWidth}
										{pressure}
										{pressureIterations}
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
										{maxTimeStep}
										{substeps}
										{viscosity}
										{viscosityIterations}
										{wallFriction}
										{wallFrictionWidth}
										{pressure}
										{pressureIterations}
										{splatOnHover}
									{transparent}
								/>
							{/key}
						{:else if mode === 'flow'}
							{#key flowScene}
								{#if flowScene === 'GasFlare'}
									<GasFlare lazy seed={717} aria-label="GasFlare playground scene" />
								{:else if flowScene === 'Karman'}
									<Karman lazy seed={737} aria-label="Karman playground scene" />
									{:else if flowScene === 'TeslaValve'}
										<TeslaValve lazy seed={747} aria-label="TeslaValve playground scene" />
									{:else if flowScene === 'CustomFlow'}
										<Fluid
											lazy
											seed={757}
											flow={customFlowConfig}
											openBoundary
											pointerInput={false}
											splatOnHover={false}
											initialSplatCount={0}
											{curl}
											{splatRadius}
											{splatForce}
											{densityDissipation}
											{velocityDissipation}
											{maxTimeStep}
											{substeps}
											{viscosity}
											{viscosityIterations}
											{wallFriction}
											{wallFrictionWidth}
											{pressure}
											{pressureIterations}
											shading={false}
											colorful={false}
											bloom={false}
											sunrays={false}
											simResolution={128}
											dyeResolution={512}
											backColor={{ r: 6, g: 10, b: 14 }}
											aria-label="Custom FlowConfig playground scene"
										/>
									{:else}
										<Venturi lazy seed={727} backColor={cardColor} aria-label="Venturi playground scene" />
								{/if}
							{/key}
						{:else}
							<Fluid
									lazy
									seed={4242}
									initialSplatCount={20}
									autoSplatRate={stickyAutoAnimate ? autoSplatRate : 0}
									{autoSplatCount}
									{autoSplatVelocityX}
									{autoSplatVelocityY}
									{autoSplatCenterX}
									{autoSplatCenterY}
									{autoSplatBandWidth}
									{autoSplatBandHeight}
									{autoSplatSwirl}
									{autoSplatEvenX}
									{curl}
									{splatRadius}
									{splatForce}
									{densityDissipation}
									{velocityDissipation}
									{maxTimeStep}
									{substeps}
									{viscosity}
									{viscosityIterations}
									{wallFriction}
									{wallFrictionWidth}
									{pressure}
									{pressureIterations}
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
					{#if mode === 'flow'}
						<div class="knob-group">
							<div class="knob-group-title">Scene</div>
							<label class="knob-row">
								<span class="knob-label">preset</span>
								<select value={flowScene} onchange={selectFlowScene} class="select">
									<option value="GasFlare">GasFlare</option>
									<option value="Venturi">Venturi</option>
									<option value="Karman">Karman</option>
									<option value="TeslaValve">TeslaValve</option>
									<option value="CustomFlow">Custom FlowConfig</option>
								</select>
							</label>
						</div>
							{#if flowScene === 'CustomFlow'}
								<div class="knob-group">
									<div class="knob-group-title">Flow API</div>
									<label class="knob-row">
										<span class="knob-label">boundary</span>
										<select bind:value={flowBoundaryPreset} onchange={markCustom} class="select">
											<option value="channel">channel</option>
											<option value="open">open</option>
											<option value="box">box</option>
										</select>
									</label>
									<label class="knob-row">
										<span class="knob-label">source rate</span>
										<input type="range" min="5" max="80" step="1" bind:value={flowSourceRate} oninput={markCustom} />
										<span class="knob-value">{flowSourceRate}</span>
									</label>
									<label class="knob-row">
										<span class="knob-label">source velocity</span>
										<input type="range" min="80" max="720" step="10" bind:value={flowSourceVelocity} oninput={markCustom} />
										<span class="knob-value">{flowSourceVelocity}</span>
									</label>
									<label class="knob-row">
										<span class="knob-label">source height</span>
										<input type="range" min="0.1" max="0.9" step="0.02" bind:value={flowSourceWidth} oninput={markCustom} />
										<span class="knob-value">{flowSourceWidth.toFixed(2)}</span>
									</label>
									<label class="knob-row">
										<span class="knob-label">outlet width</span>
										<input type="range" min="0.01" max="0.1" step="0.005" bind:value={flowOutletWidth} oninput={markCustom} />
										<span class="knob-value">{flowOutletWidth.toFixed(3)}</span>
									</label>
								</div>

								<div class="knob-group">
									<div class="knob-group-title">Scalar + Forces</div>
									<label class="knob-row">
										<span class="knob-label">temperature</span>
										<input type="range" min="0" max="3" step="0.05" bind:value={flowScalarHeat} oninput={markCustom} />
										<span class="knob-value">{flowScalarHeat.toFixed(2)}</span>
									</label>
									<label class="knob-row">
										<span class="knob-label">pressureGradient</span>
										<input type="range" min="0" max="80" step="1" bind:value={flowPressureForce} oninput={markCustom} />
										<span class="knob-value">{flowPressureForce}</span>
									</label>
									<label class="knob-row">
										<span class="knob-label">buoyancy</span>
										<input type="range" min="0" max="180" step="5" bind:value={flowBuoyancy} oninput={markCustom} />
										<span class="knob-value">{flowBuoyancy}</span>
									</label>
								</div>

								<div class="knob-group">
									<div class="knob-group-title">Visualization</div>
									<label class="knob-row">
										<span class="knob-label">colorBy</span>
										<select bind:value={flowVisualization} onchange={markCustom} class="select">
											<option value="dye">dye</option>
											<option value="speed">speed</option>
											<option value="temperature">temperature</option>
										</select>
									</label>
									<label class="knob-row">
										<span class="knob-label">transfer</span>
										<select bind:value={flowTransfer} onchange={markCustom} class="select">
											<option value="ink">ink</option>
											<option value="water">water</option>
											<option value="fire">fire</option>
											<option value="cfd">cfd</option>
										</select>
									</label>
								</div>

								<div class="knob-group">
									<div class="knob-group-title">Solver</div>
									<label class="knob-row">
										<span class="knob-label">substeps</span>
										<input type="range" min="1" max="4" step="1" bind:value={substeps} oninput={markCustom} />
										<span class="knob-value">{substeps}</span>
									</label>
									<label class="knob-row">
										<span class="knob-label">viscosity</span>
										<input type="range" min="0" max="0.08" step="0.002" bind:value={viscosity} oninput={markCustom} />
										<span class="knob-value">{viscosity.toFixed(3)}</span>
									</label>
									<label class="knob-row">
										<span class="knob-label">wallFriction</span>
										<input type="range" min="0" max="0.6" step="0.02" bind:value={wallFriction} oninput={markCustom} />
										<span class="knob-value">{wallFriction.toFixed(2)}</span>
									</label>
									<label class="knob-row">
										<span class="knob-label">pressureIterations</span>
										<input type="range" min="4" max="40" step="1" bind:value={pressureIterations} oninput={markCustom} />
										<span class="knob-value">{pressureIterations}</span>
									</label>
								</div>
							{/if}
						{:else}
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
						{#if mode !== 'reveal'}
							<!-- In reveal mode the fadeBack toggle owns dissipation; this slider would silently override it. -->
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
						{/if}
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
							<div class="knob-group-title">Solver</div>
							<label class="knob-row">
								<span class="knob-label">maxTimeStep</span>
								<input type="range" min="0.001" max="0.0333" step="any" bind:value={maxTimeStep} oninput={markCustom} />
								<span class="knob-value">{maxTimeStep.toFixed(3)}</span>
							</label>
							<label class="knob-row">
								<span class="knob-label">substeps</span>
								<input type="range" min="1" max="4" step="1" bind:value={substeps} oninput={markCustom} />
								<span class="knob-value">{substeps}</span>
							</label>
							<label class="knob-row">
								<span class="knob-label">viscosity</span>
								<input type="range" min="0" max="0.08" step="0.002" bind:value={viscosity} oninput={markCustom} />
								<span class="knob-value">{viscosity.toFixed(3)}</span>
							</label>
							<label class="knob-row">
								<span class="knob-label">viscosityIterations</span>
								<input type="range" min="0" max="24" step="1" bind:value={viscosityIterations} oninput={markCustom} />
								<span class="knob-value">{viscosityIterations}</span>
							</label>
							<label class="knob-row">
								<span class="knob-label">wallFriction</span>
								<input type="range" min="0" max="0.6" step="0.02" bind:value={wallFriction} oninput={markCustom} />
								<span class="knob-value">{wallFriction.toFixed(2)}</span>
							</label>
							<label class="knob-row">
								<span class="knob-label">wallFrictionWidth</span>
								<input type="range" min="0" max="4" step="0.25" bind:value={wallFrictionWidth} oninput={markCustom} />
								<span class="knob-value">{wallFrictionWidth.toFixed(2)}</span>
							</label>
							<label class="knob-row">
								<span class="knob-label">pressureIterations</span>
								<input type="range" min="4" max="40" step="1" bind:value={pressureIterations} oninput={markCustom} />
								<span class="knob-value">{pressureIterations}</span>
							</label>
						</div>

						{#if mode === 'fluid'}
							<div class="knob-group">
								<div class="knob-group-title">Auto Splats</div>
								<label class="knob-row">
									<span class="knob-label">rate</span>
									<input type="range" min="0" max="3" step="0.05" bind:value={autoSplatRate} oninput={markCustom} />
									<span class="knob-value">{autoSplatRate.toFixed(2)}</span>
								</label>
								<label class="knob-row">
									<span class="knob-label">count</span>
									<input type="range" min="1" max="6" step="1" bind:value={autoSplatCount} oninput={markCustom} />
									<span class="knob-value">{autoSplatCount}</span>
								</label>
								<label class="knob-row">
									<span class="knob-label">velocityX</span>
									<input type="range" min="-700" max="700" step="25" bind:value={autoSplatVelocityX} oninput={markCustom} />
									<span class="knob-value">{autoSplatVelocityX}</span>
								</label>
								<label class="knob-row">
									<span class="knob-label">velocityY</span>
									<input type="range" min="-700" max="700" step="25" bind:value={autoSplatVelocityY} oninput={markCustom} />
									<span class="knob-value">{autoSplatVelocityY}</span>
								</label>
								<label class="knob-row">
									<span class="knob-label">centerX</span>
									<input type="range" min="0" max="1" step="0.02" bind:value={autoSplatCenterX} oninput={markCustom} />
									<span class="knob-value">{autoSplatCenterX.toFixed(2)}</span>
								</label>
								<label class="knob-row">
									<span class="knob-label">centerY</span>
									<input type="range" min="0" max="1" step="0.02" bind:value={autoSplatCenterY} oninput={markCustom} />
									<span class="knob-value">{autoSplatCenterY.toFixed(2)}</span>
								</label>
								<label class="knob-row">
									<span class="knob-label">bandWidth</span>
									<input type="range" min="0" max="1" step="0.02" bind:value={autoSplatBandWidth} oninput={markCustom} />
									<span class="knob-value">{autoSplatBandWidth.toFixed(2)}</span>
								</label>
								<label class="knob-row">
									<span class="knob-label">bandHeight</span>
									<input type="range" min="0" max="2" step="0.05" bind:value={autoSplatBandHeight} oninput={markCustom} />
									<span class="knob-value">{autoSplatBandHeight.toFixed(2)}</span>
								</label>
								<label class="knob-row">
									<span class="knob-label">swirl</span>
									<input type="range" min="0" max="900" step="25" bind:value={autoSplatSwirl} oninput={markCustom} />
									<span class="knob-value">{autoSplatSwirl}</span>
								</label>
								<label class="toggle-row">
									<input type="checkbox" bind:checked={autoSplatEvenX} onchange={markCustom} />
									<span class="toggle-pill" aria-hidden="true"></span>
									<span class="knob-label">evenX</span>
								</label>
							</div>
						{/if}

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

					{#if mode !== 'reveal'}
						<!-- Reveal composites via coverColor; backColor is not passed to FluidReveal. -->
						<div class="knob-group">
						<div class="knob-group-title">Background</div>
							<label class="color-row">
								<span class="knob-label">backColor</span>
								<span class="color-swatch" style={`background: ${backColorHex}`} aria-hidden="true"></span>
								<input
									type="text"
									class="text-input color-text"
									value={backColorHex || '#f4ede0'}
									oninput={onBackColorInput}
									maxlength="7"
									spellcheck="false"
									aria-label="Background color hex"
								/>
								<span class="knob-value mono">{backColorHex}</span>
							</label>
					</div>
					{/if}
					{/if}

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
		--hover: rgba(26, 24, 20, 0.05);
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
	/* ---- Theme switcher ---- */
	.theme-switcher {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		border: 1px solid var(--rule);
		border-radius: 999px;
		background: var(--paper);
		cursor: pointer;
	}
	.theme-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 1px solid var(--ink-faint);
		flex: none;
	}
	.theme-switcher select {
		appearance: none;
		-webkit-appearance: none;
		border: none;
		background: transparent;
		color: var(--ink);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		padding-right: 14px;
		background-image:
			linear-gradient(45deg, transparent 50%, currentColor 50%),
			linear-gradient(135deg, currentColor 50%, transparent 50%);
		background-position:
			right 5px top 55%,
			right 0px top 55%;
		background-size: 5px 5px;
		background-repeat: no-repeat;
	}
	.theme-switcher select:focus {
		outline: none;
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
		background: var(--hover, rgba(26, 24, 20, 0.05));
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
		border-radius: 8px;
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

	/* ---- Above-the-fold quickstart ---- */
	.quickstart {
		max-width: 640px;
		margin: 14px auto 0;
		width: 100%;
		box-sizing: border-box;
		background: var(--card);
		border: 1px solid var(--rule);
		border-radius: 8px;
		padding: 12px 16px 14px;
	}
	.quickstart-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 8px;
	}
	.quickstart-title {
		font-size: 13px;
		font-weight: 600;
		color: var(--ink-soft);
		letter-spacing: -0.01em;
	}
	.quickstart-code {
		margin: 0;
		font-family: var(--mono);
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--ink);
		overflow-x: auto;
		white-space: pre;
	}
	.quickstart-note {
		margin: 10px 0 0;
		font-size: 12.5px;
		color: var(--ink-soft);
		line-height: 1.5;
	}
	.quickstart-note code {
		font-family: var(--mono);
		font-size: 12px;
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
		border-radius: 8px;
		overflow: hidden;
	}
	.card-fluid {
		position: relative;
		width: 100%;
		display: block;
		background: var(--card);
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
		border-radius: 8px;
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
		background: var(--hover, rgba(26, 24, 20, 0.05));
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
			align-items: start;
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
		border-radius: 8px;
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
		.color-swatch {
			width: 28px;
			height: 28px;
			border: 1px solid var(--rule);
			border-radius: 4px;
			flex-shrink: 0;
		}
		.color-text {
			max-width: 86px;
			text-transform: lowercase;
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
		border-radius: 8px;
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
