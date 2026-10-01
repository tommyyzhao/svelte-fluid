<!--
  svelte-fluid — Fluid component
  Derivative work of WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017, MIT.

  Thin Svelte 5 wrapper around `FluidEngine`. Owns:
  - the canvas element + its parent container
  - the ResizeObserver that coalesces state-preserving engine resizes
  - the stable seed that survives across resizes
  - the imperative `handle` exposed to parents via bind:this
  - the $effect that propagates prop changes via engine.setConfig()
-->

<script lang="ts" module>
	import type { Snippet } from 'svelte';
	import type { HTMLCanvasAttributes } from 'svelte/elements';
	import type { FluidConfig } from './engine/types.js';
	import type { FluidUnavailableReason } from './engine/gpu-support.js';

	/** Public props for the `<Fluid />` component. */
	export interface FluidProps
		extends Omit<HTMLCanvasAttributes, 'width' | 'height'>,
			FluidConfig {
		/** Optional fixed width in CSS pixels. Omit to fill the parent container. */
		width?: number;
		/** Optional fixed height in CSS pixels. Omit to fill the parent container. */
		height?: number;
		/** Class applied to the wrapper container. */
		class?: string;
		/** Inline style applied to the wrapper container. */
		style?: string;
		/**
		 * Maximum physical pixels per CSS pixel. Default `2`, limiting GPU
		 * allocation on DPR 3+ displays without changing CSS-based quality tiers.
		 * Pass `null` to use the device's native DPR. Construct-only.
		 */
		maxPixelRatio?: number | null;
		/**
		 * Defer per-instance field allocation until the container enters the
		 * viewport, and release those resources when it leaves. The shared WebGPU
		 * device and pipeline cache remain warm, so remounting does not reacquire a
		 * device or recompile the graph. Default `false`.
		 */
		lazy?: boolean;
		/**
		 * Automatically pause the animation loop when the canvas is not
		 * visible — either scrolled out of the viewport or on a hidden
		 * browser tab. Resumes when visibility is restored. Default `true`.
		 *
		 * This is lighter than `lazy`: instance fields stay alive but the RAF loop
		 * stops, freeing CPU and GPU cycles. When both `lazy` and `autoPause` are set, `lazy`
		 * takes precedence for scroll visibility (full teardown), while
		 * `autoPause` still handles tab-level visibility (Page Visibility API).
		 */
		autoPause?: boolean;
		/**
		 * Custom UI rendered when WebGPU cannot start or recover. Receives the
		 * typed failure `reason` and takes precedence over {@link poster}. During
		 * device recovery the last frame remains covered until the replacement
		 * engine is ready; a failed recovery surfaces this fallback. See ADR-0041.
		 */
		fallback?: Snippet<[{ reason: FluidUnavailableReason }]>;
		/**
		 * Static image shown (object-fit: cover) when WebGPU cannot run and no
		 * {@link fallback} snippet is provided. A graceful
		 * still of what the animation would have rendered.
		 */
		poster?: string;
		/**
		 * Alt text for the {@link poster} image. Defaults to `''` (decorative) —
		 * the poster is a graceful still of a decorative visual, so it is not
		 * announced unless you describe it. Set this when the poster conveys
		 * meaning a screen-reader user needs.
		 */
		posterAlt?: string;
		/**
		 * Visually-hidden message for the default fallback, discoverable (not
		 * announced) by assistive tech when WebGPU cannot run. It
		 * is rendered for the `backColor`-fill fallback AND alongside a
		 * {@link poster} (since the dead canvas is `aria-hidden`), but NOT for a
		 * custom {@link fallback} snippet (which owns its own semantics). Set `''`
		 * to suppress for a purely decorative instance. Default: "This animation
		 * requires GPU graphics, which aren't available in your browser."
		 */
		fallbackText?: string;
		/** Called after initial WebGPU startup and after successful device recovery. */
		onReady?: () => void;
		/** Called immediately when device-loss reconstruction begins. */
		onRecovering?: () => void;
		/** Called when a distortion image fails to load or upload. */
		onAssetError?: (error: Error) => void;
		/** Called after a distortion image is uploaded successfully. */
		onAssetReady?: () => void;
	}
</script>

