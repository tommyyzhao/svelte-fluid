import { afterEach, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import { createRawSnippet } from 'svelte';
import { commands, page, userEvent } from 'vitest/browser';
import LiquidToggle from '../../LiquidToggle.svelte';
import { LOOKS, hexContrast } from '../surface/look.js';
import { acquireGlHost, releaseGlHost } from '../gl-host.js';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose(); });
function setup(props: Record<string, unknown> = {}) {
	const target = document.createElement('form');
	target.style.cssText = 'display:inline-block;padding:24px;background:#f2f0eb;color:#1a1c21;font:16px Arial';
	document.body.append(target);
	const app = mount(LiquidToggle, { target, props: { children: createRawSnippet(() => ({ render: () => '<span>Notifications</span>' })), ...props } });
	cleanup.push(async () => { await unmount(app); target.remove(); });
	return { target, input: target.querySelector('input')!, root: target.querySelector('label')!, canvas: target.querySelector('canvas')! };
}
it('native checkbox label, Space, name/value, reset, disabled and isolated consumers', async () => {
	const change = vi.fn(() => { throw new Error('consumer'); });
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	try {
		const { target, input, root } = setup({ name: 'notify', value: 'yes', onchange: change });
		await userEvent.click(input);
		expect(input.checked).toBe(true);
		expect(new FormData(target).get('notify')).toBe('yes');
		expect(change).toHaveBeenCalledWith(true);
		input.focus();
		await userEvent.keyboard(' ');
		expect(input.checked).toBe(false);
		expect(new FormData(target).has('notify')).toBe(false);
		await userEvent.click(input);
		target.reset();
		await vi.waitFor(() => expect(input.checked).toBe(false));
		await vi.waitFor(() => expect(root.querySelector('.end')!.classList.contains('selected')).toBe(true));
		input.disabled = true;
		input.click();
		expect(input.checked).toBe(false);
		expect(input.getAttribute('role')).toBe('switch');
	} finally { warn.mockRestore(); }
});
it('checked initial reset and fractional native backing', async () => {
	const { target, input, root, canvas } = setup({ checked: true });
	await vi.waitFor(() => expect(root.classList.contains('live')).toBe(true));
	input.click();
	expect(input.checked).toBe(false);
	target.reset();
	await vi.waitFor(() => expect(input.checked).toBe(true));
	canvas.style.width = '96.375px'; canvas.style.height = '48.625px';
	await vi.waitFor(() => {
		expect(canvas.width).toBe(Math.floor(96.375 * devicePixelRatio));
		expect(canvas.height).toBe(Math.floor(48.625 * devicePixelRatio));
	});
	canvas.style.transform = 'scale(1.5)';
	await new Promise((r) => requestAnimationFrame(r));
	expect(canvas.width).toBe(Math.floor(96.375 * devicePixelRatio));
});
it('reference text/focus contrast; intended-size light/dark states and keyboard focus captures', async () => {
	const dir = import.meta.env.SVELTE_FLUID_SHOTS_DIR || '/tmp/liquid-toggle';
	const write = (commands as unknown as Record<string, (p: string, c: string) => Promise<void>>).writeBenchBase64;
	for (const tone of ['light', 'dark'] as const) {
		const look = LOOKS.segmented[tone];
		expect(hexContrast(look.ring, look.page)).toBeGreaterThanOrEqual(3);
		expect(hexContrast(look.text, look.page)).toBeGreaterThanOrEqual(4.5);
		const { target, input, root } = setup({ tone });
		target.style.background = look.page; target.style.color = look.text;
		await vi.waitFor(() => expect(root.classList.contains('live')).toBe(true));
		for (const checked of [false, true]) {
			if (input.checked !== checked) { input.focus(); await userEvent.keyboard(' '); }
			await new Promise((r) => setTimeout(r, 800));
			input.blur();
			if (dir) await write(`${dir}/toggle-${tone}-${checked ? 'on' : 'off'}-${devicePixelRatio}x.png`, await page.screenshot({ element: target, save: false }));
		}
		input.focus(); await userEvent.keyboard('[Tab][ShiftLeft>][Tab][/ShiftLeft]');
		if (dir) await write(`${dir}/toggle-${tone}-focus-${devicePixelRatio}x.png`, await page.screenshot({ element: target, save: false }));
	}
});

