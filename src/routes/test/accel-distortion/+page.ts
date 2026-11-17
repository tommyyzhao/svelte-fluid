import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

// Local-only preview of an internal engine knob: never prerendered or shipped.
export const prerender = false;
export const ssr = false;

export const load = () => {
	if (!dev) error(404, 'Not found');
};
