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

// Threefold headroom tolerates 20 fps versus the engine's 60 Hz clamped clock;
// cap software waits/tests at three minutes, without changing hardware deadlines.
export const glDeadline = (ms: number) => softwareGL ? Math.min(ms * 3, 180_000) : ms;

/** Fixed-step models slow with rAF on software GL; hardware keeps its original deadline. */
export async function waitForSurfaceSettle(subscribers: () => number, hardwareTimeout: number, maxFrames = 150, interval = 50): Promise<void> {
	let timeout = hardwareTimeout;
	if (softwareGL) {
		const start = performance.now();
		for (let i = 0; i < 6; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		const frameMs = (performance.now() - start) / 6;
		// Default: 3.6px presses decay below .03px in <150 fixed steps.
		// Pigment supplies its longer drying clock; allow twofold headroom.
		timeout = Math.min(45_000, Math.max(timeout, frameMs * maxFrames * 2));
	}
	await vi.waitFor(() => expect(subscribers()).toBe(0), { timeout, interval });
}
