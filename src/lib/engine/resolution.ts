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

export type PolicyField = 'bloom' | 'sunrays' | 'bloomIterations' | 'pressureIterations';
export type PolicyDefaults = Readonly<{
	bloom: boolean;
	sunrays: boolean;
	bloomIterations: number;
	pressureIterations: number;
}>;

/**
 * Apply the CSS quality policy to `cfg` in place; return the fields it forced.
 * A user-supplied value (anything but `undefined`) is never overridden.
 * Feed the return value back as `previouslyForced`: a field forced last time,
 * no longer forced, and with no user value resets to the engine default,
 * because `FluidEngine.setConfig` drops `undefined` and would keep the stale
 * override. `defaults` come from the engine so they cannot drift.
 */
export function applyCssQualityPolicy(
	cfg: Partial<Record<PolicyField, boolean | number | undefined>>,
	policy: ReturnType<typeof cssQualityPolicy>,
	defaults: PolicyDefaults,
	previouslyForced: ReadonlySet<PolicyField> = new Set()
): Set<PolicyField> {
	const forced = new Set<PolicyField>();
	const force = (key: PolicyField, value: boolean | number) => {
		if (cfg[key] !== undefined) return;
		cfg[key] = value;
		forced.add(key);
	};
	if (policy.suppressPost) {
		force('bloom', false);
		force('sunrays', false);
	}
	if (policy.bloomIterations !== undefined) force('bloomIterations', policy.bloomIterations);
	if (policy.pressureIterations !== undefined) force('pressureIterations', policy.pressureIterations);
	for (const key of previouslyForced) {
		if (!forced.has(key) && cfg[key] === undefined) cfg[key] = defaults[key];
	}
	return forced;
}

/** Preserve aspect while fitting a requested drawing buffer inside GL limits. */
export function fitDrawingBufferSize(
	width: number,
	height: number,
	maxWidth: number,
	maxHeight: number
): { width: number; height: number } {
	const requestedWidth = Math.max(1, Math.floor(width));
	const requestedHeight = Math.max(1, Math.floor(height));
	const widthLimit = Number.isFinite(maxWidth) && maxWidth > 0 ? Math.floor(maxWidth) : requestedWidth;
	const heightLimit = Number.isFinite(maxHeight) && maxHeight > 0 ? Math.floor(maxHeight) : requestedHeight;
	const scale = Math.min(1, widthLimit / requestedWidth, heightLimit / requestedHeight);
	return {
		width: Math.max(1, Math.floor(requestedWidth * scale)),
		height: Math.max(1, Math.floor(requestedHeight * scale))
	};
}
