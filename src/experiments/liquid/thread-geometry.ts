/**
 * Contact geometry from Brun et al., PRL114,174501(2015), equations(1)–(4):
 * https://arxiv.org/html/1410.5382v1 . This is their fitted quasi-static heel
 * closure, not discrete viscous rods, inertia, surface tension or DRL writing.
 */
export interface RopeContact { x: number; y: number; theta: number }
export interface DepositedPoint { x: number; y: number; belt: number; s: number }
export const THREAD_HISTORY_CAPACITY = 1536;
export const THREAD_COIL_RADIUS = 0.14;
export const THREAD_RADIUS = 0.018;
export const THREAD_SAMPLE_LENGTH = 0.004;
export const BRAID_RADIUS = 0.028;
export const BRAID_NODES = 256;

export function ropeDerivative(contact: RopeContact, beltRatio: number, radius = THREAD_COIL_RADIUS): RopeContact {
	const r = Math.hypot(contact.x, contact.y), rho = r / radius;
	const phi = contact.theta - Math.atan2(contact.y, contact.x), c = Math.cos(phi), b = 0.715;
	const curvature = Math.sqrt(rho) * (1 + b * b * c / (1 - b * c) * rho) * Math.sin(phi) / radius;
	return { x: Math.cos(contact.theta) + beltRatio, y: Math.sin(contact.theta), theta: curvature };
}
export function advanceRopeContact(contact: RopeContact, arcLength: number, beltRatio: number, radius = THREAD_COIL_RADIUS): RopeContact {
	if (![contact.x, contact.y, contact.theta, arcLength, beltRatio, radius].every(Number.isFinite) || arcLength < 0 || arcLength > 0.05 || beltRatio < 0 || beltRatio > 1 || radius <= 0) throw new Error('Invalid bounded liquid-rope step.');
	const add = (a: RopeContact, b: RopeContact, scale: number): RopeContact => ({ x: a.x + b.x * scale, y: a.y + b.y * scale, theta: a.theta + b.theta * scale });
	const a = ropeDerivative(contact, beltRatio, radius), b = ropeDerivative(add(contact, a, arcLength / 2), beltRatio, radius);
	const c = ropeDerivative(add(contact, b, arcLength / 2), beltRatio, radius), d = ropeDerivative(add(contact, c, arcLength), beltRatio, radius);
	return { x: contact.x + arcLength / 6 * (a.x + 2 * b.x + 2 * c.x + d.x),
		y: contact.y + arcLength / 6 * (a.y + 2 * b.y + 2 * c.y + d.y),
		theta: contact.theta + arcLength / 6 * (a.theta + 2 * b.theta + 2 * c.theta + d.theta) };
}

export class RopeDeposition {
	contact: RopeContact = { x: THREAD_COIL_RADIUS, y: 0, theta: Math.PI / 2 };
	readonly points: DepositedPoint[] = [{ x: THREAD_COIL_RADIUS, y: 0, belt: 0, s: 0 }];
	belt = 0;
	length = 0;
	private remainder = 0;
	get full() { return this.points.length >= THREAD_HISTORY_CAPACITY; }
	advance(dt: number, feed: number, ratio: number) {
		if (![dt, feed, ratio].every(Number.isFinite) || dt <= 0 || feed < 0 || feed > 1.2 || ratio < 0 || ratio > 1 || this.full) return;
		this.remainder += Math.min(dt, 0.05) * feed;
		while (this.remainder >= THREAD_SAMPLE_LENGTH && !this.full) {
			this.contact = advanceRopeContact(this.contact, THREAD_SAMPLE_LENGTH, ratio);
			this.length += THREAD_SAMPLE_LENGTH; this.belt += THREAD_SAMPLE_LENGTH * ratio; this.remainder -= THREAD_SAMPLE_LENGTH;
			this.points.push({ x: this.contact.x, y: this.contact.y, belt: this.belt, s: this.length });
		}
		if (this.full) this.remainder = 0;
	}
	reset() {
		this.contact = { x: THREAD_COIL_RADIUS, y: 0, theta: Math.PI / 2 }; this.points.length = 0;
		this.points.push({ x: THREAD_COIL_RADIUS, y: 0, belt: 0, s: 0 }); this.belt = 0; this.length = 0; this.remainder = 0;
	}
	position(index: number): [number, number] { const p = this.points[index]; return [p.x + this.belt - p.belt, p.y]; }
}

/** Authored continuous over/under arrangement. The clearance is measured, not solved friction/contact. */
export function braidPoint(strand: number, u: number, spacing: number, turns: number): [number, number, number] {
	const phase = 2 * Math.PI * (turns * u + strand / 3);
	return [-1.18 + 2.36 * u, spacing * Math.sin(phase), (0.065 + spacing * 0.25) * Math.cos(phase)];
}
export function braidTangent(strand: number, u: number, spacing: number, turns: number): [number, number, number] {
	const phase = 2 * Math.PI * (turns * u + strand / 3), rate = 2 * Math.PI * turns;
	const x = 2.36, y = spacing * Math.cos(phase) * rate, z = -(0.065 + spacing * 0.25) * Math.sin(phase) * rate;
	const length = Math.hypot(x, y, z); return [x / length, y / length, z / length];
}
/** CPU mirror of the shader's cubic B-spline with linearly extended end controls. */
export function braidRenderedPoint(strand: number, u: number, spacing: number, turns: number): [number, number, number] {
	const along = Math.max(0, Math.min(1, u)) * (BRAID_NODES - 1), base = Math.floor(along), f = along - base, r = 1 - f;
	const weights = [r ** 3 / 6, (3 * f ** 3 - 6 * f ** 2 + 4) / 6, (-3 * f ** 3 + 3 * f ** 2 + 3 * f + 1) / 6, f ** 3 / 6];
	const result: [number, number, number] = [0, 0, 0];
	for (let j = 0; j < 4; j++) {
		const index = base - 1 + j;
		let point = braidPoint(strand, Math.max(0, Math.min(BRAID_NODES - 1, index)) / (BRAID_NODES - 1), spacing, turns);
		if (index < 0 || index >= BRAID_NODES) {
			const neighbor = braidPoint(strand, index < 0 ? 1 / (BRAID_NODES - 1) : (BRAID_NODES - 2) / (BRAID_NODES - 1), spacing, turns);
			point = point.map((value, axis) => 2 * value - neighbor[axis]) as [number, number, number];
		}
		for (let axis = 0; axis < 3; axis++) result[axis] += point[axis] * weights[j];
	}
	return result;
}
export function braidClearance(spacing: number, turns: number, samples = BRAID_NODES) {
	let separation = Infinity;
	const curves = Array.from({ length: 3 }, (_, strand) => Array.from({ length: samples }, (_, i) => braidRenderedPoint(strand, i / (samples - 1), spacing, turns)));
	for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) for (const p of curves[a]) for (const q of curves[b]) separation = Math.min(separation, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
	// Sample-center bound on the rendered spline, not only the authored curve.
	// Its derivative is a convex combination of control-edge derivatives, each
	// bounded by the authored curve's maxSpeed. Each curve is at most half an
	// arc sample from a tested point; subtract their combined bound +2 radii.
	const maxSpeed = Math.hypot(2.36, spacing * 2 * Math.PI * turns, (0.065 + spacing * 0.25) * 2 * Math.PI * turns);
	return { sampledSurfaceGap: separation - 2 * BRAID_RADIUS, conservativeSurfaceGap: separation - maxSpeed / (samples - 1) - 2 * BRAID_RADIUS };
}
