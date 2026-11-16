import { describe, expect, it } from 'vitest';
import { DEFAULTS, resolveConfig, viscosityAlpha } from '../FluidEngine.js';
import {
	scalarDiffusionShader,
	scalarRadiationShader,
	thermalAdvectionShader,
	emissionShader,
	viscosityShader
} from '../shaders.js';
import engine from '../FluidEngine.ts?raw';

const relax = (value: number, target: number, rate: number, dt: number, footprint: number, supplied = true) =>
	supplied ? value + (target - value) * -Math.expm1(-rate * dt * footprint) : value;
const radiation = (theta: number, k: number, dt: number, ratio: number) => {
	let lo = 0,
		hi = theta;
	for (let i = 0; i < 60; i++) {
		const mid = (lo + hi) / 2;
		const f = mid + k * dt * (((1 + (ratio - 1) * mid) ** 4 - 1) / (ratio ** 4 - 1)) - theta;
		if (f > 0) hi = mid;
		else lo = mid;
	}
	return (lo + hi) / 2;
};
const excitation = (theta: number, chi = 12, ratio = 6) =>
	Math.exp(-chi * (ratio / (1 + (ratio - 1) * theta) - 1));

describe('thermal composition and energy algebra', () => {
	it('relaxes without accumulation, preserves unsupplied channels and composes across dt', () => {
		let q = 0;
		for (let i = 0; i < 1000; i++) q = relax(q, 2, 60, 1 / 240, 0.8);
		expect(q).toBeCloseTo(2, 12);
		expect(relax(7, 0, 60, 1, 1, false)).toBe(7);
		expect(relax(7, 0, 60, 1, 1)).toBeLessThan(1e-12);
		expect(relax(relax(0, 1, 60, 1 / 120, 0.3), 1, 60, 1 / 120, 0.3)).toBeCloseTo(
			relax(0, 1, 60, 1 / 60, 0.3),
			14
		);
	});
	it('eliminates half-cell wall ghosts, drops insulated faces, keeps a constant insulated field', () => {
		const solve = (rhs: number, sum: number, fluid: number, walls: number, a: number, isothermal: boolean) =>
			(rhs + a * sum) / (1 + a * (fluid + (isothermal ? 2 * walls : 0)));
		expect(solve(1, 3, 3, 1, 0.5, false)).toBe(1);
		expect(solve(1, 3, 3, 1, 0.5, true)).toBeCloseTo(2.5 / 3.5);
		expect(solve(1, 0, 0, 4, 1, true)).toBe(1 / 9);
		expect(scalarDiffusionShader).toContain('2.0 * wall * uIsothermal');
		expect(scalarDiffusionShader).not.toContain('uSolidNeighbors');
		expect(scalarDiffusionShader).not.toContain('inlineMaskValue');
	});
	it('uses actual scalar dimensions so thermal/viscous diffusion ratio is 1/Pr', () => {
		const a = viscosityAlpha(0.7, 1 / 240, 768, 256);
		const b = viscosityAlpha(1, 1 / 240, 3072, 1024);
		expect(b / a).toBeCloseTo(16 / 0.7);
	});
	it('radiation fixes ambient, remains bounded, monotonically cools with rate/time', () => {
		expect(radiation(0, 100, 10, 6)).toBe(0);
		for (const theta of [0.01, 0.2, 0.5, 1, 2]) {
			let previous = theta;
			for (const k of [0, 0.1, 1, 10, 10000]) {
				const cooled = radiation(theta, k, 0.1, 6);
				expect(cooled).toBeGreaterThanOrEqual(0);
				expect(cooled).toBeLessThanOrEqual(previous + 1e-14);
				previous = cooled;
			}
		}
		expect(scalarRadiationShader).toContain('hi = mix(hi,mid,positive)');
	});
	it('excitation is monotone, hot salt emits, ambient salt is practically dark', () => {
		expect(excitation(1)).toBe(1);
		expect(excitation(0)).toBeLessThan(1e-20);
		for (let theta = 0; theta < 1; theta += 0.01)
			expect(excitation(theta + 0.01)).toBeGreaterThan(excitation(theta));
		expect(emissionShader).toContain('dye.a');
	});
});

