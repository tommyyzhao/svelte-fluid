import { describe, expect, it } from 'vitest';
import itemRaw from '../../../../static/r/splash-cursor.json?raw';
import source from '../../../../registry/splash-cursor/SplashCursor.svelte?raw';
import recipe from '../../../routes/docs/recipes/splash-cursor/+page.svelte?raw';

describe('static/r/splash-cursor.json', () => {
	it('embeds the current registry source and declares svelte-fluid', () => {
		const item = JSON.parse(itemRaw) as { dependencies: string[]; files: { content: string }[] };
		expect(item.files[0].content.replace(/\n$/, '')).toBe(source.replace(/\n$/, ''));
		expect(item.dependencies).toEqual(['svelte-fluid']);
	});

	it('keeps the consumer install snippet out of Vite dependency scanning', () => {
		// Vite extracts import lines from TS with a regex, including template literals.
		const imports = [...recipe.matchAll(/(?<!\/\/.*)(?<=^|;|\*\/)\s*import(?!\s+type)(?:[\w*{}\n\r\t, ]+from)?\s*("[^"]+"|'[^']+')\s*(?=$|;|\/\/|\/\*)/gm)];
		expect(imports.map((match) => match[1])).not.toContain("'$lib/components/splash-cursor/SplashCursor.svelte'");
		expect(recipe).toContain("${'import'} SplashCursor from '$lib/components/splash-cursor/SplashCursor.svelte';");
	});
});
