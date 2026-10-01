import { mount, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { LabSession } from './LabSession.js';
import { createFilm, type FilmOptions } from './film.js';
import { createSoftType } from './soft-type.js';
import type { LiquidExperiment } from './types.js';
import SurfaceLayer from './SurfaceLayer.svelte';
import SoftType from './SoftType.svelte';

async function copyState(device: GPUDevice, buffers: GPUBuffer[]) {
	const copies: Uint8Array[] = [];
	for (const buffer of buffers) {
		const readback = device.createBuffer({ size: buffer.size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
		try {
			const encoder = device.createCommandEncoder();
			encoder.copyBufferToBuffer(buffer, 0, readback, 0, buffer.size);
			device.queue.submit([encoder.finish()]);
			await readback.mapAsync(GPUMapMode.READ);
			copies.push(new Uint8Array(readback.getMappedRange()).slice());
		} finally { readback.destroy(); }
	}
	return copies;
}

function profile(width: number, height: number, covered = true) {
	const data = new Uint8Array(width * height * 4);
	for (let i = 0; i < data.length; i += 4) data.set([128, 128, 80, covered ? 255 : 0], i);
	return { width, height, data };
}

async function image(device: GPUDevice, engine: LiquidExperiment) {
	engine.resize(64, 64);
	const target = device.createTexture({ size: [64, 64], format: 'rgba8unorm',
		usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
	const readback = device.createBuffer({ size: 64 * 64 * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
	try {
		const encoder = device.createCommandEncoder();
		engine.render(encoder, target.createView());
		encoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow: 256 }, [64, 64]);
		device.queue.submit([encoder.finish()]); await readback.mapAsync(GPUMapMode.READ);
		return new Uint8Array(readback.getMappedRange()).slice();
	} finally { target.destroy(); readback.destroy(); }
}

describe('DPR-only typography continuity', () => {
	for (const kind of ['enamel', 'soft type'] as const) for(const delayedInitialObserver of [false,true]) it(`preserves a disturbed, paused ${kind} while refreshing its native sources${delayedInitialObserver?' with a delayed initial resize observation':''}`, async () => {
		const host = document.createElement('div');
		host.style.cssText = 'position:relative;width:480.25px;height:190.625px';
		const heading = document.createElement('h1');
		heading.style.cssText = 'margin:0;font:700 100px/1.2 Georgia';
		heading.textContent = 'Native'; host.append(heading); document.body.append(host);
		let ratio = 1, ready = false, error = '';
		let session: LabSession | undefined, gpu: GPUDevice | undefined, engine: LiquidExperiment | undefined;
		let resets = 0, renders = 0, rejectProfile = false;
		let deliverInitial: (()=>void)|undefined;
		const NativeResizeObserver=window.ResizeObserver;
		const resizeObserver=delayedInitialObserver ? vi.spyOn(window,'ResizeObserver').mockImplementation(function(callback:ResizeObserverCallback){
			let first=true;
			return new NativeResizeObserver((entries,observer)=>{
				if(first){first=false;deliverInitial=()=>callback(entries,observer);}
				else callback(entries,observer);
			});
		}) : undefined;
		const stateBuffers: GPUBuffer[] = [], profiles: GPUTexture[] = [], warpSources: GPUTexture[] = [];
		const errors: string[] = [], queries: MediaQueryList[] = [];
		const dpr = vi.spyOn(window, 'devicePixelRatio', 'get').mockImplementation(() => ratio);
		const matchMedia = window.matchMedia.bind(window);
		const media = vi.spyOn(window, 'matchMedia').mockImplementation((source) => {
			const query = matchMedia(source); if (source.startsWith('(resolution:')) queries.push(query); return query;
		});
		const createBuffer = GPUDevice.prototype.createBuffer;
		const buffers = vi.spyOn(GPUDevice.prototype, 'createBuffer').mockImplementation(function(this: GPUDevice, descriptor) {
			const buffer = createBuffer.call(this, descriptor);
			if ((descriptor.usage & (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC)) ===
				(GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC)) stateBuffers.push(buffer);
			return buffer;
		});
		const createTexture = GPUDevice.prototype.createTexture;
		const textures = vi.spyOn(GPUDevice.prototype, 'createTexture').mockImplementation(function(this: GPUDevice, descriptor) {
			if (rejectProfile && descriptor.label === 'Enamel high-resolution rounded relief') throw new Error('Injected native profile allocation failure');
			const texture = createTexture.call(this, descriptor);
			if (descriptor.label === 'Enamel high-resolution rounded relief') profiles.push(texture);
			if (descriptor.label === 'Soft type native material source') warpSources.push(texture);
			return texture;
		});
		const originalLoad = LabSession.prototype.load;
		const loads = vi.spyOn(LabSession.prototype, 'load').mockImplementation(async function(this: LabSession, factory) {
			session = this;
			await originalLoad.call(this, async (device, format) => {
				stateBuffers.length = 0;
				gpu = device;
				device.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
				engine = await factory(device, format);
				const reset = engine.reset.bind(engine), render = engine.render.bind(engine);
				vi.spyOn(engine, 'reset').mockImplementation(() => { resets++; reset(); });
				vi.spyOn(engine, 'render').mockImplementation((encoder, target) => { renders++; render(encoder, target); });
				return engine;
			});
		});
		const onStatus = (status: { ready: boolean; error: string }) => { ready = status.ready; error = status.error; };
		const component = kind === 'enamel'
			? mount(SurfaceLayer, { target: host, props: { geometry: heading, onStatus } })
			: mount(SoftType, { target: host, props: { geometry: heading, onStatus } });
		async function until(condition: () => boolean) {
			for (let frame = 0; frame < 180 && !condition(); frame++) {
				await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
				expect(error).toBe('');
			}
			expect(condition()).toBe(true);
		}
		try {
			await until(() => ready && renders > 0);
			// Use the real session clock, then freeze a measurably disturbed state.
			session!.nudge({ x: 0.2, y: 0.35 });
			await until(() => session!.state.seconds > 0.06);
			session!.pause();
			if(delayedInitialObserver){
				await until(()=>Boolean(deliverInitial));
				const authored=loads.mock.calls.length;
				// Deliver the browser's real first measurement after startup, while
				// the material is already disturbed. Equal layout is not a new specimen.
				deliverInitial!();
				for(let frame=0;frame<5;frame++)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
				expect(loads.mock.calls.length,'A late initial measurement must not rebuild and dispose the live specimen').toBe(authored);
			}
			for (let i = 0; i < 12; i++) {
				const encoder = gpu!.createCommandEncoder();
				engine!.step(encoder, 1 / 120, { x: 0.2, y: 0.35, vx: 0.8, vy: 0.25, active: true, press: 0.7, tilt: 0 });
				gpu!.queue.submit([encoder.finish()]);
			}
			const initial = await engine!.inspect();
			expect(kind === 'enamel' ? initial.details.restError : initial.details.displacementRms).toBeGreaterThan(0);
			const pausedState = await copyState(gpu!, stateBuffers);
			const before = { seconds: session!.state.seconds, resets, loads: loads.mock.calls.length, buffers: stateBuffers.length };
			for (ratio of [2, 3]) {
				const profileCount = profiles.length, renderCount = renders;
				queries.at(-1)!.dispatchEvent(new Event('change'));
				await until(() => ready && profiles.length > profileCount && renders > renderCount);
				const expected = [Math.round(480.25 * ratio), Math.round(190.625 * ratio)];
				expect([profiles.at(-1)!.width, profiles.at(-1)!.height]).toEqual(expected);
				const canvas = host.querySelector('canvas')!;
				expect([canvas.width, canvas.height]).toEqual(expected);
				if (kind === 'soft type') expect([warpSources.at(-1)!.width, warpSources.at(-1)!.height]).toEqual(expected);
				expect(loads.mock.calls.length, 'A monitor change is not a new physical specimen').toBe(before.loads);
				expect(resets, 'Source refresh must bypass SoftType rest() as well as session.load()').toBe(before.resets);
				expect(stateBuffers.length).toBe(before.buffers);
				expect(session!.state.paused).toBe(true);
				expect(session!.state.seconds).toBe(before.seconds);
				expect(await copyState(gpu!, stateBuffers)).toEqual(pausedState);
				expect(await engine!.inspect()).toEqual(initial);
			}
			await gpu!.queue.onSubmittedWorkDone(); expect(errors).toEqual([]);
			// A failed native source must remain a visible fallback, including later
			// session notifications. It must never create a replacement specimen.
			rejectProfile = true; ratio = 2.5;
			queries.at(-1)!.dispatchEvent(new Event('change'));
			for (let frame = 0; frame < 90 && !error; frame++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			expect(error).toContain('Injected native profile allocation failure');
			expect(ready).toBe(false);
			expect(host.querySelector('canvas')!.classList.contains('unavailable')).toBe(true);
			session!.pause(); session!.pause();
			expect(ready, 'A later session notification must not resurrect rejected source output').toBe(false);
			expect(session!.state.paused).toBe(true);
			expect(session!.state.seconds).toBe(before.seconds);
			expect(loads.mock.calls.length).toBe(before.loads);
			expect(await copyState(gpu!, stateBuffers)).toEqual(pausedState);
			// Font/layout changes are still explicit full rebuilds, and may recover.
			rejectProfile = false; document.fonts.dispatchEvent(new Event('loadingdone'));
			for (let frame = 0; frame < 180 && (!ready || loads.mock.calls.length === before.loads); frame++) {
				await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			}
			expect(ready).toBe(true); expect(error).toBe(''); expect(loads.mock.calls.length).toBeGreaterThan(before.loads);
		} finally {
			await unmount(component); loads.mockRestore(); textures.mockRestore(); buffers.mockRestore();
			media.mockRestore(); dpr.mockRestore(); resizeObserver?.mockRestore(); host.remove();
		}
	});

	for (const [label, factory] of [['enamel', createFilm], ['soft type', createSoftType]] as const) {
		it(`rebinds refreshed ${label} optics and preserves physical state`, async () => {
			const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull();
			const device = await adapter!.requestDevice(); device.pushErrorScope('validation');
			const options: FilmOptions = { width: 32, height: 32, initial: new Float32Array(32 * 32).fill(0.3),
				enamel: profile(32, 32), transparent: true };
			const engine = await factory(device, 'rgba8unorm', options);
			try {
				const before = await engine.inspect();
				expect((await image(device, engine)).some((value, i) => i % 4 === 3 && value > 0)).toBe(true);
				const bytes = engine.memoryBytes;
				await engine.updateEnamelProfile(profile(64, 64, false));
				expect(engine.memoryBytes - bytes).toBe((64 * 64 - 32 * 32) * 4);
				expect((await image(device, engine)).every((value) => value === 0), 'Replacement alpha must reach the rendered/warped material, not an unused texture').toBe(true);
				expect(await engine.inspect()).toEqual(before);
				expect(await device.popErrorScope()).toBeNull();
			} finally { engine.dispose(); device.destroy(); }
		});
	}

	it('keeps the latest consecutive refresh, cleans obsolete/disposed candidates, and rejects real validation errors', async () => {
		const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull();
		const device = await adapter!.requestDevice(); device.pushErrorScope('validation');
		const film = await createFilm(device, 'rgba8unorm', { width: 32, height: 32,
			initial: new Float32Array(32 * 32).fill(0.3), enamel: profile(32, 32), transparent: true });
		const created: Array<{ texture: GPUTexture; destroy: ReturnType<typeof vi.spyOn> }> = [];
		let invalidUsage = false;
		const createTexture = device.createTexture.bind(device);
		const textures = vi.spyOn(device, 'createTexture').mockImplementation((descriptor) => {
			if (descriptor.label !== 'Enamel high-resolution rounded relief') return createTexture(descriptor);
			const texture = createTexture(invalidUsage ? { ...descriptor, usage: GPUTextureUsage.COPY_DST } : descriptor);
			created.push({ texture, destroy: vi.spyOn(texture, 'destroy') }); return texture;
		});
		const pop = device.popErrorScope.bind(device);
		let hold = false, release: (() => void) | undefined;
		const scopes = vi.spyOn(device, 'popErrorScope').mockImplementation(() => {
			const result = pop();
			if (!hold) return result;
			hold = false;
			return result.then((error) => new Promise<GPUError | null>((resolve) => { release = () => resolve(error); }));
		});
		async function waitForGate() {
			for (let i = 0; i < 90 && !release; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			expect(release).toBeDefined();
		}
		try {
			const before = await film.inspect(), baseBytes = film.memoryBytes;
			hold = true;
			const stale = film.updateEnamelProfile(profile(64, 64)); await waitForGate();
			await film.updateEnamelProfile(profile(96, 96, false));
			expect(film.memoryBytes - baseBytes).toBe((96 * 96 - 32 * 32) * 4);
			release!(); release = undefined; await stale;
			expect(created[0].destroy).toHaveBeenCalledOnce();
			expect(created[1].destroy).not.toHaveBeenCalled();
			expect((await image(device, film)).every((value) => value === 0)).toBe(true);
			expect(await film.inspect()).toEqual(before);
			invalidUsage = true;
			await expect(film.updateEnamelProfile(profile(128, 128))).rejects.toThrow();
			expect(created[2].destroy).toHaveBeenCalledOnce();
			expect(created[1].destroy).not.toHaveBeenCalled();
			expect(film.memoryBytes - baseBytes).toBe((96 * 96 - 32 * 32) * 4);
			expect((await image(device, film)).every((value) => value === 0)).toBe(true);
			invalidUsage = false; hold = true;
			const abandoned = film.updateEnamelProfile(profile(128, 128)); await waitForGate();
			film.dispose(); release!(); release = undefined; await abandoned;
			expect(created[1].destroy).toHaveBeenCalledOnce();
			expect(created[3].destroy).toHaveBeenCalledOnce();
			expect(await device.popErrorScope()).toBeNull();
		} finally { release?.(); film.dispose(); scopes.mockRestore(); textures.mockRestore(); device.destroy(); }
	});
});
