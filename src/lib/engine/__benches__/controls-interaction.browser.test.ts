import { createRawSnippet, mount, unmount } from 'svelte';
import { commands, page, server, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiquidButton, LiquidSegmented } from '../../index.js';

// macOS WebKit Tab skips non-text controls unless Keyboard navigation is on;
// Option+Tab reaches them (https://github.com/microsoft/playwright/issues/41808).
// ponytail: assumes the macOS default (setting off); Option+Tab reverses it when on.
const tab = () =>
	server.browser === 'webkit' && server.platform === 'darwin'
		? userEvent.keyboard('{Alt>}{Tab}{/Alt}')
		: userEvent.tab();

const cleanup: (() => Promise<void>)[] = [];
const emulate = (commands as unknown as Record<
	string,
	(media: { forcedColors: 'active' | 'none' }) => Promise<void>
>).emulateControlMedia;
let forcedColors = false;

afterEach(async () => {
	const failures: unknown[] = [];
	for (const dispose of cleanup.splice(0).reverse()) {
		try { await dispose(); } catch (error) { failures.push(error); }
	}
	try {
		if (forcedColors) await emulate({ forcedColors: 'none' });
	} catch (error) {
		failures.push(error);
	} finally {
		forcedColors = false;
		try { vi.restoreAllMocks(); } catch (error) { failures.push(error); }
	}
	if (failures.length) throw new AggregateError(failures, 'Control test cleanup failed');
});

function fixture(disabled = false) {
	const form = document.createElement('form');
	form.style.cssText = 'padding:24px;background:#f2f0eb;color:#1a1c21;font:16px Arial';
	const before = document.createElement('button');
	before.type = 'button';
	before.textContent = 'Before controls';
	form.append(before);
	document.body.append(form);
	cleanup.push(async () => { form.remove(); });
	const click = vi.fn();
	const buttonApp = mount(LiquidButton, {
		target: form,
		props: {
			disabled,
			onclick: click,
			children: createRawSnippet(() => ({ render: () => '<span>Launch</span>' }))
		}
	});
	cleanup.push(async () => { await unmount(buttonApp); });
	let value = 'calm';
	const changed = vi.fn();
	const segmentedApp = mount(LiquidSegmented, {
		target: form,
		props: {
			name: 'mood', legend: 'Flow mood', disabled,
			options: [{ value: 'calm', label: 'Calm' }, { value: 'lively', label: 'Lively' }],
			get value() { return value; },
			set value(next: string | undefined) { value = next ?? ''; changed(next); }
		}
	});
	cleanup.push(async () => { await unmount(segmentedApp); });
	const submit = document.createElement('button');
	submit.type = 'submit';
	submit.textContent = 'Save controls';
	form.append(submit);
	const submissions: FormData[] = [];
	form.addEventListener('submit', (event) => {
		event.preventDefault();
		submissions.push(new FormData(form));
	});
	return {
		form, before, submit, click, changed, submissions, value: () => value,
		button: form.querySelector<HTMLButtonElement>('.liquid-button')!,
		group: form.querySelector('fieldset')!,
		radios: [...form.querySelectorAll<HTMLInputElement>('input[type=radio]')]
	};
}

