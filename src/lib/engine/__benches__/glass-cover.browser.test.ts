import { expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { FluidEngine, _setContextTier } from '../FluidEngine.js';
import type { FBO } from '../internal-types.js';
import type { FluidConfig } from '../types.js';
import { LAVA_LAMP_CONFIG } from '../../presets/registry.js';
import { getTuning } from '../../../routes/test/tesla-valve/tunings.js';

interface Harness {
	gl: WebGL2RenderingContext;
	containerSdf: FBO | null;
	renderCore(target: FBO | null): void;
	withGl<T>(fn: () => T): T;
}
const cmd = commands as unknown as {
	writeBenchBase64(path: string, data: string): Promise<void>;
	readBenchBase64(path: string): Promise<string>;
};
const encode = (bytes: Uint8Array) => {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
	return btoa(binary);
};
function setup(config: FluidConfig) {
	const canvas = document.createElement('canvas');
	canvas.width = 300; canvas.height = 100;
	const engine = new FluidEngine({ canvas, autoStart: false, config: { ...config, seed: 704, pointerInput: false, simResolution: 32, dyeResolution: 64 } });
	return { engine, h: engine as unknown as Harness };
}
function read(h: Harness) {
	return h.withGl(() => {
		h.renderCore(null);
		const gl = h.gl;
		const bytes = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
		gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
		expect(gl.getError()).toBe(gl.NO_ERROR);
		return bytes;
	});
}

it('preserves analytic glass and SVG no-SDF fallback display bytes', async () => {
	for (const [name, config] of [
		['lava', LAVA_LAMP_CONFIG],
		['fallback', { ...getTuning('flame-jet').config, glass: true, glassThickness: 0.04, glassRefraction: 0.4, glassReflectivity: 0.12, glassChromatic: 0.15 }]
	] as const) {
		const { engine, h } = setup(config);
		const sdf = h.containerSdf;
		try {
			if (name === 'fallback') h.containerSdf = null;
			engine.advance(20, 1 / 240);
			const bytes = read(h), path = `.svelte-kit/flame-perf/glass-legacy-${name}.bin`;
			if (import.meta.env.SVELTE_FLUID_SHOTS_EXTRA === 'glass-baseline') await cmd.writeBenchBase64(path, encode(bytes));
			if (import.meta.env.SVELTE_FLUID_SHOTS_EXTRA === 'glass-verify') expect(encode(bytes)).toBe(await cmd.readBenchBase64(path));
		} finally { h.containerSdf = sdf; engine.dispose(); }
	}
});

it('SVG cover preserves physics, cuts out walls, survives own/shared toggles and resize', async () => {
	if (import.meta.env.SVELTE_FLUID_SHOTS_EXTRA === 'glass-baseline') return;
	for (const tier of ['own', 'shared'] as const) {
		_setContextTier(tier);
		const config: FluidConfig = { ...getTuning('flame-jet').config, transparent: true, initialSplatCount: 0, flow: { scalarFields: [{ name: 'temperature' }] }, glass: true };
		const { engine, h } = setup(config);
		try {
			expect(h.containerSdf).not.toBeNull();
			const empty = read(h);
			let sheen = 0, outside = 0;
			for (let i = 0; i < empty.length; i += 4) {
				if (empty[i + 3] === 0) { outside++; expect(empty[i] + empty[i + 1] + empty[i + 2]).toBe(0); }
				else sheen += empty[i] + empty[i + 1] + empty[i + 2];
			}
			expect(outside).toBeGreaterThan(1000);
			expect(sheen).toBeGreaterThan(1000);
			expect(Math.max(...empty.filter((_, i) => i % 4 < 3))).toBeGreaterThan(20);
			engine.splat(0.05, 0.49, 80, 0, { r: 2, g: 0.5, b: 0.1 });
			const other = setup({ ...config, glass: false });
			try {
				other.engine.splat(0.05, 0.49, 80, 0, { r: 2, g: 0.5, b: 0.1 });
				for (let frame = 0; frame < 3; frame++) {
					engine.advance(1, 1 / 240); read(h);
					other.engine.advance(1, 1 / 240); read(other.h);
				}
				for (const field of ['dye', 'scalar', 'velocity'] as const) expect(engine.readField(field).data).toEqual(other.engine.readField(field).data);
			} finally { other.engine.dispose(); }
			engine.advance(3, 1 / 240);
			const fields = (['dye', 'scalar', 'velocity'] as const).map((field) => engine.readField(field).data.slice());
			read(h);
			engine.setConfig({ glass: false }); read(h);
			engine.setConfig({ glass: true }); read(h);
			for (const [i, field] of (['dye', 'scalar', 'velocity'] as const).entries()) expect(engine.readField(field).data).toEqual(fields[i]);
			engine.resize(360, 120); read(h);
			engine.setConfig({ containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.4 } }); read(h);
			engine.setConfig({ containerShape: config.containerShape }); read(h);
			if (tier === 'own') {
				const wait = (name: string) => new Promise<void>((resolve, reject) => {
					const timer = setTimeout(() => reject(new Error(`Timed out: ${name}`)), 10000);
					h.gl.canvas.addEventListener(name, () => { clearTimeout(timer); resolve(); }, { once: true });
				});
				const extension = h.gl.getExtension('WEBGL_lose_context')!;
				const lost = wait('webglcontextlost'); extension.loseContext(); await lost;
				await new Promise((resolve) => setTimeout(resolve, 0));
				const restored = wait('webglcontextrestored'); extension.restoreContext(); await restored;
				expect(h.containerSdf).not.toBeNull(); read(h);
			}
		} finally { engine.dispose(); _setContextTier('auto'); }
	}
});
