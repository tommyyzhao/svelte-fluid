import { describe, expect, it } from 'vitest';
import { FluidEngine, _setContextTier } from '../FluidEngine.js';
import type { FBO } from '../internal-types.js';

function setup(tier: 'own' | 'shared' = 'own') {
	_setContextTier(tier);
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 128;
	const engine = new FluidEngine({
		canvas,
		autoStart: false,
		config: {
			initialSplatCount: 0,
			pointerInput: false,
			simResolution: 64,
			dyeResolution: 64,
			bloom: false,
			sunrays: false,
			shading: false,
			curl: 0,
			flow: {
				mode: 'prescribed',
				prescribed: {
					kind: 'grid',
					velocity: { width: 1, height: 1, data: [32, -16], scale: 32 },
				},
			},
		},
	});
	const inner = engine as unknown as {
		gl: WebGL2RenderingContext;
		velocity: { read: FBO };
		velocitySnapshotSlots: { buffer: WebGLBuffer; sync: WebGLSync | null }[];
		velocitySnapshotTarget: FBO | null;
		withGl<T>(fn: () => T): T;
	};
	return { engine, inner };
}
async function ready(engine: FluidEngine) {
	for (let i = 0; i < 200; i++) {
		await new Promise((r) => setTimeout(r, 5));
		const result = engine.pollVelocitySnapshot();
		if (result) return result;
	}
	throw new Error('Velocity snapshot did not complete');
}

describe('async signed velocity snapshots', () => {
	for (const tier of ['own', 'shared'] as const) {
		it(`${tier}: normalized flow, FIFO ring, epoch, ownership`, async () => {
			const { engine, inner } = setup(tier);
			const gl = inner.gl;
			try {
				engine.advance(1, 1 / 60);
				const t0 = performance.now();
				for (const tick of [10, 11, 12])
					expect(engine.queueVelocitySnapshot(tick, 32, 20)).toBe(true);
				expect(engine.queueVelocitySnapshot(13, 32, 20)).toBe(false);
				expect(engine.queueVelocitySnapshot(13, 16, 10)).toBe(false);
				const issueMs = (performance.now() - t0) / 3;
				const snapshots = [
					await ready(engine),
					await ready(engine),
					await ready(engine),
				];
				expect(snapshots.map((s) => s.tick)).toEqual([10, 11, 12]);
				const s = snapshots[0];
				expect(s.width).toBe(32);
				expect(s.height).toBe(20);
				// Prescribed field stores sim texels/s. 128×64 sim => (+.25, -.25) domain/s.
				for (let i = 0; i < s.data.length; i += 2) {
					expect(s.data[i]).toBeCloseTo(0.25, 2);
					expect(s.data[i + 1]).toBeCloseTo(-0.25, 2);
				}
				// Different signed rows prove bottom-up order; fractional boxes average exactly.
				inner.withGl(() => {
					const f = inner.velocity.read;
					gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
					gl.clearColor(16, 8, 0, 0);
					gl.clear(gl.COLOR_BUFFER_BIT);
					gl.enable(gl.SCISSOR_TEST);
					gl.scissor(0, f.height / 2, f.width, f.height / 2);
					gl.clearColor(-16, -8, 0, 0);
					gl.clear(gl.COLOR_BUFFER_BIT);
					gl.disable(gl.SCISSOR_TEST);
				});
				expect(engine.queueVelocitySnapshot(20, 7, 3)).toBe(true);
				const rows = await ready(engine);
				expect(rows.data[0]).toBeCloseTo(0.125, 5);
				expect(rows.data[1]).toBeCloseTo(0.125, 5);
				expect(rows.data[14]).toBeCloseTo(0, 5);
				expect(rows.data[28]).toBeCloseTo(-0.125, 5);
				expect(rows.data[29]).toBeCloseTo(-0.125, 5);
				engine.queueVelocitySnapshot(21, 7, 3);
				engine.resize(300, 150);
				expect(engine.pollVelocitySnapshot()).toBeNull();
				expect(engine.queueVelocitySnapshot(22, 7, 3)).toBe(true);
				const resized = await ready(engine);
				expect(resized.tick).toBe(22);
				expect(resized.epoch).toBeGreaterThan(rows.epoch);
				engine.setConfig({ simResolution: 32 });
				expect(engine.queueVelocitySnapshot(23, 7, 3)).toBe(true);
				expect((await ready(engine)).epoch).toBeGreaterThan(resized.epoch);
				engine.queueVelocitySnapshot(24, 7, 3);
				const slots = inner.velocitySnapshotSlots.map((v) => ({ ...v }));
				const target = inner.velocitySnapshotTarget!;
				expect(gl.getError()).toBe(gl.NO_ERROR);
				engine.dispose();
				for (const slot of slots) {
					expect(gl.isBuffer(slot.buffer)).toBe(false);
					if (slot.sync) expect(gl.isSync(slot.sync)).toBe(false);
				}
				expect(gl.isTexture(target.texture)).toBe(false);
				expect(gl.isFramebuffer(target.fbo)).toBe(false);
				expect(engine.queueVelocitySnapshot(25, 7, 3)).toBe(false);
				expect(engine.pollVelocitySnapshot()).toBeNull();
				console.info(
					'Velocity snapshot CPU issue ms (includes first-use shader compile):',
					tier,
					issueMs
				);
			} finally {
				engine.dispose();
				_setContextTier('auto');
			}
		});
	}

	it('rejects invalid sizes and ticks; unsupported float capability refuses enqueue', () => {
		const { engine } = setup();
		try {
			for (const [tick, w, h] of [
				[-1, 1, 1],
				[0, 97, 1],
				[0, 1, 61],
				[0, 0, 1],
				[0, 1.5, 2],
			])
				expect(() => engine.queueVelocitySnapshot(tick, w, h)).toThrow(
					RangeError
				);
			(
				engine as unknown as { canReadSettleFloat(): boolean }
			).canReadSettleFloat = () => false;
			expect(engine.queueVelocitySnapshot(0, 8, 8)).toBe(false);
		} finally {
			engine.dispose();
			_setContextTier('auto');
		}
	});
});
