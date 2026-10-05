import { describe, expect, it } from 'vitest';
import { FluidEngine, _setContextTier } from '../FluidEngine.js';
import type { DoubleFBO } from '../internal-types.js';
import { DYE_HEIGHT_CEILING, DYE_SPLAT_DOSE, advectionShader, splatShader, flowSourceShader } from '../shaders.js';
import { HEIGHT_SPECULAR_DISPLAY_BOUND, SETTLE_EPSILON } from '../settle.js';
import { compileShader, makeProgram } from '../gl-utils.js';
import { baseVertexShader, displayShaderSource, glassShaderSource } from '../shaders.js';
import type { FluidConfig } from '../types.js';

interface Harness {
	gl: WebGL2RenderingContext;
	renderCore(target: null): void;
	distortionTexture: WebGLTexture;
	dye: DoubleFBO;
	issueSettleProbe(): void;
	advanceSettleProbe(): void;
	pollSettleProbe(): boolean | null;
	settleProbe: { sync: WebGLSync | null; ready?: boolean } | null;
	canReadSettleFloat(): boolean;
	withGl<T>(fn: () => T): T;
}

function setup(config: FluidConfig = {}) {
	const canvas = document.createElement('canvas');
	canvas.width = 160;
	canvas.height = 100;
	const engine = new FluidEngine({ canvas, autoStart: false, config: {
		seed: 1234, simResolution: 32, dyeResolution: 128,
		initialSplatCount: 0, pointerInput: false, bloom: false, sunrays: false, splatRadius: 4,
		densityDissipation: 0, transparent: true, ...config
	} });
	return { engine, h: engine as unknown as Harness };
}

function read(h: Harness): Uint8Array {
	h.renderCore(null);
	const gl = h.gl;
	const p = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
	gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, p);
	expect(gl.getError()).toBe(gl.NO_ERROR);
	for (let i = 0; i < p.length; i += 4) {
		for (let c = 0; c < 3; c++) expect(p[i + c]).toBeLessThanOrEqual(p[i + 3]);
	}
	return p;
}

const mae = (a: Uint8Array, b: Uint8Array) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;

function image(h: Harness) {
	const gl = h.gl;
	const pixels = new Uint8Array(64 * 64 * 4);
	for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
		const v = ((x >> 3) + (y >> 3)) % 2 ? 230 : 40;
		pixels.set([v, v, v, 255], (y * 64 + x) * 4);
	}
	gl.bindTexture(gl.TEXTURE_2D, h.distortionTexture);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 64, 64, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
}

const thickness = (engine: FluidEngine) => {
	const data = engine.readField('dye').data;
	return Array.from({ length: data.length / 4 }, (_, i) => data[i * 4 + 3]);
};

