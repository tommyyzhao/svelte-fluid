import { describe, expect, it } from 'vitest';
import docsIndex from './+page.svelte?raw';
import api from './api/+page.svelte?raw';
import components from './components/+page.svelte?raw';
import configuration from './configuration/+page.svelte?raw';
import presets from './presets/+page.svelte?raw';
import shapes from './shapes/+page.svelte?raw';

const DOC_PAGES = {
	'/docs': docsIndex,
	'/docs/api': api,
	'/docs/components': components,
	'/docs/configuration': configuration,
	'/docs/presets': presets,
	'/docs/shapes': shapes
} as const;

type DocsRoute = keyof typeof DOC_PAGES;

interface FragmentLink {
	sourceRoute: DocsRoute;
	targetRoute: DocsRoute;
	fragment: string;
	href: string;
}

function isDocsRoute(route: string): route is DocsRoute {
	return Object.prototype.hasOwnProperty.call(DOC_PAGES, route);
}

function anchorIds(source: string): Set<string> {
	const ids = new Set<string>();
	for (const match of source.matchAll(/\bid=(?:"([^"]+)"|'([^']+)')/g)) {
		const id = match[1] ?? match[2];
		if (id) ids.add(id);
	}
	return ids;
}

function docsFragmentLinks(sourceRoute: DocsRoute, source: string): FragmentLink[] {
	const links: FragmentLink[] = [];
	for (const match of source.matchAll(/\bhref=(?:"([^"]+)"|'([^']+)')/g)) {
		const href = match[1] ?? match[2] ?? '';
		const hashIndex = href.indexOf('#');
		if (hashIndex === -1) continue;

		const fragment = href.slice(hashIndex + 1);
		if (!fragment) continue;

		const route = href.slice(0, hashIndex).replace(/^\{base\}/, '');
		const targetRoute = route === '' ? sourceRoute : isDocsRoute(route) ? route : undefined;
		if (targetRoute) links.push({ sourceRoute, targetRoute, fragment, href });
	}
	return links;
}

describe('docs anchor links', () => {
	it('points every docs fragment link at an existing id', () => {
		const idsByRoute = new Map(
			(Object.entries(DOC_PAGES) as Array<[DocsRoute, string]>).map(([route, source]) => [
				route,
				anchorIds(source)
			])
		);

		const missing: string[] = [];
		for (const [sourceRoute, source] of Object.entries(DOC_PAGES) as Array<[DocsRoute, string]>) {
			for (const link of docsFragmentLinks(sourceRoute, source)) {
				if (!idsByRoute.get(link.targetRoute)?.has(link.fragment)) {
					missing.push(`${link.sourceRoute}: ${link.href} -> ${link.targetRoute}#${link.fragment}`);
				}
			}
		}

		expect(missing).toEqual([]);
	});
});
