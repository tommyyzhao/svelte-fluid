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
	import type { WebGLUnavailableReason } from './engine/gl-utils.js';

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
		 * Defer engine creation until the container enters the viewport,
		 * and tear it down when it leaves. Frees the WebGL context for
		 * other instances on dense pages, at the cost of a shader-recompile
		 * pause when scrolled back into view. Default `false` (immediate
		 * instantiation) so the library default matches naive usage.
		 *
		 * Recommended `true` for any page with more than ~6 simultaneous
		 * `<Fluid />` instances. Browsers cap WebGL contexts at 8–16 per
		 * tab, so dense layouts hit the ceiling otherwise.
		 *
		 * The IntersectionObserver uses `rootMargin: 50px` so the engine
		 * comes alive shortly before it would be visible, hiding the
		 * recompile pause behind the user's scroll momentum while
		 * minimizing simultaneous context creation.
		 */
		lazy?: boolean;
		/**
		 * Automatically pause the animation loop when the canvas is not
		 * visible — either scrolled out of the viewport or on a hidden
		 * browser tab. Resumes when visibility is restored. Default `true`.
		 *
		 * This is lighter than `lazy`: the WebGL context stays alive (no
		 * recompile pause on resume) but the RAF loop stops, freeing CPU
		 * and GPU cycles. When both `lazy` and `autoPause` are set, `lazy`
		 * takes precedence for scroll visibility (full teardown), while
		 * `autoPause` still handles tab-level visibility (Page Visibility API).
		 */
		autoPause?: boolean;
		/**
		 * Custom UI rendered when WebGL is permanently unavailable (no WebGL,
		 * or no half-float texture support). Receives the typed failure
		 * `reason`. Takes precedence over {@link poster}. Transient failures
		 * (e.g. hitting the browser's live-context limit) do NOT trigger it —
		 * those stay blank and retry on the next reconcile — EXCEPT in `reveal`
		 * mode, where any failure (including transient) surfaces the fallback,
		 * because the transparent reveal canvas would otherwise expose the
		 * covered content. See ADR-0041.
		 */
		fallback?: Snippet<[{ reason: WebGLUnavailableReason }]>;
		/**
		 * Static image shown (object-fit: cover) when WebGL is permanently
		 * unavailable and no {@link fallback} snippet is provided. A graceful
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
		 * announced) by assistive tech when WebGL is permanently unavailable. It
		 * is rendered for the `backColor`-fill fallback AND alongside a
		 * {@link poster} (since the dead canvas is `aria-hidden`), but NOT for a
		 * custom {@link fallback} snippet (which owns its own semantics). Set `''`
		 * to suppress for a purely decorative instance. Default: "This animation
		 * requires WebGL, which isn't available in your browser."
		 */
		fallbackText?: string;
	}
</script>

