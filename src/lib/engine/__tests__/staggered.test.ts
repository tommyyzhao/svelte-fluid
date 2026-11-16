import { describe, expect, it } from 'vitest';
import { referencePressure } from '../__benches__/staggered-reference.js';
import {
	baseVertexShader,
	divergenceShader,
	pressureShader,
	pressureJacobi2Shader,
	gradientSubtractShader
} from '../shaders.js';
import {
	staggeredGeometry,
	staggeredDivergence,
	staggeredGradient,
	staggeredLaplacian
} from '../staggered.js';

describe('MAC operator algebra', () => {
	it('certifies the legacy DG/A5 defect against compatible closed-domain MAC operators', () => {
		const tolerance = 1e-12;
		const norm = (a: Float64Array) => Math.max(...a.map(Math.abs));
		const defect = (dg: Float64Array, a: Float64Array) =>
			norm(dg.map((value, i) => value + a[i]));
		const expectedLegacy = { defect: 2, pressure: 4, ratio: 0.5 };
		const compact = (s: string) => s.replace(/\s+/g, '');
		const pin = (shader: string, clause: string) =>
			expect(compact(shader)).toContain(compact(clause));

		// Pin coefficients and sampling, not whole shader hashes: whitespace is immaterial.
		pin(baseVertexShader, 'vL = vUv - vec2(texelSize.x, 0.0);');
		pin(baseVertexShader, 'vR = vUv + vec2(texelSize.x, 0.0);');
		pin(baseVertexShader, 'vT = vUv + vec2(0.0, texelSize.y);');
		pin(baseVertexShader, 'vB = vUv - vec2(0.0, texelSize.y);');
		for (const [side, uv, component] of [
			['L', 'vL', 'x'],
			['R', 'vR', 'x'],
			['T', 'vT', 'y'],
			['B', 'vB', 'y']
		]) {
			pin(
				divergenceShader,
				`float ${side} = texture2D(uVelocity, ${uv}).${component};`
			);
			for (const shader of [pressureShader, gradientSubtractShader])
				pin(shader, `float ${side} = texture2D(uPressure, ${uv}).x;`);
		}
		pin(divergenceShader, 'float div = 0.5 * (R - L + T - B);');
		for (const [side, channel, component] of [
			['L', 'x', 'x'],
			['R', 'y', 'x'],
			['T', 'z', 'y'],
			['B', 'w', 'y']
		]) {
			pin(
				divergenceShader,
				`if (nb.${channel} > 0.5) { ${side} = -C.${component}; }`
			);
			for (const shader of [
				pressureShader,
				pressureJacobi2Shader,
				gradientSubtractShader
			])
				pin(shader, `if (nb.${channel} > 0.5) { ${side} = C; }`);
		}
		pin(
			pressureShader,
			'float pressure = ((L + R + B + T) * uPressureScale - divergence) * 0.25;'
		);
		for (const [side, offset] of [
			['L', '- vec2(texelSize.x, 0.0)'],
			['R', '+ vec2(texelSize.x, 0.0)'],
			['T', '+ vec2(0.0, texelSize.y)'],
			['B', '- vec2(0.0, texelSize.y)']
		]) {
			pin(
				pressureJacobi2Shader,
				`float ${side} = texture2D(uPressure, uv ${offset}).x;`
			);
			pin(
				pressureJacobi2Shader,
				`float ${side} = innerIterate(clampToTexelCenter(vUv ${offset}));`
			);
		}
		pin(
			pressureJacobi2Shader,
			'float p = ((L + R + B + T) * uScaleInner - divergence) * 0.25;'
		);
		pin(
			pressureJacobi2Shader,
			'float pressure = (L + R + B + T - divergence) * 0.25;'
		);
		pin(gradientSubtractShader, 'velocity.xy -= vec2(R - L, T - B);');
		pin(
			gradientSubtractShader,
			'gl_FragColor = vec4(velocity, 0.0, 1.0) * im;'
		);

		// Closed box, then the existing binary baffle pattern at a larger clearance.
		// Scale=1, sticky pressure=0, inline mask=1; no solve or dynamics claim (ADR 0121).
		// Legacy impulse support stays interior; only the MAC basis sweep covers walls.
		for (const baffle of [false, true]) {
			const g = staggeredGeometry(
				12,
				8,
				(x, y) => !(baffle && x === 8 && y > 1 && y < 6)
			);
			const fluid = (x: number, y: number) =>
				x >= 0 &&
				x < g.width &&
				y >= 0 &&
				y < g.height &&
				g.cells[y * g.width + x] !== 0;
			const p = new Float64Array(g.cells.length);
			p[3 * g.width + 3] = 1;
			const sample = (x: number, y: number, cx: number, cy: number) =>
				p[fluid(x, y) ? y * g.width + x : cy * g.width + cx];
			const gx = new Float64Array(p.length),
				gy = new Float64Array(p.length);
			const a5 = new Float64Array(p.length),
				dg = new Float64Array(p.length);
			for (let y = 0; y < g.height; y++)
				for (let x = 0; x < g.width; x++) {
					if (!fluid(x, y)) continue;
					const i = y * g.width + x;
					const L = sample(x - 1, y, x, y),
						R = sample(x + 1, y, x, y);
					const T = sample(x, y + 1, x, y),
						B = sample(x, y - 1, x, y);
					gx[i] = R - L;
					gy[i] = T - B;
					a5[i] = 4 * p[i] - (L + R + B + T);
				}
			for (let y = 0; y < g.height; y++)
				for (let x = 0; x < g.width; x++) {
					if (!fluid(x, y)) continue;
					const i = y * g.width + x;
					const L = fluid(x - 1, y) ? gx[i - 1] : -gx[i];
					const R = fluid(x + 1, y) ? gx[i + 1] : -gx[i];
					const T = fluid(x, y + 1) ? gy[i + g.width] : -gy[i];
					const B = fluid(x, y - 1) ? gy[i - g.width] : -gy[i];
					dg[i] = 0.5 * (R - L + T - B);
				}
			expect(
				Math.abs(defect(dg, a5) - expectedLegacy.defect)
			).toBeLessThanOrEqual(tolerance);
			expect(Math.abs(norm(a5) - expectedLegacy.pressure)).toBeLessThanOrEqual(
				tolerance
			);
			expect(
				Math.abs(defect(dg, a5) / norm(a5) - expectedLegacy.ratio)
			).toBeLessThanOrEqual(tolerance);
			const expected = new Float64Array(p.length);
			expected[3 * g.width + 3] = 2;
			for (const offset of [-1, 1, -g.width, g.width]) {
				expected[3 * g.width + 3 + offset] = -1;
				expected[3 * g.width + 3 + 2 * offset] = 0.5;
			}
			expect(dg.map((value, i) => value + a5[i])).toEqual(expected);

			// All fluid-cell basis vectors also cover wall-adjacent MAC columns.
			for (let cell = 0; cell < p.length; cell++) {
				if (!g.cells[cell]) continue;
				p.fill(0);
				p[cell] = 1;
				const gradient = staggeredGradient(g, p);
				const ap = staggeredLaplacian(g, p);
				expect(
					defect(staggeredDivergence(g, gradient), ap) / Math.max(1, norm(ap))
				).toBeLessThanOrEqual(tolerance);
				for (let face = 0; face < gradient.length; face++)
					if (!g.faces[face]) expect(gradient[face]).toBe(0);
			}
		}
	});
	it('packs right/top faces, left/bottom padding, pins all solid faces', () => {
		const g = staggeredGeometry(3, 2, (x, y) => !(x === 1 && y === 1), {
			left: 'open',
			right: 'open',
			bottom: 'open'
		});
		expect(g.u(1, 0)).toBe(0);
		expect(g.v(0, 1)).toBe(1);
		expect(g.u(0, 0)).toBe(6);
		expect(g.v(0, 0)).toBe(17);
		expect(g.faces[g.u(1, 1)]).toBe(0);
		expect(g.faces[g.v(1, 1)]).toBe(0);
		expect(g.faces[g.u(0, 0)]).toBe(255);
		expect(g.diagonal[0]).toBe(6);
	});
	it.each([
		{},
		{ left: 'open', right: 'open', top: 'open', bottom: 'open' }
	] as const)(
		'DG equals the five-point Laplacian including walls and open ghosts: %j',
		(boundary) => {
			const g = staggeredGeometry(
				9,
				7,
				(x, y) => !(x === 4 && y > 1 && y < 5),
				boundary
			);
			const p = Float64Array.from(g.cells, (cell, i) =>
				cell ? Math.sin(i * 0.71) : 0
			);
			const gradient = staggeredGradient(g, p),
				divergence = staggeredDivergence(g, gradient),
				laplacian = staggeredLaplacian(g, p);
			for (let i = 0; i < p.length; i++)
				expect(divergence[i]).toBeCloseTo(-laplacian[i], 12);
			for (let i = 0; i < gradient.length; i++)
				if (!g.faces[i]) expect(gradient[i]).toBe(0);
			const q = Float64Array.from(g.cells, (cell, i) =>
					cell ? Math.cos(i * 0.31) : 0
				),
				aq = staggeredLaplacian(g, q);
			const dot = (a: Float64Array, b: Float64Array) =>
				a.reduce((sum, v, i) => sum + v * b[i], 0);
			expect(dot(p, aq)).toBeCloseTo(dot(q, laplacian), 10);
			expect(dot(p, laplacian)).toBeGreaterThan(0);
		}
	);
	it('face flux telescopes exactly over arbitrary slabs', () => {
		const g = staggeredGeometry(
			20,
			8,
			(x, y) => y > 0 && y < 7 && !(x === 8 && y > 4),
			{ left: 'open', right: 'open' }
		);
		const velocity = Float64Array.from(g.faces, (open, i) =>
			open ? Math.sin(i * 0.23) : 0
		);
		const d = staggeredDivergence(g, velocity),
			flux = (x: number) =>
				Array.from({ length: g.height }, (_, y) => velocity[g.u(x, y)]).reduce(
					(a, b) => a + b,
					0
				);
		for (const [a, b] of [
			[0, 20],
			[4, 9],
			[9, 19]
		]) {
			let total = 0;
			for (let y = 0; y < g.height; y++)
				for (let x = a; x < b; x++) total += d[y * g.width + x];
			expect(flux(b) - flux(a)).toBeCloseTo(total, 12);
		}
	});
	it('projects anchored binary channels with complete rectangular flux accounting', () => {
		const residualGate = 1.02e-10,
			divergenceGate = 1e-9,
			fluxGate = 1e-12;
		const normInf = (a: Float64Array) => Math.max(...a.map(Math.abs));
		const norm2 = (a: Float64Array) => Math.hypot(...a);
		const fixtures = [
			['channel', (_x: number, _y: number) => true],
			['baffle', (x: number, y: number) => !(x === 6 && y <= 4)],
			['separator', (_x: number, y: number) => y !== 4]
		] as const;
		const geometry = (fluid: (x: number, y: number) => boolean) =>
			staggeredGeometry(12, 8, fluid, { left: 'open', right: 'open' });
		const requireAnchors = (g: ReturnType<typeof staggeredGeometry>) => {
			const seen = new Set<number>();
			let components = 0;
			for (let start = 0; start < g.cells.length; start++) {
				if (!g.cells[start] || seen.has(start)) continue;
				components++;
				const queue = [start];
				seen.add(start);
				let anchored = false;
				for (let head = 0; head < queue.length; head++) {
					const i = queue[head];
					let neighbors = 0;
					for (let k = 0; k < 4; k++) {
						const n = g.neighbors[4 * i + k];
						if (n < 0) continue;
						neighbors++;
						if (!seen.has(n)) {
							seen.add(n);
							queue.push(n);
						}
					}
					anchored ||= g.diagonal[i] > neighbors;
				}
				if (!anchored) throw new Error('Unanchored pressure component');
			}
			return components;
		};
		// Reject the isolated center before invoking CG; no nullspace repair.
		const ring = geometry(
			(x, y) => Math.max(Math.abs(x - 5), Math.abs(y - 3)) !== 1
		);
		expect(() => requireAnchors(ring)).toThrow('Unanchored pressure component');
		for (const [name, fluid] of fixtures) {
			const g = geometry(fluid);
			expect(requireAnchors(g)).toBe(name === 'separator' ? 2 : 1);
			const velocity = new Float64Array(g.faces.length);
			for (let y = 0; y < g.height; y++)
				for (let x = 0; x <= g.width; x++)
					if (g.faces[g.u(x, y)])
						velocity[g.u(x, y)] = 1 + ((3 * x + 5 * y) % 7) / 8;
			for (let y = 0; y <= g.height; y++)
				for (let x = 0; x < g.width; x++)
					if (g.faces[g.v(x, y)])
						velocity[g.v(x, y)] = (((5 * x + 2 * y) % 5) - 2) / 8;
			const scale = Math.max(1, normInf(velocity));
			const d = staggeredDivergence(g, velocity);
			expect(norm2(d)).toBeGreaterThan(0);
			const q = referencePressure(g, d, undefined, 1e-10).pressure;
			const aq = staggeredLaplacian(g, q),
				gradient = staggeredGradient(g, q);
			const projected = velocity.map((v, i) => v - gradient[i]);
			const wrong = velocity.map((v, i) => v + gradient[i]);
			const dp = staggeredDivergence(g, projected),
				dw = staggeredDivergence(g, wrong);
			const residual = norm2(aq.map((v, i) => v + d[i])) / norm2(d);
			const divergence = normInf(dp) / scale;
			const wrongDefect = normInf(dw.map((v, i) => v - 2 * d[i])) / scale;
			const wrongDivergence = normInf(dw) / scale;
			expect(residual).toBeLessThanOrEqual(residualGate);
			expect(divergence).toBeLessThanOrEqual(divergenceGate);
			expect(wrongDefect).toBeLessThanOrEqual(divergenceGate);
			expect(wrongDivergence).toBeGreaterThan(1e-3);
			for (const field of [
				velocity,
				d,
				q,
				aq,
				gradient,
				projected,
				wrong,
				dp,
				dw
			])
				expect(field.every(Number.isFinite)).toBe(true);
			for (let face = 0; face < g.faces.length; face++)
				if (!g.faces[face])
					for (const field of [velocity, gradient, projected, wrong])
						expect(field[face]).toBe(0);
			let rectangles = 0,
				maxFluxError = 0,
				maxBoundaryFlux = 0,
				maxFluxResidual = 0;
			// All four sides include transverse cuts; solids contribute zero through pinned faces.
			for (let left = 0; left < g.width; left++)
				for (let right = left + 1; right <= g.width; right++)
					for (let bottom = 0; bottom < g.height; bottom++)
						for (let top = bottom + 1; top <= g.height; top++) {
							let flux = 0,
								absBoundary = 0,
								sum = 0,
								absDiv = 0;
							const add = (value: number) => {
								flux += value;
								absBoundary += Math.abs(value);
							};
							for (let y = bottom; y < top; y++) {
								add(-projected[g.u(left, y)]);
								add(projected[g.u(right, y)]);
								for (let x = left; x < right; x++) {
									const value = dp[y * g.width + x];
									sum += value;
									absDiv += Math.abs(value);
								}
							}
							for (let x = left; x < right; x++) {
								add(-projected[g.v(x, bottom)]);
								add(projected[g.v(x, top)]);
							}
							const error =
								Math.abs(flux - sum) / Math.max(1, absBoundary, absDiv);
							const cellcount = (right - left) * (top - bottom);
							expect(error).toBeLessThanOrEqual(fluxGate);
							expect(Math.abs(flux)).toBeLessThanOrEqual(
								cellcount * divergenceGate * scale
							);
							maxFluxError = Math.max(maxFluxError, error);
							maxBoundaryFlux = Math.max(maxBoundaryFlux, Math.abs(flux));
							maxFluxResidual = Math.max(
								maxFluxResidual,
								Math.abs(flux) / (cellcount * scale)
							);
							rectangles++;
						}
			expect(rectangles).toBe(2808);
			console.info(
				'MAC projection certificate',
				JSON.stringify({
					name,
					scale,
					divergenceNorm2: norm2(d),
					residual,
					divergence,
					wrongDefect,
					wrongDivergence,
					rectangles,
					maxFluxError,
					maxBoundaryFlux,
					maxFluxResidual
				})
			);
		}
	});
	it('rejects invalid dimensions', () => {
		for (const n of [0, -1, 0.5, NaN, Infinity])
			expect(() => staggeredGeometry(n, 8, () => true)).toThrow(RangeError);
	});
});
