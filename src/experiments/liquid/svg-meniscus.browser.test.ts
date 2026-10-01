import { mount, unmount } from 'svelte';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SvgMeniscus from './SvgMeniscus.svelte';
import Route from '../../routes/lab/interfaces/meniscus-svg/+page.svelte';
import { meniscusTarget } from './magnetic-meniscus-model.js';
import { svgMeniscusGeometry } from './svg-meniscus-geometry.js';

afterEach(() => vi.restoreAllMocks());
const frames = async (count = 3) => { for (let i = 0; i < count; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); };
const button = (host: HTMLElement, label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === label)!;

async function fixture(reduced = false, route = false) {
	let ratio = 2;
	vi.spyOn(window, 'devicePixelRatio', 'get').mockImplementation(() => ratio);
	const media = window.matchMedia.bind(window), queries: MediaQueryList[] = [];
	vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
		const result = media(query); if (query.includes('prefers-reduced-motion')) Object.defineProperty(result, 'matches', { value: reduced });
		if (query.startsWith('(resolution:')) queries.push(result); return result;
	});
	const adapter = navigator.gpu ? vi.spyOn(navigator.gpu, 'requestAdapter').mockRejectedValue(new Error('The SVG comparator must never request WebGPU.')) : undefined;
	const host = document.createElement('div'); host.style.width = '640.375px'; document.body.append(host);
	const specimen = route ? undefined : mount(SvgMeniscus, { target: host });
	const component = specimen ?? mount(Route, { target: host });
	const section = host.querySelector<HTMLElement>('[data-renderer=svg]')!, aperture = host.querySelector<HTMLElement>('.aperture')!;
	aperture.scrollIntoView({ block: 'center' });
	try { await vi.waitFor(() => expect(section.dataset.ready).toBe('true')); await frames(4); }
	catch (error) { await unmount(component); host.remove(); throw error; }
	return { host, section, aperture, adapter,
		inspect: () => { if (!specimen) throw new Error('The route fixture exposes its DOM, not a model inspector.'); return specimen.inspect(); },
		path: () => host.querySelector('.radial-rim')?.getAttribute('d'),
		setDpr(value: number) { ratio = value; queries.at(-1)!.dispatchEvent(new Event('change')); },
		move(x: number, y: number) { const r = aperture.getBoundingClientRect(); aperture.dispatchEvent(new PointerEvent('pointermove', { isPrimary: true, clientX: r.left + r.width * x, clientY: r.top + r.height * y })); },
		async dispose() { if (adapter) expect(adapter).not.toHaveBeenCalled(); await unmount(component); host.remove(); }
	};
}

