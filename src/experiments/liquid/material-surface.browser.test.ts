import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import MaterialSurface from './MaterialSurface.svelte';
import type { LiquidExperiment } from './types.js';

afterEach(() => vi.restoreAllMocks());

async function fixture(options: { decorative?: boolean; oninterrupt?: () => void } = {}) {
	const host = document.createElement('div');
	host.style.cssText = 'width:320.375px;height:280.625px';
	document.body.append(host);
	const counts = { steps: 0, renders: 0, resets: 0, disposals: 0, history: 0 };
	const phases: Array<number | 'end'> = [];
	const errors: string[] = [];
	let gpu: GPUDevice | undefined;
	const factory = async (device: GPUDevice): Promise<LiquidExperiment> => {
		gpu = device;
		device.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
		return {
			memoryBytes: 0,
			resize() {},
			reset() { counts.resets++; counts.history = 0; },
			endInput() { phases.push('end'); },
			step(_encoder, _dt, input) { counts.steps++; if (input.active) { counts.history++; phases.push(input.x); } },
			render(encoder, target) {
				counts.renders++;
				encoder.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0.2, 0.1, 0.05, 1] }] }).end();
			},
			async inspect() { return { finite: true, mass: 0, initialMass: 0, min: 0, max: 0, kinetic: 0, details: { history: counts.history } }; },
			dispose() { counts.disposals++; }
		};
	};
	const component = mount(MaterialSurface, { target: host, props: { factory, label: 'Persistent material test', settleMs: 120, ...options } });
	await vi.waitFor(() => {
		expect(host.querySelector('.status')?.textContent).not.toContain('unavailable');
		expect(counts.renders).toBeGreaterThan(0);
	}, { timeout: 10000 });
	return { host, component, counts, phases, errors, async dispose() {
		await gpu?.queue.onSubmittedWorkDone();
		await unmount(component); host.remove();
	} };
}

