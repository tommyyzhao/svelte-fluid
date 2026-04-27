#!/usr/bin/env bun
/*
 * One-shot hero recording: drives system Chrome via puppeteer-core,
 * captures /hero at exact 1280×640, encodes via ffmpeg → webp.
 *
 * Usage: bun scripts/capture-hero.mjs
 * Requires: dev server on http://localhost:5173, ffmpeg in PATH.
 */

import puppeteer from 'puppeteer-core';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const URL = 'http://localhost:5173/hero';
const WIDTH = 1280;
const HEIGHT = 640;
const WARMUP_MS = 2500;
const RECORD_MS = 4000;
const FPS_HINT = 24; // every 1000/24 ≈ 42ms
const CHROME =
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const framesDir = resolve('/tmp/hero-frames');
const outWebp = resolve('static/hero.webp');

await rm(framesDir, { recursive: true, force: true });
await mkdir(framesDir, { recursive: true });

const browser = await puppeteer.launch({
	executablePath: CHROME,
	headless: 'new',
	defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
	args: [
		`--window-size=${WIDTH},${HEIGHT}`,
		'--hide-scrollbars',
		'--disable-features=IsolateOrigins,site-per-process'
	]
});

const page = await browser.newPage();
await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });

console.log(`→ navigating to ${URL}`);
await page.goto(URL, { waitUntil: 'networkidle0' });
console.log(`→ warming up ${WARMUP_MS}ms`);
await new Promise((r) => setTimeout(r, WARMUP_MS));

console.log(`→ capturing for ${RECORD_MS}ms (~${FPS_HINT} fps target)`);
const start = Date.now();
const frames = [];
let i = 0;
while (Date.now() - start < RECORD_MS) {
	const t = Date.now();
	const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
	const idx = String(i++).padStart(4, '0');
	const path = `${framesDir}/frame-${idx}.jpg`;
	await writeFile(path, buf);
	frames.push(path);
	const elapsed = Date.now() - t;
	const sleep = Math.max(0, 1000 / FPS_HINT - elapsed);
	if (sleep > 0) await new Promise((r) => setTimeout(r, sleep));
}
const dur = (Date.now() - start) / 1000;
const fps = (frames.length / dur).toFixed(1);
console.log(`→ captured ${frames.length} frames in ${dur.toFixed(2)}s (${fps} fps)`);

await browser.close();

// Use actual capture rate, not the target — we drifted to ~17 fps.
const frameDurationMs = Math.round((dur * 1000) / frames.length);
console.log(`→ encoding ${outWebp} (frame duration ${frameDurationMs}ms)`);
// img2webp defaults to lossless — must explicitly opt into lossy.
const ff = spawnSync(
	'img2webp',
	[
		'-loop',
		'0',
		'-lossy',
		'-q',
		'55',
		'-d',
		String(frameDurationMs),
		'-m',
		'6',
		...frames,
		'-o',
		outWebp
	],
	{ stdio: 'inherit' }
);
if (ff.status !== 0) {
	console.error('img2webp failed');
	process.exit(1);
}

console.log(`✓ ${outWebp}`);
