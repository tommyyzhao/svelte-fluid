/*
 * Compliant-enamel model maths (ADR-0097). Pure and GL-free: the shaders in
 * shaders.ts evaluate exactly these expressions, and the Node tests run this
 * CPU mirror to prove the ordered-pair flux conserves mass.
 *
 * Units: lengths in CSS px, heights in rest units (peak 0.72, the R&D
 * molded-profile scale), time in seconds.
 */

/** Model constants. Lengths marked `× font` scale with the computed font size. */
export const ENAMEL = {
	/** Rest height at the plateau (rest units). */
	peak: 0.72,
	/** Distance from the glyph edge to the plateau, × font. */
	plateau: 0.085,
	/** Physical relief at `peak`, CSS px × font: sets slopes for shading. */
	relief: 0.12,
	/** Relief of the press deviation, CSS px × font: the reviewed dent look, kept shallower than the rest. */
	dentRelief: 0.04,
	/** Rest-surface smoothing σ, × font (min 0.75 CSS px): softens medial ridges. */
	smooth: 0.025,
	/** Corner-occlusion coverage blur σ, × font: the scale of a concave corner's shade. */
	occlusion: 0.05,
	/** Rim highlight: distance inside the edge (rest-profile level) and Gaussian half-width, × font (width ≥ 0.6 CSS px). */
	rimInset: 0.013,
	rimWidth: 0.0065,
	/** Gel diffusivity, × font² per second (R&D: 0.006 plate-height²/s). */
	diffusivity: 0.012,
	/** Contact potential at full press (rest units). */
	contact: 2.4,
	/** Contact Gaussian σ, × font (min 6 CSS px). */
	sigma: 0.06,
	/** A coarse cell below this glyph coverage is solid: no exchange across it. */
	solidBelow: 0.08,
	/** Fixed physics substep, s. */
	substep: 1 / 240,
	/** Relaxation tail after release, s; then the field snaps to rest (residual is below 8-bit shading). */
	tail: 1.6
} as const;

/** Most coarse cells per side. */
export const ENAMEL_MAX_CELLS = 512;

/** Rest height for a CSS px distance `d` inside the glyph (≤ 0 outside): a quarter-sine ramp to a plateau. */
export function restProfile(d: number, plateau: number): number {
	if (!(d > 0)) return 0;
	return ENAMEL.peak * Math.sin((Math.min(d / plateau, 1) * Math.PI) / 2);
}

/** Coarse grid for a CSS box: ~font/48 px cells (≥1 CSS px), at most ENAMEL_MAX_CELLS per side. */
export function enamelGrid(cssWidth: number, cssHeight: number, fontPx: number): { cols: number; rows: number; cell: number } {
	const cell = Math.max(1, fontPx / 48, Math.max(cssWidth, cssHeight) / ENAMEL_MAX_CELLS);
	return { cols: Math.max(2, Math.ceil(cssWidth / cell)), rows: Math.max(2, Math.ceil(cssHeight / cell)), cell };
}

/**
 * Fraction of the potential difference one pair exchanges per substep: the
 * exact solution of the two-cell relaxation, so any substep is stable.
 */
export function exchangeFraction(fontPx: number, cell: number, dt: number = ENAMEL.substep): number {
	const k = (ENAMEL.diffusivity * fontPx * fontPx) / (cell * cell);
	return 0.5 * (1 - Math.exp(-2 * k * dt));
}

/** Press: centre in coarse cells (x right, y up), strength 0–1.5, σ in cells. */
export interface Contact {
	x: number;
	y: number;
	strength: number;
	sigma: number;
}

/** Contact pressure potential at cell (i, j); mirror of the shader's contact(). */
export function contactPotential(i: number, j: number, c: Contact | null): number {
	if (!c || c.strength <= 0) return 0;
	const dx = i + 0.5 - c.x;
	const dy = j + 0.5 - c.y;
	return ENAMEL.contact * c.strength * Math.exp(-(dx * dx + dy * dy) / (2 * c.sigma * c.sigma));
}

/**
 * Ordered-pair flux A→B (A is the left/bottom cell). Descends the potential
 * `h − rest + contact`, bounded by donor thickness so neither cell goes
 * negative. Both cells of a pair evaluate this with the same ordered inputs.
 */
export function pairFlux(ha: number, hb: number, ra: number, rb: number, pa: number, pb: number, f: number): number {
	const requested = f * (ha - ra - (hb - rb) + pa - pb);
	return Math.min(ha, Math.max(-hb, requested));
}

/** Phase order for substep `tick`: alternating traversal removes an x/y ordering bias. */
export function phaseOrder(tick: number): number[] {
	return tick % 2 === 0 ? [0, 1, 2, 3] : [3, 2, 1, 0];
}

/**
 * One phase as a gather (mirror of ENAMEL_TRANSFER_FS): every cell finds its
 * partner from parity and phase (0/1: horizontal pairs starting at even/odd
 * x; 2/3: vertical, even/odd y), evaluates the shared ordered flux and keeps
 * its own side. Unpaired edge cells and solid pairs are unchanged.
 */
export function transferPhase(
	h: Float32Array,
	rest: Float32Array,
	solid: Uint8Array,
	cols: number,
	rows: number,
	phase: number,
	f: number,
	contact: Contact | null
): Float32Array {
	const out = new Float32Array(h.length);
	const horizontal = phase < 2;
	const parity = phase & 1;
	const f32 = Math.fround;
	for (let j = 0; j < rows; j++)
		for (let i = 0; i < cols; i++) {
			const self = j * cols + i;
			const coord = horizontal ? i : j;
			const isA = (coord & 1) === parity;
			const ai = horizontal ? (isA ? i : i - 1) : i;
			const aj = horizontal ? j : isA ? j : j - 1;
			const bi = horizontal ? ai + 1 : ai;
			const bj = horizontal ? aj : aj + 1;
			if (ai < 0 || aj < 0 || bi >= cols || bj >= rows) {
				out[self] = h[self];
				continue;
			}
			const a = aj * cols + ai;
			const b = bj * cols + bi;
			if (solid[a] || solid[b]) {
				out[self] = h[self];
				continue;
			}
			// Float32 throughout, as on the GPU (R32F).
			const flux = f32(pairFlux(h[a], h[b], rest[a], rest[b], f32(contactPotential(ai, aj, contact)), f32(contactPotential(bi, bj, contact)), f));
			out[self] = isA ? f32(h[a] - flux) : f32(h[b] + flux);
		}
	return out;
}

/** Area-weighted mean of a fine `fw`×`fh` field over each coarse cell (`sx`, `sy` fine px per cell). */
export function areaAverage(fine: ArrayLike<number>, fw: number, fh: number, cols: number, rows: number, sx: number, sy: number): Float32Array {
	const out = new Float32Array(cols * rows);
	for (let j = 0; j < rows; j++)
		for (let i = 0; i < cols; i++) {
			let sum = 0;
			let area = 0;
			for (let y = Math.floor(j * sy); y < Math.min(fh, Math.ceil((j + 1) * sy)); y++)
				for (let x = Math.floor(i * sx); x < Math.min(fw, Math.ceil((i + 1) * sx)); x++) {
					const a = (Math.min(x + 1, (i + 1) * sx) - Math.max(x, i * sx)) * (Math.min(y + 1, (j + 1) * sy) - Math.max(y, j * sy));
					sum += fine[y * fw + x] * a;
					area += a;
				}
			out[j * cols + i] = area > 0 ? sum / area : 0;
		}
	return out;
}
