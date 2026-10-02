/** Query string for the user's reduced-motion preference. */
const QUERY = '(prefers-reduced-motion: reduce)';

/** True when the user asked for reduced motion. Always false without `matchMedia` (SSR/Node). */
export function prefersReducedMotion(): boolean {
	return typeof matchMedia === 'function' && matchMedia(QUERY).matches;
}

/** Call `cb` now and on every preference change. Returns an unsubscribe. */
export function watchReducedMotion(cb: (reduced: boolean) => void): () => void {
	if (typeof matchMedia !== 'function') {
		cb(false);
		return () => {};
	}
	const mq = matchMedia(QUERY);
	const on = () => cb(mq.matches);
	on();
	mq.addEventListener('change', on);
	return () => mq.removeEventListener('change', on);
}