describe('thermal validation and wiring', () => {
	it.each([
		{ diffusivity: -1 },
		{ diffusivity: NaN },
		{ diffusivity: Infinity },
		{ radiativeCooling: -1 },
		{ radiativeCooling: NaN },
		{ temperatureRatio: 1 },
		{ temperatureRatio: 1 + 1e-9 },
		{ temperatureRatio: 1.009999 },
		{ temperatureRatio: Infinity },
		{ diffusionIterations: 0 },
		{ diffusionIterations: 1.5 }
	])('rejects invalid thermal coefficients %j', (field) => {
		expect(() =>
			resolveConfig({ flow: { scalarFields: [{ name: 'temperature', ...field }] } }, DEFAULTS)
		).toThrow(RangeError);
	});
	it('rejects invalid emission, accepts zero losses', () => {
		expect(() =>
			resolveConfig(
				{ flow: { visualization: { emission: { scalar: 'temperature', intensity: -1, excitation: 2 } } } },
				DEFAULTS
			)
		).toThrow(RangeError);
		expect(() =>
			resolveConfig(
				{
					flow: {
						scalarFields: [
							{
								name: 'temperature',
								diffusivity: 0,
								radiativeCooling: 0,
								temperatureRatio: 6,
								diffusionIterations: 1
							}
						]
					}
				},
				DEFAULTS
			)
		).not.toThrow();
	});
	it('guards float precision, manually filters unsupported devices and linearly reconstructs emission', () => {
		expect(() =>
			resolveConfig({ flow: { scalarFields: [{ name: 'temperature', temperatureRatio: 1.01 }] } }, DEFAULTS)
		).not.toThrow();
		expect(scalarRadiationShader).toContain('max(vec4(1.0)-ambient4,vec4(0.000001))');
		expect(thermalAdvectionShader).toContain('thermalBilerp(uVelocity, vUv, uVelocityTexel)');
		expect(thermalAdvectionShader).toContain('thermalBilerp(uSource, coord, texelSize)');
		expect(engine.match(/name === 'thermalAdvection'\) && !this.ext.supportLinearFiltering/g)).toHaveLength(
			2
		);
		expect(engine).toContain('!thermal && this.ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST');
	});
	it('runs transport immediately after advection in both branches before outlets', () => {
		expect(
			engine.match(/this\.advectScalar\(dt\);\s*this\.applyScalarTransport\(dt\);\s*this\.applyFlowOutlets/g)
		).toHaveLength(2);
		expect(engine).toContain("this.requireOptionalFBO(this.scalarRhs, 'thermal RHS')");
		expect(thermalAdvectionShader).toContain('donorWeight');
		expect(thermalAdvectionShader).toContain('solidAt(candidate)');
		expect(thermalAdvectionShader).toContain('clamp(corrected,lo,hi)');
		expect(thermalAdvectionShader).toContain('forwardClear');
		expect(engine).toContain('this.scalarAdvected.attach(6)');
	});
	it('prepares emission before bloom in both render paths, no-slip keeps free-slip arithmetic', () => {
		for (const method of ['renderCoreInner', 'renderProfiledInner']) {
			const body = engine.split(`private ${method}`)[1];
			expect(body.indexOf('this.prepareEmission()')).toBeLessThan(body.indexOf('this.applyBloom(light,'));
		}
		expect(viscosityShader).toContain(
			'vec2 velocity = (source + uAlpha * (L + R + T + B)) / (1.0 + 4.0 * uAlpha);'
		);
		expect(engine).toContain('if (prescribedChanged) this.initPrescribedGridTextures();');
		expect(engine).not.toContain('if (flowChanged) this.initPrescribedGridTextures();');
	});
});
