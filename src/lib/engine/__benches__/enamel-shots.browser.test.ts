/*
 * EnamelText captures for visual review and the kill gate (not a gate itself).
 * Opt in with SVELTE_FLUID_GPU_BENCH=1, SVELTE_FLUID_DPR=<2|3> and
 * SVELTE_FLUID_SHOTS_DIR=/tmp/lane-enamel. Each row is a real page screenshot
 * (DOM + canvas composited by the browser) at that DPR: enamel states, then
 * the static CSS text-shadow and SVG feSpecularLighting bevel baselines.
 */
import { mount, unmount } from 'svelte';
import { commands, page } from 'vitest/browser';
import { it, vi } from 'vitest';
import EnamelText from '../../EnamelText.svelte';

const DIR = import.meta.env.SVELTE_FLUID_SHOTS_DIR || '/tmp/lane-enamel';
const write = (commands as unknown as Record<string, (p: string, c: string) => Promise<void>>).writeBenchBase64;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const frames = (n: number) => new Promise<void>((r) => { const f = () => (n-- <= 0 ? r() : requestAnimationFrame(f)); f(); });

const TONES = {
	light: { page: '#f2f0eb', ink: '#23324f' },
	dark: { page: '#0b0d12', ink: '#d8c39a' }
} as const;
const FONT = '700 96px/1.1 "Helvetica Neue", Helvetica, Arial, sans-serif';

const shots: { label: string; b64: string }[] = [];
async function shoot(el: Element, label: string) {
	await frames(2);
	const b64 = await page.screenshot({ element: el, save: false });
	shots.push({ label, b64 });
	await write(`${DIR}/shots/${label.replace(/[^a-z0-9]+/gi, '-')}-${devicePixelRatio}x.png`, b64);
}

async function sheet(name: string) {
	const images = await Promise.all(
		shots.map(
			(s) =>
				new Promise<HTMLImageElement>((res) => {
					const img = new Image();
					img.onload = () => res(img);
					img.src = `data:image/png;base64,${s.b64}`;
				})
		)
	);
	const pad = 28;
	const w = Math.max(...images.map((i) => i.width));
	const out = document.createElement('canvas');
	out.width = w;
	out.height = images.reduce((s, i) => s + i.height + pad, 0);
	const ctx = out.getContext('2d')!;
	ctx.fillStyle = '#777';
	ctx.fillRect(0, 0, out.width, out.height);
	let y = 0;
	images.forEach((img, k) => {
		ctx.fillStyle = '#fff';
		ctx.font = `${Math.round(pad * 0.6)}px system-ui`;
		ctx.fillText(shots[k].label, 6, y + pad * 0.75);
		ctx.drawImage(img, 0, y + pad);
		y += img.height + pad;
	});
	// Zoom: the left 34% (the pressed "E") of every row at 2×, side by side in pairs.
	const cw = Math.round(images[0].width * 0.34);
	const zoom = document.createElement('canvas');
	zoom.width = cw * 2 * 3;
	zoom.height = Math.ceil(images.length / 3) * (images[0].height * 2 + pad);
	const z = zoom.getContext('2d')!;
	z.fillStyle = '#777';
	z.fillRect(0, 0, zoom.width, zoom.height);
	z.imageSmoothingEnabled = false;
	images.forEach((img, k) => {
		const x = (k % 3) * cw * 2;
		const y = Math.floor(k / 3) * (img.height * 2 + pad);
		z.fillStyle = '#fff';
		z.font = `${Math.round(pad * 0.6)}px system-ui`;
		z.fillText(shots[k].label, x + 4, y + pad * 0.75);
		z.drawImage(img, 0, 0, cw, img.height, x, y + pad, cw * 2, img.height * 2);
	});
	shots.length = 0;
	await write(`${DIR}/${name}.png`, out.toDataURL('image/png').split(',')[1]);
	await write(`${DIR}/${name}-zoom.png`, zoom.toDataURL('image/png').split(',')[1]);
}

function box(tone: keyof typeof TONES) {
	const el = document.createElement('div');
	el.style.cssText = `display:inline-block;padding:20px 28px;background:${TONES[tone].page};color:${TONES[tone].ink};font:${FONT}`;
	document.body.append(el);
	return el;
}

function press(root: HTMLElement, fx: number, fy: number, pressure = 0.5) {
	const r = root.getBoundingClientRect();
	const init = { bubbles: true, clientX: r.left + r.width * fx, clientY: r.top + r.height * fy, pointerId: 7, pointerType: 'mouse', button: 0, pressure };
	root.dispatchEvent(new PointerEvent('pointerdown', init));
	return () => window.dispatchEvent(new PointerEvent('pointerup', init));
}

