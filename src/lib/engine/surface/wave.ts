/*
 * Height-field surface maths (ADR-0091). The GLSL step in shaders.ts is
 * waveStep() verbatim; the Node tests prove its stability and dissipation.
 *
 * (1+γ)h' = 2h − (1−γ)h₋ + r²∇²h + ν∇²(h − h₋) − m²h
 *   r  Courant number cΔt/Δx           ν  viscosity: damps grid-scale waves
 *   γ  centred linear damping           m² restoring term: dispersive ripple trains
 * Five-point spectrum λ ∈ [0, 8]; stable iff 8r² + 16ν + m² ≤ 4.
 */

export interface WaveParams {
	courant: number;
	damping: number;
	viscosity: number;
	mass: number;
}

// ν only needs to kill the grid-scale checkerboard; more eats the visible 10–20 px ripples.
export const WAVE: WaveParams = { courant: 0.6, damping: 0.004, viscosity: 0.004, mass: 0.004 };

/** Smallest grid cell, CSS px. Grid density follows CSS size, not a fixed 256 cells. */
export const SURFACE_CELL_CSS = 1;
/** Largest grid side; very large controls coarsen the cell instead. */
export const SURFACE_MAX_CELLS = 512;
/** Impulses applied per physics step (GLSL uniform array size). */
export const MAX_IMPULSES_PER_STEP = 8;
/** Retained impulse backlog; further presses are dropped (ADR-0079). */
export const MAX_QUEUED_IMPULSES = 16;
/** Refraction offset ceiling, CSS px: the floor may never visibly smear. */
export const REFRACTION_CAP_CSS = 1.5;
/** Relative index of water, and the small-slope refraction gain k = 1 − 1/n. */
export const WATER_IOR = 1.333;
export const REFRACT_GAIN = 1 - 1 / WATER_IOR;
/** Caustic focus cap: regularizes a singular focus, not a fake glow. */
export const CAUSTIC_CAP = 6;

export function courantLimit(viscosity = 0, mass = 0): number {
	return Math.sqrt(Math.max(0, (4 - mass - 16 * viscosity) / 8));
}

function validate(p: WaveParams): void {
	const ok =
		p.courant >= 0 &&
		p.damping >= 0 &&
		p.damping < 1 &&
		p.viscosity >= 0 &&
		p.mass >= 0 &&
		16 * p.viscosity <= 1 &&
		p.courant <= courantLimit(p.viscosity, p.mass) + 1e-12;
	if (!ok) throw new RangeError('Unstable or invalid wave parameters');
}

export function waveStep(height: Float64Array, previous: Float64Array, width: number, p: WaveParams = WAVE): Float64Array {
	validate(p);
	if (width < 2 || height.length % width || previous.length !== height.length) throw new RangeError('Invalid grid');
	const rows = height.length / width;
	// Clamped neighbours = reflective (Neumann) walls, matching the shader's mirror ghost.
	const lap = (f: Float64Array, x: number, y: number) =>
		f[y * width + Math.max(0, x - 1)] +
		f[y * width + Math.min(width - 1, x + 1)] +
		f[Math.max(0, y - 1) * width + x] +
		f[Math.min(rows - 1, y + 1) * width + x] -
		4 * f[y * width + x];
	const next = new Float64Array(height.length);
	const r2 = p.courant * p.courant;
	for (let y = 0; y < rows; y++)
		for (let x = 0; x < width; x++) {
			const i = y * width + x;
			const lh = lap(height, x, y);
			const lp = lap(previous, x, y);
			next[i] = (2 * height[i] - (1 - p.damping) * previous[i] + r2 * lh + p.viscosity * (lh - lp) - p.mass * height[i]) / (1 + p.damping);
		}
	return next;
}

/** Largest |z| of (1+γ)z² − (2 − (r²+ν)λ − m²)z + (1 − γ − νλ) = 0 over λ ∈ [0, 8]. */
export function maxAmplification(p: WaveParams): number {
	let worst = 0;
	for (let k = 0; k <= 800; k++) {
		const l = k / 100;
		const a = 1 + p.damping;
		const b = 2 - (p.courant ** 2 + p.viscosity) * l - p.mass;
		const c = 1 - p.damping - p.viscosity * l;
		const disc = b * b - 4 * a * c;
		const z = disc < 0 ? Math.sqrt(Math.abs(c / a)) : Math.max(Math.abs(b + Math.sqrt(disc)), Math.abs(b - Math.sqrt(disc))) / (2 * a);
		worst = Math.max(worst, z);
	}
	return worst;
}

