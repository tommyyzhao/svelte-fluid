import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MaterialFoil from '../../../MaterialFoil.svelte';
import MaterialEnamel from '../../../MaterialEnamel.svelte';
import MaterialImage from '../../../MaterialImage.svelte';
import { inspectMaterial, materialReservedBytes, MaterialRuntime, type MaterialDriver } from './runtime.js';
import { materialCacheSize } from './cache.js';
import { sharedWebGpuDevicePool } from '../device-pool.js';
import { activeFrameSubscribers } from '../../frame-scheduler.js';

const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => { vi.restoreAllMocks(); for (const fn of cleanup.splice(0).reverse()) await fn(); expect(materialReservedBytes()).toBe(0); });
function host(tag = 'div') {
	const node = document.createElement(tag); node.style.cssText = 'width:240.25px; margin:8px; font:700 42px/1.05 Georgia; color:#88492f;';
	document.body.append(node); cleanup.push(() => node.remove()); return node;
}
function own(component: Parameters<typeof unmount>[0]) { cleanup.push(() => unmount(component)); }
function pointer(target: HTMLElement, x: number, y: number, type = 'pointermove', buttons = 0) {
	const rect = target.getBoundingClientRect(); target.dispatchEvent(new PointerEvent(type, { clientX: rect.left + rect.width * x, clientY: rect.top + rect.height * y, isPrimary: true, pointerId: 1, buttons, bubbles: true }));
}
async function ready(canvas: HTMLCanvasElement) {
	await expect.poll(() => inspectMaterial(canvas)?.state, { timeout: 12000 }).toBe('ready');
	await expect.poll(() => inspectMaterial(canvas)?.active).toBe(false);
	return inspectMaterial(canvas)!;
}
function canvas(node: HTMLElement) { return node.querySelector('canvas')!; }

