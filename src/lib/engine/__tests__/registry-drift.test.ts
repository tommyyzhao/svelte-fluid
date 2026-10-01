import { describe, expect, it } from 'vitest';
import itemRaw from '../../../../static/r/splash-cursor.json?raw';
import source from '../../../../registry/splash-cursor/SplashCursor.svelte?raw';

describe('static/r/splash-cursor.json', () => {
	it('embeds the current registry source and declares svelte-fluid', () => {
		const item = JSON.parse(itemRaw) as { dependencies: string[]; files: { content: string }[] };
		expect(item.files[0].content.replace(/\n$/, '')).toBe(source.replace(/\n$/, ''));
		expect(item.dependencies).toEqual(['svelte-fluid']);
	});
});
