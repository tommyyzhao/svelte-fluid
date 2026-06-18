import { DEFAULT_SITE } from '../agent-docs.js';

export const prerender = true;

// Design-exploration and test routes ship in the static build but are not part
// of the public site — keep crawlers out of them and off the legacy agent page.
const DISALLOW = [
	'/design',
	'/capture',
	'/maze-test',
	'/test-boundary',
	'/obstruction-lab',
	'/skills.md'
];

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
