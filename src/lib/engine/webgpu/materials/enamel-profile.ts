/** Private, static molded profile; not a contact-angle or surface-tension solve. */
export function enamelProfile(coverage: Uint8Array, width: number, height: number) {
	if (coverage.length !== width * height || width < 1 || height < 1) throw new Error('Invalid enamel coverage.');
	const distance = new Float32Array(coverage.length);
	const diagonal = Math.SQRT2;
	// Two-pass chamfer distance. Border pixels count as boundary even for a
	// fully covered input; the shape must have finite relief at the canvas edge.
	for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
		const i = y * width + x;
		distance[i] = coverage[i] < 128 ? 0 : Math.min(x + 1, y + 1, width - x, height - y);
	}
	for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
		const i = y * width + x;
		// Zero is already the exact lower bound. Relaxing transparent pixels
		// cannot change their distance, but dominated sparse native type rasters.
		if (distance[i] === 0) continue;
		if (x) distance[i] = Math.min(distance[i], distance[i - 1] + 1);
		if (y) distance[i] = Math.min(distance[i], distance[i - width] + 1);
		if (x && y) distance[i] = Math.min(distance[i], distance[i - width - 1] + diagonal);
		if (y && x + 1 < width) distance[i] = Math.min(distance[i], distance[i - width + 1] + diagonal);
	}
	for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
		const i = y * width + x;
		if (distance[i] === 0) continue;
		if (x + 1 < width) distance[i] = Math.min(distance[i], distance[i + 1] + 1);
		if (y + 1 < height) distance[i] = Math.min(distance[i], distance[i + width] + 1);
		if (x && y + 1 < height) distance[i] = Math.min(distance[i], distance[i + width - 1] + diagonal);
		if (x + 1 < width && y + 1 < height) distance[i] = Math.min(distance[i], distance[i + width + 1] + diagonal);
	}
	// Distance is no longer needed; reuse it instead of retaining another
	// full-resolution float field (64 MiB at the native pixel safety ceiling).
	const rest = distance;
	for (let i = 0; i < rest.length; i++) if (rest[i] !== 0) rest[i] = 0.72 * Math.sin(Math.min(rest[i] / (height * 0.045), 1) * Math.PI / 2);
	// Smooth the *rest surface*, not the silhouette. Pixel staircase changes in
	// the distance field otherwise become tiny specular seams along curved type.
	const scratch = new Float32Array(rest.length);
	const weights = [1, 4, 6, 4, 1];
	for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
		let sum = 0;
		for (let offset = -2; offset <= 2; offset++) {
			sum += rest[y * width + Math.max(0, Math.min(width - 1, x + offset))] * weights[offset + 2];
		}
		scratch[y * width + x] = sum / 16;
	}
	for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
		let sum = 0;
		for (let offset = -2; offset <= 2; offset++) {
			sum += scratch[Math.max(0, Math.min(height - 1, y + offset)) * width + x] * weights[offset + 2];
		}
		rest[y * width + x] = coverage[y * width + x] ? sum / 16 : 0;
	}
	const at = (x: number, y: number) => rest[Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))];
	const data = new Uint8Array(width * height * 4);
	const slopeScale = (0.003 / 0.14) * height * 0.5;
	const encode = (slope: number) => Math.round((Math.max(-2, Math.min(2, slope)) / 4 + 0.5) * 255);
	for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
		const i = y * width + x;
		data[i * 4] = encode((at(x + 1, y) - at(x - 1, y)) * slopeScale);
		data[i * 4 + 1] = encode((at(x, y + 1) - at(x, y - 1)) * slopeScale);
		data[i * 4 + 2] = Math.round(rest[i] * 255);
		data[i * 4 + 3] = coverage[i];
	}
	return { width, height, data };
}

/** Area average of the exact quantized profile sampled by the renderer. */
export function coarseEnamel(profile: ReturnType<typeof enamelProfile>, width: number, height: number) {
	const initial = new Float32Array(width * height);
	const solid = new Uint8Array(width * height);
	const sx = profile.width / width, sy = profile.height / height;
	for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
		let volume = 0, coverage = 0;
		for (let py = Math.floor(y * sy); py < Math.ceil((y + 1) * sy); py++) {
			for (let px = Math.floor(x * sx); px < Math.ceil((x + 1) * sx); px++) {
				const area = (Math.min(px + 1, (x + 1) * sx) - Math.max(px, x * sx)) *
					(Math.min(py + 1, (y + 1) * sy) - Math.max(py, y * sy));
				const i = (py * profile.width + px) * 4;
				volume += profile.data[i + 2] / 255 * area;
				coverage += profile.data[i + 3] / 255 * area;
			}
		}
		const i = y * width + x;
		solid[i] = Number(coverage / (sx * sy) < 0.08);
		initial[i] = solid[i] ? 0 : volume / (sx * sy);
	}
	return { initial, solid };
}
