/*
 * Drop-zone captures for visual review (not a gate; ADR-0094).
 * Opt in with SVELTE_FLUID_GPU_BENCH=1 and SVELTE_FLUID_SHOTS_DIR=/tmp/lane-dropzone.
 * Each PNG is the component on its page colour at native DPR.
 */
import { mount, unmount } from 'svelte';
import { it } from 'vitest';
import LiquidDropZone from '../../LiquidDropZone.svelte';
import { LOOKS } from '../surface/look.js';
import { flushSheet, frames, shoot, wait } from './surface-shots.js';

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