it('reduced motion retains both selected endpoints; context loss keeps native state', async () => {
	vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('prefers-reduced-motion'), media: q, addEventListener() {}, removeEventListener() {} }));
	try {
		const { input, root, canvas } = setup({ checked: true });
		await vi.waitFor(() => expect(root.classList.contains('live')).toBe(true));
		expect(root.querySelectorAll('.selected')[0].textContent).toBe('On');
		input.click();
		await vi.waitFor(() => expect(root.querySelectorAll('.selected')[0].textContent).toBe('Off'));
		const probe = { canvas: document.createElement('canvas') };
		const host = acquireGlHost(probe);
		try {
			const lose = host.gl.getExtension('WEBGL_lose_context')!;
			const surface = host.gl.canvas;
			const lost = new Promise((r) => surface.addEventListener('webglcontextlost', r, { once: true }));
			lose.loseContext(); await lost;
			await vi.waitFor(() => expect(root.classList.contains('live')).toBe(false));
			input.click(); expect(input.checked).toBe(true);
			await vi.waitFor(() => expect(root.querySelectorAll('.selected')[0].textContent).toBe('On'));
			const restored = new Promise((r) => surface.addEventListener('webglcontextrestored', r, { once: true }));
			lose.restoreContext(); await restored;
			await vi.waitFor(() => expect(root.classList.contains('live')).toBe(true));
			expect(canvas.width).toBeGreaterThan(0);
		} finally { releaseGlHost(probe); }
	} finally { vi.unstubAllGlobals(); }
});
it('unavailable WebGL keeps a functional native input and visible checked endpoint', async () => {
	const html = HTMLCanvasElement.prototype.getContext;
	const offscreen = OffscreenCanvas.prototype.getContext;
	const blocked = function(this: HTMLCanvasElement, kind: string, ...args: unknown[]) { return kind.includes('webgl') ? null : Reflect.apply(html, this, [kind, ...args]); };
	const a = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(blocked as typeof html);
	const b = vi.spyOn(OffscreenCanvas.prototype, 'getContext').mockImplementation(function(this: OffscreenCanvas, kind, ...args) { return String(kind).includes('webgl') ? null : Reflect.apply(offscreen, this, [kind, ...args]); } as typeof offscreen);
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	try {
		const { input, root } = setup();
		await new Promise((r) => requestAnimationFrame(r));
		expect(root.classList.contains('live')).toBe(false);
		input.click();
		expect(input.checked).toBe(true);
		await vi.waitFor(() => expect(root.querySelector('.end.selected')!.textContent).toBe('On'));
	} finally { a.mockRestore(); b.mockRestore(); warn.mockRestore(); }
});

it('forced colours show the plain native checkbox; reduced motion shows the checked liquid still', async () => {
	const emulate = (commands as unknown as Record<string, (m: { forcedColors?: 'active' | 'none'; reducedMotion?: 'reduce' | 'no-preference' }) => Promise<void>>).emulateControlMedia;
	const write = (commands as unknown as Record<string, (p: string, c: string) => Promise<void>>).writeBenchBase64;
	const dir = import.meta.env.SVELTE_FLUID_SHOTS_DIR || '/tmp/liquid-toggle';
	try {
		await emulate({ forcedColors: 'active' });
		const { input, root, target } = setup({ checked: true });
		await new Promise((r) => requestAnimationFrame(r));
		expect(getComputedStyle(input).opacity).toBe('1');
		expect(getComputedStyle(root.querySelector('.track')!).display).toBe('none');
		await userEvent.click(input); expect(input.checked).toBe(false);
		await write(`${dir}/toggle-forced-colors-${devicePixelRatio}x.png`, await page.screenshot({ element: target, save: false }));
		await emulate({ forcedColors: 'none', reducedMotion: 'reduce' });
		await userEvent.click(input); expect(input.checked).toBe(true);
		input.blur();
		await new Promise((r) => requestAnimationFrame(r));
		await write(`${dir}/toggle-reduced-on-${devicePixelRatio}x.png`, await page.screenshot({ element: target, save: false }));
	} finally { await emulate({ forcedColors: 'none', reducedMotion: 'no-preference' }); }
});
