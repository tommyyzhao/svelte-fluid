import { describe, expect, it } from 'vitest';
import { isBoundary, jumpFloodSteps, SEED_EMPTY, seedOffset } from '../jump-flood.js';
import { jumpFloodDistanceShader, jumpFloodSeedShader, jumpFloodStepShader } from '../shaders.js';

/** Supersampled coverage of a disc, matching what a rasterizer emits. */
function discCoverage(w: number, h: number, cx: number, cy: number, r: number): Float32Array {
	const out = new Float32Array(w * h);
	const ss = 8;
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			let n = 0;
			for (let j = 0; j < ss; j++)
				for (let i = 0; i < ss; i++) {
					const px = x + (i + 0.5) / ss;
					const py = y + (j + 0.5) / ss;
					if (Math.hypot(px - cx, py - cy) <= r) n++;
				}
			out[y * w + x] = n / (ss * ss);
		}
	return out;
}

/** CPU mirror of the three shader passes (clamp-to-edge sampling, texel units). */
function cpuJumpFlood(cov: Float32Array, w: number, h: number, refine = true): Float32Array {
	const at = (x: number, y: number) => cov[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
	let seeds = new Float32Array(w * h * 2).fill(SEED_EMPTY);
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const c = at(x, y), l = at(x - 1, y), r = at(x + 1, y), b = at(x, y - 1), t = at(x, y + 1);
			if (!isBoundary(c, l, r, b, t)) continue;
			const [ox, oy] = seedOffset(c, l, r, b, t);
			seeds[(y * w + x) * 2] = ox;
			seeds[(y * w + x) * 2 + 1] = oy;
		}
	for (const s of jumpFloodSteps(w, h, refine)) {
		const next = new Float32Array(w * h * 2).fill(SEED_EMPTY);
		for (let y = 0; y < h; y++)
			for (let x = 0; x < w; x++) {
				let best = Infinity;
				for (let j = -1; j <= 1; j++)
					for (let i = -1; i <= 1; i++) {
						const nx = x + i * s, ny = y + j * s;
						if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
						const sx = seeds[(ny * w + nx) * 2];
						if (Math.abs(sx) > SEED_EMPTY / 2) continue;
						const cx = sx + i * s, cy = seeds[(ny * w + nx) * 2 + 1] + j * s;
						const d = cx * cx + cy * cy;
						if (d < best) {
							best = d;
							next[(y * w + x) * 2] = cx;
							next[(y * w + x) * 2 + 1] = cy;
						}
					}
			}
		seeds = next;
	}
	const dist = new Float32Array(w * h);
	for (let i = 0; i < w * h; i++) {
		const d = Math.abs(seeds[i * 2]) > SEED_EMPTY / 2 ? SEED_EMPTY : Math.hypot(seeds[i * 2], seeds[i * 2 + 1]);
		dist[i] = cov[i] >= 0.5 ? -d : d;
	}
	return dist;
}

describe('jump-flood seed math', () => {
	it('places a hard 0/1 step on the half-texel edge', () => {
		// inside to the left: c = 1, r = 0 → crossing half a texel to the right
		const near = (a: [number, number], b: [number, number]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]));
		near(seedOffset(1, 1, 0, 1, 1), [0.5, 0]);
		near(seedOffset(0, 1, 0, 0, 0), [-0.5, 0]);
		const [, oy] = seedOffset(1, 1, 1, 0, 1);
		expect(oy).toBeCloseTo(-0.5);
	});
	it('interpolates an anti-aliased crossing and clamps to one texel', () => {
		const [ox] = seedOffset(0.75, 1, 0.25, 0.75, 0.75);
		expect(ox).toBeCloseTo(0.5);
		const [cx, cy] = seedOffset(0.99, 1, 0.98, 1, 0.98);
		expect(Math.hypot(cx, cy)).toBeLessThanOrEqual(1 + 1e-9);
		expect(seedOffset(0.5, 0.5, 0.5, 0.5, 0.5)).toEqual([0, 0]);
	});
	it('marks only texels whose neighbourhood straddles 0.5', () => {
		expect(isBoundary(1, 1, 1, 1, 1)).toBe(false);
		expect(isBoundary(0, 0, 0, 0, 0)).toBe(false);
		expect(isBoundary(0.6, 1, 0.4, 1, 1)).toBe(true);
	});
});

