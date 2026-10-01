import { describe, expect, it } from 'vitest';
import { CAUSTIC_APERTURE, CAUSTIC_DEFAULTS, CAUSTIC_WAVES, causticFluxBudget, causticFootprint, causticFootprintIntegral, causticHeight, causticJacobian, causticMemoryPlan, causticPhoton, causticRayDifferential, projectCausticRay, type PhotonGrid } from './caustic-light.js';

function reconstructLight(grid: number, width: number, height: number, interleaved: boolean) {
	const light = new Float32Array(width * height);
	for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) {
		const p = causticPhoton(i, j, grid as PhotonGrid, width, height, CAUSTIC_DEFAULTS, interleaved), [ax, ay, bx, by] = p.basis;
		const determinant = ax * by - ay * bx, rx = Math.abs(ax) + Math.abs(bx), ry = Math.abs(ay) + Math.abs(by), power = p.flux * height ** 2 / Math.abs(determinant);
		for (let y = Math.max(0, Math.ceil(p.y - ry - 0.5)); y <= Math.min(height - 1, Math.floor(p.y + ry - 0.5)); y++) for (let x = Math.max(0, Math.ceil(p.x - rx - 0.5)); x <= Math.min(width - 1, Math.floor(p.x + rx - 0.5)); x++) {
			const dx = x + 0.5 - p.x, dy = y + 0.5 - p.y, u = (by * dx - bx * dy) / determinant, v = (-ay * dx + ax * dy) / determinant;
			light[y * width + x] += power * Math.max(0, 1 - Math.abs(u)) * Math.max(0, 1 - Math.abs(v));
		}
	}
	return light;
}