describe('native material library integration on ordinary WebGPU', () => {
	it('shares device and immutable pipelines; siblings survive unmount and rest has no RAF', async () => {
		const a = host('button'), b = host('button'); a.textContent = 'Appearance '; b.textContent = 'Saved ';
		const first = mount(MaterialFoil, { target: a, props: { selected: false } });
		let firstMounted = true; cleanup.push(async () => { if (firstMounted) await unmount(first); });
		own(mount(MaterialFoil, { target: b, props: { selected: true } }));
		const left = await ready(canvas(a)), right = await ready(canvas(b));
		expect(left.device).toBe(right.device); expect(materialCacheSize(left.device!)).toMatchObject({ modules: 1, render: 1 });
		expect(activeFrameSubscribers()).toBe(0);
		window.dispatchEvent(new PointerEvent('pointerup', { isPrimary: true }));
		await new Promise((resolve) => setTimeout(resolve, 120));
		expect(inspectMaterial(canvas(a))?.frames).toBe(left.frames); expect(inspectMaterial(canvas(b))?.frames).toBe(right.frames);
		const lease = await sharedWebGpuDevicePool.acquire(); expect(lease.device).toBe(left.device); lease.release();
		await unmount(first); firstMounted = false;
		pointer(b, .45, .3); await expect.poll(() => inspectMaterial(canvas(b))?.frames).toBeGreaterThan(right.frames);
		await ready(canvas(b)); expect(inspectMaterial(canvas(b))?.device).toBe(right.device);
	});
	it('keeps native text and wrapping while rebuilding at fractional CSS × actual 3× DPR', async () => {
		const original = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
		Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 });
		cleanup.push(() => { if (original) Object.defineProperty(window, 'devicePixelRatio', original); else Reflect.deleteProperty(window, 'devicePixelRatio'); });
		const target = host('h1'); target.style.direction = 'rtl';
		const component = mount(MaterialEnamel, { target, props: { text: 'Made to\nbe felt.' } }); own(component);
		let state = await ready(canvas(target)), rect = canvas(target).getBoundingClientRect();
		expect(state.width).toBe(Math.round(rect.width * 3)); expect(state.height).toBe(Math.round(rect.height * 3));
		expect(target.textContent?.trim()).toBe('Made to\nbe felt.'); expect(canvas(target).getAttribute('aria-hidden')).toBe('true');
		target.style.width = '170.5px';
		await expect.poll(() => canvas(target).width, { timeout: 12000 }).toBe(512);
		state = await ready(canvas(target)); rect = canvas(target).getBoundingClientRect(); expect(state.height).toBe(Math.round(rect.height * 3));
		expect(rect.height).toBeGreaterThan(70);
		const allocate = vi.spyOn(state.device!, 'createTexture');
		target.style.color = '#cc8866';
		await new Promise((resolve) => setTimeout(resolve, 150)); await ready(canvas(target));
		expect(allocate).not.toHaveBeenCalled();
	});
	it('carries sparse slow pointer gestures into an image wake, then sleeps', async () => {
		const original = document.createElement('canvas'); original.width = 128; original.height = 80;
		const context = original.getContext('2d')!; context.fillStyle = '#389'; context.fillRect(0, 0, 128, 80);
		const target = host('a'); target.setAttribute('href', '#image-target');
		own(mount(MaterialImage, { target, props: { src: original.toDataURL(), alt: 'A test photograph', width: 128, height: 80 } }));
		const initial = await ready(canvas(target));
		pointer(target, .2, .5); await new Promise((r) => setTimeout(r, 120));
		pointer(target, .5, .5); await new Promise((r) => setTimeout(r, 120));
		expect(inspectMaterial(canvas(target))?.active).toBe(true);
		expect(inspectMaterial(canvas(target))!.frames).toBeGreaterThan(initial.frames + 2);
		pointer(target, .8, .5, 'pointerleave');
		await expect.poll(() => inspectMaterial(canvas(target))?.active, { timeout: 6000 }).toBe(false);
		expect(target.querySelector('img')?.alt).toBe('A test photograph'); expect(target.getAttribute('href')).toBe('#image-target');
	});
	it('reports an allocation failure locally and retries without losing a healthy sibling', async () => {
		const anchor = host('button'); own(mount(MaterialFoil, { target: anchor, props: { selected: false } }));
		const healthy = await ready(canvas(anchor));
		const spy = vi.spyOn(healthy.device!, 'createBuffer').mockImplementationOnce(() => { throw new Error('Injected material allocation failure'); });
		const target = host('button'); const component = mount(MaterialFoil, { target, props: { selected: true } }); own(component);
		await expect.poll(() => inspectMaterial(canvas(target))?.state).toBe('unavailable'); spy.mockRestore();
		expect(inspectMaterial(canvas(anchor))?.state).toBe('ready'); expect(inspectMaterial(canvas(target))?.bytes).toBe(0);
		expect(target.querySelector('svg')?.classList.contains('covered')).toBe(false);
		component.retry(); const restored = await ready(canvas(target)); expect(restored.device).toBe(healthy.device);
	});
	it('keeps an ordinary image and an explicit status when the GPU asset fetch fails', async () => {
		const target = host(); own(mount(MaterialImage, { target, props: { src: '/intentionally-missing-material-image.png', alt: 'Original art', width: 300, height: 200 } }));
		await expect.poll(() => inspectMaterial(canvas(target))?.state, { timeout: 12000 }).toBe('unavailable');
		expect(target.querySelector('img')?.alt).toBe('Original art'); expect(target.textContent).toContain('Image unavailable');
		expect(inspectMaterial(canvas(target))?.bytes).toBe(0);
	});
	it('contains a late frame validation error and preserves the actual GPUError message', async () => {
		const target = host('button'); own(mount(MaterialFoil, { target, props: { selected: false } }));
		const healthy = await ready(canvas(target)), output = document.createElement('canvas'), surface = host();
		output.style.cssText = 'width:100px;height:60px;'; surface.append(output);
		let reason = '';
		const runtime = new MaterialRuntime(output, surface, async (lease) => {
			const buffer = lease.device.createBuffer({ size: 4, usage: GPUBufferUsage.UNIFORM });
			return { active: false, async layout() {}, step() {}, quiet() {}, dispose() { buffer.destroy(); },
				render(encoder, view) {
					// Intentionally invalid: no COPY_DST. Must remain inside this frame's scope.
					lease.device.queue.writeBuffer(buffer, 0, new Uint32Array([1]));
					const pass = encoder.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store' }] }); pass.end();
				} };
		}, (status) => { reason = status.reason ?? ''; }); cleanup.push(() => runtime.dispose());
		await expect.poll(() => inspectMaterial(output)?.state).toBe('unavailable');
		expect(reason).toMatch(/copy_?dst/i); expect(inspectMaterial(output)?.bytes).toBe(0);
		expect(inspectMaterial(canvas(target))?.device).toBe(healthy.device); expect(inspectMaterial(canvas(target))?.state).toBe('ready');
	});
	it('does not let a throwing consumer status callback poison the shared device', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {}), target = host('button');
		own(mount(MaterialFoil, { target, props: { selected: false, onStatus: () => { throw new Error('Consumer callback'); } } }));
		await ready(canvas(target)); expect(warn).toHaveBeenCalled();
	});
	it('rejects over-budget native targets instead of silently reducing resolution', async () => {
		const target = host(); target.style.cssText = 'width:20000px;height:20000px;';
		own(mount(MaterialEnamel, { target, props: { text: 'Oversized' } }));
		await expect.poll(() => inspectMaterial(canvas(target))?.state).toBe('unavailable');
		expect(target.textContent?.trim()).toBe('Oversized'); expect(materialReservedBytes()).toBe(0);
	});
	it('a cancelled startup cannot reserve memory or invalidate a newer retry', async () => {
		const target = host(), output = document.createElement('canvas'); output.style.cssText = 'width:100px;height:60px;'; target.append(output);
		let unblock!: () => void, launches = 0, staleReservationRejected = false;
		const gate = new Promise<void>((resolve) => { unblock = resolve; });
		const runtime = new MaterialRuntime(output, target, async (lease, _size, reserve) => {
			const number = ++launches;
			if (number === 1) { await gate; try { reserve(123); } catch { staleReservationRejected = true; } }
			else reserve(0);
			const driver: MaterialDriver = { active: false, async layout() {}, step() {}, quiet() {}, dispose() {}, render(encoder, view) { const pass = encoder.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] }); pass.end(); } };
			return driver;
		}, () => {}); cleanup.push(() => runtime.dispose());
		await expect.poll(() => launches).toBe(1); runtime.retry(); await ready(output);
		const before = materialReservedBytes(); unblock(); await expect.poll(() => staleReservationRejected).toBe(true);
		expect(materialReservedBytes()).toBe(before); expect(inspectMaterial(output)?.state).toBe('ready');
	});
});
