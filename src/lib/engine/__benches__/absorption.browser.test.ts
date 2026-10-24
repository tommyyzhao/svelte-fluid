import { describe, expect, it, vi } from 'vitest';
import { FluidEngine, _setContextTier } from '../FluidEngine.js';
import type { DoubleFBO, FBO } from '../internal-types.js';
import type { FluidConfig, FlowVisualization } from '../types.js';
import { createFBO, disposeFBO } from '../gl-utils.js';
import { renderer } from './renderer.js';

const absorption: NonNullable<FlowVisualization['absorption']> = {
	absorbance: [{ r: 6, g: 2, b: 0.2 }, { r: 2, g: 0.05, b: 5 }, { r: 0.2, g: 0.02, b: 0.12 }]
};
interface Harness {
	gl: WebGL2RenderingContext;
	dye: DoubleFBO;
	velocity: DoubleFBO;
	dyeFloat: boolean;
	scalar: DoubleFBO | null;
	scalarAdvected: FBO | null;
	emission: FBO | null;
	advectDye(dt: number): void;
	renderCore(target: FBO | null): void;
}
function make(config: FluidConfig = {}) {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 32;
	const engine = new FluidEngine({ canvas, autoStart: false, config: {
		seed: 704, pointerInput: false, initialSplatCount: 0, simResolution: 32, dyeResolution: 32,
		curl: 0, densityDissipation: 0, velocityDissipation: 0, shading: false, bloom: false, sunrays: false,
		advectionScheme: 'maccormack', backColor: { r: 255, g: 255, b: 255 },
		flow: { visualization: { absorption } }, ...config
	} });
	return { engine, h: engine as unknown as Harness, canvas };
}
function upload(h: Harness, fbo: FBO, value: number[] | ((x: number) => number[]), channels = 4) {
	const data = new Float32Array(fbo.width * fbo.height * channels);
	for (let y = 0; y < fbo.height; y++) for (let x = 0; x < fbo.width; x++)
		data.set(typeof value === 'function' ? value((x + 0.5) / fbo.width) : value, (y * fbo.width + x) * channels);
	h.gl.bindTexture(h.gl.TEXTURE_2D, fbo.texture);
	h.gl.texSubImage2D(h.gl.TEXTURE_2D, 0, 0, 0, fbo.width, fbo.height, channels === 4 ? h.gl.RGBA : h.gl.RG, h.gl.FLOAT, data);
}
function display(h: Harness, target: FBO) {
	h.renderCore(target);
	const values = new Float32Array(target.width * target.height * 4);
	h.gl.bindFramebuffer(h.gl.FRAMEBUFFER, target.fbo);
	h.gl.readPixels(0, 0, target.width, target.height, h.gl.RGBA, h.gl.FLOAT, values);
	expect(h.gl.getError(), renderer).toBe(h.gl.NO_ERROR);
	return values;
}
const srgb = (x: number) => x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;

