import { buildSkillMd } from '../agent-docs.js';

export const prerender = true;

export function GET() {
	return new Response(buildSkillMd(), {
		headers: { 'content-type': 'text/markdown; charset=utf-8' }
	});
}
