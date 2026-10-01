import { describe, expect, it } from 'vitest';
import {
	createDoubleTarget,
	createExternalImageTexture,
	createMaskTexture,
	createTarget,
	WebGpuResourceTracker
} from './resources.js';

function throwingDevice(failure: 'second-texture' | 'view' | 'write' | 'external') {
	let textures = 0;
	const destroyed: number[] = [];
	const device = {
		createTexture() {
			textures += 1;
			if (failure === 'second-texture' && textures === 2) throw new Error('texture allocation failed');
			const id = textures;
			return {
				createView() {
					if (failure === 'view') throw new Error('view creation failed');
					return {};
				},
				destroy() {
					destroyed.push(id);
				}
			};
		},
		queue: {
			writeTexture() {
				if (failure === 'write') throw new Error('upload failed');
			},
			copyExternalImageToTexture() {
				if (failure === 'external') throw new Error('external upload failed');
			}
		}
	};
	return { device: device as unknown as GPUDevice, destroyed };
}

describe('WebGPU resource tracker', () => {
	it('returns to zero across repeated instance-shaped churn', () => {
		const tracker = new WebGpuResourceTracker();
		for (let cycle = 0; cycle < 100; cycle += 1) {
			for (let texture = 0; texture < 9; texture += 1) tracker.textureCreated();
			for (let buffer = 0; buffer < 12; buffer += 1) tracker.bufferCreated();
			for (let texture = 0; texture < 9; texture += 1) tracker.textureDestroyed();
			for (let buffer = 0; buffer < 12; buffer += 1) tracker.bufferDestroyed();
		}
		expect(tracker.snapshot()).toMatchObject({
			texturesCreated: 900,
			texturesDestroyed: 900,
			buffersCreated: 1200,
			buffersDestroyed: 1200,
			liveTextures: 0,
			liveBuffers: 0
		});
	});

	it('rolls back a texture whose view cannot be created', () => {
		const tracker = new WebGpuResourceTracker();
		const { device, destroyed } = throwingDevice('view');
		expect(() => createTarget(device, tracker, 1, 1, 'r16float', 'test')).toThrow('view creation failed');
		expect(destroyed).toEqual([1]);
		expect(tracker.snapshot().liveTextures).toBe(0);
	});

	it('rolls back the first half of a failed double target', () => {
		const tracker = new WebGpuResourceTracker();
		const { device, destroyed } = throwingDevice('second-texture');
		expect(() => createDoubleTarget(device, tracker, 1, 1, 'r16float', 'test')).toThrow('texture allocation failed');
		expect(destroyed).toEqual([1]);
		expect(tracker.snapshot().liveTextures).toBe(0);
	});

	it('rolls back failed byte and external image uploads', () => {
		for (const failure of ['write', 'external'] as const) {
			const tracker = new WebGpuResourceTracker();
			const { device, destroyed } = throwingDevice(failure);
			const create = () =>
				failure === 'write'
					? createMaskTexture(device, tracker, 1, 1, new Uint8Array(4), 'test')
					: createExternalImageTexture(device, tracker, { width: 1, height: 1 } as ImageBitmap, 'test');
			expect(create).toThrow('failed');
			expect(destroyed).toEqual([1]);
			expect(tracker.snapshot().liveTextures).toBe(0);
		}
	});
});