const frames = async (count = 5) => {
	for (let i = 0; i < count; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
};

describe('persistent material surface lifecycle', () => {
	it('interrupts external loads on forced pause, not ordinary pointer release', async () => {
		const interrupt = vi.fn();
		const f = await fixture({ decorative: true, oninterrupt: interrupt });
		try {
			const root = f.host.querySelector('.material')!;
			expect(root.getAttribute('aria-hidden')).toBe('true');
			expect(root.hasAttribute('role')).toBe(false);
			interrupt.mockClear();
			root.dispatchEvent(new PointerEvent('pointerleave', { isPrimary: true }));
			expect(interrupt).not.toHaveBeenCalled();
			const before = f.counts.renders;
			window.dispatchEvent(new Event('blur'));
			expect(interrupt).toHaveBeenCalledTimes(1);
			await vi.waitFor(() => expect(f.counts.renders).toBe(before + 1));
			await frames();
			expect(f.counts.renders).toBe(before + 1);
			expect(root.getAttribute('data-sleeping')).toBe('true');
			f.component.demo();
			await vi.waitFor(() => expect(f.counts.steps).toBeGreaterThan(0));
			f.component.suspend();
			expect(interrupt).toHaveBeenCalledTimes(2);
			await frames();
			expect(root.getAttribute('data-sleeping')).toBe('true');
			const frozen = { ...f.counts };
			await frames();
			expect(f.counts).toEqual(frozen);
			expect(f.errors).toEqual([]);
		} finally { await f.dispose(); }
		expect(interrupt).toHaveBeenCalledTimes(3);
		expect(f.counts.disposals).toBe(1);
	});

	it('still releases resources when an external interruption callback throws', async () => {
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const f = await fixture({ oninterrupt() { throw new Error('consumer interruption failure'); } });
		try {
			window.dispatchEvent(new Event('blur'));
			expect(warning).toHaveBeenCalled();
			expect(f.errors).toEqual([]);
		} finally { await f.dispose(); }
		expect(f.counts.disposals).toBe(1);
	});

	it('consumes the final between-frame movement before ending brush continuity', async () => {
		const f = await fixture();
		try {
			const root = f.host.querySelector('.material')!, rect = root.getBoundingClientRect();
			root.dispatchEvent(new PointerEvent('pointermove', { isPrimary: true, clientX: rect.left + rect.width * 0.25, clientY: rect.top + 100 }));
			await vi.waitFor(() => expect(f.counts.history).toBeGreaterThan(0));
			const before = f.phases.length;
			root.dispatchEvent(new PointerEvent('pointermove', { isPrimary: true, clientX: rect.left + rect.width * 0.75, clientY: rect.top + 100 }));
			root.dispatchEvent(new PointerEvent('pointerleave', { isPrimary: true }));
			await vi.waitFor(() => expect(f.phases.slice(before)).toContain('end'));
			const release = f.phases.slice(before);
			expect(release[0]).toBeCloseTo(0.75);
			expect(release.indexOf('end')).toBeGreaterThan(0);
			expect(f.counts.resets).toBe(0);
			expect(f.errors).toEqual([]);
		} finally { await f.dispose(); }
	});

	it('sleeps without erasing history, stops GPU work, and refreshes a still specimen once', async () => {
		const f = await fixture();
		try {
			const root = f.host.querySelector('.material')!;
			expect(f.counts.steps).toBe(0);
			expect(f.counts.resets).toBe(0);
			const rect = root.getBoundingClientRect();
			root.dispatchEvent(new PointerEvent('pointermove', { isPrimary: true, clientX: rect.left + 100, clientY: rect.top + 120 }));
			await vi.waitFor(() => expect(f.counts.history).toBeGreaterThan(0));
			await vi.waitFor(() => expect(root.getAttribute('data-sleeping')).toBe('true'));
			await frames();
			const frozen = { ...f.counts };
			await frames(8);
			expect(f.counts).toEqual(frozen);
			f.component.refresh();
			await vi.waitFor(() => expect(f.counts.renders).toBe(frozen.renders + 1));
			expect(f.counts.history).toBe(frozen.history);
			expect(f.counts.steps).toBe(frozen.steps);
			await frames();
			expect(f.counts.renders).toBe(frozen.renders + 1);
			f.component.reset();
			await vi.waitFor(() => expect(f.counts.renders).toBe(frozen.renders + 2));
			expect(f.counts.resets).toBe(1); expect(f.counts.history).toBe(0);
			expect(f.errors).toEqual([]);
		} finally { await f.dispose(); }
		expect(f.counts.disposals).toBe(1);
	});

	it('keeps native fractional pixels and still refresh controls under reduced motion', async () => {
		vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3);
		const real = window.matchMedia.bind(window);
		vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
			const result = real(query);
			if (query.includes('prefers-reduced-motion')) Object.defineProperty(result, 'matches', { value: true });
			return result;
		});
		const f = await fixture();
		try {
			const canvas = f.host.querySelector('canvas')!;
			const bounds = canvas.getBoundingClientRect();
			expect([canvas.width, canvas.height]).toEqual([Math.round(bounds.width * 3), Math.round(bounds.height * 3)]);
			expect(f.host.querySelector('.material')?.getAttribute('data-reduced')).toBe('true');
			expect(f.component.wake()).toBe(false);
			f.component.demo();
			await frames();
			expect(f.counts.steps).toBe(0);
			const before = f.counts.renders;
			f.component.refresh();
			await vi.waitFor(() => expect(f.counts.renders).toBe(before + 1));
			expect(f.counts.steps).toBe(0);
			expect(f.errors).toEqual([]);
		} finally { await f.dispose(); }
	});

	it('shows explicit fallback when no ordinary WebGPU adapter is available', async () => {
		vi.spyOn(navigator.gpu, 'requestAdapter').mockResolvedValue(null);
		const host = document.createElement('div'); document.body.append(host);
		const factory = vi.fn();
		const component = mount(MaterialSurface, { target: host, props: { factory, label: 'Unavailable material' } });
		try {
			await vi.waitFor(() => expect(host.querySelector('[role=status]')?.textContent).toContain('No WebGPU adapter'));
			expect(factory).not.toHaveBeenCalled();
			expect(component.wake()).toBe(false);
			expect(host.querySelector('canvas')?.classList.contains('unavailable')).toBe(true);
		} finally { await unmount(component); host.remove(); }
	});
});
