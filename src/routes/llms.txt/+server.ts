import { buildLlmsTxt } from '../agent-docs.js';

export const prerender = true;

export function GET() {
	return new Response(buildLlmsTxt(), {
		headers: { 'content-type': 'text/plain; charset=utf-8' }
	});
}
