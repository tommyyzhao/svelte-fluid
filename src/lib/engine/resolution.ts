export const DEFAULT_MAX_PIXEL_RATIO = 2;

/** Resolve a finite physical-pixel scale. `null` explicitly opts into native DPR. */
export function resolvePixelRatio(
	devicePixelRatio: number,
	maxPixelRatio: number | null | undefined = DEFAULT_MAX_PIXEL_RATIO
): number {
	const native = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
	if (maxPixelRatio === null) return native;
	const cap = Number.isFinite(maxPixelRatio) && (maxPixelRatio ?? 0) > 0
		? (maxPixelRatio as number)
		: DEFAULT_MAX_PIXEL_RATIO;
	return Math.min(native, cap);
}

export function canvasPixelSize(
	cssWidth: number,
	cssHeight: number,
	devicePixelRatio: number,
	maxPixelRatio: number | null | undefined = DEFAULT_MAX_PIXEL_RATIO
): { width: number; height: number; pixelRatio: number } {
	const pixelRatio = resolvePixelRatio(devicePixelRatio, maxPixelRatio);
	return {
		width: Math.max(1, Math.floor(Math.max(0, cssWidth) * pixelRatio)),
		height: Math.max(1, Math.floor(Math.max(0, cssHeight) * pixelRatio)),
		pixelRatio
	};
}

/** CSS-only policy: DPR must not change qualitative feature tiers. */
export function cssQualityPolicy(
	cssWidth: number,
	cssHeight: number,
	simResolution: number,
	bloomIterationsExplicit: boolean,
	pressureIterationsExplicit: boolean
): { suppressPost: boolean; bloomIterations?: number; pressureIterations?: number } {
	const maxCss = Math.max(0, cssWidth, cssHeight);
	const policy: { suppressPost: boolean; bloomIterations?: number; pressureIterations?: number } = {
		suppressPost: maxCss < 600
	};
	if (!bloomIterationsExplicit) {
		if (maxCss < 512) policy.bloomIterations = 4;
		else if (maxCss < 768) policy.bloomIterations = 5;
	}
	if (!pressureIterationsExplicit) {
		if (simResolution <= 64) policy.pressureIterations = 6;
		else if (simResolution <= 96 || maxCss < 600) policy.pressureIterations = 10;
	}
	return policy;
}

/** Engine defaults for the fields the CSS quality policy can override. */
const POLICY_DEFAULTS = { bloom: true, sunrays: true, bloomIterations: 8, pressureIterations: 20 } as const;
export type PolicyField = keyof typeof POLICY_DEFAULTS;

/**
 * Apply the CSS quality policy to `cfg` in place; return the fields it forced.
 * Feed the return value back as `previouslyForced`: a field forced last time, no
 * longer forced, and with no user value resets to the engine default, because
 * `FluidEngine.setConfig` drops `undefined` and would keep the stale override.
 * User-supplied values are never replaced by defaults.
 */
export function applyCssQualityPolicy(
	cfg: Partial<Record<PolicyField, boolean | number | undefined>>,
	policy: ReturnType<typeof cssQualityPolicy>,
	previouslyForced: ReadonlySet<PolicyField> = new Set()
): Set<PolicyField> {
	const forced = new Set<PolicyField>();
	if (policy.suppressPost) {
		cfg.bloom = false;
		cfg.sunrays = false;
		forced.add('bloom').add('sunrays');
	}
	if (policy.bloomIterations !== undefined) {
		cfg.bloomIterations = policy.bloomIterations;
		forced.add('bloomIterations');
	}
	if (policy.pressureIterations !== undefined) {
		cfg.pressureIterations = policy.pressureIterations;
		forced.add('pressureIterations');
	}
	for (const key of previouslyForced) {
		if (!forced.has(key) && cfg[key] === undefined) cfg[key] = POLICY_DEFAULTS[key];
	}
	return forced;
}
