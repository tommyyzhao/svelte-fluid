import { describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { FluidEngine } from '../FluidEngine.js';
import type { FBO } from '../internal-types.js';
import { createFBO, disposeFBO } from '../gl-utils.js';
import { getTuning } from '../../../routes/test/tesla-valve/tunings.js';
import { jetFlow } from '../../../routes/test/tesla-valve/jet-pulse.js';
import { renderer } from './renderer.js';

interface Harness {
	gl: WebGL2RenderingContext;
	profileEnvironment(): import('../engine-profiler.js').ProfileEnvironment;
	solidMaskData: Uint8Array;
	solidMaskW: number;
	solidMaskH: number;
	renderCore(target: FBO | null): void;
}
const cmd = commands as unknown as {
	captureCanvasScreenshot(rect: {
		x: number;
		y: number;
		width: number;
		height: number;
		nativeSize?: boolean;
	}): Promise<string>;
	writeBenchBase64(path: string, data: string): Promise<void>;
	writeBenchJson(path: string, data: string): Promise<void>;
};
const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const linear = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);

const measurement = import.meta.env.SVELTE_FLUID_SHOTS_EXTRA;
const variants =
	measurement === 'thermal-paced'
		? ['baseline', 'raf-cadence']
		: measurement === 'viscosity-candidate'
		? ['viscosity-40', 'viscosity-10']
		: measurement === 'viscosity-noise'
		? ['viscosity-39', 'viscosity-40']
		: measurement === 'viscosity-ensemble'
		? ['viscosity-38', 'viscosity-39', 'viscosity-40']
		: measurement === 'thermal-rounding'
		? ['equal-convergence']
		: measurement === 'thermal-isolate'
		? ['diffusion-only', 'viscosity-only']
		: measurement === 'thermal-convergence'
		? ['baseline', 'pressure-double', 'dt-half', 'diffusion-double']
		: measurement === 'thermal-followup'
		? ['pressure-quadruple', 'raf-cadence', 'nozzle-baseline', 'nozzle-dt-half']
		: measurement === 'thermal-sensitivity'
		? ['baseline', 'k-tenth']
		: ['baseline'];
