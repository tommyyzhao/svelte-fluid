import { describe, expect, it } from 'vitest';
import { FluidEngine } from '../FluidEngine.js';
import { compileShader, makeProgram } from '../gl-utils.js';
import { baseVertexShader, displayShaderSource, glassShaderSource } from '../shaders.js';
import type { FluidConfig } from '../types.js';

interface Harness {
	gl: WebGL2RenderingContext;
	renderCore(target: null): void;
	distortionTexture: WebGLTexture;
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
				[glassShaderSource, []]
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
