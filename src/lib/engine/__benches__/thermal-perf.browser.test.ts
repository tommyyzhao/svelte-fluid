import { expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { FluidEngine } from '../FluidEngine.js';
import type { FBO } from '../internal-types.js';
import { getTuning } from '../../../routes/test/tesla-valve/tunings.js';
import { jetFlow } from '../../../routes/test/tesla-valve/jet-pulse.js';
import { renderer } from './renderer.js';

interface Harness {
	gl: WebGL2RenderingContext;
	velocity: { width: number; height: number };
	renderCore(target: FBO | null): void;
	applyScalarTransport(dt: number): void;
	applyViscosity(dt: number): void;
	projectVelocity(): void;
	bindSolidMaskUniforms(uniforms: Record<string, WebGLUniformLocation | null>, unit: number, neighborUnit: number): void;
	advectThermalScalar(dt: number, scalar?: unknown): void;
}
const cmd = commands as unknown as {
	writeBenchBase64(path: string, data: string): Promise<void>;
	readBenchBase64(path: string): Promise<string>;
	writeBenchJson(path: string, data: string): Promise<void>;
};
const encode = (bytes: Uint8Array) => {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 32768)
		binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
	return btoa(binary);
};
const decode = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
const quantile = (values: number[], p: number) =>
	[...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];

