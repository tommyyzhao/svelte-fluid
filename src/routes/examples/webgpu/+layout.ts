import { dev } from '$app/environment';

// Private R&D: served by `bun run dev`, absent from the production build
// (svelte.config.js sets adapter-static `strict: false` so this is not an error).
export const prerender = dev;