/** Discrete energy conserved exactly by the undamped (γ = ν = 0) leapfrog step. */
export function waveEnergy(height: Float64Array, previous: Float64Array, width: number, p: WaveParams = WAVE): number {
	const r2 = p.courant ** 2;
	let energy = 0;
	for (let i = 0; i < height.length; i++) {
		energy += (height[i] - previous[i]) ** 2 + p.mass * height[i] * previous[i];
		if (i % width < width - 1) energy += r2 * (height[i + 1] - height[i]) * (previous[i + 1] - previous[i]);
		if (i + width < height.length) energy += r2 * (height[i + width] - height[i]) * (previous[i + width] - previous[i]);
	}
	return energy / 2;
}

/** Square grid covering a `width`×`height` CSS px canvas at ≥ SURFACE_CELL_CSS per cell. */
export function surfaceGrid(width: number, height: number, minCell = SURFACE_CELL_CSS): { cols: number; rows: number; cell: number } {
	const w = Math.max(1, width);
	const h = Math.max(1, height);
	const cell = Math.max(minCell, Math.max(w, h) / SURFACE_MAX_CELLS);
	return { cols: Math.max(2, Math.ceil(w / cell)), rows: Math.max(2, Math.ceil(h / cell)), cell };
}

/** Leapfrog substeps per 1/60 s so waves travel `speed` CSS px/s at the shipped Courant number. */
export function substepsPerFrame(speed: number, cell: number): number {
	return Math.max(1, Math.round(speed / 60 / (WAVE.courant * cell)));
}

/** Per-substep damping γ for an amplitude e-folding time of `decay` seconds. */
export function dampingFor(decay: number, substeps: number): number {
	return Math.min(0.5, 1 / (Math.max(decay, 1e-3) * 60 * substeps));
}

/** Wallace's projected-area ratio: flat area over refracted area. */
export function causticAreaRatio(original: number, refracted: number): number {
	if (!Number.isFinite(original) || !Number.isFinite(refracted) || original < 0 || refracted < 0) {
		throw new RangeError('Areas must be finite and nonnegative');
	}
	return Math.min(CAUSTIC_CAP, original / Math.max(refracted, 1e-8));
}

/**
 * Area ratio of the refracted grid at a point (mirror of the composite shader).
 * A vertical ray through slope ∇h lands at x + D·k·∇h on a floor `depth` below,
 * so the Jacobian of the refracted grid is I + D·k·H for height Hessian H: a
 * crest (H < 0) shrinks the area and focuses light.
 */
export function causticJacobianRatio(hxx: number, hxy: number, hyy: number, depth: number): number {
	const s = depth * REFRACT_GAIN;
	const det = (1 + s * hxx) * (1 + s * hyy) - s * s * hxy * hxy;
	return causticAreaRatio(1, Math.abs(det));
}

/** Small-slope refraction offset magnitude, CSS px, before and after the legibility cap. */
export function refractionOffset(slope: number, depth: number): { offset: number; capped: number } {
	const ti = Math.atan(Math.abs(slope));
	const tt = Math.asin(Math.sin(ti) / WATER_IOR);
	const offset = Math.tan(ti - tt) * Math.max(depth, 0);
	return { offset, capped: Math.min(offset, REFRACTION_CAP_CSS) };
}

/**
 * Lens height across its edge at signed distance `d` (negative inside), CSS px.
 * tanh is C∞: the composite reads curvature, and a C¹ step (smoothstep) has a
 * curvature jump at each end of its band that renders as a seam.
 */
export function lensProfile(d: number, amplitude: number, falloff: number): number {
	return amplitude * 0.5 * (1 - Math.tanh(d / (falloff / 1.5)));
}

export interface Impulse {
	/** Canvas CSS px, y up. */
	x: number;
	y: number;
	/** Height, CSS px. */
	amplitude: number;
	/** Gaussian sigma, CSS px. */
	sigma: number;
}

/** Push `impulse` if finite and the backlog has room. Returns whether it was queued. */
export function enqueueImpulse(queue: Impulse[], impulse: Impulse): boolean {
	const { x, y, amplitude, sigma } = impulse;
	if (![x, y, amplitude, sigma].every(Number.isFinite) || sigma <= 0) return false;
	if (queue.length >= MAX_QUEUED_IMPULSES) return false;
	queue.push(impulse);
	return true;
}

/** Assign defined keys only: `undefined` means "not supplied" and keeps the previous value. */
export function assignDefined<T extends object>(target: T, patch: Partial<T>): T {
	for (const key of Object.keys(patch) as (keyof T)[]) {
		const value = patch[key];
		if (value !== undefined) target[key] = value as T[keyof T];
	}
	return target;
}