// Expensive, hardware-only measurement. Never part of the default browser suite.
it.skipIf(!['thermal-perf', 'glass-perf'].includes(import.meta.env.SVELTE_FLUID_SHOTS_EXTRA))(
	'profiles the real flame, stores deterministic float references, measures stage ablations',
	async () => {
		const tuning = getTuning('flame-jet');
		const pulse = tuning.pulse!;
		const canvas = document.createElement('canvas');
		canvas.width = 1920;
		canvas.height = 640;
		canvas.style.cssText = 'width:960px;height:320px';
		document.body.append(canvas);
		const engine = new FluidEngine({
			canvas,
			autoStart: false,
			config: { ...tuning.config, seed: 704, pointerInput: false, transparent: true }
		});
		const h = engine as unknown as Harness;
		const gl = h.gl;
		const tag = (import.meta.env.SVELTE_FLUID_SHOTS_DIR || 'baseline').split('/').at(-1)!;
		const root = '.svelte-kit/flame-perf';
		const pixel = new Uint8Array(4);
		const sync = () => {
			// Offscreen-only stage probes must finish too: a read of an unchanged
			// default target need not serialize unrelated tile render targets.
			gl.finish();
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
		};
		const steps = tuning.config.substeps!;
		const dt = tuning.config.maxTimeStep!;
		let frame = 0;
		let measuredFlow = tuning.config.flow;
		const drive = () => {
			engine.setConfig({ flow: jetFlow(measuredFlow, frame * dt, pulse.base, pulse.peak, pulse.palette) });
		};
		const differences: Record<string, { maxAbsolute: number; differentBits: number }> = {};
		const timings: Record<string, { median: number; p90: number }> = {};
		try {
			expect(/swiftshader|llvmpipe|software/i.test(renderer)).toBe(false);
			expect([h.velocity.width, h.velocity.height]).toEqual([tuning.config.simResolution! * 3, tuning.config.simResolution]);
			// Same per-substep pulse times as the registered fade gate.
			for (frame = 1; frame <= Math.round(3 / dt); frame++) {
				drive();
				engine.advance(1, dt);
				if (frame % 240 === 0) await new Promise((r) => setTimeout(r, 0));
			}
			h.renderCore(null);
			sync();
			if (import.meta.env.SVELTE_FLUID_SHOTS_EXTRA === 'glass-perf') {
				const timings: Record<string, { median: number; p90: number }> = {};
				const samples = { on: [] as number[], off: [] as number[] };
				const state = engine as unknown as { config: { GLASS: boolean } };
				// Keep sceneFBO allocated; switch only routing outside the timed frame.
				for (let batch = 0; batch < 11; batch++) for (const enabled of [true, false, false, true]) {
					state.config.GLASS = enabled;
					frame += steps; drive(); sync();
					const start = performance.now();
					engine.advance(steps, dt); h.renderCore(null); sync();
					if (batch >= 2) samples[enabled ? 'on' : 'off'].push(performance.now() - start);
					await new Promise((r) => setTimeout(r, 0));
				}
				state.config.GLASS = true;
				for (const key of ['on', 'off'] as const) timings[key] = { median: quantile(samples[key], 0.5), p90: quantile(samples[key], 0.9) };
				const report = { tag, renderer, timings, samples, steps, dt, note: 'GPU-synchronized wall time; off retains sceneFBO but uses direct display routing' };
				console.log('glass perf', JSON.stringify(report));
				await cmd.writeBenchJson(`${root}/${tag}.json`, JSON.stringify(report, null, 2));
				return;
			}
			for (const field of ['dye', 'scalar'] as const) {
				const data = engine.readField(field).data;
				const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
				if (tag !== 'baseline' && !tag.startsWith('phase2-')) {
					const referenceTag = tag.startsWith('bounded-') ? 'bounded' : 'baseline';
					const referenceBytes = decode(await cmd.readBenchBase64(`${root}/${referenceTag}-${field}.bin`));
					const reference = new Float32Array(referenceBytes.buffer);
					expect(data.length).toBe(reference.length);
					let maxAbsolute = 0, differentBits = 0;
					const bits = new Uint32Array(data.buffer, data.byteOffset, data.length);
					const referenceBits = new Uint32Array(reference.buffer);
					for (let i = 0; i < data.length; i++) {
						maxAbsolute = Math.max(maxAbsolute, Math.abs(data[i] - reference[i]));
						if (bits[i] !== referenceBits[i]) differentBits++;
					}
					differences[field] = { maxAbsolute, differentBits };
					if (tag.startsWith('bounded-')) expect(differentBits, `${field} exact optimisation`).toBe(0);
					if (tag === 'diffusion-only') {
						if (field === 'dye') expect(differentBits, 'unchanged salt transport').toBe(0);
						else expect(maxAbsolute, 'bounded scalar truncation').toBeLessThanOrEqual(1e-6);
					}
				}
				await cmd.writeBenchBase64(`${root}/${tag}-${field}.bin`, encode(bytes));
			}
			const measure = async (name: string, sample: () => void) => {
				const times: number[] = [];
				for (let i = 0; i < 11; i++) {
					frame += steps;
					drive();
					sync();
					const start = performance.now();
					sample();
					sync();
					if (i >= 2) times.push(performance.now() - start);
					await new Promise((r) => setTimeout(r, 0));
				}
				timings[name] = { median: quantile(times, 0.5), p90: quantile(times, 0.9) };
			};
			const full = () => { engine.advance(steps, dt); h.renderCore(null); };
			await measure('full', full);
			for (const count of [1, 2, 4])
				await measure(`fixed-dt-${count}-steps`, () => { engine.advance(count, dt); h.renderCore(null); });
			const originalFlow = tuning.config.flow;
			measuredFlow = { ...originalFlow, scalarFields: originalFlow.scalarFields!.map((f) => ({ ...f, diffusionIterations: 80 })) };
			engine.setConfig({ viscosityIterations: 40, flow: measuredFlow });
			await measure('original-iterations', () => { engine.advance(steps, dt); h.renderCore(null); });
			measuredFlow = originalFlow;
			engine.setConfig({ viscosityIterations: tuning.config.viscosityIterations, flow: originalFlow });
			await measure('render-only', () => h.renderCore(null));
			for (const stage of ['applyScalarTransport', 'advectThermalScalar', 'applyViscosity', 'projectVelocity'] as const) {
				const original = h[stage];
				try {
					h[stage] = () => {};
					await measure(`without-${stage}`, full);
				} finally { Object.assign(h, { [stage]: original }); }
			}
			// Whole-frame ablations serialize the actual downstream consumers.
			// Isolated offscreen-stage timings were unreliable on ANGLE Metal.
			await measure('pressure-single', () => { for (let i = 0; i < 4; i++) h.projectVelocity(); });
			const width = h.velocity.width;
			await measure('pressure-paired', () => {
				// Only projectVelocity's threshold reads width; texelSize/FBO dimensions stay real.
				try { h.velocity.width = 1; for (let i = 0; i < 4; i++) h.projectVelocity(); }
				finally { h.velocity.width = width; }
			});
			expect(gl.getError()).toBe(gl.NO_ERROR);
			const report = { tag, renderer, timings, differences };
			console.log('thermal perf', JSON.stringify(report));
			await cmd.writeBenchJson(`${root}/${tag}.json`, JSON.stringify(report, null, 2));
		} finally {
			engine.dispose();
			canvas.remove();
		}
	},
	600_000
);
