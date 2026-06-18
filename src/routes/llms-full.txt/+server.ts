import { buildLlmsFullTxt } from '../agent-docs.js';

export const prerender = true;

export function GET() {
	return new Response(buildLlmsFullTxt(), {
		headers: { 'content-type': 'text/plain; charset=utf-8' }
	});
}