async function quiet(h: Harness, bytes = false) {
	if (bytes) h.canReadSettleFloat = () => false;
	h.issueSettleProbe();
	for (let i = 0; i < 12 && h.settleProbe && !h.settleProbe.sync && !h.settleProbe.ready; i++) h.advanceSettleProbe();
	for (let i = 0; i < 50; i++) {
		const result = h.pollSettleProbe();
		if (result !== null) return result;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error('height quiet probe timed out');
}

describe('independent thickness transport', () => {
	it('same splat force/radius gives identical thickness across RGB including black, unchanged by render/sunrays', () => {
		let expected: number[] | undefined;
		for (const color of [{ r: 0, g: 0, b: 0 }, { r: 1, g: 0, b: 0 }, { r: 0, g: 3, b: 0 }, { r: 1, g: 1, b: 1 }]) {
			const { engine, h } = setup({ sunrays: true });
			try {
				expect(thickness(engine).every((v) => v === 0)).toBe(true);
				engine.splat(0.5, 0.5, 120, -80, color);
				const deposited = thickness(engine);
				expect(Math.max(...deposited)).toBeCloseTo(DYE_SPLAT_DOSE, 3);
				read(h);
				expect(thickness(engine)).toEqual(deposited);
				engine.advance(3, 1 / 60);
				const transported = thickness(engine);
				if (expected) expect(transported).toEqual(expected);
				else expected = transported;
				read(h);
				expect(thickness(engine)).toEqual(transported);
				engine.splat(0.3, 0.6, 0, 0, color); // fully overwrites sunrays scratch, never swaps its alpha
				expect(thickness(engine).every((v) => Number.isFinite(v) && v <= DYE_HEIGHT_CEILING)).toBe(true);
			} finally { engine.dispose(); }
		}
	});
	it('adds bounded thickness; force changes transport, not deposition; own/shared initialization is empty', () => {
		for (const tier of ['own', 'shared'] as const) {
			_setContextTier(tier);
			const { engine, h } = setup();
			try {
				expect(thickness(engine).every((v) => v === 0)).toBe(true);
				for (let i = 0; i < 12; i++) engine.splat(0.5, 0.5, i * 10, 0, { r: 0, g: 0, b: 0 });
				expect(Math.max(...thickness(engine))).toBeCloseTo(DYE_HEIGHT_CEILING, 3);
				expect(h.withGl(() => h.gl.getParameter(h.gl.COLOR_CLEAR_VALUE)[3])).toBe(1);
			} finally { engine.dispose(); _setContextTier('auto'); }
		}
	});
	it('flow dose scales with rate * dt, independent of RGB and substeps; invalid rates/radii deposit nothing', () => {
		const source = { kind: 'point' as const, x: 0.5, y: 0.5, rate: 2, radius: 4, dye: { r: 0, g: 0, b: 0 } };
		const a = setup({ flow: { sources: [source] } });
		const b = setup({ flow: { sources: [{ ...source, dye: { r: 10, g: 3, b: 1 } }] } });
		try {
			a.engine.advance(1, 1 / 60);
			b.engine.advance(2, 1 / 120);
			const ah = thickness(a.engine), bh = thickness(b.engine);
			expect(Math.max(...ah)).toBeCloseTo(DYE_SPLAT_DOSE * 2 / 60, 5);
			expect(Math.max(...ah.map((v, i) => Math.abs(v - bh[i])))).toBeLessThan(0.000004);
			for (const invalid of [{ rate: 0 }, { rate: -1 }, { rate: NaN }, { rate: Infinity }, { radius: 0 }, { radius: -1 }, { radius: Infinity }]) {
				const empty = setup({ flow: { sources: [{ ...source, ...invalid }] } });
				try { empty.engine.advance(1, 1 / 60); expect(thickness(empty.engine).every((v) => v === 0)).toBe(true); }
				finally { empty.engine.dispose(); }
			}
		} finally { a.engine.dispose(); b.engine.dispose(); }
	});
	it('recoloring RGB leaves height, normals and image refraction unchanged', () => {
		const { engine, h } = setup({ distortion: true, distortionPower: 0, refraction: 1, shading: false });
		try {
			image(h);
			engine.splat(0.5, 0.5, 0, 0, { r: 0, g: 0, b: 0 });
			const before = read(h), heights = thickness(engine);
			const field = engine.readField('dye');
			for (let i = 0; i < field.data.length; i += 4) field.data.set([10, 0.1, 3], i);
			h.gl.bindTexture(h.gl.TEXTURE_2D, h.dye.read.texture);
			h.gl.texSubImage2D(h.gl.TEXTURE_2D, 0, 0, 0, field.width, field.height, h.gl.RGBA, h.gl.FLOAT, field.data);
			expect(thickness(engine)).toEqual(heights);
			expect(mae(before, read(h))).toBe(0);
		} finally { engine.dispose(); }
	});
	it('sticky retention, physical masks and outlets remove/retain the full RGBA layer', () => {
		for (const config of [
			{ sticky: true, stickyStrength: 1, stickyAmplify: 0, densityDissipation: 0.9, stickyMask: { d: 'M0 0H100V100H0Z', maskResolution: 32 } },
			{ containerShape: { type: 'circle' as const, cx: 0.5, cy: 0.5, radius: 0.2 } },
			{ flow: { outlets: [{ edge: 'left' as const, width: 1, clearDye: 0 }] } }
		]) {
			const { engine } = setup(config);
			try {
				engine.splat(0.5, 0.5, 0, 0, { r: DYE_SPLAT_DOSE, g: 0, b: 0 });
				engine.advance(3, 1 / 60);
				const data = engine.readField('dye').data;
				for (let i = 0; i < data.length; i += 4) expect(data[i + 3]).toBe(data[i]);
				if (config.sticky) expect(Math.max(...thickness(engine))).toBeCloseTo(DYE_SPLAT_DOSE, 3);
				if (config.containerShape) expect(data[3]).toBe(0);
				if (config.flow) expect(Math.max(...thickness(engine))).toBeLessThan(DYE_SPLAT_DOSE / 2);
			} finally { engine.dispose(); }
		}
	});
	it('decays thickness and preserves read alpha through resolution/aspect resize', () => {
		const { engine } = setup({ densityDissipation: 2 });
		try {
			engine.splat(0.5, 0.5, 0, 0, { r: 0, g: 0, b: 0 });
			const peak = Math.max(...thickness(engine));
			engine.advance(1, 1 / 60);
			expect(Math.max(...thickness(engine))).toBeCloseTo(peak / (1 + 2 / 60), 4);
			engine.setConfig({ dyeResolution: 256 });
			expect(Math.max(...thickness(engine))).toBeCloseTo(peak / (1 + 2 / 60), 3);
			engine.resize(120, 140);
			expect(Math.max(...thickness(engine))).toBeCloseTo(peak / (1 + 2 / 60), 3);
		} finally { engine.dispose(); }
	});
	it('keeps thickness within its ceiling for invalid sticky/outlet multipliers', () => {
		for (const config of [
			{ sticky: true, stickyAmplify: -2, stickyMask: { d: 'M0 0H100V100H0Z', maskResolution: 32 } },
			{ flow: { outlets: [{ edge: 'left' as const, width: 1, clearDye: 10 }] } },
			{ flow: { outlets: [{ edge: 'left' as const, width: 1, clearDye: -10 }] } }
		]) {
			const { engine } = setup(config);
			try {
				engine.splat(0.5, 0.5, 0, 0, { r: 0, g: 0, b: 0 });
				expect(thickness(engine).every((v) => v >= 0 && v <= DYE_HEIGHT_CEILING)).toBe(true);
				engine.advance(1, 1 / 60);
				expect(thickness(engine).every((v) => v >= 0 && v <= DYE_HEIGHT_CEILING)).toBe(true);
			} finally { engine.dispose(); }
		}
	});
	it('sunrays gain prevents a sub-byte RGB/height field from settling while visibly amplified', async () => {
		for (const bytes of [false, true]) for (const weight of [100, 1e6]) {
			const { engine, h } = setup({ sunrays: true, sunraysWeight: weight });
			try {
				engine.splat(0.5, 0.5, 20, 0, { r: 0.001, g: 0, b: 0 });
				const pixels = read(h);
				expect(Math.max(...pixels)).toBeGreaterThan(10);
				expect(await quiet(h, bytes)).toBe(false);
			} finally { engine.dispose(); }
		}
	});
	it('non-inert black thickness is nonquiet when specular/refraction exposes it; tiny bounded specular and diffuse-only black settle', async () => {
		for (const bytes of [false, true]) for (const config of [{ specular: 1 }, { refraction: 1, distortion: true, distortionPower: 0 }]) {
			const { engine, h } = setup({ ...config, densityDissipation: 0.1 });
			try { engine.splat(0.5, 0.5, 0, 0, { r: 0, g: 0, b: 0 }); expect(await quiet(h, bytes)).toBe(false); }
			finally { engine.dispose(); }
		}
		for (const bytes of [false, true]) {
			const { engine, h } = setup({ specular: 1, shading: false, flow: { sources: [{ kind: 'point', x: 0.5, y: 0.5, dye: { r: 0, g: 0, b: 0 }, rate: 0.001 }] } });
			try {
				engine.advance(1, 1 / 60);
				expect(Math.max(...thickness(engine)) * HEIGHT_SPECULAR_DISPLAY_BOUND).toBeLessThan(SETTLE_EPSILON);
				expect(Math.max(...read(h))).toBeLessThanOrEqual(1);
				expect(await quiet(h, bytes)).toBe(true);
				engine.setConfig({ glass: true, containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.4 }, glassThickness: 100 });
				expect(await quiet(h, bytes)).toBe(false); // unbounded glass amplification, even refraction=0
			} finally { engine.dispose(); }
			const black = setup();
			try { black.engine.splat(0.5, 0.5, 200, 0, { r: 0, g: 0, b: 0 }); expect(await quiet(black.h, bytes)).toBe(true); }
			finally { black.engine.dispose(); }
		}
	});
});

