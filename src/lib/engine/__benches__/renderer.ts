import { expect, vi } from 'vitest';

// Reuse the hardware smoke gate's renderer check, never infer hardware from CI/OS.
const canvas = document.createElement('canvas');
const gl = canvas.getContext('webgl2');
if (!gl) throw new Error('WebGL2 unavailable for browser renderer probe');
const debug = gl.getExtension('WEBGL_debug_renderer_info');
export const renderer = String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
export const softwareGL = /swiftshader|llvmpipe|software/i.test(renderer);
// This disposable probe owns its context; do not retain a slot for tier tests.
gl.getExtension('WEBGL_lose_context')?.loseContext();
if (import.meta.env.SVELTE_FLUID_HARDWARE_GATE) {
	expect(softwareGL, `hardware gate renderer: ${renderer}`).toBe(false);
}

/** Surface physics advances at most 3 fixed steps per rAF, not wall-clock time. */
export async function waitForSurfaceSettle(subscribers: () => number, hardwareTimeout: number): Promise<void> {
	let timeout = hardwareTimeout;
	if (softwareGL) {
		const start = performance.now();
		for (let i = 0; i < 6; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		const frameMs = (performance.now() - start) / 6;
		// 3.6px presses decay below .03px in <150 fixed steps; allow twofold headroom.
		timeout = Math.min(45_000, Math.max(timeout, frameMs * 150 * 2));
	}
	await vi.waitFor(() => expect(subscribers()).toBe(0), { timeout });
}