describe('matched native SVG meniscus, without WebGPU authority', () => {
	it('actual page visibly changes the clip and annulus on the first native and pointer gestures', async () => {
		const f = await fixture(false, true);
		try {
			const circle = f.path(); expect(circle).toBeTruthy(); expect(f.host.querySelector('canvas')).toBeNull();
			await userEvent.click(button(f.host, 'Magnet at right')); await frames(3);
			expect(f.path()).not.toBe(circle); expect(f.section.dataset.sleeping).toBe('false');
			await vi.waitFor(() => expect(f.section.dataset.sleeping).toBe('true'), { timeout: 3000 });
			const svg = f.host.querySelector('svg')!, [, , width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number);
			const exact = svgMeniscusGeometry(meniscusTarget(.32 * width / Math.min(width, height), 0, 1), width, height);
			expect(f.path()).toBe(exact.ring); expect(f.host.querySelector('clipPath path')?.getAttribute('d')).toBe(exact.clip);
			const photo = f.host.querySelector('img')!; expect(getComputedStyle(photo).objectFit).toBe('cover'); expect(getComputedStyle(photo).clipPath).toContain('-clip');
			f.aperture.scrollIntoView({ block: 'center' }); await frames(); f.move(.32, .2); await frames(4); expect(f.path()).not.toBe(exact.ring);
			f.aperture.dispatchEvent(new PointerEvent('pointerleave')); await vi.waitFor(() => expect(f.section.dataset.sleeping).toBe('true'), { timeout: 3000 }); expect(f.path()).toBe(circle);
		} finally { await f.dispose(); }
	});
	it('preserves the exact current boundary across 2x/3x output and stops all own settled work', async () => {
		const f = await fixture();
		try {
			await userEvent.click(button(f.host, 'Magnet above left')); await vi.waitFor(() => expect(f.section.dataset.sleeping).toBe('true'), { timeout: 3000 });
			const before = f.inspect(); f.setDpr(3); await frames(); const after = f.inspect(), rect = f.aperture.getBoundingClientRect();
			expect([after.width, after.height]).toEqual([Math.round(rect.width * 3), Math.round(rect.height * 3)]);
			expect(after.modes).toEqual(before.modes); expect(after.steps).toBe(before.steps); expect(after.segments).toBeGreaterThan(before.segments); expect(after.errorBound).toBeLessThan(.2);
			const idle = f.inspect(); await frames(12); expect(f.inspect()).toEqual(idle);
			const native = f.host.querySelector<HTMLInputElement>('input[type=range]')!; native.focus(); await userEvent.keyboard('{ArrowRight}'); await frames();
			expect(native.value).toBe('1.05');
		} finally { await f.dispose(); }
	});
	it('reduced motion uses native still endpoints, ignores hover, and baseline does no hidden path work', async () => {
		const f = await fixture(true);
		try {
			await userEvent.click(button(f.host, 'Magnet at right')); await frames(); const endpoint = f.inspect();
			expect(endpoint.modes).toEqual(endpoint.target); expect(endpoint.modes.some((value) => value !== 0)).toBe(true); expect(endpoint.steps).toBe(0);
			f.move(.32, .2); await frames(); expect(f.inspect()).toEqual(endpoint);
			await userEvent.click(f.host.querySelector('input[type=checkbox]')!); await frames(); const still = f.inspect();
			expect(f.host.querySelector('svg')).toBeNull(); expect(f.aperture.classList.contains('plain')).toBe(true); expect(button(f.host, 'Magnet at right').disabled).toBe(true);
			await frames(12); expect(f.inspect()).toEqual(still);
			await userEvent.click(f.host.querySelector('input[type=checkbox]')!); await frames(); expect(f.inspect().modes).toEqual(endpoint.modes); expect(f.inspect().steps).toBe(0);
		} finally { await f.dispose(); }
	});
	it('interruptions release transient hover but preserve native commands, including hidden still endpoints', async () => {
		const f = await fixture();
		try {
			await userEvent.click(button(f.host, 'Magnet at right')); await vi.waitFor(() => expect(f.section.dataset.sleeping).toBe('true'), { timeout: 3000 }); const preset = f.inspect();
			window.dispatchEvent(new Event('blur')); await frames(); expect(f.inspect().modes).toEqual(preset.modes); window.dispatchEvent(new Event('focus'));
			f.move(.32, .2); await frames(4); expect(f.inspect().pointerOwned).toBe(true);
			let hidden = true; vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden); document.dispatchEvent(new Event('visibilitychange')); await frames();
			expect(f.inspect().modes.every((value) => value === 0)).toBe(true); expect(f.inspect().pointerOwned).toBe(false);
			button(f.host, 'Magnet above left').click(); await frames(); const still = f.inspect(); expect(still.modes).toEqual(still.target); expect(still.requested.active).toBe(true);
			hidden = false; document.dispatchEvent(new Event('visibilitychange')); await frames(10); expect(f.inspect()).toEqual(still);
		} finally { await f.dispose(); }
	});
	it('shows an explicit native-sizing fallback and recovers without silently lowering DPR', async () => {
		const f = await fixture(true);
		try {
			f.setDpr(0); await frames(); expect(f.section.dataset.ready).toBe('false'); expect(f.host.querySelector('[role=status]')?.textContent).toContain('positive native SVG size');
			expect(f.aperture.classList.contains('plain')).toBe(true); expect(button(f.host, 'Magnet at right').disabled).toBe(true);
			f.setDpr(3); await frames(); expect(f.section.dataset.ready).toBe('true'); expect(f.host.querySelector('[role=status]')).toBeNull();
			const rect = f.aperture.getBoundingClientRect(); expect(f.inspect().width).toBe(Math.round(rect.width * 3));
		} finally { await f.dispose(); }
	});
});