<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { canvasPixelSize, cssQualityPolicy } from './engine/resolution.js';
	import { FluidEngine } from './engine/FluidEngine.js';
	import { WebGLUnavailableError } from './engine/gl-utils.js';
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
		fallbackText = "This animation requires WebGL, which isn't available in your browser.",
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
	// supported, so this is construct-only (Bucket D).
	const stableRequireHW = untrack(() => requireHardwareAcceleration);
	const stableMaxPixelRatio = untrack(() => maxPixelRatio);
	let isVisible = !stableLazy;

	/**
	 * The last engine-init WebGL failure, or `null` when the engine is running.
	 * Stored raw (not pre-resolved) so {@link failureReason} can recompute the
	 * displayed state reactively when `reveal` changes at runtime. See ADR-0041.
	 */
	let lastError = $state<WebGLUnavailableError | null>(null);

	/**
	 * The reason to SHOW the accessible fallback, or `null` to stay blank.
	 * Permanent reasons always surface; a transient `context-limit` stays blank
	 * and retries — EXCEPT in reveal mode, where the canvas is transparent and a
	 * blank box would expose the content the reveal is meant to cover, so any
	 * failure masks. Derived (not set imperatively) so toggling `reveal` re-masks
	 * without waiting for a reconcile.
	 */
	const failureReason = $derived<WebGLUnavailableReason | null>(
		lastError && (lastError.reason !== 'context-limit' || reveal) ? lastError.reason : null
	);

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

	// Context slot management for lazy mode. Browsers cap WebGL contexts
	// at ~16 per tab — calling loseContext() after dispose frees the slot
	// so other instances can use it. We save the extension ref because
	// getExtension() returns null on an already-lost context.
	let savedLoseExt: WEBGL_lose_context | undefined;
	let savedLoseGl: WebGLRenderingContext | WebGL2RenderingContext | undefined;
	let pendingRestore = false;

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

		// Auto-suppress expensive post-processing on small canvases.
		if (policy.suppressPost) {
			cfg.bloom = false;
			cfg.sunrays = false;
		}

		if (policy.bloomIterations !== undefined) cfg.bloomIterations = policy.bloomIterations;
		if (policy.pressureIterations !== undefined) cfg.pressureIterations = policy.pressureIterations;
		return cfg;
	}

	function teardown() {
		// For lazy instances, grab the lose-context extension while the
		// context is still alive so we can release the slot afterward.
		if (stableLazy && canvasEl && !savedLoseExt) {
			const gl =
				(canvasEl.getContext('webgl2') as WebGL2RenderingContext | null) ??
				(canvasEl.getContext('webgl') as WebGLRenderingContext | null);
			if (gl && !gl.isContextLost()) {
				savedLoseExt = gl.getExtension('WEBGL_lose_context') ?? undefined;
				savedLoseGl = savedLoseExt ? gl : undefined;
			}
		}
		engine?.dispose();
		engine = undefined;
		// Release the context slot so other lazy instances can use it.
		// preventDefault on contextlost is required — without it the browser
		// won't allow restoreContext() later (per WEBGL_lose_context spec).
		if (stableLazy && savedLoseExt && savedLoseGl && !savedLoseGl.isContextLost() && canvasEl) {
			canvasEl.addEventListener(
				'webglcontextlost',
				(e) => e.preventDefault(),
				{ once: true }
			);
			savedLoseExt.loseContext();
		} else if (savedLoseGl?.isContextLost()) {
			savedLoseExt = undefined;
			savedLoseGl = undefined;
		}
	}

	function instantiate() {
		if (!canvasEl || cssW === 0 || cssH === 0 || !isVisible) return;
		if (pendingRestore) return;
		// A permanent failure won't recover by retrying — skip re-instantiation
		// (and the capability probe / doomed engine init it entails) on every
		// resize/scroll reconcile. The fallback overlay already fills the resized
		// container. Transient context-limit still retries (failureReason is null,
		// or 'context-limit' when reveal masked it).
		if (failureReason === 'no-webgl' || failureReason === 'no-float-textures') return;

		// If the context was lost by a previous lazy teardown, restore it
		// before creating a new engine. restoreContext() is async — wait
		// for webglcontextrestored before proceeding.
			if (savedLoseExt) {
				pendingRestore = true;
				const ext = savedLoseExt;
				savedLoseExt = undefined;
				savedLoseGl = undefined;
			canvasEl.addEventListener(
				'webglcontextrestored',
				() => {
					pendingRestore = false;
					reconcile();
				},
				{ once: true }
			);
			ext.restoreContext();
			return;
		}

		const size = canvasPixelSize(cssW, cssH, window.devicePixelRatio || 1, stableMaxPixelRatio);
		canvasEl.width = size.width;
		canvasEl.height = size.height;

		const cfg = buildCanvasConfig(cssW, cssH, canvasEl.width, canvasEl.height);

		try {
			engine = new FluidEngine({ canvas: canvasEl, config: cfg });
			lastError = null;
		} catch (err) {
			// Engine init can fail. Degrade gracefully — never crash the host page.
			// The transient/permanent + reveal-masking policy lives in the
			// `failureReason` derived; here we just record the typed error (or, for
			// a non-WebGL engine error like a shader-compile failure per ADR-0008,
			// stay blank and surface it rather than misdiagnose an unsupported browser).
			engine = undefined;
			if (err instanceof WebGLUnavailableError) {
				lastError = err;
			} else {
				lastError = null;
				console.error('svelte-fluid: engine initialization failed', err);
			}
		}
	}

	/**
	 * Reconcile engine existence with the current (cssW, cssH, isVisible)
	 * tuple. Called from both the ResizeObserver and the IntersectionObserver
	 * so the two observers stay in sync without racing.
	 */
	function reconcile() {
		const shouldExist = isVisible && cssW > 0 && cssH > 0;
		if (shouldExist && !engine) {
			instantiate();
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
				// A resize failure can leave an uncertain GL resource set. Rebuild
				// once through the established constructor fallback, never in a loop.
				console.error('svelte-fluid: in-place resize failed; rebuilding once', err);
				if (rebuildingAfterResizeFailure) return;
				rebuildingAfterResizeFailure = true;
				teardown();
				instantiate();
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
				if (document.hidden) {
					engine?.pause();
				} else if (inViewport) {
					// Only resume if the canvas is still in the viewport.
					engine?.resume();
				}
			};
			document.addEventListener('visibilitychange', onVisibilityChange);
		}

		return () => {
			ro.disconnect();
			io?.disconnect();
			if (onVisibilityChange) {
				document.removeEventListener('visibilitychange', onVisibilityChange);
			}
			if (resizeFrame) cancelAnimationFrame(resizeFrame);
			resizeFrame = 0;
			pendingRestore = false;
			teardown();
		};
	});

	/**
	 * Hot prop updates. Buckets A/B/C are handled inside `engine.setConfig`.
	 * Bucket D fields (seed / initialSplatCount* / presetSplats /
	 * requireHardwareAcceleration / maxPixelRatio / advectionScheme) are
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
		style:background={transparent || reveal ? 'transparent' : undefined}
		{...rest}
		aria-hidden={failureReason ? 'true' : ariaHidden}
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
	/* Accessible WebGL fallback overlay (ADR-0041). Covers the blank canvas
	   when WebGL is permanently unavailable. */
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
