import { describe, expect, it } from 'vitest';
import { activeFrameSubscribers } from '../frame-scheduler.js';
import { rasterizeStickyMask, resampleStickyMask } from '../sticky-rasterizer.js';
import type { FlowConfig } from '../types.js';
import { NativeWebGpuFluidEngine } from './NativeWebGpuFluidEngine.js';
import { sharedWebGpuDevicePool } from './device-pool.js';

function channelMax(data: Float32Array, components: number, channel: number): number {
	let maximum = -Infinity;
	for (let index = channel; index < data.length; index += components) maximum = Math.max(maximum, data[index]!);
	return maximum;
}

function channelMin(data: Float32Array, components: number, channel: number): number {
	let minimum = Infinity;
	for (let index = channel; index < data.length; index += components) minimum = Math.min(minimum, data[index]!);
	return minimum;
}

describe('native WebGPU production slice', () => {
	it('releases its shared-device lease when owned config rejects before resource setup', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 32;
		canvas.height = 32;
		const before = sharedWebGpuDevicePool.snapshot()?.leases ?? 0;
		await expect(
			NativeWebGpuFluidEngine.create({
				canvas,
				autoStart: false,
				config: {
					flow: {
						sources: [{ kind: 'point', x: 0.5, y: 0.5, scalars: { smoke: 1, humidity: 1 } }]
					}
				}
			})
		).rejects.toThrow(/alias packed channel/);
		expect(sharedWebGpuDevicePool.snapshot()?.leases ?? 0).toBe(before);
	}, 30_000);

	it('submits no solver or post-processing work for an unchanged empty scene', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 48;
		const engine = await NativeWebGpuFluidEngine.create({
			canvas,
			autoStart: false,
			config: { simResolution: 32, dyeResolution: 32, initialSplatCount: 0, bloom: true, sunrays: true }
		});
		try {
			const before = engine.frameSubmissions();
			engine.advance(20, 1 / 60);
			expect(engine.frameSubmissions()).toBe(before);
			engine.splat(0.5, 0.5, 20, 0, { r: 1, g: 0, b: 0 });
			engine.advance(1, 1 / 60);
			expect(engine.frameSubmissions()).toBeGreaterThan(before);
		} finally {
			engine.dispose();
		}
	}, 30_000);

	it('compiles, advances, reads live dye, and releases every instance resource', async () => {
		if (!('gpu' in navigator)) return;
		const before = sharedWebGpuDevicePool.snapshot();
		const canvas = document.createElement('canvas');
		canvas.width = 128;
		canvas.height = 72;
		const gpuErrors: string[] = [];
		const engine = await NativeWebGpuFluidEngine.create({
			canvas,
			autoStart: false,
			onError: (error) => gpuErrors.push(error.message),
			config: {
				simResolution: 36,
				dyeResolution: 72,
				pressureIterations: 8,
				initialSplatCount: 0,
				curl: 22
			}
		});
		try {
			engine.splat(0.42, 0.53, 180, -40, { r: 0.8, g: 0.25, b: 0.1 });
			engine.advance(8, 1 / 60);
			const dye = await engine.readField('dye');
			await engine.awaitIdle();
			expect(dye.data.every(Number.isFinite)).toBe(true);
			expect(Math.max(...dye.data)).toBeGreaterThan(0.001);
			expect(gpuErrors).toEqual([]);
			expect(engine.resourceSnapshot().liveTextures).toBeGreaterThan(0);
		} finally {
			engine.dispose();
		}
		const after = sharedWebGpuDevicePool.snapshot();
		expect(after?.liveTextures).toBe(before?.liveTextures ?? 0);
		expect(after?.liveBuffers).toBe(before?.liveBuffers ?? 0);
		expect(after?.leases).toBe(before?.leases ?? 0);
	}, 30_000);

	it('runs the resolution-aware implicit viscosity branch without destabilizing the field', async () => {
		if (!('gpu' in navigator)) return;
		const measureEnergy = async (viscosity: number): Promise<number> => {
			const canvas = document.createElement('canvas');
			canvas.width = 96;
			canvas.height = 96;
			const errors: string[] = [];
			const engine = await NativeWebGpuFluidEngine.create({
				canvas,
				autoStart: false,
				onError: (error) => errors.push(error.message),
				config: {
					simResolution: 64,
					dyeResolution: 64,
					initialSplatCount: 0,
					curl: 0,
					pressureIterations: 8,
					velocityDissipation: 0,
					viscosity,
					viscosityIterations: 12
				}
			});
			try {
				engine.splat(0.5, 0.5, 260, 0, { r: 0, g: 0, b: 0 });
				engine.advance(6, 1 / 60);
				const field = await engine.readField('velocity');
				await engine.awaitIdle();
				expect(field.data.every(Number.isFinite)).toBe(true);
				expect(errors).toEqual([]);
				let energy = 0;
				for (const value of field.data) energy += value * value;
				return energy / field.data.length;
			} finally {
				engine.dispose();
			}
		};

		const inviscid = await measureEnergy(0);
		const viscous = await measureEnergy(0.35);
		expect(inviscid).toBeGreaterThan(0);
		expect(viscous).toBeGreaterThan(0);
		expect(viscous).toBeLessThan(inviscid);
	}, 30_000);

	it('hot-switches velocity advection without reallocating fields', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const engine = await NativeWebGpuFluidEngine.create({
			canvas,
			autoStart: false,
			config: { simResolution: 32, dyeResolution: 32, initialSplatCount: 0, bloom: false, sunrays: false }
		});
		try {
			engine.splat(0.5, 0.5, 100, 20, { r: 1, g: 0, b: 0 });
			engine.advance(2, 1 / 60);
			const before = engine.resourceSnapshot();
			engine.setConfig({ advectionScheme: 'maccormack' });
			engine.advance(2, 1 / 60);
			const after = engine.resourceSnapshot();
			expect(after.liveTextures).toBe(before.liveTextures);
			expect(after.liveBuffers).toBe(before.liveBuffers);
			expect((await engine.readField('velocity')).data.every(Number.isFinite)).toBe(true);
		} finally {
			engine.dispose();
		}
	}, 30_000);

	it('bounds non-finite loop and raster configuration at the public boundary', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 48;
		canvas.height = 48;
		const engine = await NativeWebGpuFluidEngine.create({
			canvas,
			autoStart: true,
			config: {
				simResolution: Infinity,
				dyeResolution: Infinity,
				initialSplatCount: Infinity,
				autoSplatRate: Infinity,
				autoSplatCount: Infinity,
				sticky: true,
				stickyMask: { text: 'safe', maskResolution: Infinity, blur: Infinity }
			}
		});
		try {
			await new Promise((resolve) => setTimeout(resolve, 50));
			engine.randomSplats(Infinity);
			engine.advance(Infinity, Infinity);
			expect(engine.resourceSnapshot().liveTextures).toBeGreaterThan(0);
		} finally {
			engine.dispose();
		}
	}, 30_000);

	it('bounds live splat bursts to four frames of work', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 48;
		canvas.height = 48;
		const engine = await NativeWebGpuFluidEngine.create({
			canvas,
			autoStart: false,
			config: { simResolution: 24, dyeResolution: 24, initialSplatCount: 0, bloom: false, sunrays: false }
		});
		try {
			engine.splat(Number.NaN, 0.5, 0, 0, { r: 1, g: 0, b: 0 });
			expect(engine.pendingSplatCount()).toBe(0);
			engine.randomSplats(10_000);
			expect(engine.pendingSplatCount()).toBe(64);
			for (let index = 0; index < 200; index += 1) {
				engine.splat(index / 200, 0.5, 1, 0, { r: 1, g: 0, b: 0 });
			}
			expect(engine.pendingSplatCount()).toBe(64);
			engine.advance(4, 1 / 60);
			expect(engine.pendingSplatCount()).toBe(0);
		} finally {
			engine.dispose();
		}
	}, 30_000);

	it('keeps more coherent velocity energy with limited MacCormack advection', async () => {
		if (!('gpu' in navigator)) return;
		const run = async (advectionScheme: 'semilagrangian' | 'maccormack') => {
			const canvas = document.createElement('canvas');
			canvas.width = 128;
			canvas.height = 128;
			const engine = await NativeWebGpuFluidEngine.create({
				canvas,
				autoStart: false,
				config: {
					simResolution: 96,
					dyeResolution: 96,
					initialSplatCount: 0,
					advectionScheme,
					velocityDissipation: 0,
					pressureIterations: 12,
					curl: 0
				}
			});
			try {
				engine.splat(0.42, 0.5, 0, 320, { r: 0, g: 0, b: 0 });
				engine.splat(0.58, 0.5, 0, -320, { r: 0, g: 0, b: 0 });
				engine.advance(36, 1 / 120);
				const field = await engine.readField('velocity');
				let energy = 0;
				for (const value of field.data) energy += value * value;
				return { data: field.data, energy: energy / field.data.length };
			} finally {
				engine.dispose();
			}
		};

		const semiLagrangian = await run('semilagrangian');
		const macCormack = await run('maccormack');
		expect(semiLagrangian.data.every(Number.isFinite)).toBe(true);
		expect(macCormack.data.every(Number.isFinite)).toBe(true);
		expect(macCormack.data).not.toEqual(semiLagrangian.data);
		expect(macCormack.energy).toBeGreaterThan(semiLagrangian.energy);
	}, 30_000);

	it('defines zero pressure iterations as no projection and clears stale warm-start pressure', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const engine = await NativeWebGpuFluidEngine.create({
			canvas,
			autoStart: false,
			config: {
				simResolution: 32,
				dyeResolution: 32,
				initialSplatCount: 0,
				pressureIterations: 8,
				curl: 0,
				bloom: false,
				sunrays: false
			}
		});
		try {
			engine.splat(0.5, 0.5, 500, 0, { r: 0, g: 0, b: 0 });
			engine.advance(2, 1 / 60);
			const warm = await engine.readField('pressure');
			expect(warm.data.some((value) => Math.abs(value) > 0.0001)).toBe(true);
			engine.setConfig({ pressureIterations: 0 });
			engine.advance(1, 1 / 60);
			const disabled = await engine.readField('pressure');
			expect(disabled.data.every((value) => value === 0)).toBe(true);
		} finally {
			engine.dispose();
		}
	}, 30_000);

	it('keeps masked MacCormack transport behind a represented thin wall', async () => {
		if (!('gpu' in navigator)) return;
		const run = async (advectionScheme: 'semilagrangian' | 'maccormack', withWall: boolean) => {
			const canvas = document.createElement('canvas');
			canvas.width = 64;
			canvas.height = 64;
			const engine = await NativeWebGpuFluidEngine.create({
				canvas,
				autoStart: false,
				config: {
					pointerInput: false,
					obstructions: withWall
						? [{ d: 'M 49 0 L 51 0 L 51 100 L 49 100 Z', fit: 'fill', viewBox: [0, 0, 100, 100] }]
						: undefined,
					advectionScheme,
					curl: 0,
					viscosity: 0,
					simResolution: 64,
					dyeResolution: 64,
					velocityDissipation: 0.05,
					densityDissipation: 0,
					pressureIterations: 12,
					splatRadius: 0.04,
					initialSplatCount: 0,
					bloom: false,
					sunrays: false
				}
			});
			try {
				engine.splat(0.32, 0.5, 1200, 0, { r: 0, g: 0, b: 0 });
				engine.advance(12, 1 / 60);
				const velocity = await engine.readField('velocity');
				const lineX = Math.floor(velocity.width * 0.56);
				let flux = 0;
				let energy = 0;
				let count = 0;
				for (let y = 0; y < velocity.height; y += 1) {
					flux += Math.max(0, velocity.data[(y * velocity.width + lineX) * 2]!);
					for (let x = Math.floor(velocity.width * 0.54); x < velocity.width; x += 1) {
						const index = (y * velocity.width + x) * 2;
						energy += velocity.data[index]! ** 2 + velocity.data[index + 1]! ** 2;
						count += 1;
					}
				}
				return {
					data: velocity.data,
					flux: flux / velocity.height,
					energy: Math.sqrt(energy / Math.max(1, count))
				};
			} finally {
				engine.dispose();
			}
		};

		const control = await run('semilagrangian', false);
		const semiLagrangian = await run('semilagrangian', true);
		const macCormack = await run('maccormack', true);
		expect(control.flux).toBeGreaterThan(0.05);
		expect(control.energy).toBeGreaterThan(0.05);
		expect(semiLagrangian.data.every(Number.isFinite)).toBe(true);
		expect(macCormack.data.every(Number.isFinite)).toBe(true);
		expect(macCormack.flux).toBeLessThanOrEqual(semiLagrangian.flux + Math.max(0.02, semiLagrangian.flux * 0.05));
		expect(macCormack.energy).toBeLessThanOrEqual(
			semiLagrangian.energy + Math.max(0.02, semiLagrangian.energy * 0.05)
		);
	}, 30_000);

	it('enforces a CPU-rasterized closed container in solver and dye fields', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 96;
		canvas.height = 96;
		const errors: string[] = [];
		const engine = await NativeWebGpuFluidEngine.create({
			canvas,
			autoStart: false,
			onError: (error) => errors.push(error.message),
			config: {
				simResolution: 64,
				dyeResolution: 64,
				initialSplatCount: 0,
				curl: 0,
				containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.32 }
			}
		});
		try {
			engine.splat(0.5, 0.5, 0, 0, { r: 1, g: 0.2, b: 0.1 });
			engine.splat(0.04, 0.04, 0, 0, { r: 1, g: 1, b: 1 });
			engine.advance(2, 1 / 60);
			const dye = await engine.readField('dye');
			let insidePeak = 0;
			let outsidePeak = 0;
			for (let y = 0; y < dye.height; y += 1) {
				for (let x = 0; x < dye.width; x += 1) {
					const value = dye.data[(y * dye.width + x) * dye.components]!;
					const distance = Math.hypot((x + 0.5) / dye.width - 0.5, (y + 0.5) / dye.height - 0.5);
					if (distance < 0.28) insidePeak = Math.max(insidePeak, value);
					if (distance > 0.38) outsidePeak = Math.max(outsidePeak, Math.abs(value));
				}
			}
			expect(errors).toEqual([]);
			expect(insidePeak).toBeGreaterThan(0.01);
			expect(outsidePeak).toBeLessThan(0.001);
		} finally {
			engine.dispose();
		}
	}, 30_000);

	it('runs persistent analytic flow sources, vector forces, and outlet damping', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 128;
		canvas.height = 72;
		const errors: string[] = [];
		const engine = await NativeWebGpuFluidEngine.create({
			canvas,
			autoStart: false,
			onError: (error) => errors.push(error.message),
			config: {
				simResolution: 54,
				dyeResolution: 72,
				initialSplatCount: 0,
				curl: 0,
				flow: {
					boundary: { left: 'open', right: 'open' },
					sources: [
						{
							kind: 'line',
							from: { x: 0.08, y: 0.35 },
							to: { x: 0.08, y: 0.65 },
							thickness: 0.8,
							profile: 'parabolic',
							velocity: { x: 180, y: 0 },
							dye: { r: 0.1, g: 0.6, b: 1 }
						}
					],
					forces: [{ kind: 'pressureGradient', vector: { x: 2, y: 0 } }],
					outlets: [{ edge: 'right', width: 0.08, clearVelocity: true, clearDye: 0 }]
				}
			}
		});
		try {
			engine.advance(5, 1 / 60);
			const dye = await engine.readField('dye');
			const velocity = await engine.readField('velocity');
			let dyePeak = 0;
			let velocityPeak = 0;
			for (const value of dye.data) dyePeak = Math.max(dyePeak, Math.abs(value));
			for (const value of velocity.data) velocityPeak = Math.max(velocityPeak, Math.abs(value));
			expect(errors).toEqual([]);
			expect(dye.data.every(Number.isFinite)).toBe(true);
			expect(velocity.data.every(Number.isFinite)).toBe(true);
			expect(dyePeak).toBeGreaterThan(0.01);
			expect(velocityPeak).toBeGreaterThan(0.01);
		} finally {
			engine.dispose();
		}
	}, 30_000);

	it('advects packed scalar channels and drives buoyancy from the selected scalar', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 96;
		canvas.height = 96;
		const errors: string[] = [];
		const engine = await NativeWebGpuFluidEngine.create({
			canvas,
			autoStart: false,
			onError: (error) => errors.push(error.message),
			config: {
				simResolution: 64,
				dyeResolution: 64,
				initialSplatCount: 0,
				curl: 0,
				flow: {
					scalarFields: [{ name: 'temperature', dissipation: 0.01 }],
					sources: [{ kind: 'point', x: 0.5, y: 0.2, radius: 8, scalars: { temperature: 1 } }],
					forces: [{ kind: 'buoyancy', scalar: 'temperature', strength: 60 }]
				}
			}
		});
		try {
			engine.advance(8, 1 / 60);
			const scalar = await engine.readField('scalar');
			const velocity = await engine.readField('velocity');
			expect(errors).toEqual([]);
			expect(scalar.data.every(Number.isFinite)).toBe(true);
			expect(velocity.data.every(Number.isFinite)).toBe(true);
			expect(channelMax(scalar.data, scalar.components, 0)).toBeGreaterThan(0.1);
			expect(Math.max(...velocity.data.map(Math.abs))).toBeGreaterThan(0.01);
		} finally {
			engine.dispose();
		}
	}, 30_000);

	it('uploads prescribed velocity and scalar grids with public coordinate conventions', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const errors: string[] = [];
		const engine = await NativeWebGpuFluidEngine.create({
			canvas,
			autoStart: false,
			onError: (error) => errors.push(error.message),
			config: {
				simResolution: 32,
				dyeResolution: 32,
				initialSplatCount: 0,
				flow: {
					mode: 'prescribed',
					scalarFields: [{ name: 'temperature' }, { name: 'ink' }],
					prescribed: {
						kind: 'grid',
						velocity: { width: 2, height: 2, scale: 100, data: [50, 20, 50, 20, 50, 20, 50, 20] },
						scalars: {
							temperature: { width: 2, height: 2, data: [0.25, 0.5, 0.75, 1] },
							ink: { width: 2, height: 2, data: [-0.8, -0.3, 0.3, 0.8] }
						}
					}
				}
			}
		});
		try {
			engine.advance(1, 1 / 60);
			const velocity = await engine.readField('velocity');
			const scalar = await engine.readField('scalar');
			expect(errors).toEqual([]);
			expect(Math.max(...velocity.data)).toBeGreaterThan(45);
			expect(Math.min(...velocity.data)).toBeLessThan(-15);
			expect(channelMax(scalar.data, scalar.components, 0)).toBeGreaterThan(0.9);
			expect(channelMax(scalar.data, scalar.components, 1)).toBeGreaterThan(0.75);
			expect(channelMin(scalar.data, scalar.components, 1)).toBeLessThan(-0.75);
		} finally {
			engine.dispose();
		}
	}, 30_000);

	it('clears packed scalar values when declared channel ownership changes', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const engine = await NativeWebGpuFluidEngine.create({
			canvas,
			autoStart: false,
			config: {
				simResolution: 32,
				dyeResolution: 32,
				initialSplatCount: 0,
				flow: {
					scalarFields: [{ name: 'temperature' }],
					sources: [{ kind: 'point', x: 0.5, y: 0.5, scalars: { temperature: 1 } }]
				}
			}
		});
		try {
			engine.advance(1, 1 / 60);
			expect(channelMax((await engine.readField('scalar')).data, 4, 0)).toBeGreaterThan(0.1);
			engine.setConfig({ flow: { scalarFields: [{ name: 'ink' }, { name: 'temperature' }] } });
			await engine.awaitIdle();
			const scalar = await engine.readField('scalar');
			expect(Math.max(...scalar.data.map(Math.abs))).toBe(0);
		} finally {
			engine.dispose();
		}
	}, 30_000);

	it('re-uploads a reused prescribed grid when its explicit version changes', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const data = new Float32Array([0.1, 0.1, 0.1, 0.1]);
		const scalarGrid = { width: 2, height: 2, data, version: 0 };
		const flow: FlowConfig = {
			mode: 'prescribed',
			scalarFields: [{ name: 'temperature' }],
			prescribed: { kind: 'grid', scalars: { temperature: scalarGrid } }
		};
		const engine = await NativeWebGpuFluidEngine.create({
			canvas,
			autoStart: false,
			config: { simResolution: 32, dyeResolution: 32, initialSplatCount: 0, flow }
		});
		try {
			engine.advance(1, 1 / 60);
			let scalar = await engine.readField('scalar');
			expect(channelMax(scalar.data, scalar.components, 0)).toBeLessThan(0.12);
			data.fill(0.9);
			scalarGrid.version = 1;
			engine.setConfig({ flow });
			engine.advance(1, 1 / 60);
			scalar = await engine.readField('scalar');
			expect(channelMax(scalar.data, scalar.components, 0)).toBeGreaterThan(0.85);
		} finally {
			engine.dispose();
		}
	}, 30_000);

	it('preserves the public y-up row origin for asymmetric prescribed grids', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const engine = await NativeWebGpuFluidEngine.create({
			canvas,
			autoStart: false,
			config: {
				simResolution: 32,
				dyeResolution: 32,
				initialSplatCount: 0,
				flow: {
					mode: 'prescribed',
					scalarFields: [{ name: 'temperature', dissipation: 0 }],
					prescribed: {
						kind: 'grid',
						scalars: { temperature: { width: 2, height: 2, data: [0.1, 0.2, 0.8, 0.9] } }
					}
				}
			}
		});
		try {
			engine.advance(1, 1 / 60);
			const scalar = await engine.readField('scalar');
			const redAt = (x: number, y: number) => scalar.data[(y * scalar.width + x) * scalar.components]!;
			const topLeft = redAt(2, 2);
			const topRight = redAt(scalar.width - 3, 2);
			const bottomLeft = redAt(2, scalar.height - 3);
			const bottomRight = redAt(scalar.width - 3, scalar.height - 3);
			expect(topLeft).toBeGreaterThan(bottomLeft + 0.5);
			expect(topRight).toBeGreaterThan(bottomRight + 0.5);
			expect(topRight).toBeGreaterThan(topLeft);
			expect(bottomRight).toBeGreaterThan(bottomLeft);
		} finally {
			engine.dispose();
		}
	}, 30_000);

	it('processes source batches beyond one shader uniform block', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const engine = await NativeWebGpuFluidEngine.create({
			canvas,
			autoStart: false,
			config: {
				simResolution: 32,
				dyeResolution: 32,
				initialSplatCount: 0,
				curl: 0,
				flow: {
					sources: Array.from({ length: 17 }, () => ({
						kind: 'point' as const,
						x: 0.5,
						y: 0.5,
						radius: 10,
						dye: { r: 0.1, g: 0, b: 0 }
					}))
				}
			}
		});
		try {
			engine.advance(1, 1 / 60);
			const dye = await engine.readField('dye');
			expect(Math.max(...dye.data)).toBeGreaterThan(1.62);
		} finally {
			engine.dispose();
		}
	}, 30_000);

	it('matches the sticky recipe by clearing off-mask dye while retaining and amplifying on-mask dye', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 96;
		canvas.height = 64;
		const errors: string[] = [];
		const engine = await NativeWebGpuFluidEngine.create({
			canvas,
			autoStart: false,
			onError: (error) => errors.push(error.message),
			config: {
				simResolution: 48,
				dyeResolution: 64,
				initialSplatCount: 0,
				curl: 0,
				densityDissipation: 1.2,
				sticky: true,
				stickyMask: { d: 'M 0 0 H 50 V 100 H 0 Z', viewBox: [0, 0, 100, 100] },
				stickyStrength: 0.95,
				stickyPressure: 0,
				stickyAmplify: 1
			}
		});
		try {
			engine.splat(0.25, 0.5, 0, 0, { r: 1, g: 0, b: 0 });
			engine.splat(0.75, 0.5, 0, 0, { r: 0, g: 1, b: 0 });
			const peaks = (dye: Awaited<ReturnType<typeof engine.readField>>) => {
				let sticky = 0;
				let free = 0;
				for (let y = 0; y < dye.height; y += 1) {
					for (let x = 0; x < dye.width; x += 1) {
						const offset = (y * dye.width + x) * dye.components;
						if (x < dye.width / 2) sticky = Math.max(sticky, dye.data[offset]!);
						else free = Math.max(free, dye.data[offset + 1]!);
					}
				}
				return { sticky, free };
			};
			engine.advance(1, 0);
			const initial = peaks(await engine.readField('dye'));
			engine.advance(120, 1 / 60);
			const final = peaks(await engine.readField('dye'));
			expect(errors).toEqual([]);
			expect(initial.sticky).toBeGreaterThan(initial.free * 1.5);
			expect(final.free).toBeLessThan(initial.free * 0.12);
			expect(final.sticky).toBeGreaterThan(initial.sticky * 0.75);
		} finally {
			engine.dispose();
		}
	}, 30_000);

	it('resolves intentionally wetted sticky typography after free dye clears', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 192;
		canvas.height = 96;
		const engine = await NativeWebGpuFluidEngine.create({
			canvas,
			autoStart: false,
			config: {
				simResolution: 64,
				dyeResolution: 96,
				initialSplatCount: 0,
				curl: 0,
				pressureIterations: 0,
				densityDissipation: 1.2,
				sticky: true,
				stickyMask: { text: 'STICK', font: '900 72px sans-serif', padding: 0.8, blur: 2 },
				stickyStrength: 0.95,
				stickyPressure: 0,
				stickyAmplify: 2,
				splatRadius: 0.075
			}
		});
		try {
			for (const [x, y] of [
				[0.16, 0.38], [0.16, 0.5], [0.16, 0.62],
				[0.34, 0.38], [0.34, 0.5], [0.34, 0.62],
				[0.5, 0.38], [0.5, 0.5], [0.5, 0.62],
				[0.66, 0.38], [0.66, 0.5], [0.66, 0.62],
				[0.84, 0.38], [0.84, 0.5], [0.84, 0.62]
			] as const) engine.splat(x, y, 0, 0, { r: 1, g: 0.6, b: 0.2 });
			engine.advance(180, 1 / 60);
			const dye = await engine.readField('dye');
			const mask = resampleStickyMask(
				rasterizeStickyMask({ text: 'STICK', font: '900 72px sans-serif', padding: 0.8, blur: 2 }, canvas.width, canvas.height),
				dye.width,
				dye.height
			);
			let retained = 0;
			let cleared = 0;
			let retainedCount = 0;
			let clearedCount = 0;
			for (let index = 0; index < mask.length; index += 1) {
				const brightness = dye.data[index * dye.components]! + dye.data[index * dye.components + 1]! + dye.data[index * dye.components + 2]!;
				if (mask[index]! > 127) {
					retained += brightness;
					retainedCount += 1;
				} else {
					cleared += brightness;
					clearedCount += 1;
				}
			}
			expect(retained / retainedCount).toBeGreaterThan((cleared / clearedCount) * 6);
		} finally {
			engine.dispose();
		}
	}, 30_000);

	it('keeps public maskResolution detail separate from the solver grid', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 96;
		canvas.height = 64;
		const engine = await NativeWebGpuFluidEngine.create({
			canvas,
			autoStart: false,
			config: {
				simResolution: 48,
				dyeResolution: 64,
				initialSplatCount: 0,
				containerShape: {
					type: 'svgPath',
					d: 'M 5 5 H 95 V 95 H 5 Z',
					maskResolution: 320
				}
			}
		});
		try {
			expect(engine.maskExtents()).toEqual({ physics: [72, 48], visual: [320, 213] });
		} finally {
			engine.dispose();
		}
	}, 30_000);

	it('preserves persistent fields across canvas and configured-resolution reallocations', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 96;
		canvas.height = 96;
		const errors: string[] = [];
		const engine = await NativeWebGpuFluidEngine.create({
			canvas,
			autoStart: false,
			onError: (error) => errors.push(error.message),
			config: {
				simResolution: 48,
				dyeResolution: 64,
				initialSplatCount: 0,
				bloom: false,
				sunrays: false,
				curl: 0
			}
		});
		try {
			engine.splat(0.5, 0.5, 100, 0, { r: 1, g: 0.2, b: 0 });
			engine.advance(2, 1 / 60);
			const before = await engine.readField('dye');
			engine.resize(160, 80);
			await engine.awaitIdle();
			const resized = await engine.readField('dye');
			engine.setConfig({ simResolution: 72, dyeResolution: 96 });
			await engine.awaitIdle();
			const reconfigured = await engine.readField('dye');
			expect(errors).toEqual([]);
			expect(resized.width).not.toBe(before.width);
			expect(reconfigured.height).not.toBe(resized.height);
			expect(Math.max(...resized.data)).toBeGreaterThan(0.01);
			expect(Math.max(...reconfigured.data)).toBeGreaterThan(0.01);
		} finally {
			engine.dispose();
		}
	}, 30_000);

	it('coalesces structural churn to the newest config and resize while a GPU transition is in flight', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const engine = await NativeWebGpuFluidEngine.create({
			canvas,
			autoStart: false,
			config: { simResolution: 32, dyeResolution: 32, initialSplatCount: 0, bloom: false, sunrays: false }
		});
		try {
			const liveBefore = engine.resourceSnapshot().liveTextures;
			engine.setConfig({ dyeResolution: 48 });
			engine.setConfig({ dyeResolution: 64 });
			engine.setConfig({ dyeResolution: 40 });
			engine.resize(80, 40);
			engine.resize(96, 48);
			await engine.awaitIdle();
			const dye = await engine.readField('dye');
			expect([dye.width, dye.height]).toEqual([80, 40]);
			expect([canvas.width, canvas.height]).toEqual([96, 48]);
			expect(engine.resourceSnapshot().liveTextures).toBe(liveBefore);
		} finally {
			engine.dispose();
		}
	}, 30_000);

	it('rejects an invalid coalesced candidate without terminating the live graph', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const errors: string[] = [];
		const engine = await NativeWebGpuFluidEngine.create({
			canvas,
			autoStart: false,
			onConfigurationError: (error) => errors.push(error.message),
			config: { simResolution: 32, dyeResolution: 32, initialSplatCount: 0, bloom: false, sunrays: false }
		});
		try {
			engine.setConfig({ dyeResolution: 48 });
			engine.setConfig({ dyeResolution: 8192 });
			await engine.awaitIdle();
			expect(errors.some((message) => message.includes('limit'))).toBe(true);
			engine.splat(0.5, 0.5, 10, 0, { r: 1, g: 0, b: 0 });
			engine.advance(1, 1 / 60);
			const dye = await engine.readField('dye');
			expect(dye.data.every(Number.isFinite)).toBe(true);
			expect(Math.max(...dye.data)).toBeGreaterThan(0.01);
		} finally {
			engine.dispose();
		}
	}, 30_000);

	it('rolls back a failed combined graph update without touching live state', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 72;
		canvas.height = 72;
		const engine = await NativeWebGpuFluidEngine.create({
			canvas,
			autoStart: false,
			config: {
				simResolution: 32,
				dyeResolution: 32,
				initialSplatCount: 0,
				densityDissipation: 0,
				bloom: false,
				sunrays: false,
				curl: 0
			}
		});
		try {
			engine.splat(0.5, 0.5, 20, 0, { r: 1, g: 0.2, b: 0 });
			engine.advance(2, 1 / 60);
			const beforeField = await engine.readField('dye');
			const beforeResources = engine.resourceSnapshot();
			expect(() =>
				engine.setConfig({
					simResolution: 48,
					dyeResolution: 64,
					bloom: true,
					containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.2 },
					flow: {
						mode: 'prescribed',
						prescribed: {
							kind: 'grid',
							velocity: { width: 8, height: 8, data: new Float32Array(2) }
						}
					}
				})
			).toThrow(/shorter than its extent/);
			const afterField = await engine.readField('dye');
			const afterResources = engine.resourceSnapshot();
			expect(afterField.width).toBe(beforeField.width);
			expect(afterField.height).toBe(beforeField.height);
			expect(afterField.data).toEqual(beforeField.data);
			expect(afterResources.liveTextures).toBe(beforeResources.liveTextures);
			expect(afterResources.liveBuffers).toBe(beforeResources.liveBuffers);
			engine.advance(1, 1 / 60);
			expect((await engine.readField('dye')).data.every(Number.isFinite)).toBe(true);
		} finally {
			engine.dispose();
		}
	}, 30_000);

	it('rebuilds masks after a same-object shape mutation', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const containerShape = { type: 'circle' as const, cx: 0.5, cy: 0.5, radius: 0.45 };
		const engine = await NativeWebGpuFluidEngine.create({
			canvas,
			autoStart: false,
			config: {
				simResolution: 32,
				dyeResolution: 32,
				initialSplatCount: 0,
				densityDissipation: 0,
				curl: 0,
				containerShape
			}
		});
		try {
			engine.splat(0.75, 0.5, 0, 0, { r: 1, g: 0, b: 0 });
			engine.advance(1, 1 / 60);
			const before = channelMax((await engine.readField('dye')).data, 4, 0);
			containerShape.radius = 0.1;
			engine.setConfig({ containerShape });
			engine.advance(1, 1 / 60);
			const after = channelMax((await engine.readField('dye')).data, 4, 0);
			expect(before).toBeGreaterThan(0.1);
			expect(after).toBeLessThan(before * 0.05);
		} finally {
			engine.dispose();
		}
	}, 30_000);

	it('clears hidden state when a paused mask shrinks and later expands', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const engine = await NativeWebGpuFluidEngine.create({
			canvas,
			autoStart: false,
			config: {
				simResolution: 32,
				dyeResolution: 32,
				initialSplatCount: 0,
				paused: true,
				densityDissipation: 0,
				bloom: false,
				sunrays: false
			}
		});
		try {
			engine.splat(0.75, 0.5, 0, 0, { r: 1, g: 0, b: 0 });
			engine.advance(1, 0);
			expect(channelMax((await engine.readField('dye')).data, 4, 0)).toBeGreaterThan(0.1);
			engine.setConfig({ containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.1 } });
			engine.setConfig({ containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 } });
			await engine.awaitIdle();
			expect(channelMax((await engine.readField('dye')).data, 4, 0)).toBeLessThan(0.001);
		} finally {
			engine.dispose();
		}
	}, 30_000);

	it('allocates and releases optional presentation targets on hot configuration', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 96;
		canvas.height = 64;
		const engine = await NativeWebGpuFluidEngine.create({
			canvas,
			autoStart: false,
			config: { initialSplatCount: 0, bloom: false, sunrays: false }
		});
		try {
			const baseline = engine.resourceSnapshot().liveTextures;
			engine.setConfig({ bloom: true, bloomResolution: 32, sunrays: true, sunraysResolution: 32 });
			await engine.awaitIdle();
			expect(engine.resourceSnapshot().liveTextures).toBe(baseline + 3);
			engine.advance(0, 0);
			engine.setConfig({ bloom: false, sunrays: false });
			await engine.awaitIdle();
			expect(engine.resourceSnapshot().liveTextures).toBe(baseline);
		} finally {
			engine.dispose();
		}
	}, 30_000);

	it('owns distortion image upload, replacement, and teardown without retaining textures', async () => {
		if (!('gpu' in navigator)) return;
		const source = document.createElement('canvas');
		source.width = 4;
		source.height = 2;
		const context = source.getContext('2d')!;
		context.fillStyle = '#ff4000';
		context.fillRect(0, 0, 4, 2);
		const blob = await new Promise<Blob>((resolve) => source.toBlob((value) => resolve(value!), 'image/png'));
		const url = URL.createObjectURL(blob);
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const assetErrors: string[] = [];
		let resolveAsset!: () => void;
		const assetReady = new Promise<void>((resolve) => (resolveAsset = resolve));
		const engine = await NativeWebGpuFluidEngine.create({
			canvas,
			autoStart: false,
			onAssetError: (error) => assetErrors.push(error.message),
			onAssetReady: resolveAsset,
			config: { initialSplatCount: 0, distortion: false, bloom: false, sunrays: false }
		});
		try {
			const baseline = engine.resourceSnapshot().liveTextures;
			engine.setConfig({ distortion: true, distortionImageUrl: url });
			await assetReady;
			expect(assetErrors).toEqual([]);
			expect(engine.resourceSnapshot().liveTextures).toBe(baseline + 1);
			engine.advance(0, 0);
			engine.setConfig({ distortion: false, bloom: true, bloomResolution: 32, sunrays: true, sunraysResolution: 32 });
			expect(engine.resourceSnapshot().liveTextures).toBe(baseline + 3);
		} finally {
			engine.dispose();
			URL.revokeObjectURL(url);
		}
	}, 30_000);

	it('shares one page scheduler and exposes the common performance-governor contract', async () => {
		if (!('gpu' in navigator)) return;
		const baseline = activeFrameSubscribers();
		const engines = await Promise.all(
			[0, 1].map(() => {
				const canvas = document.createElement('canvas');
				canvas.width = 48;
				canvas.height = 48;
				return NativeWebGpuFluidEngine.create({
					canvas,
					config: {
						initialSplatCount: 0,
						bloom: false,
						sunrays: false,
						autoPerformance: true,
						autoPerformanceTargetFrameMs: 20,
						autoPerformanceMinPressureIterations: 6,
						autoPerformanceMinSubsteps: 1,
						pressureIterations: 14,
						substeps: 2
					}
				});
			})
		);
		try {
			expect(activeFrameSubscribers()).toBe(baseline + 2);
			expect(engines[0]!.getPerformanceState()).toMatchObject({
				enabled: true,
				targetFrameMs: 20,
				pressureIterations: 14,
				substeps: 2,
				minPressureIterations: 6,
				minSubsteps: 1
			});
			engines[0]!.pause();
			expect(activeFrameSubscribers()).toBe(baseline + 1);
			engines[0]!.resume();
			expect(activeFrameSubscribers()).toBe(baseline + 2);
		} finally {
			for (const engine of engines) engine.dispose();
		}
		expect(activeFrameSubscribers()).toBe(baseline);
	}, 30_000);

	it('keeps shared-device resource counts flat across 100 instance lifecycles', async () => {
		if (!('gpu' in navigator)) return;
		const before = sharedWebGpuDevicePool.snapshot();
		for (let index = 0; index < 100; index += 1) {
			const canvas = document.createElement('canvas');
			canvas.width = 24;
			canvas.height = 24;
			const engine = await NativeWebGpuFluidEngine.create({
				canvas,
				autoStart: false,
				config: {
					simResolution: 16,
					dyeResolution: 16,
					initialSplatCount: 0,
					pressureIterations: 0,
					curl: 0,
					bloom: false,
					sunrays: false
				}
			});
			engine.dispose();
		}
		const after = sharedWebGpuDevicePool.snapshot();
		expect(after?.liveTextures).toBe(before?.liveTextures ?? 0);
		expect(after?.liveBuffers).toBe(before?.liveBuffers ?? 0);
		expect(after?.leases).toBe(before?.leases ?? 0);
	}, 30_000);

	it('applies the opening density-dissipation ramp on deterministic advances', async () => {
		if (!('gpu' in navigator)) return;
		const peakAfterOpening = async (initialDensityDissipation: number): Promise<number> => {
			const canvas = document.createElement('canvas');
			canvas.width = 64;
			canvas.height = 64;
			const engine = await NativeWebGpuFluidEngine.create({
				canvas,
				autoStart: false,
				config: {
					initialSplatCount: 0,
					bloom: false,
					sunrays: false,
					dyeResolution: 64,
					curl: 0,
					pressureIterations: 0,
					densityDissipation: 0,
					initialDensityDissipation,
					initialDensityDissipationDuration: 1
				}
			});
			try {
				engine.splat(0.5, 0.5, 0, 0, { r: 1, g: 0, b: 0 });
				engine.advance(8, 1 / 60);
				let peak = 0;
				for (const value of (await engine.readField('dye')).data) peak = Math.max(peak, value);
				return peak;
			} finally {
				engine.dispose();
			}
		};

		const steady = await peakAfterOpening(0);
		const burnedIn = await peakAfterOpening(12);
		expect(steady).toBeGreaterThan(0);
		expect(burnedIn).toBeLessThan(steady * 0.8);
	}, 30_000);
});