<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { applyCssQualityPolicy, canvasPixelSize, cssQualityPolicy, type PolicyField } from './engine/resolution.js';
	import { FluidEngine } from './engine/FluidEngine.js';
	import {
		FluidUnavailableError,
		isFluidUnavailableError,
		isTerminalFailure,
		type FluidUnavailableReason as RuntimeUnavailableReason
	} from './engine/gpu-support.js';
	import { DISABLED_PERFORMANCE_STATE } from './engine/performance-governor.js';
	import { randomSeed } from './engine/rng.js';
	import type { FluidHandle } from './engine/types.js';

	let {
		width,
		height,
		maxPixelRatio = 2,
		class: className,
		style,
		seed: seedProp,
		simResolution,
		dyeResolution,
		densityDissipation,
		initialDensityDissipation,
		initialDensityDissipationDuration,
		velocityDissipation,
		advectionScheme,
		maxTimeStep,
		substeps,
		viscosity,
		viscosityIterations,
		wallFriction,
		wallFrictionWidth,
		pressure,
		pressureIterations,
		autoPerformance,
		autoPerformanceTargetFrameMs,
		autoPerformanceMinPressureIterations,
		autoPerformanceMinSubsteps,
		curl,
		vorticityAdaptive,
		splatRadius,
		splatForce,
		shading,
		colorful,
		colorUpdateSpeed,
		paused,
		backColor,
		transparent,
		bloom,
		bloomIterations,
		bloomResolution,
		bloomIntensity,
		bloomThreshold,
		bloomSoftKnee,
		sunrays,
		sunraysResolution,
		sunraysWeight,
		initialSplatCount,
		initialSplatCountMin,
		initialSplatCountMax,
		pointerInput = true,
		pointerTarget,
		splatOnHover,
		presetSplats,
		autoSplatRate,
		autoSplatCount,
		autoSplatColor,
		autoSplatVelocityX,
		autoSplatVelocityY,
		autoSplatCenterX,
		autoSplatCenterY,
		autoSplatEvenX,
		autoSplatSwirl,
		autoSplatBandHeight,
		autoSplatBandWidth,
		containerShape,
		obstructions,
		obstructionColor,
		flow,
		glass,
		glassThickness,
		glassRefraction,
		glassReflectivity,
		glassChromatic,
		reveal,
		revealSensitivity,
		revealCurve,
		revealCoverColor,
		revealAccentColor,
		revealFringeColor,
		distortion,
		distortionPower,
		distortionImageUrl,
		distortionFit,
		distortionScale,
		distortionBleedX,
		distortionBleedY,
		openBoundary,
		sticky,
		stickyMask,
		stickyStrength,
		stickyPressure,
		stickyAmplify,
		requireHardwareAcceleration,
		lazy = false,
		autoPause = true,
		fallback,
		poster,
		posterAlt,
		fallbackText = "This animation requires GPU graphics, which aren't available in your browser.",
		onReady,
		onRecovering,
		onAssetError,
		onAssetReady,
		'aria-hidden': ariaHidden,
		...rest
	}: FluidProps = $props();

	let canvasEl = $state<HTMLCanvasElement | undefined>(undefined);
	let container = $state<HTMLDivElement | undefined>(undefined);
	let engine: FluidEngine | undefined;
	// `lazy` and `autoPause` are captured once, like `seed`. Toggling after
	// mount has no effect — the observer wiring is decided in `onMount`.
	const stableLazy = untrack(() => lazy);
	const stableAutoPause = untrack(() => autoPause);
	// Like `seed`, captured once — re-acquiring a context mid-life isn't
	// supported, so this is construct-only.
	const stableRequireHW = untrack(() => requireHardwareAcceleration);
	const stableMaxPixelRatio = untrack(() => maxPixelRatio);
	let isVisible = !stableLazy;
	let documentVisible = true;

	/**
	 * The last typed engine-init failure, or `null` when the engine is running.
	 * Stored raw (not pre-resolved) so {@link failureReason} can recompute the
	 * displayed state reactively when `reveal` changes at runtime. See ADR-0041.
	 */
	let lastError = $state<FluidUnavailableError | null>(null);

	/**
	 * The reason to SHOW the accessible fallback, or `null` to stay blank.
	 * WebGPU capability failures always surface. Device loss is reconstructed by
	 * the runtime controller first and reaches this state only if recovery fails.
	 */
	const failureReason = $derived<RuntimeUnavailableReason | null>(lastError?.reason ?? null);

	// Fill color for the default fallback box. Mode-aware so the fallback never
	// contradicts the live render's intent:
	//   - transparent mode → stay see-through (filling backColor would paint an
	//     opaque box where the author wanted compositing);
	//   - reveal mode → use the reveal COVER color (0–1 linear), because the
	//     canvas is transparent and a blank box would expose the very content
	//     the reveal is meant to hide;
	//   - otherwise → backColor (0–255 RGB, default black) to preserve layout.
	const fallbackFill = $derived.by(() => {
		// reveal's no-exposure guarantee outranks transparent: a reveal canvas is
		// transparent, so even with `transparent` also set the fallback must paint
		// the opaque cover color rather than leave covered content exposed.
		if (reveal) {
			const c = revealCoverColor ?? { r: 1, g: 1, b: 1 };
			return `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`;
		}
		if (transparent) return 'transparent';
		return backColor ? `rgb(${backColor.r}, ${backColor.g}, ${backColor.b})` : '#000';
	});

	let instantiateToken = 0;
	let initializing = false;
	// Unlike the legacy synchronous constructor, WebGPU acquisition crosses an
	// async boundary. Keep readiness reactive so reveal mode can paint its cover
	// from the first rendered frame until the runtime is genuinely usable.
	let engineReady = $state(false);
	const revealStartupCover = $derived(Boolean(reveal && !engineReady && !failureReason));

	/**
	 * Stable seed: generated once per mount, reused across every
	 * teardown/rebuild so resizing produces the same initial splat pattern.
	 * Intentionally NOT $state — we don't want it to be reactive.
	 * `untrack` reads `seedProp` once without subscribing.
	 */
	const stableSeed = ((untrack(() => seedProp) ?? randomSeed()) >>> 0) as number;

	/**
	 * Stable preset splats. Like `seed`, this is construct-only — the
	 * engine consumes it once during construction. Snapshot via `untrack`
	 * so the `$effect` below doesn't subscribe to a per-render array
	 * reference and so resize re-creates the same opening scene.
	 */
	const stablePresetSplats = untrack(() => presetSplats);

	let cssW = $state(0);
	let cssH = $state(0);

	function buildConfig() {
		return {
			simResolution,
			dyeResolution,
			densityDissipation,
			initialDensityDissipation,
			initialDensityDissipationDuration,
			velocityDissipation,
			advectionScheme,
			maxTimeStep,
			substeps,
			viscosity,
			viscosityIterations,
			wallFriction,
			wallFrictionWidth,
			pressure,
			pressureIterations,
			autoPerformance,
			autoPerformanceTargetFrameMs,
			autoPerformanceMinPressureIterations,
			autoPerformanceMinSubsteps,
			curl,
			vorticityAdaptive,
			splatRadius,
			splatForce,
			shading,
			colorful,
			colorUpdateSpeed,
			paused,
			backColor,
			transparent,
			bloom,
			bloomIterations,
			bloomResolution,
			bloomIntensity,
			bloomThreshold,
			bloomSoftKnee,
			sunrays,
			sunraysResolution,
			sunraysWeight,
			initialSplatCount,
			initialSplatCountMin,
			initialSplatCountMax,
			autoSplatRate,
			autoSplatCount,
			autoSplatColor,
			autoSplatVelocityX,
			autoSplatVelocityY,
			autoSplatCenterX,
			autoSplatCenterY,
			autoSplatEvenX,
			autoSplatSwirl,
			autoSplatBandHeight,
			autoSplatBandWidth,
			containerShape,
			obstructions,
			obstructionColor,
			flow,
			glass,
			glassThickness,
			glassRefraction,
			glassReflectivity,
			glassChromatic,
			reveal,
			revealSensitivity,
			revealCurve,
			revealCoverColor,
			revealAccentColor,
			revealFringeColor,
			distortion,
			distortionPower,
			distortionImageUrl,
			distortionFit,
			distortionScale,
			distortionBleedX,
			distortionBleedY,
			openBoundary,
			sticky,
			stickyMask,
			stickyStrength,
			stickyPressure,
			stickyAmplify,
			pointerInput,
			pointerTarget,
			splatOnHover,
			requireHardwareAcceleration: stableRequireHW,
			seed: stableSeed,
			presetSplats: stablePresetSplats
		};
	}

	let policyForced = new Set<PolicyField>();

	/** Resolve canvas-size policy without making CSS dimensions a Svelte effect dependency. */
	function buildCanvasConfig(
		cssWidth: number,
		cssHeight: number,
		physicalWidth: number,
		physicalHeight: number,
		cfg = buildConfig()
	) {
		const maxPx = Math.max(physicalWidth, physicalHeight);
		const policy = cssQualityPolicy(
			cssWidth,
			cssHeight,
			cfg.simResolution ?? 128,
			bloomIterations !== undefined,
			pressureIterations !== undefined
		);

		// Adaptive resolution: cap texture sizes to actual canvas pixels.
		cfg.dyeResolution = Math.min(cfg.dyeResolution ?? 1024, maxPx);
		cfg.bloomResolution = Math.min(cfg.bloomResolution ?? 256, maxPx);
		cfg.sunraysResolution = Math.min(cfg.sunraysResolution ?? 196, maxPx);

		// Small-canvas policy; undoes values it injected once it stops applying.
		policyForced = applyCssQualityPolicy(cfg, policy, policyForced);
		return cfg;
	}

	function teardown() {
		instantiateToken += 1;
		initializing = false;
		engineReady = false;
		engine?.dispose();
		engine = undefined;
	}

	function notifyHost(callback: (() => void) | undefined, name: string) {
		if (!callback) return;
		try {
			callback();
		} catch (cause) {
			console.error(`svelte-fluid: ${name} callback threw`, cause);
		}
	}

	async function instantiate() {
		if (!canvasEl || cssW === 0 || cssH === 0 || !isVisible) return;
		if (initializing || isTerminalFailure(failureReason)) return;
		// A failed distortion asset is not terminal: the rebuilt engine retries the image.
		if (lastError?.reason === 'asset-failed') lastError = null;

		const size = canvasPixelSize(cssW, cssH, window.devicePixelRatio || 1, stableMaxPixelRatio);
		canvasEl.width = size.width;
		canvasEl.height = size.height;

		const cfg = buildCanvasConfig(cssW, cssH, canvasEl.width, canvasEl.height);

		const token = ++instantiateToken;
		initializing = true;
		let next: FluidEngine | undefined;
		try {
			next = new FluidEngine({
					canvas: canvasEl,
					config: cfg,
					autoStart: !stableAutoPause || documentVisible,
					onRecovering: () => {
						if (token !== instantiateToken || engine !== next) return;
						engineReady = false;
						notifyHost(onRecovering, 'onRecovering');
					},
					onRecovered: () => {
						if (token !== instantiateToken || engine !== next) return;
						engineReady = true;
						lastError = null;
						notifyHost(onReady, 'onReady');
					},
					onAssetError: (error) => {
						if (token !== instantiateToken || engine !== next) return;
						console.error('svelte-fluid: distortion asset failed', error);
						lastError = new FluidUnavailableError(
							'svelte-fluid: distortion image failed to load or upload',
							'asset-failed',
							{ cause: error }
						);
						notifyHost(() => onAssetError?.(error), 'onAssetError');
					},
					onAssetReady: () => {
						if (token !== instantiateToken || engine !== next) return;
						if (lastError?.reason === 'asset-failed') lastError = null;
						notifyHost(onAssetReady, 'onAssetReady');
					},
					onFatalError: (error) => {
						if (token !== instantiateToken || engine !== next) return;
						next?.dispose();
						engine = undefined;
						engineReady = false;
						if (isFluidUnavailableError(error)) lastError = error;
						else {
							console.error('svelte-fluid: runtime failed', error);
							lastError = new FluidUnavailableError(
								'svelte-fluid: WebGPU runtime failed',
								'runtime-failed',
								{ cause: error }
							);
						}
					}
				});
			// Install the queueing controller before adapter/pipeline acquisition so
			// resize, pause, prop changes, and imperative splats cannot be lost.
			engine = next;
			await next.ready;
			if (token !== instantiateToken || !isVisible) {
				next.dispose();
				if (engine === next) engine = undefined;
				return;
			}
			// Startup recovery after an early device loss already announced readiness
			// via onRecovered; a failed recovery cleared `engine`. Fire onReady once.
			if (engine !== next || engineReady) return;
			engineReady = true;
			lastError = null;
			notifyHost(onReady, 'onReady');
		} catch (err) {
			if (token !== instantiateToken) return;
			// Engine init can fail after adapter acquisition (for example WGSL or
			// resource validation). Surface a typed fallback instead of leaving a
			// permanently blank canvas.
			next?.dispose();
			if (engine === next) engine = undefined;
			engineReady = false;
			if (isFluidUnavailableError(err)) {
				lastError = err;
			} else {
				console.error('svelte-fluid: engine initialization failed', err);
				lastError = new FluidUnavailableError(
					'svelte-fluid: WebGPU engine initialization failed',
					'initialization-failed',
					{ cause: err }
				);
			}
		} finally {
			if (token === instantiateToken) initializing = false;
		}
	}

	/**
	 * Reconcile engine existence with the current (cssW, cssH, isVisible)
	 * tuple. Called from both the ResizeObserver and the IntersectionObserver
	 * so the two observers stay in sync without racing.
	 */
	function reconcile() {
		const shouldExist = isVisible && cssW > 0 && cssH > 0;
		if (shouldExist && !engine && !initializing) {
			void instantiate();
		} else if (!shouldExist && engine) {
			teardown();
		}
	}

	/** Imperative API exposed to parents via `bind:this`. */
	export const handle: FluidHandle = {
		splat: (x, y, dx, dy, color) => engine?.splat(x, y, dx, dy, color),
		randomSplats: (count) => engine?.randomSplats(count),
		pause: () => engine?.pause(),
		resume: () => engine?.resume(),
		get isPaused() { return engine?.isPaused ?? true; },
		getPerformanceState: () => engine?.getPerformanceState() ?? DISABLED_PERFORMANCE_STATE
	};

	onMount(() => {
		if (!container) return;
		documentVisible = !document.hidden;
		let resizeFrame = 0;
		let rebuildingAfterResizeFailure = false;

		const applyResize = () => {
			resizeFrame = 0;
			if (!canvasEl || !engine || !isVisible || cssW <= 0 || cssH <= 0) {
				reconcile();
				return;
			}
			const size = canvasPixelSize(cssW, cssH, window.devicePixelRatio || 1, stableMaxPixelRatio);
			const physicalWidth = size.width;
			const physicalHeight = size.height;
			try {
				engine.resize(physicalWidth, physicalHeight);
				engine.setConfig(buildCanvasConfig(cssW, cssH, canvasEl.width, canvasEl.height));
				rebuildingAfterResizeFailure = false;
			} catch (err) {
				// A resize failure can leave an uncertain GPU resource set. Rebuild
				// once through the established constructor fallback, never in a loop.
				console.error('svelte-fluid: in-place resize failed; rebuilding once', err);
				if (rebuildingAfterResizeFailure) return;
				rebuildingAfterResizeFailure = true;
				teardown();
				void instantiate();
			}
		};

		const scheduleResize = () => {
			if (resizeFrame) return;
			resizeFrame = requestAnimationFrame(applyResize);
		};

		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const box = entry.contentBoxSize?.[0];
				const w = box ? box.inlineSize : entry.contentRect.width;
				const h = box ? box.blockSize : entry.contentRect.height;
				if (w === cssW && h === cssH) continue;
				cssW = w;
				cssH = h;
				if (w <= 0 || h <= 0) {
					if (resizeFrame) cancelAnimationFrame(resizeFrame);
					resizeFrame = 0;
					reconcile();
				} else if (engine) {
					scheduleResize();
				} else {
					reconcile();
				}
			}
		});
		ro.observe(container);

		// --- Scroll visibility ---
		// `lazy` mode: full teardown/rebuild when scrolling out/into view.
		// `autoPause` mode (without lazy): pause/resume the RAF loop.
		// Both use IntersectionObserver; lazy takes precedence.
		let io: IntersectionObserver | undefined;
		let inViewport = true;
		if (stableLazy || stableAutoPause) {
			io = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						inViewport = entry.isIntersecting;
						if (stableLazy) {
							// Lazy mode: teardown/rebuild
							if (entry.isIntersecting === isVisible) continue;
							isVisible = entry.isIntersecting;
							reconcile();
						} else if (stableAutoPause) {
							// autoPause mode: pause/resume RAF
							if (entry.isIntersecting) {
								engine?.resume();
							} else {
								engine?.pause();
							}
						}
					}
				},
				{ rootMargin: '50px' }
			);
			io.observe(container);
		}

		// --- Page Visibility API ---
		// Pause all engines when the tab is hidden, regardless of scroll.
		let onVisibilityChange: (() => void) | undefined;
		if (stableAutoPause) {
			onVisibilityChange = () => {
				documentVisible = !document.hidden;
				if (document.hidden) {
					engine?.pause();
				} else if (inViewport) {
					// Only resume if the canvas is still in the viewport.
					engine?.resume();
				}
			};
			document.addEventListener('visibilitychange', onVisibilityChange);
			onVisibilityChange();
		}

		return () => {
			ro.disconnect();
			io?.disconnect();
			if (onVisibilityChange) {
				document.removeEventListener('visibilitychange', onVisibilityChange);
			}
			if (resizeFrame) cancelAnimationFrame(resizeFrame);
			resizeFrame = 0;
			teardown();
		};
	});

	/**
	 * Hot prop updates are handled inside `engine.setConfig`.
	 * Construct-only fields (seed / initialSplatCount* / presetSplats /
	 * requireHardwareAcceleration / maxPixelRatio) are
	 * applied only at construction time and ignored here.
	 */
	$effect(() => {
		// Touch every tracked field so the effect re-runs on any change.
		const cfg = buildConfig();
		if (engine && canvasEl) {
			engine.setConfig(
				buildCanvasConfig(untrack(() => cssW), untrack(() => cssH), canvasEl.width, canvasEl.height, cfg)
			);
		}
	});
