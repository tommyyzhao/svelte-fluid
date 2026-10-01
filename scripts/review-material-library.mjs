// Run against `bun run dev`: bun scripts/review-material-library.mjs
// Ordinary hardware Chrome; generated review images stay outside the repository.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = process.env.MATERIAL_REVIEW_ORIGIN ?? 'http://127.0.0.1:5173';
const artifacts = await mkdtemp(join(tmpdir(), 'material-library-review-'));
console.log(`Review images: ${artifacts}`);
const browser = await chromium.launch({ executablePath: process.env.VITEST_CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const failures = [], evidence = {}; let currentPage;
async function state(page) {
	return page.evaluate(async () => {
		// Follow Vite's actual module URL, including its HMR timestamp. Importing
		// the bare path after an edit can instantiate a second diagnostics registry.
		const moduleUrl = performance.getEntriesByType('resource').map((entry) => entry.name).findLast((url) => /\/materials\/runtime\.ts(?:\?|$)/.test(url));
		if (!moduleUrl) throw new Error('The material runtime module was not loaded.');
		const { inspectMaterial, materialReservedBytes } = await import(moduleUrl);
		const samples = [...document.querySelectorAll('canvas')].map((canvas) => ({ ...inspectMaterial(canvas), rect: canvas.getBoundingClientRect().toJSON() }));
		return { devices: new Set(samples.map((sample) => sample.device).filter(Boolean)).size, bytes: materialReservedBytes(), samples: samples.map(({ device, ...sample }) => sample) };
	});
}
async function loaded(page, expected = 'ready') {
	await page.waitForFunction((expected) => [...document.querySelectorAll('[data-material-state]')].length === 1 && [...document.querySelectorAll('[data-material-state]')].every((node) => node.dataset.materialState === expected), expected, { timeout: 15000 });
}
async function idle(page) {
	// A native event / history commit may precede the Svelte effect that wakes
	// the material. Do not mistake that task boundary for a settled mechanism.
	await page.waitForTimeout(100);
	await page.waitForFunction(async () => {
		const moduleUrl = performance.getEntriesByType('resource').map((entry) => entry.name).findLast((url) => /\/materials\/runtime\.ts(?:\?|$)/.test(url));
		if (!moduleUrl) return false;
		const { inspectMaterial } = await import(moduleUrl);
		return [...document.querySelectorAll('canvas')].every((canvas) => { const sample = inspectMaterial(canvas); return sample && !sample.active && !sample.inFlight; });
	}, undefined, { timeout: 10000 });
}
async function shot(page, name) { await page.screenshot({ path: join(artifacts, `${name}.png`), fullPage: true }); }
async function errors(page) { page.on('pageerror', (error) => failures.push(error.message)); await page.addInitScript(() => performance.setResourceTimingBufferSize(4000)); }
try {
	const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 }); await errors(page);
	currentPage = page;
	const start = performance.now(); await page.goto(`${origin}/lab/interfaces/library`); await loaded(page); await idle(page);
	evidence.desktopStartupWallMs = Math.round(performance.now() - start); evidence.desktop = await state(page);
	assert.equal(evidence.desktop.devices, 1);
	for (const sample of evidence.desktop.samples) { assert.equal(sample.width, Math.max(1, Math.round(sample.rect.width * 2))); assert.equal(sample.height, Math.max(1, Math.round(sample.rect.height * 2))); }
	await page.waitForTimeout(300); assert.deepEqual((await state(page)).samples.map((s) => s.submissions), evidence.desktop.samples.map((s) => s.submissions));
	await shot(page, 'desktop-rest');
	console.log('Desktop: native sizing and idle verified.');
	assert.equal(await page.locator('canvas').count(), 1, 'Only the spring is a material on this page.');
	assert.equal(await page.locator('h1 canvas, figure canvas').count(), 0, 'Type and photograph stay still.');
	const spring = page.locator('.appearance canvas'), initial = await spring.screenshot();
	const chrome = await page.getByRole('switch').evaluate((node) => {
		const css = getComputedStyle(node), rect = node.getBoundingClientRect();
		return { borders: [css.borderTopWidth, css.borderRightWidth, css.borderBottomWidth, css.borderLeftWidth], shadow: css.boxShadow, background: css.backgroundColor, outline: css.outlineStyle, height: rect.height, width: rect.width };
	});
	assert.deepEqual(chrome.borders, ['0px', '0px', '0px', '0px']);
	assert.equal(chrome.shadow, 'none'); assert.equal(chrome.background, 'rgba(0, 0, 0, 0)'); assert.equal(chrome.outline, 'none');
	assert(chrome.height >= 44 && chrome.width >= 44, 'Unboxed must not mean a tiny hit target.');
	const toggle = page.getByRole('switch', { name: 'Dark appearance' }); await toggle.focus(); await page.keyboard.press('Enter');
	assert.equal(await toggle.getAttribute('aria-checked'), 'true'); await page.waitForURL('**theme=dark'); await loaded(page); await idle(page);
	assert.equal(await toggle.evaluate((node) => node === document.activeElement), true);
	assert.equal(await toggle.evaluate((node) => getComputedStyle(node).outlineStyle), 'solid', 'Keyboard users retain a visible focus ring.');
	assert(!initial.equals(await spring.screenshot()), 'The spring must visibly change curvature.');
	await shot(page, 'desktop-dark');
	await page.keyboard.press('Space'); assert.equal(await toggle.getAttribute('aria-checked'), 'false'); await page.waitForURL('**theme=light');
	await page.goBack(); await page.waitForURL('**theme=dark'); assert.equal(await toggle.getAttribute('aria-checked'), 'true');
	await page.goForward(); await page.waitForURL('**theme=light'); assert.equal(await toggle.getAttribute('aria-checked'), 'false');
	await page.getByText('Study notes', { exact: true }).click();
	await page.getByRole('link', { name: 'Plain', exact: true }).click(); await loaded(page, 'static'); assert.equal((await state(page)).bytes, 0); assert.equal((await state(page)).devices, 0);
	await page.reload(); await loaded(page, 'static');
	await page.getByText('Study notes', { exact: true }).click();
	assert.equal(await page.getByRole('link', { name: 'Plain', exact: true }).getAttribute('aria-current'), 'page');
	await page.getByRole('link', { name: 'Material', exact: true }).click(); await loaded(page); await idle(page);
	for (let i = 0; i < 7; i++) { await toggle.click(); }
	await loaded(page); await page.mouse.move(1, 1); await idle(page); assert.equal(await toggle.getAttribute('aria-checked'), 'true');
	console.log('Native activation, history, plain, refresh and rapid retarget verified.');
	await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(150); await idle(page);
	const beforeReduced = await state(page); await spring.hover(); await page.waitForTimeout(250); assert.deepEqual((await state(page)).samples.map((s) => s.submissions), beforeReduced.samples.map((s) => s.submissions));
	await toggle.locator('.mode').click(); assert.equal(await toggle.getAttribute('aria-checked'), 'false'); await loaded(page); await idle(page);
	await page.emulateMedia({ forcedColors: 'active' }); await loaded(page, 'static'); assert.equal((await state(page)).bytes, 0); await shot(page, 'forced-colors');
	console.log('Reduced motion and forced colors verified.');
	await page.close();

	const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }); await errors(mobile);
	currentPage = mobile;
	await mobile.goto(`${origin}/lab/interfaces/library?dir=rtl&theme=dark`); await loaded(mobile); await idle(mobile); evidence.mobile = await state(mobile);
	for (const sample of evidence.mobile.samples) { assert.equal(sample.width, Math.max(1, Math.round(sample.rect.width * 3))); assert.equal(sample.height, Math.max(1, Math.round(sample.rect.height * 3))); }
	assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No narrow-screen horizontal overflow.');
	await shot(mobile, 'mobile-rtl');
	await mobile.getByRole('switch').tap(); assert.equal(await mobile.getByRole('switch').getAttribute('aria-checked'), 'false');
	await mobile.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
	for (const surface of await mobile.locator('[data-material-state]').all()) { await surface.scrollIntoViewIfNeeded(); await mobile.waitForTimeout(150); }
	await loaded(mobile); await mobile.evaluate(() => scrollTo(0, 0)); await idle(mobile);
	assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No overflow at 200% text size.');
	assert(await mobile.locator('header, header a, header button').evaluateAll((nodes) => nodes.every((node) => { const rect = node.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth; })), 'RTL overflow can escape left without increasing scrollWidth.');
	await shot(mobile, 'mobile-text-200'); await mobile.close();

	const unavailable = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 2 }); await errors(unavailable);
	currentPage = unavailable;
	await unavailable.addInitScript(() => { Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined }); });
	await unavailable.goto(`${origin}/lab/interfaces/library`); await loaded(unavailable, 'unavailable');
	assert(await unavailable.getByRole('heading', { level: 1 }).innerText()); assert.equal(await unavailable.locator('img').evaluate((img) => img.naturalWidth > 0), true);
	await unavailable.getByRole('switch').click(); assert.equal(await unavailable.getByRole('switch').getAttribute('aria-checked'), 'true');
	await unavailable.getByRole('button', { name: 'Retry material' }).click(); await loaded(unavailable, 'unavailable');
	evidence.unavailable = await state(unavailable); assert.equal(evidence.unavailable.bytes, 0); await shot(unavailable, 'unavailable'); await unavailable.close();
	assert.deepEqual(failures, []); console.log(JSON.stringify({ artifacts, checks: 'unboxed spring, full hit area, native DPR, visible curvature change, static type/image, idle, keyboard focus, rapid retarget, Back/Forward, refresh, plain, reduced motion, forced colors, RTL, 200% text, touch, GPU failure/retry', ...evidence }, null, 2));
} catch (error) {
	if (currentPage && !currentPage.isClosed()) {
		console.error(JSON.stringify({ url: currentPage.url(), errors: failures, materials: await currentPage.locator('[data-material-state]').evaluateAll((nodes) => nodes.map((node) => ({ state: node.dataset.materialState, text: node.textContent }))) }));
		await shot(currentPage, 'failure');
	}
	throw error;
} finally { await browser.close(); }