describe('jump-flood pass count', () => {
	it('runs log2(N) halving passes plus the optional +1', () => {
		expect(jumpFloodSteps(512, 512, false)).toEqual([256, 128, 64, 32, 16, 8, 4, 2, 1]);
		expect(jumpFloodSteps(512, 288)).toEqual([256, 128, 64, 32, 16, 8, 4, 2, 1, 1]);
		expect(jumpFloodSteps(1024, 1024).length).toBe(11);
		expect(jumpFloodSteps(300, 20, false)[0]).toBe(256);
		expect(jumpFloodSteps(1, 1, false)).toEqual([]);
	});
});

describe('CPU reference JFA', () => {
	it('matches analytic disc distance within 1 texel everywhere', () => {
		const w = 48, h = 40, cx = 21.3, cy = 19.7, r = 11.2;
		const d = cpuJumpFlood(discCoverage(w, h, cx, cy, r), w, h);
		let worst = 0, sq = 0;
		for (let y = 0; y < h; y++)
			for (let x = 0; x < w; x++) {
				const truth = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r;
				const e = Math.abs(d[y * w + x] - truth);
				worst = Math.max(worst, e);
				sq += e * e;
			}
		expect(worst).toBeLessThan(1);
		expect(Math.sqrt(sq / (w * h))).toBeLessThan(0.35);
	});

	it('matches brute-force nearest-seed distance on an irregular mask within 1 texel', () => {
		const w = 37, h = 29;
		const cov = new Float32Array(w * h);
		for (let y = 0; y < h; y++)
			for (let x = 0; x < w; x++) {
				const v = Math.sin(x * 0.45) + Math.cos(y * 0.37) + Math.sin((x + y) * 0.21);
				cov[y * w + x] = Math.min(1, Math.max(0, v * 0.8 + 0.5));
			}
		const d = cpuJumpFlood(cov, w, h);
		const at = (x: number, y: number) => cov[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
		const seeds: [number, number][] = [];
		for (let y = 0; y < h; y++)
			for (let x = 0; x < w; x++) {
				const c = at(x, y), l = at(x - 1, y), r = at(x + 1, y), b = at(x, y - 1), t = at(x, y + 1);
				if (!isBoundary(c, l, r, b, t)) continue;
				const [ox, oy] = seedOffset(c, l, r, b, t);
				seeds.push([x + ox, y + oy]);
			}
		expect(seeds.length).toBeGreaterThan(20);
		for (let y = 0; y < h; y++)
			for (let x = 0; x < w; x++) {
				let best = Infinity;
				for (const [sx, sy] of seeds) best = Math.min(best, Math.hypot(sx - x, sy - y));
				expect(Math.abs(Math.abs(d[y * w + x]) - best)).toBeLessThan(1);
				expect(Math.sign(d[y * w + x]) || -1).toBe(cov[y * w + x] >= 0.5 ? -1 : 1);
			}
	});

	it('keeps an empty mask finite and positive', () => {
		const d = cpuJumpFlood(new Float32Array(16), 4, 4);
		for (const v of d) expect(v).toBe(SEED_EMPTY);
	});
});

describe('jump-flood shaders', () => {
	it('mirror the CPU sentinel, steeper one-sided gradient and sign convention', () => {
		expect(jumpFloodSeedShader).toContain('abs(r - c) > abs(c - l) ? r - c : c - l');
		expect(jumpFloodSeedShader).toContain('vec4(1.0e4, 1.0e4, 0.0, 1.0)');
		expect(jumpFloodStepShader).toContain('abs(s.x) > 5000.0');
		expect(jumpFloodDistanceShader).toContain('>= 0.5 ? -d : d');
	});
});