describe('hardware transmitted concentration dye', () => {
	it('known concentrations transmit Beer–Lambert light once, independent of alpha and tone curve', () => {
		const { engine, h } = make({ shading: true, specular: 1, bloom: true, sunrays: true, toneMapping: 'agx' });
		const target = createFBO(h.gl, 32, 32, h.gl.RGBA32F, h.gl.RGBA, h.gl.FLOAT, h.gl.NEAREST);
		try {
			for (const concentration of [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0.2, 0.4, 0.8]]) {
				upload(h, h.dye.read, [...concentration, 0]);
				const values = display(h, target);
				for (const [channel, key] of (['r', 'g', 'b'] as const).entries()) {
					const tau = absorption.absorbance.reduce((sum, species, s) => sum + concentration[s] * species[key], 0);
					expect(values[16 * 32 * 4 + 16 * 4 + channel]).toBeCloseTo(srgb(Math.exp(-tau)), 2);
				}
				expect(values[3]).toBe(1);
			}
			engine.setConfig({ flow: { visualization: { absorption: { ...absorption, backlight: { r: 0.25, g: 0.5, b: 0.75 } } } } });
			upload(h, h.dye.read, [0, 0, 0, 1]);
			const values = display(h, target);
			for (let c = 0; c < 3; c++) expect(values[c]).toBeCloseTo(srgb([0.25, 0.5, 0.75][c]), 2);
		} finally { disposeFBO(h.gl, target); engine.dispose(); }
	});
	it('uses float bounded concentration transport without scalar/emission allocation', () => {
		const { engine, h } = make();
		try {
			expect(h.dyeFloat).toBe(true);
			expect(h.scalar).toBeNull();
			expect(h.emission).toBeNull();
			expect(h.scalarAdvected).toBeTruthy();
			upload(h, h.velocity.read, [4, 0], 2);
			upload(h, h.dye.read, (x) => [0.5 + 0.4 * Math.sin(2 * Math.PI * x), 0.25, 0.125, 0.4]);
			for (let i = 0; i < 40; i++) h.advectDye(0.01);
			const values = engine.readField('dye').data;
			let low = Infinity, high = -Infinity;
			for (let i = 0; i < values.length; i += 4) { low = Math.min(low, values[i]); high = Math.max(high, values[i]); }
			expect(low).toBeGreaterThanOrEqual(0.099);
			expect(high).toBeLessThanOrEqual(0.901);
			expect(h.gl.getError(), renderer).toBe(h.gl.NO_ERROR);
		} finally { engine.dispose(); }
	});
	it('disabled absorption preserves legacy dye and display exactly', () => {
		const run = (explicit: boolean) => {
			const { engine, h } = make({ flow: explicit ? { visualization: { absorption: undefined } } : null });
			const target = createFBO(h.gl, 32, 32, h.gl.RGBA32F, h.gl.RGBA, h.gl.FLOAT, h.gl.NEAREST);
			try {
				expect(h.dyeFloat).toBe(false);
				expect(h.scalarAdvected).toBeNull();
				engine.splat(0.5, 0.5, 10, 4, { r: 0.5, g: 0.25, b: 0.125 });
				engine.advance(20, 1 / 120);
				return { dye: engine.readField('dye').data, velocity: engine.readField('velocity').data, display: display(h, target) };
			} finally { disposeFBO(h.gl, target); engine.dispose(); }
		};
		expect(run(true)).toEqual(run(false));
	});
	it('hot coefficients allocate nothing, toggles preserve dye, resize/disposal release every owned target', () => {
		const { engine, h } = make();
		const gl = h.gl, live = new Set<WebGLFramebuffer>();
		const create = gl.createFramebuffer.bind(gl), remove = gl.deleteFramebuffer.bind(gl);
		const add = vi.spyOn(gl, 'createFramebuffer').mockImplementation(() => { const f = create(); if (f) live.add(f); return f; });
		const del = vi.spyOn(gl, 'deleteFramebuffer').mockImplementation((f) => { if (f) live.delete(f); remove(f); });
		const texture = vi.spyOn(gl, 'createTexture'), compile = vi.spyOn(gl, 'compileShader');
		try {
			upload(h, h.dye.read, [0.5, 0.25, 0.125, 0.25]);
			for (let i = 0; i < 100; i++) engine.setConfig({ flow: { visualization: { absorption: { ...absorption, backlight: { r: i / 100, g: 1, b: 1 } } } } });
			expect(add).not.toHaveBeenCalled(); expect(texture).not.toHaveBeenCalled(); expect(compile).not.toHaveBeenCalled();
			const before = engine.readField('dye').data;
			engine.setConfig({ flow: null });
			expect(h.dyeFloat).toBe(false); expect(h.scalarAdvected).toBeNull();
			expect(engine.readField('dye').data).toEqual(before);
			engine.setConfig({ flow: { visualization: { absorption } } });
			expect(h.dyeFloat).toBe(true); expect(engine.readField('dye').data).toEqual(before);
			engine.setConfig({ dyeResolution: 48 }); expect(h.scalarAdvected!.width).toBe(48);
			engine.resize(96, 64); expect(h.scalarAdvected!.width).toBe(h.dye.width);
			expect(gl.getError(), renderer).toBe(gl.NO_ERROR);
			engine.dispose(); expect(live.size).toBe(0);
		} finally { add.mockRestore(); del.mockRestore(); texture.mockRestore(); compile.mockRestore(); engine.dispose(); }
	});
	it('rejects invalid hot updates atomically; capability fallback retains half-float concentration transport', () => {
		const { engine, h } = make({ flow: null });
		const extension = h.gl.getExtension.bind(h.gl);
		try {
			engine.splat(0.5, 0.5, 0, 0, { r: .5, g: .25, b: .125 });
			const before = engine.readField('dye').data, old = h.dye;
			expect(() => engine.setConfig({ flow: { visualization: { absorption: { absorbance: [{ r: NaN, g: 0, b: 0 }, absorption.absorbance[1], absorption.absorbance[2]] } } } })).toThrow(RangeError);
			expect(h.dye).toBe(old); expect(engine.readField('dye').data).toEqual(before);
			const spy = vi.spyOn(h.gl, 'getExtension').mockImplementation((name: string) => name === 'EXT_color_buffer_float' ? null : extension(name));
			try {
				engine.setConfig({ flow: { visualization: { absorption } } });
				expect(h.dyeFloat).toBe(false); expect(h.scalarAdvected).toBeTruthy(); expect(h.scalar).toBeNull();
				h.advectDye(.01); expect(h.gl.getError(), renderer).toBe(h.gl.NO_ERROR);
			} finally { spy.mockRestore(); }
		} finally { engine.dispose(); }
	});
	it('context restore recreates concentration resources', async () => {
		const { engine, h, canvas } = make();
		const old = h.scalarAdvected;
		const lose = h.gl.getExtension('WEBGL_lose_context')!;
		try {
			const lost = new Promise<void>((resolve) => canvas.addEventListener('webglcontextlost', () => resolve(), { once: true }));
			lose.loseContext(); await lost; await new Promise((r) => setTimeout(r, 0));
			const restored = new Promise<void>((resolve) => canvas.addEventListener('webglcontextrestored', () => resolve(), { once: true }));
			lose.restoreContext(); await restored;
			expect(h.scalarAdvected).not.toBe(old); expect(h.scalarAdvected!.width).toBe(32); expect(h.dyeFloat).toBe(true);
			expect(h.gl.getError(), renderer).toBe(h.gl.NO_ERROR);
		} finally { engine.dispose(); }
	});
	it('shared-host siblings bind independent absorption uniforms', () => {
		_setContextTier('shared');
		const a = make(), b = make({ flow: { visualization: { absorption: { ...absorption, backlight: { r: 0.25, g: 0.5, b: 1 } } } } });
		const gl = a.h.gl, target = createFBO(gl, 32, 32, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
		try {
			a.engine.splat(0.5, 0.5, 0, 0, { r: 1, g: 0, b: 0 });
			const before = display(a.h, target); display(b.h, target);
			expect(display(a.h, target)).toEqual(before);
		} finally { disposeFBO(gl, target); a.engine.dispose(); b.engine.dispose(); _setContextTier('auto'); }
	});
});
