import { DEFAULT_SITE } from '../agent-docs.js';

export const prerender = true;

// Canonical public pages only — the design-exploration/test routes are
// intentionally excluded (see robots.txt).
const ROUTES = [
	'/',
	'/for-agents',
	'/docs',
	'/docs/components',
	'/docs/configuration',
	'/docs/shapes',
	'/docs/presets',
	'/docs/api'
];

export function GET() {
	const urls = ROUTES.map((r) => `\t<url><loc>${DEFAULT_SITE}${r === '/' ? '' : r}</loc></url>`).join('\n');
	const body =
		'<?xml version="1.0" encoding="UTF-8"?>\n' +
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
		urls +
		'\n</urlset>\n';
	return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
}
