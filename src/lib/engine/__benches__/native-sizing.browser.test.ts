import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import FoilSwitch from '../../FoilSwitch.svelte';
import EnamelText from '../../EnamelText.svelte';
import LiquidButton from '../../LiquidButton.svelte';
import fluidTextSrc from '../../FluidText.svelte?raw';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

describe('native fractional component backing', () => {
	it('defaults small text to AA without removing the explicit large-text override', () => {
		expect(fluidTextSrc).toContain('minContrast = 4.5,');
		expect(fluidTextSrc).toContain('{minContrast}');
	});

	for (const component of [FoilSwitch, EnamelText, LiquidButton]) {
		it(`${component.name} retains fractional layout pixels through resize and transforms`, async () => {
			const target = document.createElement('div');
			target.style.cssText = 'font:32px Arial;color:#222;background:#fff';
			document.body.append(target);
			const app = component === FoilSwitch
				? mount(FoilSwitch, { target, props: { checked: true } })
				: component === EnamelText
					? mount(EnamelText, { target, props: { text: 'Native' } })
					: mount(LiquidButton, { target });
			cleanup.push(async () => { await unmount(app); target.remove(); });
			const canvas = target.querySelector('canvas')!;
			const root = target.firstElementChild!;
			await vi.waitFor(() => expect(root.classList.contains('live')).toBe(true));
			for (const [width, height] of [[96, 48], [96.375, 48.625], [110.625, 55.375]]) {
				canvas.style.width = `${width}px`;
				canvas.style.height = `${height}px`;
				await vi.waitFor(() => {
					expect(canvas.width).toBe(Math.max(1, Math.floor(width * devicePixelRatio)));
					expect(canvas.height).toBe(Math.max(1, Math.floor(height * devicePixelRatio)));
				});
				console.info('native backing', component.name, devicePixelRatio, width, height, canvas.width, canvas.height);
			}
			// A transformed visual box must not replace logical layout dimensions.
			canvas.style.transform = 'scale(1.5)';
			canvas.style.width = '96.375px';
			canvas.style.height = '48.625px';
			await vi.waitFor(() => {
				expect(canvas.width).toBe(Math.floor(96.375 * devicePixelRatio));
				expect(canvas.height).toBe(Math.floor(48.625 * devicePixelRatio));
			});
			if (component === FoilSwitch) expect(root.getAttribute('aria-checked')).toBe('true');
			if (component === EnamelText) expect(root.textContent).toBe('Native');
			expect(root.classList.contains('live')).toBe(true);
		});
	}
});