describe('geometry lighting', () => {
	it('highlight is opt-in, finite, premultiplied; scalar changes and zero crossings allocate no targets', () => {
		const { engine, h } = setup();
		const gl = h.gl;
		try {
			engine.splat(0.5, 0.5, 0, 0, { r: 0.5, g: 0.2, b: 0.1 });
			const before = read(h);
			let creates = 0;
			let deletes = 0;
			let compiles = 0;
			const create = gl.createFramebuffer.bind(gl);
			const del = gl.deleteFramebuffer.bind(gl);
			const compile = gl.compileShader.bind(gl);
			Object.defineProperty(gl, 'createFramebuffer', { configurable: true, value: () => { creates++; return create(); } });
			Object.defineProperty(gl, 'deleteFramebuffer', { configurable: true, value: (f: WebGLFramebuffer | null) => { deletes++; del(f); } });
			Object.defineProperty(gl, 'compileShader', { configurable: true, value: (s: WebGLShader) => { compiles++; compile(s); } });
			engine.setConfig({ specular: 1 });
			const after = read(h);
			expect(mae(before, after)).toBeGreaterThan(0.05);
			const compiled = compiles;
			engine.setConfig({ specular: 0.5 });
			read(h);
			expect(compiles).toBe(compiled);
			engine.setConfig({ specular: undefined, refraction: undefined });
			engine.setConfig({ specular: 0 });
			expect(mae(before, read(h))).toBe(0);
			expect(creates).toBe(0);
			expect(deletes).toBe(0);
		} finally { engine.dispose(); }
	});
	it('refracts the existing distortion image, also without diffuse enabled', () => {
		const { engine, h } = setup({ distortion: true, distortionPower: 0, shading: false });
		try {
			image(h);
			engine.splat(0.5, 0.5, 0, 0, { r: 2, g: 1, b: 0.3 });
			const before = read(h);
			engine.setConfig({ refraction: 1 });
			expect(mae(before, read(h))).toBeGreaterThan(0.05);
			engine.setConfig({ specular: 1 });
			read(h);
			engine.setConfig({ refraction: 0, specular: 0 });
			expect(mae(before, read(h))).toBe(0);
		} finally { engine.dispose(); }
	});
	it('refracts the existing glass scene; empty surfaces create no phantom highlights', () => {
		const { engine, h } = setup({ glass: true, containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 } });
		try {
			engine.setConfig({ refraction: 1, specular: 1 });
			read(h);
			engine.splat(0.5, 0.5, 0, 0, { r: 2, g: 0.5, b: 0.2 });
			engine.setConfig({ refraction: 0, specular: 0 });
			const before = read(h);
			engine.setConfig({ refraction: 1 });
			expect(mae(before, read(h))).toBeGreaterThan(0.01);
		} finally { engine.dispose(); }
		const empty = setup({ specular: 1 });
		try { expect(Math.max(...read(empty.h))).toBe(0); } finally { empty.engine.dispose(); }
	});
	it('compiles WebGL1 display variants and glass shader', () => {
		const gl = document.createElement('canvas').getContext('webgl');
		if (!gl) throw new Error('WebGL1 unavailable');
		const vertex = compileShader(gl, gl.VERTEX_SHADER, baseVertexShader);
		try {
			for (const [source, keywords] of [
				[displayShaderSource, ['SHADING']],
				[displayShaderSource, ['SHADING', 'SPECULAR', 'REFRACTION', 'DISTORTION']],
				[glassShaderSource, []],
				[splatShader, []],
				[flowSourceShader, []],
				[advectionShader, ['MANUAL_FILTERING']]
			] as [string, string[]][]) {
				const frag = compileShader(gl, gl.FRAGMENT_SHADER, source, keywords);
				const program = makeProgram(gl, vertex, frag);
				gl.deleteProgram(program.program);
				gl.deleteShader(frag);
			}
			expect(gl.getError()).toBe(gl.NO_ERROR);
		} finally { gl.deleteShader(vertex); }
	});
});