it('enamel contact sheets', { timeout: 120_000 }, async () => {
	await page.viewport(900, 700);
	const dpr = devicePixelRatio;
	for (const tone of ['light', 'dark'] as const) {
		const host = box(tone);
		const h1 = document.createElement('h1');
		h1.style.cssText = 'margin:0;font:inherit';
		host.append(h1);
		const app = mount(EnamelText, { target: h1, props: { text: 'Enamel' } });
		await document.fonts.ready;
		await sleep(300);
		await shoot(host, `${tone} rest @${dpr}x`);
		const root = h1.querySelector<HTMLElement>('.enamel-text')!;
		const lift = press(root, 0.12, 0.55);
		await sleep(180);
		await shoot(host, `${tone} mid-press (held 180 ms, stem of E)`);
		await sleep(250);
		await shoot(host, `${tone} held 430 ms`);
		lift();
		await sleep(160);
		await shoot(host, `${tone} relaxing (160 ms after release)`);
		await sleep(600);
		await shoot(host, `${tone} relaxing (760 ms)`);
		await sleep(2200);
		await shoot(host, `${tone} settled`);
		unmount(app);
		host.remove();

		// Reduced motion: static relief at rest.
		vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
		const rhost = box(tone);
		const rh1 = document.createElement('h1');
		rh1.style.cssText = 'margin:0;font:inherit';
		rhost.append(rh1);
		const rapp = mount(EnamelText, { target: rh1, props: { text: 'Enamel' } });
		await sleep(300);
		press(rh1.querySelector<HTMLElement>('.enamel-text')!, 0.12, 0.55);
		await sleep(150);
		await shoot(rhost, `${tone} reduced motion (pressed: no dent)`);
		unmount(rapp);
		rhost.remove();
		vi.unstubAllGlobals();

		// Baseline 1: CSS text-shadow bevel, tuned for a soft raised glaze.
		const css = box(tone);
		const light = tone === 'light';
		// Two layers: an outer text-shadow drop and rim, and an inner bevel from a
		// clipped gradient fill over the same glyphs (text-shadow alone is outside-only).
		const shadow = light
			? '0 -1px 0 rgba(255,255,255,.9), 1px 2px 1px rgba(0,0,0,.28), 2px 4px 6px rgba(0,0,0,.22)'
			: '0 -1px 0 rgba(255,255,255,.18), 1px 2px 1px rgba(0,0,0,.7), 2px 4px 8px rgba(0,0,0,.6)';
		const fill = light ? 'linear-gradient(172deg, #4c5f8a 0%, #2b3b5c 42%, #1e2b47 100%)' : 'linear-gradient(172deg, #f6e9cc 0%, #dcc79f 45%, #b49b6b 100%)';
		css.innerHTML = `<h1 style="margin:0;font:inherit;position:relative"><span style="text-shadow:${shadow}">Enamel</span><span aria-hidden="true" style="position:absolute;inset:0;background:${fill};-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:0">Enamel</span></h1>`;
		await shoot(css, `${tone} BASELINE css text-shadow + gradient fill`);
		css.remove();

		// Baseline 2: SVG filter bevel (blurred alpha as height, specular + diffuse lighting).
		const svg = box(tone);
		const id = `bevel-${tone}`;
		svg.innerHTML = `<svg width="0" height="0" style="position:absolute"><filter id="${id}" x="-5%" y="-10%" width="110%" height="130%" color-interpolation-filters="sRGB">
			<feGaussianBlur in="SourceAlpha" stdDeviation="3.2" result="blur"/>
			<feSpecularLighting in="blur" surfaceScale="4" specularConstant="0.9" specularExponent="22" lighting-color="#fff" result="spec"><feDistantLight azimuth="225" elevation="48"/></feSpecularLighting>
			<feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn"/>
			<feDiffuseLighting in="blur" surfaceScale="4" diffuseConstant="1" lighting-color="#fff" result="diff"><feDistantLight azimuth="225" elevation="55"/></feDiffuseLighting>
			<feComposite in="SourceGraphic" in2="diff" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="lit"/>
			<feComposite in="lit" in2="SourceAlpha" operator="in" result="litIn"/>
			<feComposite in="specIn" in2="litIn" operator="arithmetic" k1="0" k2="${light ? 0.45 : 0.55}" k3="1" k4="0"/>
		</filter></svg><h1 style="margin:0;font:inherit;filter:url(#${id})">Enamel</h1>`;
		await shoot(svg, `${tone} BASELINE svg feSpecularLighting bevel`);
		svg.remove();

		await sheet(`sheet-${tone}-${dpr}x`);
	}
});