</script>

<div
	bind:this={container}
	class={`svelte-fluid-container ${className ?? ''}`.trim()}
	style:width={width != null ? `${width}px` : undefined}
	style:height={height != null ? `${height}px` : undefined}
	{style}
>
	<canvas
		bind:this={canvasEl}
		style:background={transparent || reveal || distortion ? 'transparent' : undefined}
		{...rest}
		aria-hidden={failureReason || revealStartupCover ? 'true' : ariaHidden}
	></canvas>
	{#if failureReason}
		<div
			class="svelte-fluid-fallback"
			class:inert={!fallback}
			style:background={fallback ? undefined : fallbackFill}
		>
			{#if fallback}
				{@render fallback({ reason: failureReason })}
			{:else}
				{#if poster}
					<img class="svelte-fluid-poster" src={poster} alt={posterAlt ?? ''} />
				{/if}
				{#if fallbackText}
					<!-- Discoverable (not announced) failure text. Rendered alongside a
					     decorative poster too, since the dead canvas is aria-hidden. -->
					<span class="svelte-fluid-fallback-text">{fallbackText}</span>
				{/if}
			{/if}
		</div>
	{:else if revealStartupCover}
		<!-- WebGPU device acquisition is asynchronous. Reveal must never expose the
		     covered content while the runtime is still being constructed. -->
		<div class="svelte-fluid-fallback inert" style:background={fallbackFill}></div>
	{/if}
</div>

<style>
	.svelte-fluid-container {
		width: 100%;
		height: 100%;
		position: relative;
		overflow: hidden;
	}
	.svelte-fluid-container canvas {
		display: block;
		width: 100%;
		height: 100%;
		background: #000;
		touch-action: none;
	}
	/* Accessible GPU fallback overlay (ADR-0041). Covers the blank canvas when
	   rendering is unavailable, and protects reveal content during async init. */
	.svelte-fluid-fallback {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	/* Default (non-snippet) fallbacks are inert — don't intercept pointer events
	   meant for content behind a full-bleed instance (e.g. FluidBackground). A
	   consumer-supplied `fallback` snippet keeps pointer events so it can be
	   interactive. */
	.svelte-fluid-fallback.inert {
		pointer-events: none;
	}
	.svelte-fluid-poster {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	/* Visually hidden, still announced to assistive tech. */
	.svelte-fluid-fallback-text {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}
</style>
