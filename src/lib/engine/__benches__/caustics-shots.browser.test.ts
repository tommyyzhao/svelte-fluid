/*
 * LiquidCaustics captures for visual review (not a gate; ADR-0094).
 * Opt in with SVELTE_FLUID_GPU_BENCH=1 and SVELTE_FLUID_SHOTS_DIR=/tmp/lane-dropzone.
 * Rows: rest (clean), pointer ripple at 0.2/0.6/1.2 s, focus ripple, settled
 * (clean), reduced; light | dark.
 */
import { createRawSnippet, mount, unmount } from 'svelte';
import { it, vi } from 'vitest';
import LiquidCaustics from '../../LiquidCaustics.svelte';
import { LOOKS } from '../surface/look.js';
import { flushSheet, frames, shoot, wait } from './surface-shots.js';

const PROSE =
	'Water is the oldest interface. You touch it and it answers, immediately and locally, then it forgets. A ripple carries the news of the touch outward and fades; a surface that kept trembling would be broken. That is the brief for liquid in a UI: feedback that is honest about where you acted.';

function block(tone: 'light' | 'dark') {
	const host = document.createElement('div');
	host.style.cssText = `padding:30px;display:inline-block;background:${LOOKS.button[tone].page};font:17px/1.6 system-ui;color:${tone === 'dark' ? '#e9edf4' : '#1a1c21'}`;
	document.body.append(host);
	const children = createRawSnippet(() => ({
		render: () => `<div style="padding:28px 36px"><p style="margin:0">${PROSE}</p><p style="margin:1.2em 0 0"><a href="#x" style="color:inherit">A link to focus</a></p></div>`
	}));
	const app = mount(LiquidCaustics, { target: host, props: { tone, children, style: 'width:720px;height:400px;box-sizing:border-box;border-radius:16px' } });
	return { host, app };
}

it('caustics captures', { timeout: 180_000 }, async () => {
	const shots: Record<string, HTMLCanvasElement[]> = {};
	for (const tone of ['light', 'dark'] as const) {
		const out: HTMLCanvasElement[] = (shots[tone] = []);
		const { host, app } = block(tone);
		await frames(4);
		await wait(300);
		await shoot(host, `${tone}-caustics-rest`, out);
		const root = host.querySelector('.liquid-caustics')!;
		const b = root.getBoundingClientRect();
		// One short stroke: a handful of admitted ripples close together.
		const t0 = performance.now();
		for (let i = 0; i < 4; i++) {
			root.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: b.left + 430 + i * 14, clientY: b.top + 250 }));
			await wait(65);
		}
		for (const at of [200, 600, 1200]) {
			await wait(Math.max(0, at - (performance.now() - t0)));
			await shoot(host, `${tone}-caustics-pointer-${at}ms`, out);
		}
		await wait(1500);
		host.querySelector('a')!.focus({ focusVisible: true } as FocusOptions);
		await wait(300);
		await shoot(host, `${tone}-caustics-focus`, out);
		await wait(2500);
		await shoot(host, `${tone}-caustics-settled`, out);
		unmount(app);
		host.remove();
	}
	vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
	for (const tone of ['light', 'dark'] as const) {
		const { host, app } = block(tone);
		await frames(6);
		await shoot(host, `${tone}-caustics-reduced`, shots[tone]);
		unmount(app);
		host.remove();
	}
	vi.unstubAllGlobals();
	const sheet: HTMLCanvasElement[] = [];
	shots.light.forEach((c, i) => sheet.push(c, shots.dark[i]));
	await flushSheet('caustics', sheet, 2);
});
