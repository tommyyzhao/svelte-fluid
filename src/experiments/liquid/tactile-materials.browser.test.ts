import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import { createTactileMaterial, type TactileMaterial } from './tactile-materials.js';
import TactileMaterials from './TactileMaterials.svelte';
import { LabSession } from './LabSession.js';

let device: GPUDevice;
beforeAll(async () => { const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull(); device = await adapter!.requestDevice(); });
beforeEach(() => device.pushErrorScope('validation'));
afterEach(async () => { vi.restoreAllMocks(); await device.queue.onSubmittedWorkDone(); expect(await device.popErrorScope()).toBeNull(); });
afterAll(() => device.destroy());
const idle = { x: 0.5, y: 0.5, vx: 0, vy: 0, active: false, tilt: 0 };
function advance(model: TactileMaterial, count: number) {
	for (let i = 0; i < count; i++) { const encoder = device.createCommandEncoder(); model.step(encoder, 1 / 120, idle); device.queue.submit([encoder.finish()]); }
}
const frames = async (count = 3) => { for (let i = 0; i < count; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); };

describe('tactile material ownership', () => {
	it('preserves a native foil commitment through hover, interrupted reversal, resize and interruption', async () => {
		const foil = await createTactileMaterial(device, 'rgba8unorm', 'foil');
		try {
			foil.resize(801, 641); foil.move(0.8, 0.05); advance(foil, 120);
			const hovered = await foil.inspect(); expect(hovered.details.selected).toBe(0); expect(hovered.details.amplitude).toBeGreaterThan(0.8);
			foil.commit(true); const committed = await foil.inspect(); expect(committed.details.selected).toBe(1); expect(committed.details.amplitude).toBe(hovered.details.amplitude);
			advance(foil, 18); const moving = await foil.inspect(); foil.commit(false);
			expect((await foil.inspect()).details.velocity).toBe(moving.details.velocity);
			advance(foil, 7); foil.commit(true); foil.leave(); advance(foil, 400);
			const settled = await foil.inspect(); expect(settled.details.amplitude).toBeCloseTo(-1, 7); expect(settled.details.actuated).toBe(0);
			foil.resize(1202, 962); expect((await foil.inspect()).details.amplitude).toBe(settled.details.amplitude); expect(foil.memoryBytes).toBe(32);
			foil.commit(false); advance(foil, 4); foil.interrupt(); const paused = await foil.inspect();
			expect(paused.details.selected).toBe(0); expect(paused.details.amplitude).toBe(1); expect(paused.kinetic).toBe(0);
		} finally { foil.dispose(); }
	});

	it('uses the fast response only for animated commitments, with immediate reduced-motion samples', async () => {
		const foil = await createTactileMaterial(device, 'rgba8unorm', 'foil');
		try {
			foil.resize(801, 641); foil.commit(true);
			advance(foil, 10); const crossed = await foil.inspect();
			expect(crossed.details.amplitude).toBeLessThan(0);
			expect(crossed.details.responseRate).toBe(8);
			expect(crossed.kinetic).toBeCloseTo(crossed.details.velocity ** 2 / 128, 10);
			advance(foil, 17); const captured = await foil.inspect();
			expect(captured.details.amplitude).toBe(-1); expect(captured.details.actuated).toBe(0);
			foil.commit(false); advance(foil, 4);
			foil.commit(true, true); const still = await foil.inspect();
			expect(still.details.amplitude).toBe(-1); expect(still.details.velocity).toBe(0);
			expect(still.details.actuated).toBe(0);
			foil.commit(false); advance(foil, 4); foil.interrupt();
			expect((await foil.inspect()).details.amplitude).toBe(1);
			expect((await foil.inspect()).details.velocity).toBe(0);
		} finally { foil.dispose(); }
	});

	it('holds a tap and rotates the load frame while leaving native-resize state intact', async () => {
		const glass = await createTactileMaterial(device, 'rgba8unorm', 'glass');
		try {
			glass.resize(801, 641); glass.move(0.8, 0.2); glass.press(true); glass.press(false); glass.pulse();
			advance(glass, 1); const press = await glass.inspect(); expect(press.details.pressure).toBeGreaterThan(0.9); expect(press.details.orientation).toBeGreaterThan(0.5);
			glass.resize(1202, 962); expect((await glass.inspect()).details.pressure).toBe(press.details.pressure); expect((await glass.inspect()).details.orientation).toBe(press.details.orientation);
			glass.leave(); advance(glass, 180); expect((await glass.inspect()).details.pressure).toBe(0);
			glass.press(true); glass.pulse(); glass.interrupt(); const cancelled = await glass.inspect();
			expect(cancelled.details.pressure).toBe(0); expect(cancelled.details.held).toBe(0); expect(cancelled.details.pulseRemaining).toBe(0);
		} finally { glass.dispose(); }
	});

	it('gives CSS baseline hover and committed semantics without hidden GPU submissions', async () => {
		let model: TactileMaterial | undefined, submissions = 0, nativeDevice: GPUDevice | undefined;
		const load = LabSession.prototype.load;
		vi.spyOn(LabSession.prototype, 'load').mockImplementation(async function (this: LabSession, factory) {
			await load.call(this, async (gpu, format) => {
				nativeDevice = gpu; const submit = gpu.queue.submit.bind(gpu.queue);
				vi.spyOn(gpu.queue, 'submit').mockImplementation((commands) => { submissions++; submit(commands); });
				model = await factory(gpu, format) as TactileMaterial; return model;
			});
		});
		const host = document.createElement('div'); host.style.cssText = 'width:480.375px;height:380.625px'; document.body.append(host);
		const component = mount(TactileMaterials, { target: host, props: { kind: 'foil', baseline: true } });
		try {
			await vi.waitFor(() => expect(host.querySelector('.material')?.getAttribute('data-ready')).toBe('true'), { timeout: 10000 });
			await frames(5); const before = submissions;
			const button = host.querySelector('button')!, rect = button.getBoundingClientRect();
			button.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, isPrimary: true, clientX: rect.left + 80, clientY: rect.top + 90 }));
			button.click(); await frames(5);
			expect(host.querySelector('.tactile')?.classList.contains('hovered')).toBe(true);
			expect(button.getAttribute('aria-pressed')).toBe('true'); expect(submissions).toBe(before);
			expect((await model!.inspect()).details.selected).toBe(0); // Hidden physics does not consume baseline clicks.
		} finally { await nativeDevice?.queue.onSubmittedWorkDone(); await unmount(component); host.remove(); }
	});

	it('keeps the foil native action usable when WebGPU is unavailable', async () => {
		vi.spyOn(navigator.gpu, 'requestAdapter').mockResolvedValue(null);
		const host = document.createElement('div'); host.style.height = '300px'; document.body.append(host);
		const component = mount(TactileMaterials, { target: host, props: { kind: 'foil' } });
		try {
			await vi.waitFor(() => expect(host.querySelector('.status')?.textContent).toContain('No WebGPU adapter'));
			const button = host.querySelector('button')!; expect(button.disabled).toBe(false); button.click(); await frames();
			expect(button.getAttribute('aria-pressed')).toBe('true'); expect(host.querySelector('.caption')?.textContent).toContain('Committed: inverted');
		} finally { await unmount(component); host.remove(); }
	});
});
