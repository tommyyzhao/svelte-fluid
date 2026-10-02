/*
 * Liquid-control captures for visual review (not a gate). Opt in with
 * SVELTE_FLUID_GPU_BENCH=1 and SVELTE_FLUID_SHOTS_DIR=/tmp/lane-surface.
 * Each PNG is the control on its page colour at native DPR.
 */
import { mount, unmount, flushSync, createRawSnippet } from 'svelte';
import { commands } from 'vitest/browser';
import { it } from 'vitest';
import LiquidButton from '../../LiquidButton.svelte';
import LiquidSegmented from '../../LiquidSegmented.svelte';
import { LOOKS } from '../surface/look.js';

const DIR = import.meta.env.SVELTE_FLUID_SHOTS_DIR || '/tmp/lane-surface';
const write = (commands as unknown as Record<string, (p: string, c: string) => Promise<void>>).writeBenchJson;
const frames = (n: number) => new Promise<void>((r) => { const f = () => (n-- <= 0 ? r() : requestAnimationFrame(f)); f(); });

async function shoot(host: HTMLElement, name: string) {
	await frames(2);
	const dpr = devicePixelRatio;
	const box = host.getBoundingClientRect();
	const out = document.createElement('canvas');
	out.width = Math.round(box.width * dpr);
	out.height = Math.round(box.height * dpr);
	const ctx = out.getContext('2d')!;
	ctx.fillStyle = getComputedStyle(host).backgroundColor;
	ctx.fillRect(0, 0, out.width, out.height);
	for (const c of host.querySelectorAll('canvas')) {
		const r = c.getBoundingClientRect();
		if (getComputedStyle(c).display !== 'none') ctx.drawImage(c, (r.left - box.left) * dpr, (r.top - box.top) * dpr, r.width * dpr, r.height * dpr);
	}
	// DOM label text on top (the canvas cannot see it).
	for (const el of host.querySelectorAll<HTMLElement>('.label, label span')) {
		const r = el.getBoundingClientRect();
		const cs = getComputedStyle(el);
		ctx.font = `${cs.fontWeight} ${parseFloat(cs.fontSize) * dpr}px ${cs.fontFamily}`;
		ctx.fillStyle = cs.color;
		ctx.textBaseline = 'middle';
		ctx.fillText(el.textContent ?? '', (r.left - box.left) * dpr, (r.top - box.top + r.height / 2) * dpr);
	}
	await write(`${DIR}/${name}.png.b64`, out.toDataURL('image/png').split(',')[1]);
	sheet.push(out);
}

const sheet: HTMLCanvasElement[] = [];
async function flushSheet(name: string) {
	const w = Math.max(...sheet.map((c) => c.width));
	const out = document.createElement('canvas');
	out.width = w * 2;
	out.height = Math.ceil(sheet.length / 2) * sheet[0].height;
	const ctx = out.getContext('2d')!;
	sheet.forEach((c, i) => ctx.drawImage(c, (i % 2) * w, Math.floor(i / 2) * c.height));
	sheet.length = 0;
	await write(`${DIR}/sheet-${name}.png.b64`, out.toDataURL('image/png').split(',')[1]);
}

it('liquid control captures', { timeout: 120_000 }, async () => {
	for (const tone of ['light', 'dark'] as const) {
		const host = document.createElement('div');
		host.style.cssText = `padding:14px;display:inline-block;background:${LOOKS.button[tone].page};font:16px system-ui;color:${tone === 'dark' ? '#e9edf4' : '#1a1c21'}`;
		document.body.append(host);
		const children = createRawSnippet(() => ({ render: () => '<span>Save changes</span>' }));
		const app = mount(LiquidButton, { target: host, props: { tone, children, style: 'width:220px;height:56px;font-size:17px' } });
		await frames(3);
		await shoot(host, `${tone}-button-rest`);
		const btn = host.querySelector('button')!;
		const r = btn.getBoundingClientRect();
		btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + r.width * 0.3, clientY: r.top + r.height * 0.45, pointerType: 'mouse', button: 0 }));
		for (const [ms, label] of [[60, 'press-1-impulse'], [180, 'press-2-spread'], [400, 'press-3-interference'], [1500, 'press-4-settled']] as const) {
			await new Promise((res) => setTimeout(res, ms));
			await shoot(host, `${tone}-button-${label}`);
		}
		btn.focus({ focusVisible: true } as FocusOptions);
		await new Promise((res) => setTimeout(res, 200));
		await shoot(host, `${tone}-button-focus`);
		unmount(app);
		await flushSheet(`${tone}-button`);

		const seg = document.createElement('div');
		host.replaceChildren(seg);
		const sapp = mount(LiquidSegmented, {
			target: seg,
			props: { value: 'day', name: `range-${tone}`, legend: 'Range', tone, options: [{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }] }
		});
		await frames(3);
		await shoot(host, `${tone}-segmented-rest`);
		seg.querySelectorAll('input')[2].click();
		flushSync();
		for (const [ms, label] of [[60, 'change-1'], [150, 'change-2-spread'], [300, 'change-3'], [1200, 'change-4-settled']] as const) {
			await new Promise((res) => setTimeout(res, ms));
			await shoot(host, `${tone}-segmented-${label}`);
		}
		host.querySelector<HTMLInputElement>('input:checked')!.focus({ focusVisible: true } as FocusOptions);
		await new Promise((res) => setTimeout(res, 200));
		await shoot(host, `${tone}-segmented-focus`);
		unmount(sapp);
		await flushSheet(`${tone}-segmented`);
		host.remove();
	}
});