describe.each(variants)('thermal scene %s', (variant) => {
	it('real flame-jet: establishes discharge/salt arrival, then evaluates registered cycle-averaged physical fade', async () => {
		const original = getTuning('flame-jet');
		const diffusionScale = variant === 'k-tenth' ? 0.1 : 1;
		const dt = variant.endsWith('dt-half') ? original.config.maxTimeStep! / 2 : original.config.maxTimeStep!;
		const tuning = {
			...original,
			config: {
				...original.config,
				viscosityIterations: variant.startsWith('viscosity-') && /^viscosity-\d+$/.test(variant) ? Number(variant.split('-')[1]) : variant === 'equal-convergence' ? 41 : variant === 'diffusion-only' ? 40 : original.config.viscosityIterations,
				pressureIterations:
					original.config.pressureIterations! *
					(variant === 'pressure-quadruple' ? 4 : variant === 'pressure-double' ? 2 : 1),
				flow: {
					...original.config.flow,
					scalarFields: original.config.flow.scalarFields!.map((field) => ({
						...field,
						diffusivity: field.diffusivity! * diffusionScale,
						diffusionIterations: variant === 'equal-convergence' ? 81 : variant === 'viscosity-only' ? 80 : field.diffusionIterations! * (variant === 'diffusion-double' ? 2 : 1)
					}))
				}
			}
		};
		const pulse = tuning.pulse!;
		const stage = document.createElement('div');
		stage.style.cssText = 'position:relative;width:960px;height:320px;background:white;overflow:hidden';
		const shape = tuning.config.containerShape!;
		if (shape.type !== 'svgPath') throw new Error('Expected real Tesla geometry');
		stage.innerHTML = `<svg style="position:absolute;inset:0;width:100%;height:100%" viewBox="${shape.viewBox!.join(
			' '
		)}" preserveAspectRatio="xMidYMid meet"><path d="${shape.d}" fill="#000" fill-rule="evenodd"/></svg>`;
		const canvas = document.createElement('canvas');
		canvas.width = 1920;
		canvas.height = 640;
		canvas.style.cssText = 'position:relative;width:960px;height:320px;display:block';
		stage.append(canvas);
		document.body.append(stage);
		const engine = new FluidEngine({
				canvas,
				autoStart: false,
				// Glass is a display overlay; registered fluid-fade metrics exclude its external reflection.
				config: { ...tuning.config, glass: false, seed: 704, pointerInput: false, transparent: true }
			}),
			h = engine as unknown as Harness;
		const gl = h.gl;
		const environment = h.profileEnvironment();
		expect([canvas.width, canvas.height, gl.drawingBufferWidth, gl.drawingBufferHeight]).toEqual([
			1920, 640, 1920, 640
		]);
		expect([
			environment.simWidth,
			environment.simHeight,
			environment.dyeWidth,
			environment.dyeHeight
		]).toEqual([tuning.config.simResolution! * 3, tuning.config.simResolution, tuning.config.dyeResolution! * 3, tuning.config.dyeResolution]);
		console.log(
			'flame dimensions',
			JSON.stringify({ environment, rect: canvas.getBoundingClientRect().toJSON() })
		);
		const target = createFBO(gl, 960, 320, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
		const isFluid = (x: number, y: number) =>
			h.solidMaskData[
				Math.min(h.solidMaskH - 1, Math.floor((1 - y) * h.solidMaskH)) * h.solidMaskW +
					Math.min(h.solidMaskW - 1, Math.floor(x * h.solidMaskW))
			] < 128;
		const observations: {
			time: number;
			head: number;
			tail: number;
			headBand: number;
			tailBand: number;
			inlet: number;
			shoulder: number;
			tailDisplay: number;
			salt: number;
			flux: number;
		}[] = [];
		const profiles: number[][] = [];
		const shots: string[] = [];
		const shotDir = import.meta.env.SVELTE_FLUID_SHOTS_DIR
			? `${import.meta.env.SVELTE_FLUID_SHOTS_DIR}/${variant}`
			: '';
		async function sample(time: number) {
			engine.setConfig({ glass: false });
			const emission = engine.readField('emission'),
				dye = engine.readField('dye'),
				velocity = engine.readField('velocity');
			const axial = new Float64Array(100),
				axialN = new Uint32Array(100);
			let head = 0,
				tail = 0,
				headN = 0,
				tailN = 0,
				headBand = 0,
				tailBand = 0,
				headBN = 0,
				tailBN = 0,
				salt = 0,
				saltN = 0,
				flux = 0,
				fluxN = 0;
			for (let y = 0; y < emission.height; y++)
				for (let x = 0; x < emission.width; x++) {
					const u = (x + 0.5) / emission.width,
						v = (y + 0.5) / emission.height;
					if (!isFluid(u, v)) continue;
					const i = (y * emission.width + x) * 4,
						l = luminance(emission.data[i], emission.data[i + 1], emission.data[i + 2]);
					const bin = Math.min(99, Math.floor(u * 100));
					axial[bin] += l;
					axialN[bin]++;
					if (u >= 0.03 && u <= 0.1) {
						head += l;
						headN++;
						if (Math.abs(v - 0.49) < 0.025) {
							headBand += l;
							headBN++;
						}
					}
					if (u >= 0.9 && u <= 0.97) {
						tail += l;
						tailN++;
						salt += dye.data[i] + dye.data[i + 1] + dye.data[i + 2];
						saltN++;
						if (Math.abs(v - 0.49) < 0.025) {
							tailBand += l;
							tailBN++;
						}
					}
				}
			for (let y = 0; y < velocity.height; y++)
				for (let x = Math.floor(velocity.width * 0.97); x < Math.floor(velocity.width * 0.99); x++) {
					const u = (x + 0.5) / velocity.width,
						v = (y + 0.5) / velocity.height;
					if (isFluid(u, v)) {
						flux += velocity.data[(y * velocity.width + x) * 2] / velocity.width;
						fluxN++;
					}
				}
			h.renderCore(target);
			const display = new Float32Array(960 * 320 * 4);
			gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
			gl.readPixels(0, 0, 960, 320, gl.RGBA, gl.FLOAT, display);
			let inlet = 0,
				inletN = 0,
				shoulder = 0,
				shoulderN = 0,
				tailDisplay = 0,
				tailDN = 0;
			for (let y = 0; y < 320; y++)
				for (let x = 0; x < 960; x++) {
					const u = (x + 0.5) / 960,
						v = (y + 0.5) / 320;
					if (!isFluid(u, v)) continue;
					const i = (y * 960 + x) * 4,
						r = display[i],
						g = display[i + 1],
						b = display[i + 2],
						l = luminance(linear(r), linear(g), linear(b));
					if (u >= 0.012 && u <= 0.025 && Math.abs(v - 0.49) < 0.015) {
						inlet += l;
						inletN++;
					}
					if (u >= 0.02 && u <= 0.08 && Math.abs(v - 0.49) > 0.05 && Math.abs(v - 0.49) < 0.085) {
						shoulder += Math.max(r, g, b) - Math.min(r, g, b);
						shoulderN++;
					}
					if (u >= 0.9 && u <= 0.97) {
						tailDisplay += l;
						tailDN++;
					}
				}
			if (time > 24) profiles.push(Array.from(axial, (value, i) => value / Math.max(1, axialN[i])));
			const observation = {
				time,
				head: head / headN,
				tail: tail / tailN,
				headBand: headBand / headBN,
				tailBand: tailBand / tailBN,
				inlet: inlet / inletN,
				shoulder: shoulder / shoulderN,
				tailDisplay: tailDisplay / tailDN,
				salt: salt / saltN,
				flux: flux / fluxN
			};
			observations.push(observation);
			console.log('flame observation', JSON.stringify(observation));
			expect(gl.getError()).toBe(gl.NO_ERROR);
		}
		try {
			const stepsPerSecond = Math.round(1 / dt);
			for (let frame = 1; frame <= (variant.startsWith('nozzle-') ? 1 : 30) * stepsPerSecond; frame++) {
				const time = frame * dt;
				if (variant !== 'raf-cadence' || (frame - 1) % (stepsPerSecond / (1 / pulse.clockCap)) === 0) {
					const pulseTime =
						variant === 'raf-cadence' ? Math.floor((frame - 1) / (stepsPerSecond / (1 / pulse.clockCap))) * pulse.clockCap : time;
					engine.setConfig({
						flow: jetFlow(tuning.config.flow, pulseTime, pulse.base, pulse.peak, pulse.palette)
					});
				}
				engine.advance(1, dt);
				if (frame % stepsPerSecond === 0) {
					await new Promise((r) => setTimeout(r, 0));
					if ([1, 5, 12, 30].includes(time)) {
						engine.setConfig({ glass: true });
						h.renderCore(null);
						await engine.presented();						if (shotDir) {
							const rect = canvas.getBoundingClientRect();
							const png = (await cmd.captureCanvasScreenshot({
								x: rect.x,
								y: rect.y,
								width: rect.width,
								height: rect.height,
								nativeSize: true
							})) as string;
							const path = `${shotDir}/flame-${time}s.png`;
							await cmd.writeBenchBase64(path, png);
							shots.push(path);
							if (time === 30) {
								engine.setConfig({ glass: false });
								h.renderCore(null);
								await engine.presented();
								const offPath = `${shotDir}/flame-30s-glass-off.png`;
								await cmd.writeBenchBase64(offPath, await cmd.captureCanvasScreenshot({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, nativeSize: true }));
								shots.push(offPath);
							}
						}
					}
				}
				if (
					frame % (6 * stepsPerSecond) === 0 ||
					(frame >= 24 * stepsPerSecond && frame % (stepsPerSecond / 2) === 0)
				)
					await sample(time);
			}
			if (variant.startsWith('nozzle-')) {
				const dye = engine.readField('dye'),
					scalar = engine.readField('scalar');
				let salt = 0,
					heat = 0,
					count = 0;
				for (let y = 0; y < dye.height; y++)
					for (let x = 0; x < dye.width; x++) {
						const u = (x + 0.5) / dye.width,
							v = (y + 0.5) / dye.height;
						if (u < 0.004 || u > 0.012 || Math.abs(v - 0.49) > 0.015 || !isFluid(u, v)) continue;
						const i = (y * dye.width + x) * 4;
						salt += dye.data[i] + dye.data[i + 1] + dye.data[i + 2];
						heat += scalar.data[i];
						count++;
					}
				await cmd.writeBenchJson(
					`${shotDir}/nozzle.json`,
					JSON.stringify(
						{ variant, dt, time: 1, salt: salt / count, temperature: heat / count, count },
						null,
						2
					)
				);
				return;
			}
			const cycle = observations.filter((o) => o.time > 24);
			const average = (key: keyof (typeof cycle)[number]) =>
				cycle.reduce((sum, o) => sum + o[key], 0) / cycle.length;
			const axialProfile = Array.from(
				{ length: 100 },
				(_, i) => profiles.reduce((sum, p) => sum + p[i], 0) / profiles.length
			);
			const crossing = (fraction: number) => {
				for (let i = 10; i < 100; i++)
					if (axialProfile[i] <= average('head') * fraction) return (i + 0.5) / 100;
				return 1;
			};
			const metrics = {
				variant,
				dt,
				axialProfile,
				fade50: crossing(0.5),
				fade5: crossing(0.05),
				renderer,
				window: [24, 30],
				head: average('head'),
				tail: average('tail'),
				ratio: average('tail') / average('head'),
				bandRatio: average('tailBand') / average('headBand'),
				inletLuminance: average('inlet'),
				shoulderChroma: average('shoulder'),
				tailDisplayLuminance: average('tailDisplay'),
				downstreamSalt: average('salt'),
				outletFluxUvPerSecond: average('flux'),
				environment,
				reynoldsEstimate: (average('flux') * 3 * 0.201) / ((tuning.config.viscosity! * 3) / 128),
				pecletEstimate:
					(average('flux') * 3 * 0.201) / ((tuning.config.flow.scalarFields![0].diffusivity! * 3) / 128),
				observations,
				shots,
				parameters: tuning.config
			};
			await cmd.writeBenchJson(
				`${shotDir || '.svelte-kit/flame-shots'}/metrics.json`,
				JSON.stringify(metrics, null, 2)
			);
			console.log('REGISTERED FLAME FADE', JSON.stringify(metrics));
			expect(metrics.outletFluxUvPerSecond, 'positive outlet flux before fade').toBeGreaterThan(0);
			expect(metrics.downstreamSalt, 'salt must arrive downstream; stalled darkness fails').toBeGreaterThan(
				0.001
			);
			expect(metrics.ratio, 'tail/head raw emission cross-section means <=2%').toBeLessThanOrEqual(0.02);
			expect(metrics.bandRatio, 'tail/head raw emission centreline bands <=2%').toBeLessThanOrEqual(0.02);
			expect(metrics.inletLuminance, 'inlet core near white').toBeGreaterThanOrEqual(0.8);
			expect(metrics.shoulderChroma, 'visible coloured shoulders').toBeGreaterThan(0.08);
			expect(metrics.tailDisplayLuminance, 'tail dark after bloom').toBeLessThan(0.02);
		} finally {
			disposeFBO(gl, target);
			engine.dispose();
			stage.remove();
		}
	}, 1_200_000);
});
