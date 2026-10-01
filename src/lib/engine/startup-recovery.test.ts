import { describe, expect, it, vi } from 'vitest';
import { FluidEngine } from './FluidEngine.js';
import { NativeWebGpuFluidEngine } from './webgpu/NativeWebGpuFluidEngine.js';

function fakeEngine(onIdle?: () => void) {
	return {
		setConfig() {},
		resize: () => true,
		async awaitIdle() {
			onIdle?.();
		},
		acceptedState: () => ({ config: {}, width: 32, height: 24 }),
		resume() {},
		pause() {},
		dispose() {},
		splat() {},
		randomSplats() {},
		isPaused: true
	} as unknown as NativeWebGpuFluidEngine;
}

describe('startup device loss', () => {
	it('does not resolve ready until recovery publishes an engine, so onReady fires once', async () => {
		let lose!: () => void;
		const events: string[] = [];
		const create = vi
			.spyOn(NativeWebGpuFluidEngine, 'create')
			.mockImplementationOnce(async (options) => {
				lose = () => options.onDeviceLost?.();
				return fakeEngine(() => lose());
			})
			.mockImplementationOnce(async () => {
				await new Promise((resolve) => setTimeout(resolve, 5));
				return fakeEngine();
			});
		const canvas = { width: 32, height: 24 } as HTMLCanvasElement;
		const controller = new FluidEngine({
			canvas,
			autoStart: false,
			onRecovering: () => events.push('recovering'),
			onRecovered: () => events.push('recovered')
		});
		try {
			await controller.ready;
			events.push('ready');
			// Recovery has already completed by the time ready resolves.
			expect(events).toEqual(['recovering', 'recovered', 'ready']);
			expect(create).toHaveBeenCalledTimes(2);
		} finally {
			controller.dispose();
			create.mockRestore();
		}
	});
});
