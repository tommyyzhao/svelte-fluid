import { mount, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { surfaceGeometry } from './surface-geometry.js';
import { createFilm } from './film.js';
import { createSoftType } from './soft-type.js';
import SurfaceLayer from './SurfaceLayer.svelte';
import SoftType from './SoftType.svelte';

function specimen(width: number, height: number) {
	const host = document.createElement('div');
	host.style.cssText = `position:relative;width:${width}px;height:${height}px`;
	const heading = document.createElement('h1');
	heading.style.cssText = 'margin:0;font:700 110px/1.2 Georgia;letter-spacing:-3px';
	heading.textContent = 'Native'; host.append(heading); document.body.append(host);
	return { host, heading };
}

describe('native display typography sources', () => {
	it('rejects an oversized native glyph image before allocating the raster', () => {
		const { host, heading } = specimen(6000, 3000);
		const dpr = vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(1);
		const create = vi.spyOn(document, 'createElement');
		try {
			expect(() => surfaceGeometry(host, heading, '#ab5432')).toThrow();
			expect(create).not.toHaveBeenCalled();
		} finally { create.mockRestore(); dpr.mockRestore(); host.remove(); }
	});

	it('keeps full 2×/3× coverage, an unchanged coarse grid, and exact GPU profile copies', async () => {
		const { host, heading } = specimen(901, 280);
		let ratio = 1;
		const dpr = vi.spyOn(window, 'devicePixelRatio', 'get').mockImplementation(() => ratio);
		const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull();
		const device = await adapter!.requestDevice();
		device.pushErrorScope('validation');
		const createTexture = device.createTexture.bind(device);
		let profileTexture: GPUTexture | undefined;
		const textures = vi.spyOn(device, 'createTexture').mockImplementation((descriptor) => {
			if (descriptor.label !== 'Enamel high-resolution rounded relief') return createTexture(descriptor);
			profileTexture = createTexture({ ...descriptor, usage: descriptor.usage | GPUTextureUsage.COPY_SRC });
			return profileTexture;
		});
		try {
			let coarseCells = 0, firstBytes = 0, firstProfileBytes = 0;
			for (ratio of [1, 2, 3]) {
				const options = surfaceGeometry(host, heading, '#ab5432');
				const profile = options.enamel!;
				expect([profile.width, profile.height]).toEqual([901 * ratio, 280 * ratio]);
				expect(profile.data.length).toBe(profile.width * profile.height * 4);
				expect(options.width).toBe(384);
				coarseCells ||= options.initial!.length;
				expect(options.initial!.length).toBe(coarseCells);
				expect(options.initial!.every(Number.isFinite)).toBe(true);
				expect(options.initial!.some((value) => value > 0)).toBe(true);
				const film = await createFilm(device, 'rgba8unorm', options);
				const bytesPerRow = Math.ceil(profile.width * 4 / 256) * 256;
				const readback = device.createBuffer({ size: bytesPerRow * profile.height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
				try {
					if (ratio === 1) { firstBytes = film.memoryBytes; firstProfileBytes = profile.data.length; }
					expect(film.memoryBytes - firstBytes).toBe(profile.data.length - firstProfileBytes);
					const encoder = device.createCommandEncoder();
					encoder.copyTextureToBuffer({ texture: profileTexture! }, { buffer: readback, bytesPerRow }, [profile.width, profile.height]);
					device.queue.submit([encoder.finish()]); await readback.mapAsync(GPUMapMode.READ);
					const copied = new Uint8Array(readback.getMappedRange());
					let mismatches = 0;
					for (let y = 0; y < profile.height; y++) for (let x = 0; x < profile.width * 4; x++) {
						if (copied[y * bytesPerRow + x] !== profile.data[y * profile.width * 4 + x]) mismatches++;
					}
					expect(mismatches).toBe(0);
					expect((await film.inspect()).finite).toBe(true);
				} finally { readback.destroy(); film.dispose(); }
			}
			expect((await device.popErrorScope())?.message ?? null).toBeNull();
		} finally { textures.mockRestore(); device.destroy(); dpr.mockRestore(); host.remove(); }
	});

	it('allocates the warp source only at its requested native size, without changing displacement', async () => {
		const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull();
		const device = await adapter!.requestDevice(); device.pushErrorScope('validation');
		const sizes: Array<[number, number]> = [];
		const original = device.createTexture.bind(device);
		const textures = vi.spyOn(device, 'createTexture').mockImplementation((descriptor) => {
			if (descriptor.label === 'Soft type native material source') {
				const size = descriptor.size as number[]; sizes.push([size[0], size[1]]);
			}
			return original(descriptor);
		});
		const type = await createSoftType(device, 'rgba8unorm', { width: 64, height: 32, initial: new Float32Array(64 * 32).fill(0.3) });
		try {
			expect(sizes).toEqual([]);
			const bytes = type.memoryBytes, state = await type.inspect();
			for (const ratio of [2, 3]) {
				type.resize(901 * ratio, 450 * ratio);
				expect(type.memoryBytes - bytes).toBe(901 * 450 * ratio ** 2 * 4);
				expect(await type.inspect()).toEqual(state);
				const target = device.createTexture({ size: [901 * ratio, 450 * ratio], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT });
				try { const encoder = device.createCommandEncoder(); type.render(encoder, target.createView()); device.queue.submit([encoder.finish()]); }
				finally { target.destroy(); }
			}
			expect(sizes).toEqual([[1802, 900], [2703, 1350]]);
			expect(() => type.resize(100_000, 100_000)).toThrow();
			expect(type.memoryBytes - bytes).toBe(2703 * 1350 * 4);
			await device.queue.onSubmittedWorkDone();
			expect((await device.popErrorScope())?.message ?? null).toBeNull();
		} finally { type.dispose(); textures.mockRestore(); device.destroy(); }
	});

	for (const label of ['enamel', 'soft type'] as const) it(`keeps fractional ${label} source dimensions exact through DPR-only and subpixel layout changes`, async () => {
		const cssWidth = 640.25, cssHeight = 240.625;
		const { host, heading } = specimen(cssWidth, cssHeight);
		let ratio = 1, ready = false, error = '';
		const dpr = vi.spyOn(window, 'devicePixelRatio', 'get').mockImplementation(() => ratio);
		const queries: MediaQueryList[] = [];
		const realMedia = window.matchMedia.bind(window);
		const media = vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
			const result = realMedia(query); if (query.startsWith('(resolution:')) queries.push(result); return result;
		});
		const nativeProfiles: Array<[number, number]> = [];
		const sources: Array<[number, number]> = [];
		const original = GPUDevice.prototype.createTexture;
		const textures = vi.spyOn(GPUDevice.prototype, 'createTexture').mockImplementation(function(this: GPUDevice, descriptor) {
			const size = descriptor.size as number[];
			if (descriptor.label === 'Enamel high-resolution rounded relief') nativeProfiles.push([size[0], size[1]]);
			if (descriptor.label === 'Soft type native material source') sources.push([size[0], size[1]]);
			return original.call(this, descriptor);
		});
		const onStatus = (status: { ready: boolean; error: string }) => { ready = status.ready; error = status.error; };
		const component = label === 'enamel'
			? mount(SurfaceLayer, { target: host, props: { geometry: heading, onStatus } })
			: mount(SoftType, { target: host, props: { geometry: heading, onStatus } });
		async function until(condition: () => boolean) {
			for (let frame = 0; frame < 180 && !condition(); frame++) {
				await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); expect(error).toBe('');
			}
			expect(condition()).toBe(true);
		}
		try {
			await until(() => ready && nativeProfiles.length > 0);
			expect(nativeProfiles.at(-1)).toEqual([640, 241]);
			for (const next of [2, 3]) {
				const before = nativeProfiles.length; ratio = next;
				queries.at(-1)!.dispatchEvent(new Event('change'));
				await until(() => ready && nativeProfiles.length > before);
				const expected = [Math.round(cssWidth * ratio), Math.round(cssHeight * ratio)];
				expect(nativeProfiles.at(-1)).toEqual(expected);
				expect([host.clientWidth, host.clientHeight]).toEqual([640, 241]);
				const canvas = host.querySelector('canvas')!;
				expect([canvas.width, canvas.height]).toEqual(expected);
				if (label === 'soft type') expect(sources.at(-1)).toEqual(expected);
			}
			const beforeSubpixelResize = nativeProfiles.length;
			host.style.width = '640.125px';
			await until(() => ready && nativeProfiles.length > beforeSubpixelResize);
			// clientWidth did not change, but the native raster lost one column.
			expect(host.clientWidth).toBe(640);
			expect(nativeProfiles.at(-1)).toEqual([1920, 722]);
			const canvas = host.querySelector('canvas')!;
			expect([canvas.width, canvas.height]).toEqual([1920, 722]);
			if (label === 'soft type') expect(sources.at(-1)).toEqual([1920, 722]);
			const beforeFailure = nativeProfiles.length;
			host.style.width = '6000px'; host.style.height = '3000px';
			for (let frame = 0; frame < 90 && !error; frame++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			expect(error).toContain('Native presentation');
			expect(ready).toBe(false);
			expect(host.querySelector('canvas')!.classList.contains('unavailable')).toBe(true);
			expect(nativeProfiles.length).toBe(beforeFailure);
		} finally { await unmount(component); textures.mockRestore(); media.mockRestore(); dpr.mockRestore(); host.remove(); }
	});

	it('keeps an initially oversized soft-type specimen native instead of creating an 800-pixel substitute', async () => {
		const { host, heading } = specimen(6000, 3000);
		const dpr = vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(1);
		const textures = vi.spyOn(GPUDevice.prototype, 'createTexture');
		let ready = false, error = '';
		const component = mount(SoftType, { target: host, props: { geometry: heading,
			onStatus(status) { ready = status.ready; error = status.error; } } });
		try {
			for (let frame = 0; frame < 90 && !error; frame++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			expect(error).toContain('Native presentation'); expect(ready).toBe(false);
			expect(textures).not.toHaveBeenCalled();
			expect(host.querySelector('canvas')!.classList.contains('unavailable')).toBe(true);
			expect(heading.textContent).toBe('Native');
		} finally { await unmount(component); textures.mockRestore(); dpr.mockRestore(); host.remove(); }
	});
});
