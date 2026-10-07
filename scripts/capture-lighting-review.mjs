#!/usr/bin/env bun
// Run under the GPU lock, with this worktree's dev server on port 5198.
import puppeteer from 'puppeteer-core';
import { resolve } from 'node:path';
import { readdir, stat, writeFile } from 'node:fs/promises';

const browser = await puppeteer.launch({
	executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	headless: true,
	defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
	args: ['--hide-scrollbars']
});
const rows = [];
try {
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	await page.goto('http://127.0.0.1:5198/dv2-capture', { waitUntil: 'networkidle0' });
	await page.setContent('<!doctype html><html><head></head><body></body></html>');
	const presets = await page.evaluate(async () => {
		const { PRESETS } = await import('/src/lib/presets/registry.ts');
		return PRESETS.filter((preset) => preset.config.shading === true).map((preset) => preset.id);
	});
	for (const id of presets) {
		const state = await page.evaluate(async (id) => {
			const componentModule = await (await fetch('/src/lib/Fluid.svelte')).text();
			const svelteUrl = componentModule.match(/from "([^\"]*svelte\.js[^\"]*)"/)[1];
			const { mount, unmount } = await import(svelteUrl);
			const { default: Fluid } = await import('/src/lib/Fluid.svelte');
			const { PRESETS } = await import('/src/lib/presets/registry.ts');
			if (window.reviewApp) await unmount(window.reviewApp);
			document.body.replaceChildren();
			document.body.style.cssText = 'margin:0;width:1440px;height:900px;overflow:hidden;background:#000';
			const target = document.createElement('div');
			target.style.cssText = 'width:1440px;height:900px;position:relative';
			document.body.append(target);
			let ready;
			const started = new Promise((resolve) => { ready = resolve; });
			const failures = [];
			window.reviewApp = mount(Fluid, { target, props: {
				...PRESETS.find((preset) => preset.id === id).config,
				seed: 5, pointerInput: false, autoPause: false,
				onReady: ready, onError: (error) => failures.push(String(error))
			} });
			await Promise.race([started, new Promise((_, reject) => setTimeout(() => reject(new Error('ready timeout')), 15000))]);
			await new Promise((resolve) => setTimeout(resolve, 5000));
			window.reviewApp.handle.pause();
			await new Promise((resolve) => requestAnimationFrame(resolve));
			const canvas = target.querySelector('canvas');
			if (failures.length || !canvas || target.querySelector('.svelte-fluid-fallback')) throw new Error(JSON.stringify(failures));
			if (canvas.width !== 2880 || canvas.height !== 1800 || devicePixelRatio !== 2) throw new Error('non-native capture');
			const gl = canvas.getContext('webgl2');
			const debug = gl?.getExtension('WEBGL_debug_renderer_info');
			const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null;
			if (!renderer || /swiftshader|llvmpipe|software/i.test(renderer)) throw new Error(`not hardware: ${renderer}`);
			return { id, seed: 5, css: [1440, 900], backing: [canvas.width, canvas.height], dpr: devicePixelRatio, renderer, elapsedSeconds: 5, failures };
		}, id);
		await page.screenshot({ path: resolve(`dev-docs/benchmarks/owner-review/lighting/${id}.jpg`), type: 'jpeg', quality: 80 });
		rows.push(state);
	}
	if (errors.length) throw new Error(errors.join('\n'));
	await writeFile(resolve('dev-docs/benchmarks/owner-review/lighting/manifest.json'), JSON.stringify({ chrome: await browser.version(), source: '1006e8f (unchanged library)', timing: 'five seconds wall time after onReady, not fixed-step parity', rows, errors }, null, 2) + '\n');
} finally {
	await browser.close();
}
const directory = resolve('dev-docs/benchmarks/owner-review/lighting');
const sizes = await Promise.all((await readdir(directory)).map(async (name) => (await stat(resolve(directory, name))).size));
if (sizes.reduce((total, size) => total + size, 0) >= 4_000_000) throw new Error('review packet exceeds 4 MB');
