/**
 * Invoke a consumer callback without letting a throw escape. Consumer code is
 * untrusted: an exception must not break engine startup, teardown, or sibling
 * instances. Returns whether the callback completed.
 */
export function notifyHost<A extends unknown[]>(
	callback: ((...args: A) => void) | undefined,
	name: string,
	...args: A
): boolean {
	if (!callback) return true;
	try {
		callback(...args);
		return true;
	} catch (cause) {
		console.error(`svelte-fluid: ${name} callback threw`, cause);
		return false;
	}
}
