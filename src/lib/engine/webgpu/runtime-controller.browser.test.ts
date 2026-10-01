import { describe, expect, it, vi } from 'vitest';
import { FluidEngine } from '../FluidEngine.js';
import { getFluidEngineDiagnostics } from '../engine-diagnostics.js';
import type { FluidConfig } from '../types.js';
import { NativeWebGpuFluidEngine } from './NativeWebGpuFluidEngine.js';

describe('FluidEngine startup and recovery', () => {
	it('requires an exposed WebGPU implementation in the hardware suite', () => {
		expect('gpu' in navigator).toBe(true);
	});

	it('reconciles config and size updates that arrive inside the startup GPU fence', async () => {
		let enterFence!: () => void;
		let releaseFence!: () => void;
		const fenceEntered = new Promise<void>((resolve) => (enterFence = resolve));
		const fence = new Promise<void>((resolve) => (releaseFence = resolve));
		const configs: FluidConfig[] = [];
		const sizes: Array<[number, number]> = [];
		let fenceCalls = 0;
		const fake = {
			setConfig(config: FluidConfig) {
				configs.push(config);
			},
			resize(width: number, height: number) {
				sizes.push([width, height]);
				return true;
			},
			async awaitIdle() {
				fenceCalls += 1;
				if (fenceCalls === 1) {
					enterFence();
					await fence;
				}
			},
			resume() {},
			pause() {},
			dispose() {},
			splat() {},
			randomSplats() {},
			get isPaused() { return true; }
		};
		const create = vi.spyOn(NativeWebGpuFluidEngine, 'create').mockResolvedValue(
			fake as unknown as NativeWebGpuFluidEngine
		);
		const canvas = document.createElement('canvas');
		canvas.width = 32;
		canvas.height = 24;
		const controller = new FluidEngine({ canvas, autoStart: false, config: { densityDissipation: 1 } });
		try {
			await fenceEntered;
			controller.setConfig({ densityDissipation: 0.25 });
			controller.resize(80, 48);
			releaseFence();
			await controller.ready;
			expect(fenceCalls).toBe(2);
			expect(configs.at(-1)?.densityDissipation).toBe(0.25);
			expect(sizes.at(-1)).toEqual([80, 48]);
		} finally {
			controller.dispose();
			create.mockRestore();
		}
	});

	it('rolls explicitly rejected config and resize intent back before reconstruction', async () => {
		let loseDevice!: () => void;
		let rejectTransition!: NonNullable<Parameters<typeof NativeWebGpuFluidEngine.create>[0]['onConfigurationError']>;
		let resolveRecovered!: () => void;
		const recovered = new Promise<void>((resolve) => (resolveRecovered = resolve));
		const createConfigs: FluidConfig[] = [];
		const appliedSizes: Array<[number, number]> = [];
		let generation = 0;
		const create = vi.spyOn(NativeWebGpuFluidEngine, 'create').mockImplementation(async (options) => {
			generation += 1;
			createConfigs.push(options.config ?? {});
			if (generation === 1) {
				loseDevice = () => options.onDeviceLost?.({} as GPUDeviceLostInfo);
				rejectTransition = options.onConfigurationError!;
			}
			return {
				acceptedState: () => ({ config: { simResolution: 24, dyeResolution: 40 }, width: 40, height: 30 }),
				setConfig() {},
				resize(width: number, height: number) {
					appliedSizes.push([width, height]);
					return true;
				},
				async awaitIdle() {},
				resume() {},
				pause() {},
				dispose() {},
				splat() {},
				randomSplats() {},
				get isPaused() { return true; }
			} as unknown as NativeWebGpuFluidEngine;
		});
		const canvas = document.createElement('canvas');
		canvas.width = 40;
		canvas.height = 30;
		const controller = await FluidEngine.create({
			canvas,
			autoStart: false,
			config: { simResolution: 24, dyeResolution: 40 },
			onRecovered: resolveRecovered
		});
		try {
			controller.setConfig({ dyeResolution: 8192 });
			controller.resize(400, 300);
			rejectTransition(new Error('config rejected'), {
				kind: 'config',
				acceptedConfig: { simResolution: 24, dyeResolution: 40 }
			});
			rejectTransition(new Error('resize rejected'), {
				kind: 'resize',
				acceptedWidth: 40,
				acceptedHeight: 30
			});
			loseDevice();
			await recovered;
			expect(createConfigs).toHaveLength(2);
			expect(createConfigs[1]?.dyeResolution).toBe(40);
			expect(appliedSizes.at(-1)).toEqual([40, 30]);
		} finally {
			controller.dispose();
			create.mockRestore();
		}
	});

	it('replays valid unsettled config and resize intent after device loss', async () => {
		let loseDevice!: () => void;
		let resolveRecovered!: () => void;
		const recovered = new Promise<void>((resolve) => (resolveRecovered = resolve));
		const createConfigs: FluidConfig[] = [];
		const appliedConfigs: Array<{ generation: number; config: FluidConfig }> = [];
		const appliedSizes: Array<[number, number]> = [];
		let generation = 0;
		const create = vi.spyOn(NativeWebGpuFluidEngine, 'create').mockImplementation(async (options) => {
			generation += 1;
			createConfigs.push(options.config ?? {});
			if (generation === 1) loseDevice = () => options.onDeviceLost?.({} as GPUDeviceLostInfo);
			return {
				acceptedState: () => ({ config: { simResolution: 24, dyeResolution: 40 }, width: 40, height: 30 }),
				setConfig(config: FluidConfig) {
					appliedConfigs.push({ generation, config });
				},
				resize(width: number, height: number) {
					appliedSizes.push([width, height]);
					return true;
				},
				async awaitIdle() {},
				resume() {},
				pause() {},
				dispose() {},
				splat() {},
				randomSplats() {},
				get isPaused() { return true; }
			} as unknown as NativeWebGpuFluidEngine;
		});
		const canvas = document.createElement('canvas');
		canvas.width = 40;
		canvas.height = 30;
		const controller = await FluidEngine.create({
			canvas,
			autoStart: false,
			config: { simResolution: 24, dyeResolution: 40 },
			onRecovered: resolveRecovered
		});
		try {
			controller.setConfig({ dyeResolution: 64 });
			controller.resize(80, 60);
			loseDevice();
			await recovered;
			expect(createConfigs).toHaveLength(2);
			expect(createConfigs[1]?.dyeResolution).toBe(40);
			expect(appliedConfigs.some((entry) => entry.generation === 2 && entry.config.dyeResolution === 64)).toBe(true);
			expect(appliedSizes.at(-1)).toEqual([80, 60]);
		} finally {
			controller.dispose();
			create.mockRestore();
		}
	});

	it('keeps recovery nonfatal when unsettled intent later fails resource preparation', async () => {
		let loseDevice!: () => void;
		let resolveRecovered!: () => void;
		const recovered = new Promise<void>((resolve) => (resolveRecovered = resolve));
		const errors: string[] = [];
		const createConfigs: FluidConfig[] = [];
		let generation = 0;
		const create = vi.spyOn(NativeWebGpuFluidEngine, 'create').mockImplementation(async (options) => {
			generation += 1;
			createConfigs.push(options.config ?? {});
			if (generation === 1) loseDevice = () => options.onDeviceLost?.({} as GPUDeviceLostInfo);
			return {
				acceptedState: () => ({ config: { simResolution: 24, dyeResolution: 40 }, width: 40, height: 30 }),
				setConfig(config: FluidConfig) {
					if (generation === 2 && config.dyeResolution === 8192) throw new Error('field budget exceeded');
				},
				resize() { return false; },
				async awaitIdle() {},
				resume() {},
				pause() {},
				dispose() {},
				splat() {},
				randomSplats() {},
				get isPaused() { return true; }
			} as unknown as NativeWebGpuFluidEngine;
		});
		const canvas = document.createElement('canvas');
		canvas.width = 40;
		canvas.height = 30;
		const controller = await FluidEngine.create({
			canvas,
			autoStart: false,
			config: { simResolution: 24, dyeResolution: 40 },
			onError: (error) => errors.push(error.message),
			onRecovered: resolveRecovered
		});
		try {
			controller.setConfig({ dyeResolution: 8192 });
			loseDevice();
			await recovered;
			expect(createConfigs[1]?.dyeResolution).toBe(40);
			expect(errors).toEqual(['field budget exceeded']);
		} finally {
			controller.dispose();
			create.mockRestore();
		}
	});

	it('queues lifecycle, configuration, and ordered input while becoming ready', async () => {
		if (!('gpu' in navigator)) return;
		const config = {
			simResolution: 32,
			dyeResolution: 32,
			initialSplatCount: 0,
			seed: 0x51a7,
			bloom: false,
			sunrays: false
		};
		const queuedCanvas = document.createElement('canvas');
		queuedCanvas.width = 48;
		queuedCanvas.height = 32;
		const queued = new FluidEngine({ canvas: queuedCanvas, autoStart: true, config });
		queued.pause();
		queued.resize(72, 40);
		queued.setConfig({ densityDissipation: 0 });
		queued.randomSplats(1);
		queued.splat(0.45, 0.55, 40, -15, { r: 1, g: 0.2, b: 0.1 });
		queued.randomSplats(1);

		const directCanvas = document.createElement('canvas');
		directCanvas.width = 72;
		directCanvas.height = 40;
		const direct = await FluidEngine.create({
			canvas: directCanvas,
			autoStart: false,
			config: { ...config, densityDissipation: 0 }
		});
		try {
			await queued.ready;
			direct.randomSplats(1);
			direct.splat(0.45, 0.55, 40, -15, { r: 1, g: 0.2, b: 0.1 });
			direct.randomSplats(1);
			getFluidEngineDiagnostics(queued).advance(2, 1 / 60);
			getFluidEngineDiagnostics(direct).advance(2, 1 / 60);
			const [queuedDye, directDye] = await Promise.all([getFluidEngineDiagnostics(queued).readField('dye'), getFluidEngineDiagnostics(direct).readField('dye')]);
			expect(queuedCanvas.width).toBe(72);
			expect(queuedCanvas.height).toBe(40);
			expect(queued.isPaused).toBe(true);
			expect(queuedDye.data).toEqual(directDye.data);
		} finally {
			queued.dispose();
			direct.dispose();
		}
	}, 30_000);

	it('replays an omitted seed identically after device reconstruction', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 48;
		let recovered!: () => void;
		const recovery = new Promise<void>((resolve) => {
			recovered = resolve;
		});
		const controller = await FluidEngine.create({
			canvas,
			autoStart: false,
			onRecovered: recovered,
			config: { simResolution: 32, dyeResolution: 32, initialSplatCount: 2, bloom: false, sunrays: false }
		});
		try {
			const before = await getFluidEngineDiagnostics(controller).readField('dye');
			controller.setConfig({ seed: 1, initialSplatCount: 0 });
			getFluidEngineDiagnostics(controller).forceDeviceLoss();
			await Promise.race([
				recovery,
				new Promise<never>((_, reject) => setTimeout(() => reject(new Error('recovery timed out')), 10_000))
			]);
			const after = await getFluidEngineDiagnostics(controller).readField('dye');
			expect(after.data).toEqual(before.data);
		} finally {
			controller.dispose();
		}
	}, 30_000);

	it('snapshots construct-only preset splats across device reconstruction', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		let recovered!: () => void;
		const recovery = new Promise<void>((resolve) => (recovered = resolve));
		const preset = {
			x: 0.35,
			y: 0.6,
			dx: 20,
			dy: -10,
			color: { r: 1, g: 0.2, b: 0.1 }
		};
		const controller = await FluidEngine.create({
			canvas,
			autoStart: false,
			onRecovered: recovered,
			config: {
				simResolution: 32,
				dyeResolution: 32,
				initialSplatCount: 0,
				presetSplats: [preset],
				bloom: false,
				sunrays: false
			}
		});
		try {
			const before = await getFluidEngineDiagnostics(controller).readField('dye');
			preset.x = 0.9;
			preset.color.r = 0;
			preset.color.g = 1;
			getFluidEngineDiagnostics(controller).forceDeviceLoss();
			await Promise.race([
				recovery,
				new Promise<never>((_, reject) => setTimeout(() => reject(new Error('recovery timed out')), 10_000))
			]);
			const after = await getFluidEngineDiagnostics(controller).readField('dye');
			expect(after.data).toEqual(before.data);
		} finally {
			controller.dispose();
		}
	}, 30_000);

	it('retains the last-good owned descriptors after a rejected same-object update and recovery', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const shape = { type: 'circle' as const, cx: 0.5, cy: 0.5, radius: 0.45 };
		const velocity = { width: 2, height: 2, data: new Float32Array(8), version: 0 };
		const flow = { mode: 'prescribed' as const, prescribed: { kind: 'grid' as const, velocity } };
		const errors: string[] = [];
		let recovered!: () => void;
		const recovery = new Promise<void>((resolve) => (recovered = resolve));
		const controller = await FluidEngine.create({
			canvas,
			autoStart: false,
			onError: (error) => errors.push(error.message),
			onRecovered: recovered,
			config: {
				simResolution: 32,
				dyeResolution: 32,
				initialSplatCount: 0,
				bloom: false,
				sunrays: false,
				containerShape: shape,
				flow
			}
		});
		try {
			shape.radius = 0.1;
			velocity.width = 8;
			velocity.height = 8;
			velocity.version = 1;
			controller.setConfig({ containerShape: shape, flow });
			expect(errors.some((message) => message.includes('shorter than its extent'))).toBe(true);
			getFluidEngineDiagnostics(controller).forceDeviceLoss();
			await Promise.race([
				recovery,
				new Promise<never>((_, reject) => setTimeout(() => reject(new Error('recovery timed out')), 10_000))
			]);
			controller.splat(0.75, 0.5, 0, 0, { r: 1, g: 0, b: 0 });
			getFluidEngineDiagnostics(controller).advance(1, 0);
			expect(Math.max(...(await getFluidEngineDiagnostics(controller).readField('dye')).data)).toBeGreaterThan(0.1);
		} finally {
			controller.dispose();
		}
	}, 30_000);

	it('reconstructs on a fresh shared device after loss and remains usable', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 96;
		canvas.height = 64;
		let recovered!: () => void;
		const recovery = new Promise<void>((resolve) => {
			recovered = resolve;
		});
		const errors: string[] = [];
		const controller = await FluidEngine.create({
			canvas,
			autoStart: false,
			onError: (error) => errors.push(error.message),
			onAssetError: (error) => errors.push(error.message),
			onRecovered: recovered,
			config: { simResolution: 32, dyeResolution: 32, initialSplatCount: 0, bloom: false, sunrays: false }
		});
		try {
			const firstGeneration = getFluidEngineDiagnostics(controller).resourceSnapshot()!.generation;
			getFluidEngineDiagnostics(controller).forceDeviceLoss();
			await Promise.race([
				recovery,
				new Promise<never>((_, reject) => setTimeout(() => reject(new Error('recovery timed out')), 10_000))
			]);
			expect(getFluidEngineDiagnostics(controller).resourceSnapshot()!.generation).toBeGreaterThan(firstGeneration);
			controller.splat(0.5, 0.5, 50, 0, { r: 1, g: 0, b: 0 });
			getFluidEngineDiagnostics(controller).advance(2, 1 / 60);
			const dye = await getFluidEngineDiagnostics(controller).readField('dye');
			expect(Math.max(...dye.data)).toBeGreaterThan(0.01);
			expect(errors).toEqual([]);
		} finally {
			controller.dispose();
		}
	}, 30_000);

	it('does not turn undefined hot fields into recovery-time defaults', async () => {
		if (!('gpu' in navigator)) return;
		const canvas = document.createElement('canvas');
		canvas.width = 48;
		canvas.height = 48;
		let recovered!: () => void;
		const recovery = new Promise<void>((resolve) => (recovered = resolve));
		const controller = await FluidEngine.create({
			canvas,
			autoStart: false,
			onRecovered: recovered,
			config: {
				simResolution: 24,
				dyeResolution: 24,
				initialSplatCount: 0,
				densityDissipation: 0,
				bloom: false,
				sunrays: false
			}
		});
		try {
			controller.setConfig({ densityDissipation: undefined });
			getFluidEngineDiagnostics(controller).forceDeviceLoss();
			await Promise.race([
				recovery,
				new Promise<never>((_, reject) => setTimeout(() => reject(new Error('recovery timed out')), 10_000))
			]);
			controller.splat(0.5, 0.5, 0, 0, { r: 1, g: 0, b: 0 });
			getFluidEngineDiagnostics(controller).advance(1, 1 / 60);
			const first = Math.max(...(await getFluidEngineDiagnostics(controller).readField('dye')).data);
			getFluidEngineDiagnostics(controller).advance(59, 1 / 60);
			const retained = Math.max(...(await getFluidEngineDiagnostics(controller).readField('dye')).data);
			expect(first).toBeGreaterThan(0.5);
			expect(retained).toBeGreaterThan(first * 0.99);
		} finally {
			controller.dispose();
		}
	}, 30_000);

	it('fans shared-device loss out to every live runtime and rebuilds each one', async () => {
		if (!('gpu' in navigator)) return;
		let recovering = 0;
		let resolveRecovering!: () => void;
		const allRecovering = new Promise<void>((resolve) => {
			resolveRecovering = resolve;
		});
		let recovered = 0;
		let resolveAll!: () => void;
		const allRecovered = new Promise<void>((resolve) => {
			resolveAll = resolve;
		});
		const controllers = await Promise.all(
			[0, 1, 2].map(async () => {
				const canvas = document.createElement('canvas');
				canvas.width = 48;
				canvas.height = 32;
				return FluidEngine.create({
					canvas,
					autoStart: false,
					onRecovering: () => {
						recovering += 1;
						if (recovering === 3) resolveRecovering();
					},
					onRecovered: () => {
						recovered += 1;
						if (recovered === 3) resolveAll();
					},
					config: {
						simResolution: 16,
						dyeResolution: 16,
						initialSplatCount: 0,
						bloom: false,
						sunrays: false
					}
				});
			})
		);
		try {
			const firstGeneration = getFluidEngineDiagnostics(controllers[0]!).resourceSnapshot()!.generation;
			getFluidEngineDiagnostics(controllers[0]!).forceDeviceLoss();
			await Promise.race([
				allRecovering,
				new Promise<never>((_, reject) => setTimeout(() => reject(new Error('fan-out loss timed out')), 10_000))
			]);
			// Inputs and host resize are accepted while no native instance exists.
			for (const controller of controllers) {
				controller.splat(0.5, 0.5, 20, 0, { r: 1, g: 0.2, b: 0 });
				controller.randomSplats(1);
				controller.resize(72, 40);
			}
			await Promise.race([
				allRecovered,
				new Promise<never>((_, reject) => setTimeout(() => reject(new Error('fan-out recovery timed out')), 10_000))
			]);
			for (const controller of controllers) {
				expect(getFluidEngineDiagnostics(controller).resourceSnapshot()!.generation).toBeGreaterThan(firstGeneration);
				getFluidEngineDiagnostics(controller).advance(1, 1 / 60);
				expect((await getFluidEngineDiagnostics(controller).readField('dye')).data.some((value) => value > 0.01)).toBe(true);
			}
		} finally {
			for (const controller of controllers) controller.dispose();
		}
	}, 30_000);
});
