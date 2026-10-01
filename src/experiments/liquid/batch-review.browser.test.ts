import { mount, unmount } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import Review from '../../routes/lab/interfaces/batch/+page.svelte';
import Studio from '../../routes/lab/interfaces/+page.svelte';

const routes = import.meta.glob('../../routes/lab/interfaces/*/+page.svelte');
afterEach(async () => { vi.restoreAllMocks(); await page.viewport(1280, 720); });

const retired = ['mask-editor', 'before-after', 'annotations', 'reorder', 'relationships', 'allocation', 'product', 'lens'];
for (const [name, catalog] of [['review', Review], ['studio', Studio]] as const) for (const width of [390, 1280]) it(`keeps the ${width}px ${name} catalog linked, focused and entirely static`, async () => {
	await page.viewport(width, 844);
	const request = vi.spyOn(navigator.gpu, 'requestAdapter');
	const host = document.createElement('div'); document.body.append(host);
	const component = mount(catalog, { target: host });
	try {
		await document.fonts.ready;
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		const cards = [...host.querySelectorAll<HTMLAnchorElement>('a.card')];
		// Coverage is about the selected mechanisms, not a quota of ideas.
		for (const path of name === 'review' ? ['image-wake', 'adhesive-type', 'imprint', 'dendritic-growth'] : ['material-type', 'filaments', 'heat-tint', 'selection']) {
			expect(host.querySelector(`a[href="/lab/interfaces/${path}"]`)).not.toBeNull();
		}
		for (const path of retired) {
			expect(host.querySelector(`a[href="/lab/interfaces/${path}"]`)).toBeNull();
			expect(routes[`../../routes/lab/interfaces/${path}/+page.svelte`], `${path} must be removed, not merely hidden`).toBeUndefined();
		}
		expect(host.querySelector('a[href="/lab/interfaces/meniscus-svg"]'), 'Renderer diagnostics belong inside the study, not the creative portfolio').toBeNull();
		expect(new Set(cards.map((card) => card.pathname)).size).toBe(cards.length);
		for (const link of host.querySelectorAll<HTMLAnchorElement>('a[href^="/lab/interfaces/"]')) {
			const slug = link.pathname.split('/').at(-1);
			expect(routes[`../../routes/lab/interfaces/${slug}/+page.svelte`], `Missing review destination: ${link.pathname}`).toBeDefined();
		}
		for (const card of cards) {
			const rect = card.getBoundingClientRect();
			expect(rect.left).toBeGreaterThanOrEqual(0);
			expect(rect.right).toBeLessThanOrEqual(width);
			expect(parseFloat(getComputedStyle(card.querySelector('.copy p')!).fontSize)).toBeGreaterThanOrEqual(12);
			card.focus(); expect(document.activeElement).toBe(card);
		}
		expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
		expect(host.querySelector('canvas')).toBeNull();
		expect(request).not.toHaveBeenCalled();
	} finally { await unmount(component); host.remove(); }
});
