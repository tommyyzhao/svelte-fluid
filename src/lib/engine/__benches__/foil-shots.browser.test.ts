/*
 * FoilSwitch captures and GPU cost (visual review and measurement, not gates).
 * Shots: SVELTE_FLUID_SHOTS_DIR=/tmp/lane-foil SVELTE_FLUID_DPR=<2|3>.
 * GPU: SVELTE_FLUID_GPU_BENCH_OUT=/tmp/lane-foil/foil-gpu.json (ADR-0089 method:
 * busy frames bracketed by a 1-px readback; wall time per frame bounds GPU time).
 */
import { mount, unmount, createRawSnippet, flushSync } from 'svelte';
import { commands, page } from 'vitest/browser';
import { it, vi } from 'vitest';
import FoilSwitch from '../../FoilSwitch.svelte';
import { activeFrameSubscribers } from '../frame-scheduler.js';
import { acquireGlHost } from '../gl-host.js';
import { FoilEngine } from '../foil/FoilEngine.js';
import { FOIL_LOOKS, hexToRgb } from '../foil/look.js';

const DIR = import.meta.env.SVELTE_FLUID_SHOTS_DIR;
const GPU_OUT = import.meta.env.SVELTE_FLUID_GPU_BENCH_OUT;
const cmd = commands as unknown as Record<string, (p: string, c: string) => Promise<void>>;
const frames = (n: number) => new Promise<void>((r) => { const f = () => (n-- <= 0 ? r() : requestAnimationFrame(f)); f(); });
const idle = () => vi.waitFor(() => { if (activeFrameSubscribers()) throw new Error('busy'); }, { timeout: 4000 });

async function grab(el: HTMLElement): Promise<HTMLImageElement> {
	const base64 = await page.screenshot({ element: el, save: false });
	const img = new Image();
	img.src = `data:image/png;base64,${base64}`;
	await img.decode();
	return img;
}

it.skipIf(!DIR)('foil switch contact sheets', { timeout: 120_000 }, async () => {
	const dpr = devicePixelRatio;
	const shots: [string, HTMLImageElement][] = [];
	for (const tone of ['light', 'dark'] as const) {
		const host = document.createElement('div');
		// The R&D library header: muted Arial label beside the spring.
		host.style.cssText = `display:inline-block;padding:12px;background:${FOIL_LOOKS[tone].page};color:${tone === 'dark' ? '#a5a99b' : '#676960'};font:0.8rem Arial,Helvetica,sans-serif`;
		document.body.append(host);
		const children = createRawSnippet(() => ({ render: () => `<span>${tone === 'dark' ? 'Dark' : 'Light'}</span>` }));
		const app = mount(FoilSwitch, { target: host, props: { tone, children } });
		const button = host.querySelector('button')!;
		await idle();
		await frames(2);
		shots.push([`${tone} off-rest`, await grab(host)]);
		// Mid-snap at a fixed 50 ms of model time: a standalone engine in the same box,
		// since a screenshot of the live switch takes longer than the snap.
		const box = button.querySelector('canvas')!.getBoundingClientRect();
		const mid = document.createElement('canvas');
		mid.style.cssText = `position:fixed;left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;background:${FOIL_LOOKS[tone].page}`;
		document.body.append(mid);
		const still = new FoilEngine({ canvas: mid, config: { page: hexToRgb(FOIL_LOOKS[tone].page) } });
		still.resize(box.width, box.height, dpr);
		await still.advance(1);
		still.setConfig({ checked: true });
		await still.advance(3);
		// Freeze: the presented bitmap stays on the canvas after dispose.
		still.dispose();
		shots.push([`${tone} mid-snap 50ms`, await grab(host)]);
		mid.remove();
		button.click();
		flushSync();
		await idle();
		await frames(2);
		shots.push([`${tone} on-rest`, await grab(host)]);
		const r = button.querySelector('canvas')!.getBoundingClientRect();
		button.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, isPrimary: true, pointerType: 'mouse', clientX: r.right - 18, clientY: r.top + r.height * 0.8 }));
		await idle();
		await frames(2);
		shots.push([`${tone} on-hover`, await grab(host)]);
		button.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true, isPrimary: true, pointerType: 'mouse' }));
		button.focus({ focusVisible: true } as FocusOptions);
		await idle();
		await frames(2);
		shots.push([`${tone} on-focus`, await grab(host)]);
		button.blur();
		unmount(app);
		vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduced-motion'), media: query, addEventListener() {}, removeEventListener() {} }));
		const reduced = mount(FoilSwitch, { target: host, props: { tone, children } });
		await idle();
		host.querySelector('button')!.click();
		flushSync();
		await frames(3);
		shots.push([`${tone} reduced (1 frame after click)`, await grab(host)]);
		unmount(reduced);
		vi.unstubAllGlobals();
		host.remove();
	}
	const w = Math.max(...shots.map(([, i]) => i.width));
	const h = Math.max(...shots.map(([, i]) => i.height));
	const caption = 18 * dpr;
	const sheet = document.createElement('canvas');
	sheet.width = w * 6;
	sheet.height = (h + caption) * 2;
	const ctx = sheet.getContext('2d')!;
	ctx.fillStyle = '#888';
	ctx.fillRect(0, 0, sheet.width, sheet.height);
	ctx.font = `${11 * dpr}px system-ui`;
	shots.forEach(([name, img], i) => {
		const x = (i % 6) * w;
		const y = Math.floor(i / 6) * (h + caption);
		ctx.fillStyle = '#000';
		ctx.fillText(name, x + 4, y + caption - 5 * dpr);
		ctx.drawImage(img, x, y + caption);
	});
	await cmd.writeBenchBase64(`${DIR}/foil-sheet-${dpr}x.png`, sheet.toDataURL('image/png').split(',')[1]);
});

it.skipIf(!GPU_OUT)('foil GPU per instance (synced batches)', { timeout: 120_000 }, async () => {
	const rows: Record<string, unknown>[] = [];
	for (const [w, h] of [[96, 48], [192, 96]]) {
		const canvas = document.createElement('canvas');
		document.body.append(canvas);
		const e = new FoilEngine({ canvas });
		e.resize(w, h, devicePixelRatio);
		const gl = acquireGlHost(e).gl;
		const px = new Uint8Array(4);
		const drain = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
		e.busyFrames(120);
		drain();
		const per: number[] = [];
		for (let b = 0; b < 15; b++) {
			const t0 = performance.now();
			e.busyFrames(60);
			drain();
			per.push((performance.now() - t0) / 60);
		}
		per.sort((a, b) => a - b);
		rows.push({ css: `${w}x${h}`, dpr: devicePixelRatio, canvas: `${canvas.width}x${canvas.height}`, medianMs: per[per.length >> 1], worstBatchMs: per[per.length - 1] });
		e.dispose();
		canvas.remove();
	}
	await cmd.writeBenchJson(GPU_OUT, JSON.stringify(rows, null, 2));
});
