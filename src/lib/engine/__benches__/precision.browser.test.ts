import { commands } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { FluidEngine, _setContextTier } from '../FluidEngine.js';
import { compileShader, makeProgram, Material } from '../gl-utils.js';
import { baseVertexShader } from '../shaders.js';
import { PRESETS } from '../../presets/registry.js';
import type { FluidConfig } from '../types.js';
import type { DoubleFBO, FBO, ResolvedConfig } from '../internal-types.js';
import type { ProgramWrap } from '../gl-utils.js';
import { precisionSources, withBaseline, type PrecisionPass } from './precision-probe.js';

interface Harness {
	gl: WebGL2RenderingContext;
	canvas: HTMLCanvasElement;
	velocity: DoubleFBO;
	dye: DoubleFBO;
	pressure: DoubleFBO;
	divergence: FBO;
	curlFBO: FBO;
	config: ResolvedConfig;
	displayMaterial: Material;
	sunraysMaskProgram: ProgramWrap;
	sunraysProgram: ProgramWrap;
	displayKeywords(config: ResolvedConfig): string[];
	renderCore(target: FBO | null): void;
}
const rows: Record<string, unknown>[] = [];
const out = import.meta.env.SVELTE_FLUID_GPU_BENCH_OUT || '/tmp/e1-precision-parity.json';
async function flush() {
	const write = (commands as unknown as Record<string, (p: string, c: string) => Promise<void>>).writeBenchJson;
	await write(out, JSON.stringify({ steps: 120, css: [1440, 900], dpr: 2, seed: 5, rows }, null, 2));
}
function build(preset: string) {
	const canvas = document.createElement('canvas');
	canvas.width = 2880; canvas.height = 1800;
	canvas.style.cssText = 'width:1440px;height:900px';
	document.body.append(canvas);
	_setContextTier('own');
	try { return new FluidEngine({ canvas, autoStart: false, config: { ...PRESETS.find(p => p.id === preset)!.config as FluidConfig, seed: 5, pointerInput: false } }); }
	finally { _setContextTier('auto'); }
}
function canvasPixels(h: Harness) {
	h.renderCore(null);
	const gl = h.gl, pixels = new Uint8Array(2880 * 1800 * 4);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.readPixels(0, 0, 2880, 1800, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
	expect(gl.getError()).toBe(gl.NO_ERROR);
	expect(pixels.some(value => value !== 0)).toBe(true);
	return pixels;
}
function delta(a: Uint8Array, b: Uint8Array) {
	let max = 0, changedPixels = 0;
	for (let i = 0; i < a.length; i += 4) {
		let changed = false;
		for (let c = 0; c < 4; c++) { const d = Math.abs(a[i + c] - b[i + c]); max = Math.max(max, d); changed ||= d !== 0; }
		if (changed) changedPixels++;
	}
	return { maxLsb: max, changedPixels, fraction: changedPixels / (a.length / 4) };
}
function field(h: Harness, fbo: FBO) {
	const gl = h.gl, values = new Float32Array(fbo.width * fbo.height * 4);
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fbo);
	gl.readPixels(0, 0, fbo.width, fbo.height, gl.RGBA, gl.FLOAT, values);
	expect(gl.getError()).toBe(gl.NO_ERROR);
	return new Uint8Array(values.buffer);
}
function fields(h: Harness) {
	return [h.velocity.read, h.dye.read, h.pressure.read, h.divergence, h.curlFBO].map(fbo => field(h, fbo));
}
function changedBytes(a: Uint8Array, b: Uint8Array) {
	expect(a.length).toBe(b.length);
	let count = 0;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) count++;
	return count;
}
function isolated(h: Harness, pass: PrecisionPass) {
	const gl = h.gl, vs = compileShader(gl, gl.VERTEX_SHADER, baseVertexShader);
	let material: Material | null = null, fs: WebGLShader | null = null, program: ProgramWrap | null = null;
	const key = pass === 'display' ? 'displayMaterial' : pass === 'mask' ? 'sunraysMaskProgram' : 'sunraysProgram';
	const original = h[key];
	try {
		if (pass === 'display') {
			material = new Material(gl, vs, precisionSources.display);
			material.setKeywords(h.displayKeywords(h.config)); h.displayMaterial = material;
		} else {
			fs = compileShader(gl, gl.FRAGMENT_SHADER, precisionSources[pass]);
			program = makeProgram(gl, vs, fs);
			if (pass === 'mask') h.sunraysMaskProgram = program; else h.sunraysProgram = program;
		}
		return canvasPixels(h);
	} finally {
		Object.assign(h, { [key]: original }); material?.dispose();
		if (program) gl.deleteProgram(program.program);
		if (fs) gl.deleteShader(fs);
		gl.deleteShader(vs);
	}
}

describe('E1 TRAIN precision parity', () => {
	for (const preset of ['Plasma', 'LavaLamp', 'InkInWater', 'Aurora']) it(preset, async () => {
		const baseline = withBaseline(() => build(preset)), candidate = build(preset);
		const a = baseline as unknown as Harness, b = candidate as unknown as Harness;
		try {
			const dbg = b.gl.getExtension('WEBGL_debug_renderer_info');
			const renderer = dbg ? String(b.gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown';
			expect(renderer).toContain('ANGLE Metal Renderer: Apple M1 Max');
			// Let the shared 64² dithering image finish before either replay.
			await new Promise(resolve => setTimeout(resolve, 500));
			baseline.advance(120, 1 / 60); candidate.advance(120, 1 / 60);
			const af = fields(a), bf = fields(b);
			const fieldChangedBytes = af.map((f, i) => changedBytes(f, bf[i]));
			const ap = canvasPixels(a), bp = canvasPixels(b), result = delta(ap, bp);
			const diagnostic = Object.fromEntries((['display', 'mask', 'radial'] as const).map(pass => [pass, delta(ap, isolated(a, pass))]));
			const after = fields(b);
			const renderFieldChangedBytes = bf.map((f, i) => changedBytes(f, after[i]));
			rows.push({ preset, renderer, ...result, fieldChangedBytes, renderFieldChangedBytes, diagnostic });
			await flush();
			expect(fieldChangedBytes).toEqual([0, 0, 0, 0, 0]);
			expect(renderFieldChangedBytes).toEqual([0, 0, 0, 0, 0]);
			expect(result.maxLsb).toBeLessThanOrEqual(1);
			expect(result.fraction).toBeLessThanOrEqual(0.001);
		} finally { baseline.dispose(); candidate.dispose(); document.body.replaceChildren(); }
	});
});