/**
 * Signed distance (CSS px, negative inside) from (x, y) to a rounded rect, the
 * CPU twin of the shader's sdRoundRect. The drop zone's proximity uses it: the
 * JFA SDF only covers the canvas, the dragged pointer may be anywhere.
 */
export function roundRectDistance(x: number, y: number, rect: { x: number; y: number; width: number; height: number }, radius: number): number {
	const bx = rect.width / 2;
	const by = rect.height / 2;
	const r = Math.max(0, Math.min(radius, bx, by));
	const qx = Math.abs(x - rect.x - bx) - bx + r;
	const qy = Math.abs(y - rect.y - by) - by + r;
	return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Drop-zone wall climb (ADR-0094), CSS px. Mirrored by the climb block in the composite shader. */
export const CLIMB = { rise: 9, length: 18, floor: 0.15, reach: 220 };

/**
 * Drag proximity 0–1 from the pointer's distance (CSS px) outside the zone:
 * 1 on or inside it, smoothstep to 0 at `CLIMB.reach`.
 */
export function dragProximity(distance: number): number {
	if (!Number.isFinite(distance)) return 0;
	const t = Math.min(1, Math.max(0, 1 - distance / CLIMB.reach));
	return t * t * (3 - 2 * t);
}

/**
 * Drop-zone climb height (CSS px) at (x, y) inside `rect` (CPU mirror of the
 * composite's climb block; any consistent y axis). A sum over the four walls of
 * `rise · strength · (floor + (1 − floor)·N) · exp(−d/length)`, where d is the
 * distance to that wall and N a Gaussian (sigma `spread`) of the distance from
 * the pointer to the wall point beside (x, y): the wall nearest the pointer
 * climbs highest.
 */
export function climbHeight(
	x: number,
	y: number,
	rect: { x: number; y: number; width: number; height: number },
	pointer: { x: number; y: number },
	strength: number,
	spread: number
): number {
	const s2 = spread * spread;
	const walls: [number, number, number][] = [
		// distance to wall, along-wall offset to the pointer, pointer offset from the wall
		[x - rect.x, y - pointer.y, pointer.x - rect.x],
		[rect.x + rect.width - x, y - pointer.y, rect.x + rect.width - pointer.x],
		[y - rect.y, x - pointer.x, pointer.y - rect.y],
		[rect.y + rect.height - y, x - pointer.x, rect.y + rect.height - pointer.y]
	];
	let h = 0;
	for (const [d, a, b] of walls) {
		const n = Math.exp(-(a * a + b * b) / (2 * s2));
		h += CLIMB.rise * strength * (CLIMB.floor + (1 - CLIMB.floor) * n) * Math.exp(-Math.max(d, 0) / CLIMB.length);
	}
	return h;
}

/** Along-wall reach of the climb for a `width`×`height` zone, CSS px. */
export function climbSpread(width: number, height: number): number {
	return Math.max(24, 0.3 * Math.min(width, height) + 0.12 * Math.max(width, height));
}

/** Pointer ripples: at most one per `interval` ms, and only after `distance` CSS px of travel. */
export const RIPPLE_THROTTLE = { interval: 60, distance: 10 };

export interface RippleGate {
	t: number;
	x: number;
	y: number;
}

/** Whether a pointer ripple at (x, y) at `now` ms passes the throttle; updates `gate` when it does. */
export function admitRipple(gate: RippleGate, now: number, x: number, y: number): boolean {
	if (![now, x, y].every(Number.isFinite)) return false;
	if (now - gate.t < RIPPLE_THROTTLE.interval || Math.hypot(x - gate.x, y - gate.y) < RIPPLE_THROTTLE.distance) return false;
	gate.t = now;
	gate.x = x;
	gate.y = y;
	return true;
}

/** One ambient wave train: wave vector (rad/CSS px), amplitude (CSS px), phase speed (CSS px/s), phase. */
export interface AmbientWave {
	kx: number;
	ky: number;
	amplitude: number;
	speed: number;
	phase: number;
}

/** Seeded ambient trains for the caustics overlay: spread directions, 60–130 px wavelengths. */
export function ambientWaves(seed: number, count = 6): AmbientWave[] {
	let a = seed >>> 0;
	const rng = () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const base = rng() * Math.PI;
	return Array.from({ length: count }, (_, i) => {
		// Golden-angle spacing: no two trains run parallel, so crests cross into a net.
		const angle = base + i * 2.399963 + (rng() - 0.5) * 0.3;
		const k = (2 * Math.PI) / (60 + 70 * rng());
		return { kx: k * Math.cos(angle), ky: k * Math.sin(angle), amplitude: 0.5 + 0.25 * rng(), speed: 10 + 8 * rng(), phase: 2 * Math.PI * rng() };
	});
}
