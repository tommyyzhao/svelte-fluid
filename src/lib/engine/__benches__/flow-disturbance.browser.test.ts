import { afterEach, describe, expect, it, vi } from 'vitest';
import { commands } from 'vitest/browser';
import { renderer } from './renderer.js';
import { FluidEngine, _setContextTier } from '../FluidEngine.js';
import { VENTURI_CONFIG } from '../../presets/registry.js';
import { flowDisturbanceShader } from '../shaders.js';
import type { FlowForce, FluidConfig } from '../types.js';

type Disturbance = Extract<FlowForce, { kind: 'disturbance' }>;
const FORCE: Disturbance = { kind: 'disturbance', acceleration: 6, correlationTime: 0.2, scale: 0.08, region: { x: 0.04, y: 0.15, width: 0.16, height: 0.7 } };
const CHANNEL: FluidConfig = {
	...VENTURI_CONFIG, seed: 704, pointerInput: false, initialSplatCount: 0,
	simResolution: 160, dyeResolution: 160, obstructions: undefined,
	flow: { boundary: { left: 'open', right: 'open', top: 'wall', bottom: 'wall' }, forces: [{ kind: 'pressureGradient', vector: { x: 42, y: 0 } }] }
};
const engines: Array<FluidEngine> = [];
afterEach(() => {
	vi.restoreAllMocks();
	for (const engine of engines.splice(0)) engine.dispose();
	_setContextTier('auto');
});
function create(force?: Disturbance, shared = false) {
	const canvas = document.createElement('canvas');
	canvas.width = 320;
	canvas.height = 160;
	const config = { ...CHANNEL, flow: { ...CHANNEL.flow, forces: [...CHANNEL.flow!.forces!, ...(force ? [force] : [])] } };
	_setContextTier(shared);
	try {
		const engine = new FluidEngine({ canvas, autoStart: false, config });
		engines.push(engine);
		return engine;
	} finally { _setContextTier('auto'); }
}
async function hash(data: Float32Array) {
	return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function bytes(data: Float32Array) { return new Uint8Array(data.buffer); }
function snapshot(engine: FluidEngine) {
	return { velocity: engine.readField('velocity').data, dye: engine.readField('dye').data };
}
const sequence = [1 / 120, 1 / 80, 1 / 100, 1 / 60];
function advance(engine: FluidEngine, n = 48) {
	for (let i = 0; i < n; i++) engine.advance(1, sequence[i % sequence.length]);
}

describe('opt-in disturbance hardware gates', () => {
	// Pins are ANGLE Metal captures (identical on M1/M2); other backends round differently.
	it.runIf(/ANGLE Metal/.test(renderer))('keeps velocity/dye byte-identical to the frozen pre-change engine', async () => {
		// Captured from a pre-edit engine/shader snapshot, directly compared to
		// current bytes on ANGLE Metal; snapshot deleted after the passing capture.
		const engine = create();
		engine.splat(0.1, 0.5, 0, 0, { r: 0.3, g: 0.6, b: 0.9 });
		advance(engine);
		const after = snapshot(engine);
		expect(await hash(after.velocity)).toBe('49222d95d7ed32e9e075a590b89fd31a595ff3bde98b51d41d9f007e86c5e256');
		expect(await hash(after.dye)).toBe('8e1fe3cc552007ee3e2554246ae47a73c91ff55696c5762fd121159ad85bd155');
	});

	it('repeats identical seed/dt bytes; a different seed changes velocity', () => {
		const a = create(FORCE), b = create(FORCE), c = create({ ...FORCE, seed: 13 });
		for (const engine of [a, b, c]) {
			engine.splat(0.1, 0.5, 0, 0, { r: 0.3, g: 0.6, b: 0.9 });
			advance(engine);
		}
		const first = snapshot(a), repeat = snapshot(b);
		expect(bytes(first.velocity)).toEqual(bytes(repeat.velocity));
		expect(bytes(first.dye)).toEqual(bytes(repeat.dye));
		expect(bytes(first.velocity)).not.toEqual(bytes(c.readField('velocity').data));
	});

	it('zero acceleration is byte-identical to omission', () => {
		const absent = create(), zero = create({ ...FORCE, acceleration: 0 });
		for (const engine of [absent, zero]) {
			engine.splat(0.1, 0.5, 0, 0, { r: 0.3, g: 0.6, b: 0.9 });
			advance(engine);
		}
		const a = snapshot(absent), z = snapshot(zero);
		expect(bytes(z.velocity)).toEqual(bytes(a.velocity));
		expect(bytes(z.dye)).toEqual(bytes(a.dye));
	});

	it('CHANNEL_OPEN inlet response scales roughly linearly with acceleration', { timeout: 180_000 }, async () => {
		// amended after first run: 4 s spin-up left baseline drift
		// First ratio NaN (both baseline-subtracted RMS zero), variance 179.49582.
		// Post-hoc setup only: 40s spin-up; force/probe/8s record/[1.6,2.4] unchanged.
		// 3x3 centreline probe at x=.22, just downstream of support ending at .20.
		const list = [create(), create(FORCE), create({ ...FORCE, acceleration: FORCE.acceleration * 2 })];
		const records: Array<Array<[number, number]>> = [[], [], []];
		for (const engine of list) engine.advance(4800, 1 / 120);
		for (let s = 0; s < 160; s++) for (let k = 0; k < list.length; k++) {
			list[k].advance(6, 1 / 120);
			const { data, width, height } = list[k].readField('velocity');
			const x = Math.round(0.22 * width - 0.5), y = Math.floor(height / 2);
			let u = 0, v = 0;
			for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
				const i = ((y + dy) * width + x + dx) * 2;
				u += data[i] / 9; v += data[i + 1] / 9;
			}
			records[k].push([u, v]);
		}
		const mean = (r: Array<[number, number]>, c: number) => r.reduce((s, v) => s + v[c], 0) / r.length;
		const variance = (r: Array<[number, number]>) => {
			const u = mean(r, 0), v = mean(r, 1);
			return r.reduce((s, p) => s + (p[0] - u) ** 2 + (p[1] - v) ** 2, 0) / r.length;
		};
		const baseline = variance(records[0]);
		const rms = records.slice(1).map((r) => Math.sqrt(Math.max(0, variance(r) - baseline)));
		const U = mean(records[0], 0), epsilon = rms.map((v) => v / U), ratio = rms[1] / rms[0];
		const result = { renderer, acceleration: FORCE.acceleration, U, baselineVariance: baseline, rms, epsilon, ratio };
		await (commands as unknown as { writeBenchJson(p: string, d: string): Promise<void> }).writeBenchJson('/tmp/public-disturbance-calibration.json', JSON.stringify(result));
		console.log('DISTURBANCE_CALIBRATION', JSON.stringify(result));
		expect(rms[0]).toBeGreaterThan(0);
		expect(ratio).toBeGreaterThanOrEqual(1.6);
		expect(ratio).toBeLessThanOrEqual(2.4);
	});

	it('first presence links transactionally; value updates allocate/link nothing', () => {
		const engine = create() as FluidEngine;
		const h = engine as unknown as { gl: WebGL2RenderingContext; config: { FLOW: unknown } };
		const gl = h.gl;
		const compile = vi.spyOn(gl, 'shaderSource');
		const links = vi.spyOn(gl, 'linkProgram');
		const allocations = ['createTexture', 'createFramebuffer', 'createRenderbuffer', 'createBuffer', 'createProgram', 'createShader', 'compileShader', 'texImage2D', 'bufferData'].map((name) => vi.spyOn(gl, name as 'createTexture'));
		const set = (force: Disturbance) => engine.setConfig({ flow: { ...CHANNEL.flow, forces: [...CHANNEL.flow!.forces!, force] } });
		const prior = h.config.FLOW;
		const original = gl.getProgramParameter.bind(gl);
		const failure = vi.spyOn(gl, 'getProgramParameter').mockImplementation((p, name) => name === gl.LINK_STATUS ? false : original(p, name));
		expect(() => set(FORCE)).toThrow(/program link failed/);
		expect(h.config.FLOW).toBe(prior);
		failure.mockRestore();
		set(FORCE);
		expect(compile.mock.calls.some(([, source]) => source === flowDisturbanceShader)).toBe(true);
		links.mockClear();
		for (const spy of allocations) spy.mockClear();
		for (const force of [{ ...FORCE, acceleration: 8 }, { ...FORCE, region: { x: 0.1, y: 0.2, width: 0.2, height: 0.6 } }, { ...FORCE, seed: 65535 }, { ...FORCE, scale: 0.12, correlationTime: 0.4 }]) {
			set(force);
			engine.advance(1, 1 / 120);
		}
		expect(links).not.toHaveBeenCalled();
		for (const spy of allocations) expect(spy).not.toHaveBeenCalled();
		expect(gl.getError()).toBe(gl.NO_ERROR);
	});

	it('interleaved shared disturbance siblings leave the plain engine byte-identical', () => {
		const ref = create(), plain = create(undefined, true), noisy = create(FORCE, true), noisySibling = create({ ...FORCE, seed: 99, scale: 0.14 }, true);
		expect(plain.sharedContext).toBe(true);
		expect(noisy.sharedContext).toBe(true);
		for (const engine of [ref, plain]) engine.splat(0.1, 0.5, 0, 0, { r: 0.3, g: 0.6, b: 0.9 });
		advance(ref);
		for (let i = 0; i < 48; i++) {
			noisy.advance(1, sequence[i % 4]);
			noisySibling.advance(1, sequence[i % 4]);
			plain.advance(1, sequence[i % 4]);
		}
		const a = snapshot(ref), b = snapshot(plain);
		expect(bytes(b.velocity)).toEqual(bytes(a.velocity));
		expect(bytes(b.dye)).toEqual(bytes(a.dye));
	});
});
