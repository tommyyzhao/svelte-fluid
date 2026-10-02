/*
 * Drop-zone captures for visual review (not a gate; ADR-0094).
 * Opt in with SVELTE_FLUID_GPU_BENCH=1 and SVELTE_FLUID_SHOTS_DIR=/tmp/lane-dropzone.
 * Each PNG is the component on its page colour at native DPR.
 */
import { mount, unmount } from 'svelte';
import { commands } from 'vitest/browser';
import { it } from 'vitest';
import LiquidDropZone from '../../LiquidDropZone.svelte';
import { LOOKS } from '../surface/look.js';

const DIR = import.meta.env.SVELTE_FLUID_SHOTS_DIR || '/tmp/lane-dropzone';
const write = (commands as unknown as Record<string, (p: string, c: string) => Promise<void>>).writeBenchBase64;
const frames = (n: number) =>
	new Promise<void>((r) => {
		const f = () => (n-- <= 0 ? r() : requestAnimationFrame(f));
		f();
	});
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Composite page, DOM text and canvases (screen blend for the dark overlay) into one PNG. */
async function shoot(host: HTMLElement, name: string, sheet: HTMLCanvasElement[]) {
	await frames(2);
	const dpr = devicePixelRatio;
	const box = host.getBoundingClientRect();
	const out = document.createElement('canvas');
	out.width = Math.round(box.width * dpr);
	out.height = Math.round(box.height * dpr);
	const ctx = out.getContext('2d')!;
	ctx.fillStyle = getComputedStyle(host).backgroundColor;
	ctx.fillRect(0, 0, out.width, out.height);
	const draw = (c: HTMLCanvasElement) => {
		const r = c.getBoundingClientRect();
		const cs = getComputedStyle(c);
		if (cs.display === 'none') return;
		ctx.globalCompositeOperation = cs.mixBlendMode === 'screen' ? 'screen' : 'source-over';
		ctx.drawImage(c, (r.left - box.left) * dpr, (r.top - box.top) * dpr, r.width * dpr, r.height * dpr);
		ctx.globalCompositeOperation = 'source-over';
	};
	const canvases = [...host.querySelectorAll('canvas')];
	const under = canvases.filter((c) => !c.closest('.liquid-caustics'));
	under.forEach(draw);
	for (const el of host.querySelectorAll<HTMLElement>('.text, p')) {
		const cs = getComputedStyle(el);
		ctx.font = `${cs.fontWeight} ${parseFloat(cs.fontSize) * dpr}px ${cs.fontFamily}`;
		ctx.fillStyle = cs.color;
		ctx.textBaseline = 'alphabetic';
		// Each rendered line: use a Range over the text node's client rects.
		const range = document.createRange();
		range.selectNodeContents(el);
		const words = (el.textContent ?? '').trim().split(/\s+/);
		let line = '';
		let top = -1;
		const flush = (y: number, x: number) => line && ctx.fillText(line.trim(), x, y);
		const node = el.firstChild ?? el;
		if (node.nodeType !== 3) {
			const r = el.getBoundingClientRect();
			ctx.textBaseline = 'middle';
			ctx.textAlign = 'center';
			ctx.fillText(el.textContent?.trim() ?? '', (r.left - box.left + r.width / 2) * dpr, (r.top - box.top + r.height / 2) * dpr);
			ctx.textAlign = 'left';
			continue;
		}
		let x0 = 0;
		let y0 = 0;
		let offset = (node.textContent ?? '').indexOf(words[0]);
		for (const w of words) {
			const start = (node.textContent ?? '').indexOf(w, offset);
			offset = start + w.length;
			range.setStart(node, start);
			range.setEnd(node, offset);
			const r = range.getBoundingClientRect();
			if (Math.round(r.top) !== top) {
				flush(y0, x0);
				line = '';
				top = Math.round(r.top);
				x0 = (r.left - box.left) * dpr;
				y0 = (r.bottom - box.top - r.height * 0.25) * dpr;
			}
			line += w + ' ';
		}
		flush(y0, x0);
	}
	canvases.filter((c) => c.closest('.liquid-caustics')).forEach(draw);
	await write(`${DIR}/${name}.png`, out.toDataURL('image/png').split(',')[1]);
	sheet.push(out);
}

async function flushSheet(name: string, sheet: HTMLCanvasElement[], cols = 2) {
	const w = Math.max(...sheet.map((c) => c.width));
	const h = Math.max(...sheet.map((c) => c.height));
	const out = document.createElement('canvas');
	out.width = w * cols;
	out.height = Math.ceil(sheet.length / cols) * h;
	const ctx = out.getContext('2d')!;
	sheet.forEach((c, i) => ctx.drawImage(c, (i % cols) * w, Math.floor(i / cols) * h));
	sheet.length = 0;
	await write(`${DIR}/sheet-${name}.png`, out.toDataURL('image/png').split(',')[1]);
}

function dragEvent(type: string, x: number, y: number, files: File[] = []) {
	const dt = new DataTransfer();
	for (const f of files) dt.items.add(f);
	return new DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt });
}

it('drop zone captures', { timeout: 180_000 }, async () => {
	const sheet: HTMLCanvasElement[] = [];
	for (const tone of ['light', 'dark'] as const) {
		const page = LOOKS.button[tone].page;
		const host = document.createElement('div');
		host.style.cssText = `padding:40px 60px;display:inline-block;background:${page};font:16px system-ui;color:${tone === 'dark' ? '#e9edf4' : '#1a1c21'}`;
		document.body.append(host);
		const app = mount(LiquidDropZone, { target: host, props: { tone, multiple: true, label: 'Drop files here or choose', style: 'width:480px;height:200px;box-sizing:border-box' } });
		await frames(4);
		await shoot(host, `${tone}-dropzone-rest`, sheet);
		const zone = host.querySelector('label')!;
		const r = zone.getBoundingClientRect();
		const file = new File(['x'], 'a.txt', { type: 'text/plain' });
		for (const [side, x] of [
			['left', r.left - 24],
			['right', r.right - 30]
		] as const) {
			const y = r.top + r.height * 0.4;
			zone.dispatchEvent(dragEvent('dragenter', x, y, [file]));
			for (let i = 0; i < 20; i++) {
				window.dispatchEvent(dragEvent('dragover', x, y, [file]));
				await frames(1);
			}
			await wait(250);
			await shoot(host, `${tone}-dropzone-drag-near-${side}`, sheet);
		}
		const dx = r.left + r.width * 0.62;
		const dy = r.top + r.height * 0.55;
		zone.dispatchEvent(dragEvent('drop', dx, dy, [file, file]));
		window.dispatchEvent(dragEvent('drop', dx, dy));
		await wait(140);
		await shoot(host, `${tone}-dropzone-drop-ripple`, sheet);
		await wait(2000);
		await shoot(host, `${tone}-dropzone-settled`, sheet);
		host.querySelector('input')!.focus({ focusVisible: true } as FocusOptions);
		await wait(200);
		await shoot(host, `${tone}-dropzone-focus`, sheet);
		unmount(app);
		host.remove();
	}
	await flushSheet('dropzone', sheet, 2);
});
