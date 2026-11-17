import { afterEach, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { FluidEngine } from '../FluidEngine.js';
import type { DistortionField } from '../FluidEngine.js';

/** One screenshot per mode after ~3 s of the route's auto-stir. Opt in with SVELTE_FLUID_SHOTS_DIR. */
const dir = import.meta.env.SVELTE_FLUID_SHOTS_DIR;
const cmd = commands as unknown as {
	captureCanvasScreenshot(rect: { x: number; y: number; width: number; height: number; nativeSize?: boolean }): Promise<string>;
	writeBenchBase64(path: string, data: string): Promise<void>;
};
const live: FluidEngine[] = [];
afterEach(() => { for (const e of live.splice(0)) e.dispose(); });

const MODES: [DistortionField, number][] = [['velocity', 1], ['acceleration', 60], ['pressure-gradient', 60]];

it.skipIf(!dir).each(MODES)('%s screenshot after 3 s auto-stir', async (mode, softness) => {
	const blob = await (await fetch('/bosch-garden.jpg')).blob();
	const url = URL.createObjectURL(blob);
	const canvas = document.createElement('canvas');
	canvas.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:720px';
	canvas.width = 1280;
	canvas.height = 720;
	document.body.append(canvas);
	const e = new FluidEngine({ canvas, config: {
		seed: 3, distortion: true, distortionImageUrl: url, distortionPower: 0.06, pointerInput: false,
		initialSplatCount: 0, autoSplatRate: 0, densityDissipation: 0.98, velocityDissipation: 0.4,
		splatRadius: 0.6, curl: 0, pressure: 0, bloom: false, sunrays: false, shading: false
	} });
	live.push(e);
	e.previewDistortionField(mode, softness);
	// Same Lissajous as the route, driven by real frames.
	let t = 0, prev = 0, lx = 0.5, ly = 0.5, raf = 0;
	const tick = (now: number) => {
		raf = requestAnimationFrame(tick);
		t += prev ? (now - prev) * 0.001 : 0;
		prev = now;
		const x = 0.5 + 0.3 * Math.sin(2 * t - Math.PI);
		const y = 0.5 + 0.2 * Math.sin(5 * t) * Math.cos(2 * t);
		e.splat(x, y, 800 * (x - lx), 800 * (y - ly), { r: 0.024, g: 0, b: 0 });
		lx = x; ly = y;
	};
	raf = requestAnimationFrame(tick);
	await new Promise((r) => setTimeout(r, 3000));
	cancelAnimationFrame(raf);
	e.pause();
	const png = await cmd.captureCanvasScreenshot({ x: 0, y: 0, width: 1280, height: 720, nativeSize: true });
	expect(png.length).toBeGreaterThan(10_000);
	await cmd.writeBenchBase64(`${dir}/accel-distortion-${mode}.png`, png);
	URL.revokeObjectURL(url);
}, 30_000);