for (const fallback of [false, true]) {
	describe(fallback ? 'controls: unavailable WebGL fallback' : 'controls: live WebGL', () => {
		beforeEach(() => {
			if (!fallback) return;
			const html = HTMLCanvasElement.prototype.getContext;
			const offscreen = OffscreenCanvas.prototype.getContext;
			vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement, kind, ...args) {
				return String(kind).includes('webgl') ? null : Reflect.apply(html, this, [kind, ...args]);
			} as typeof html);
			vi.spyOn(OffscreenCanvas.prototype, 'getContext').mockImplementation(function (this: OffscreenCanvas, kind, ...args) {
				return String(kind).includes('webgl') ? null : Reflect.apply(offscreen, this, [kind, ...args]);
			} as typeof offscreen);
			vi.spyOn(console, 'warn').mockImplementation(() => {});
		});

		async function ready(f: ReturnType<typeof fixture>) {
			await vi.waitFor(() => {
				expect(f.button.classList.contains('live')).toBe(!fallback);
				expect(f.group.classList.contains('live')).toBe(!fallback);
			});
		}

		it('snippet names the button; Tab focuses, Enter and Space each activate once; CSS focus in fallback/forced colors', async () => {
			const f = fixture();
			await ready(f);
			await expect.element(page.getByRole('button', { name: 'Launch', exact: true })).toBeVisible();
			f.before.focus();
			await tab();
			expect(document.activeElement).toBe(f.button);
			expect(f.button.matches(':focus-visible')).toBe(true);
			await userEvent.keyboard('{Enter}');
			expect(f.click).toHaveBeenCalledTimes(1);
			await userEvent.keyboard(' ');
			expect(f.click).toHaveBeenCalledTimes(2);
			// Live focus is shader-painted; computed CSS only proves the forced-colors ring.
			if (!fallback) {
				forcedColors = true;
				await emulate({ forcedColors: 'active' });
			}
			const focus = getComputedStyle(f.button);
			expect(focus.outlineStyle).toBe('solid');
			expect(parseFloat(focus.outlineWidth)).toBeGreaterThanOrEqual(2);
			expect(focus.outlineColor).not.toBe('rgba(0, 0, 0, 0)');
		});

		it('legend and radio names, initial selection, native arrows update binding and submitted value', async () => {
			const f = fixture();
			await ready(f);
			await expect.element(page.getByRole('group', { name: 'Flow mood', exact: true })).toBeVisible();
			await expect.element(page.getByRole('radio', { name: 'Calm', exact: true })).toBeChecked();
			await expect.element(page.getByRole('radio', { name: 'Lively', exact: true })).not.toBeChecked();
			expect(f.value()).toBe('calm');
			f.button.focus();
			await tab();
			expect(document.activeElement).toBe(f.radios[0]);
			await userEvent.keyboard('{ArrowRight}');
			expect(document.activeElement).toBe(f.radios[1]);
			expect(f.radios[1].checked).toBe(true);
			await vi.waitFor(() => expect(f.value()).toBe('lively'));
			expect(f.changed).toHaveBeenLastCalledWith('lively');
			await userEvent.keyboard('{ArrowLeft}');
			expect(document.activeElement).toBe(f.radios[0]);
			expect(f.radios[0].checked).toBe(true);
			await vi.waitFor(() => expect(f.value()).toBe('calm'));
			expect(f.changed).toHaveBeenLastCalledWith('calm');
			await userEvent.keyboard('{ArrowRight}');
			await vi.waitFor(() => expect(f.value()).toBe('lively'));
			await userEvent.click(f.submit);
			expect(f.submissions).toHaveLength(1);
			expect(f.submissions[0].getAll('mood')).toEqual(['lively']);
		});

		it('disabled button and fieldset reject pointer/keyboard interaction and omit radios from submission', async () => {
			const f = fixture(true);
			await ready(f);
			expect(f.button.disabled).toBe(true);
			expect(f.group.disabled).toBe(true);
			f.before.focus();
			f.button.focus();
			f.radios[0].focus();
			expect(document.activeElement).toBe(f.before);
			await userEvent.keyboard('{Enter} ');
			await tab();
			expect(document.activeElement).toBe(f.submit);
			// Bypass Playwright's enabled wait, not the browser's disabled semantics.
			await userEvent.click(f.button, { force: true });
			await userEvent.click(f.radios[1], { force: true });
			expect(f.click).not.toHaveBeenCalled();
			expect(f.changed).not.toHaveBeenCalled();
			expect(f.radios.map((radio) => radio.checked)).toEqual([true, false]);
			expect(f.value()).toBe('calm');
			await userEvent.click(f.submit);
			expect(f.submissions).toHaveLength(1);
			expect(f.submissions[0].has('mood')).toBe(false);
		});
	});
}