describe('equal-flux forward caustic geometry', () => {
	it('derives normals from the actual height and obeys flat/index-one null refraction', () => {
		for (let y = -0.4; y < 0.5; y += 0.08) for (let x = -0.8; x < 0.9; x += 0.11) {
			const e = 1e-6, [, hx, hy] = causticHeight(x, y, 1.6, CAUSTIC_DEFAULTS);
			expect(hx).toBeCloseTo((causticHeight(x + e, y, 1.6, CAUSTIC_DEFAULTS)[0] - causticHeight(x - e, y, 1.6, CAUSTIC_DEFAULTS)[0]) / (2 * e), 7);
			expect(hy).toBeCloseTo((causticHeight(x, y + e, 1.6, CAUSTIC_DEFAULTS)[0] - causticHeight(x, y - e, 1.6, CAUSTIC_DEFAULTS)[0]) / (2 * e), 7);
			for (const g of [{ ...CAUSTIC_DEFAULTS, relief: 0 }, { ...CAUSTIC_DEFAULTS, index: 1 }]) { const p = projectCausticRay(x, y, 1.6, g); expect(p[0]).toBeCloseTo(x, 12); expect(p[1]).toBeCloseTo(y, 12); }
		}
	});
	it('actually compresses and folds the forward map without negative photon energy', () => {
		let minimumDeterminant = Infinity, maximumDeterminant = -Infinity, compressed = 0;
		for (let y = -0.35; y < 0.4; y += 0.025) for (let x = -0.6; x < 0.65; x += 0.025) {
			const [a, b, c, d] = causticJacobian(x, y, 1.6, { ...CAUSTIC_DEFAULTS, relief: 1, depth: 1 });
			const det = a * d - b * c; minimumDeterminant = Math.min(minimumDeterminant, det); maximumDeterminant = Math.max(maximumDeterminant, det); if (det > 0 && det < 0.5) compressed++;
		}
		expect(compressed).toBeGreaterThan(100); expect(minimumDeterminant).toBeLessThan(0); expect(maximumDeterminant).toBeGreaterThan(2);
		console.info('Caustic forward map determinant range', { minimumDeterminant, maximumDeterminant, compressed });
	});
	it('gets the Snell-map Jacobian from one analytic jet, agreeing with independent ray differences', () => {
		for (const geometry of [CAUSTIC_DEFAULTS, { ...CAUSTIC_DEFAULTS, relief: 1, depth: 1, index: 1.6 }, { ...CAUSTIC_DEFAULTS, index: 1 }]) {
			for (let y = -0.5; y < 0.51; y += 0.09) for (let x = -0.7; x < 0.71; x += 0.11) {
				const exact = causticRayDifferential(x, y, 1.6, geometry), finite = causticJacobian(x, y, 1.6, geometry, 1e-6), point = projectCausticRay(x, y, 1.6, geometry);
				for (let i = 0; i < 4; i++) expect(exact.jacobian[i]).toBeCloseTo(finite[i], 7);
				expect(exact.point[0]).toBeCloseTo(point[0], 12); expect(exact.point[1]).toBeCloseTo(point[1], 12);
			}
		}
	});
	it('reproduces affine irradiance without a lattice, including shear, rotation and orientation reversal', () => {
		let rejectedAxisAlignedError = 0;
		for (const [ax, ay, bx, by] of [[3.1, 0, 0, 2.7], [3.1, 1.3, 2.7, 4.2], [-2.1, 1.2, 1.8, 3.7]]) {
			const determinant = ax * by - ay * bx;
			for (let y = -2; y < 2; y += 0.13) for (let x = -2; x < 2; x += 0.17) {
				let sum = 0, oldAxisAligned = 0; const rx = Math.hypot(ax, bx), ry = Math.hypot(ay, by);
				for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) {
					const dx = x - ax * i - bx * j, dy = y - ay * i - by * j;
					const u = (by * dx - bx * dy) / determinant, v = (-ay * dx + ax * dy) / determinant;
					sum += Math.max(0, 1 - Math.abs(u)) * Math.max(0, 1 - Math.abs(v)) / Math.abs(determinant);
					oldAxisAligned += Math.max(0, 1 - Math.abs(dx) / rx) * Math.max(0, 1 - Math.abs(dy) / ry) / (rx * ry);
				}
				expect(sum).toBeCloseTo(1 / Math.abs(determinant), 12);
				rejectedAxisAlignedError = Math.max(rejectedAxisAlignedError, Math.abs(oldAxisAligned * determinant) - 1);
			}
		}
		expect(rejectedAxisAlignedError).toBeGreaterThan(0.1);
		console.info('Rejected axis-aligned affine lattice peak error', rejectedAxisAlignedError);
	});
	it('interleaves two rotated affine partitions using the same positions and incident photon power', () => {
		for (const [ax, ay, bx, by] of [[3.1, 0, 0, 2.7], [3.1, 1.3, 2.7, 4.2], [-2.1, 1.2, 1.8, 3.7]]) {
			const [a, b, c, d] = [ax + bx, ay + by, ax - bx, ay - by], determinant = a * d - b * c;
			for (let y = -2; y < 2; y += 0.31) for (let x = -2; x < 2; x += 0.37) {
				const cosets = [0, 0];
				for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) {
					const dx = x - ax * i - bx * j, dy = y - ay * i - by * j, u = (d * dx - c * dy) / determinant, v = (-b * dx + a * dy) / determinant;
					cosets[((i + j) % 2 + 2) % 2] += Math.max(0, 1 - Math.abs(u)) * Math.max(0, 1 - Math.abs(v)) / Math.abs(determinant);
				}
				for (const sum of cosets) expect(sum).toBeCloseTo(1 / Math.abs(determinant), 12);
				expect(cosets[0] + cosets[1]).toBeCloseTo(1 / Math.abs(ax * by - ay * bx), 12);
			}
		}
		for (const grid of [64, 128, 256] as const) {
			const single = causticPhoton(13, 27, grid, 1202, 962, CAUSTIC_DEFAULTS, false), mixed = causticPhoton(13, 27, grid, 1202, 962, CAUSTIC_DEFAULTS, true);
			expect([mixed.x, mixed.y, mixed.flux]).toEqual([single.x, single.y, single.flux]);
		}
	});
	it('reduces same-count reconstruction error without washing out the bright ridge network', () => {
		const width = 1202, height = 962, reference = reconstructLight(512, width, height, false);
		const expose = (value: number) => 255 * (1 - Math.exp(-0.026 - 0.37 * 0.24 * value)) ** (1 / 2.2);
		const metrics = [false, true].map((interleaved) => {
			const actual = reconstructLight(256, width, height, interleaved); let error = 0, intersection = 0, union = 0, actualBright = 0, referenceBright = 0, flux = 0;
			for (let i = 0; i < reference.length; i++) {
				const a = expose(actual[i]), r = expose(reference[i]), brightA = a > 180, brightR = r > 180;
				error += Math.abs(a - r); intersection += Number(brightA && brightR); union += Number(brightA || brightR); actualBright += Number(brightA); referenceBright += Number(brightR); flux += actual[i] / height ** 2;
			}
			return { interleaved, meanError: error / reference.length, ridgeIntersectionOverUnion: intersection / union, brightAreaRatio: actualBright / referenceBright, flux };
		});
		expect(metrics[1].meanError).toBeLessThan(metrics[0].meanError * 0.85);
		expect(metrics[1].ridgeIntersectionOverUnion).toBeGreaterThan(metrics[0].ridgeIntersectionOverUnion);
		expect(Math.abs(metrics[1].brightAreaRatio - 1)).toBeLessThan(0.015);
		expect(Math.abs(metrics[1].flux - metrics[0].flux) / metrics[0].flux).toBeLessThan(0.001);
		console.info('Same65k-point reconstruction versus CPU512² single-lattice reference', metrics);
	});
	it('integrates clipped continuous tents and bounds native-pixel regularization without changing photon flux', () => {
		for (const original of [[4, 0, 0, 3], [4, 2, -2, 5], [0.001, 2, 0, 4], [0, 0, 0, 0]]) {
			const basis = causticFootprint(original), [a, b, c, d] = basis;
			expect(Math.abs(a * d - b * c)).toBeGreaterThanOrEqual(0.999999);
			expect(causticFootprintIntegral(50, 50, basis, 100, 100).captured).toBe(1);
			expect(causticFootprintIntegral(-50, 50, basis, 100, 100).captured).toBe(0);
			expect(causticFootprintIntegral(0, 50, basis, 100, 100).captured).toBeCloseTo(0.5, 12);
			let quadrature = 0; const samples = 1200, x = 1.3, y = 2.2;
			for (let j = 0; j < samples; j++) for (let i = 0; i < samples; i++) {
				const u = (i + 0.5) / samples * 2 - 1, v = (j + 0.5) / samples * 2 - 1;
				const px = x + a * u + c * v, py = y + b * u + d * v;
				if (px >= 0 && px <= 100 && py >= 0 && py <= 100) quadrature += (1 - Math.abs(u)) * (1 - Math.abs(v)) * 4 / samples ** 2;
			}
			expect(causticFootprintIntegral(x, y, basis, 100, 100).captured).toBeCloseTo(quadrature, 3);
		}
	});
	it('uses a compact bounded spectrum with a real gravity-capillary dispersion relation', () => {
		expect(CAUSTIC_WAVES).toHaveLength(8);
		for (const wave of CAUSTIC_WAVES) { const k = Math.hypot(wave.kx, wave.ky); expect(wave.omega ** 2).toBeCloseTo(k * (1 + (k * 0.025) ** 2), 12); }
		expect(CAUSTIC_WAVES.reduce((sum, w) => sum + w.amplitude, 0)).toBeLessThan(0.04);
		expect(CAUSTIC_WAVES.reduce((sum, w) => sum + w.amplitude * Math.hypot(w.kx, w.ky), 0)).toBeLessThan(0.6);
	});
	it('keeps incident flux independent of light-sample count and native DPR', () => {
		const g = { ...CAUSTIC_DEFAULTS, relief: 0 };
		for (const grid of [64, 128, 256] as const) for (const [w, h] of [[801, 641], [1202, 962]]) {
			const budget = causticFluxBudget(grid, w, h, g);
			expect(budget.incident).toBeCloseTo(CAUSTIC_APERTURE ** 2 * w / h, 12);
			expect(budget.captured).toBeCloseTo(w / h, 9); expect(budget.escaped).toBeCloseTo(budget.incident - w / h, 9);
			const p = causticPhoton(5, 7, grid, w, h, g); expect(p.flux * grid ** 2).toBeCloseTo(budget.incident, 12);
		}
	});
	it('retains nonnegative finite flux at strong refraction and explicitly reports receiver escape', () => {
		const budget = causticFluxBudget(64, 801, 641, { ...CAUSTIC_DEFAULTS, relief: 1, depth: 1, index: 1.6 });
		expect(budget.captured).toBeGreaterThan(0); expect(budget.captured).toBeLessThanOrEqual(budget.incident);
		expect(budget.escaped).toBeGreaterThan(0); expect(budget.captured + budget.escaped).toBeCloseTo(budget.incident, 12);
	});
	it('budgets native float light, output and old+new attachments without capping DPR', () => {
		const p = causticMemoryPlan(2773, 1682, 924 * 560);
		expect(p.attachmentBytes).toBe(2773 * 1682 * 2); expect(p.outputBytes).toBe(2773 * 1682 * 4);
		expect(p.peakResizeBytes).toBe(p.engineBytes + p.outputBytes + 924 * 560 * 2);
		expect(() => causticMemoryPlan(5000, 5000)).toThrow('attachment budget');
		expect(() => causticMemoryPlan(4000, 3500, 100_000_000)).toThrow('attachment budget');
		expect(() => causticMemoryPlan(800.1, 600)).toThrow('native');
	});
});
