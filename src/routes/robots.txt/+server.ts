import { DEFAULT_SITE } from '../agent-docs.js';

export const prerender = true;

// The /examples/* feature demos ship in the static build but are intentionally
// unlisted for now (see dev-docs/plans/scratch-route-consolidation.md) — keep
// crawlers out until we choose to feature them.
const DISALLOW = ['/examples'];

export function GET() {
	const body = [
		'User-agent: *',
		...DISALLOW.map((p) => `Disallow: ${p}`),
		'',
		`Sitemap: ${DEFAULT_SITE}/sitemap.xml`,
		''
	].join('\n');
	return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
