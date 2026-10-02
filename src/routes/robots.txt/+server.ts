import { base } from '$app/paths';
import { DEFAULT_SITE } from '../agent-docs.js';

export const prerender = true;

// The /examples/* feature demos ship in the static build but are intentionally
// unlisted for now — keep crawlers out until we choose to feature them.
// /lab is private R&D and never linked or listed.
const DISALLOW = ['/examples', '/lab'];

export function GET() {
	const body = [
		'User-agent: *',
		...DISALLOW.map((p) => `Disallow: ${base}${p}`),
		'',
		`Sitemap: ${DEFAULT_SITE}/sitemap.xml`,
		''
	].join('\n');
	return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
