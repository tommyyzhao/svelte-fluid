import { describe, expect, it } from 'vitest';
import review from './+page.svelte?raw';
import layout from '../../+layout.svelte?raw';
import { GET } from '../../../sitemap.xml/+server.js';

describe('maxFps owner review', () => {
	it('keeps the comparison public-API-only, seeded, registry-driven and swappable', () => {
		expect(review).toContain("from '$lib/presets/registry.js'");
		expect(review).toContain("$state('Plasma')");
		expect(review).toContain('swapped ? [60, 0] : [0, 60]');
		expect(review).toContain('{...preset.config}');
		expect(review).toContain('seed={5}');
		expect(review).toContain('maxFps={rate}');
		expect(review).toContain('cancelAnimationFrame(request)');
		expect(review).not.toMatch(/from ['"][^'"]*engine\//);
	});

	it('inherits noindex and stays outside the canonical sitemap', async () => {
		expect(layout).toContain('<meta name="robots" content="noindex" />');
		expect(await GET().text()).not.toContain('/examples/bench/max-fps');
	});
});
