/*
 * Shared capture helpers for the liquid-surface visual-review benches.
 */
import { commands } from 'vitest/browser';

export const DIR = import.meta.env.SVELTE_FLUID_SHOTS_DIR || '/tmp/lane-dropzone';
const write = (commands as unknown as Record<string, (p: string, c: string) => Promise<void>>).writeBenchBase64;
export const frames = (n: number) =>
	new Promise<void>((r) => {
		const f = () => (n-- <= 0 ? r() : requestAnimationFrame(f));
		f();
	});
export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Composite page, DOM text and canvases (screen blend for the dark overlay) into one PNG. */
export async function shoot(host: HTMLElement, name: string, sheet: HTMLCanvasElement[]) {
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
			// Element content (a link, a snippet): draw at the text's own laid-out box.
			const r = range.getBoundingClientRect();
			ctx.textBaseline = 'middle';
			ctx.fillText(el.textContent?.trim() ?? '', (r.left - box.left) * dpr, (r.top - box.top + r.height / 2) * dpr);
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

export async function flushSheet(name: string, sheet: HTMLCanvasElement[], cols = 2) {
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

