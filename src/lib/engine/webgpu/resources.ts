export interface WebGpuResourceSnapshot {
	texturesCreated: number;
	texturesDestroyed: number;
	buffersCreated: number;
	buffersDestroyed: number;
	liveTextures: number;
	liveBuffers: number;
}

// Numeric WebGPU usage flags keep these transactional helpers unit-testable and
// safe to import during SSR, where the browser globals do not exist.
const TEXTURE_COPY_SRC = 0x01;
const TEXTURE_COPY_DST = 0x02;
const TEXTURE_BINDING = 0x04;
const TEXTURE_RENDER_ATTACHMENT = 0x10;

export class WebGpuResourceTracker {
	private texturesCreated = 0;
	private texturesDestroyed = 0;
	private buffersCreated = 0;
	private buffersDestroyed = 0;

	textureCreated(): void {
		this.texturesCreated += 1;
	}

	textureDestroyed(): void {
		this.texturesDestroyed += 1;
	}

	bufferCreated(): void {
		this.buffersCreated += 1;
	}

	bufferDestroyed(): void {
		this.buffersDestroyed += 1;
	}

	snapshot(): WebGpuResourceSnapshot {
		return {
			texturesCreated: this.texturesCreated,
			texturesDestroyed: this.texturesDestroyed,
			buffersCreated: this.buffersCreated,
			buffersDestroyed: this.buffersDestroyed,
			liveTextures: this.texturesCreated - this.texturesDestroyed,
			liveBuffers: this.buffersCreated - this.buffersDestroyed
		};
	}
}

export interface WebGpuTarget {
	readonly texture: GPUTexture;
	readonly view: GPUTextureView;
	readonly width: number;
	readonly height: number;
	readonly format: GPUTextureFormat;
	destroy(): void;
}

export interface WebGpuDoubleTarget {
	read: WebGpuTarget;
	write: WebGpuTarget;
	swap(): void;
	destroy(): void;
}

export function createTarget(
	device: GPUDevice,
	tracker: WebGpuResourceTracker,
	width: number,
	height: number,
	format: GPUTextureFormat,
	label: string
): WebGpuTarget {
	const texture = device.createTexture({
		label,
		size: [width, height],
		format,
		usage:
			TEXTURE_RENDER_ATTACHMENT |
			TEXTURE_BINDING |
			TEXTURE_COPY_SRC |
			TEXTURE_COPY_DST
	});
	tracker.textureCreated();
	let view: GPUTextureView;
	try {
		view = texture.createView();
	} catch (error) {
		texture.destroy();
		tracker.textureDestroyed();
		throw error;
	}
	let destroyed = false;
	return {
		texture,
		view,
		width,
		height,
		format,
		destroy() {
			if (destroyed) return;
			destroyed = true;
			texture.destroy();
			tracker.textureDestroyed();
		}
	};
}

export function createDoubleTarget(
	device: GPUDevice,
	tracker: WebGpuResourceTracker,
	width: number,
	height: number,
	format: GPUTextureFormat,
	label: string
): WebGpuDoubleTarget {
	const read = createTarget(device, tracker, width, height, format, `${label}-read`);
	let write: WebGpuTarget;
	try {
		write = createTarget(device, tracker, width, height, format, `${label}-write`);
	} catch (error) {
		read.destroy();
		throw error;
	}
	const target = {
		read,
		write,
		swap() {
			const previous = target.read;
			target.read = target.write;
			target.write = previous;
		},
		destroy() {
			target.read.destroy();
			target.write.destroy();
		}
	};
	return target;
}

export function createMaskTexture(
	device: GPUDevice,
	tracker: WebGpuResourceTracker,
	width: number,
	height: number,
	data: Uint8Array,
	label: string
): WebGpuTarget {
	if (data.length !== width * height * 4) throw new Error(`svelte-fluid: ${label} data size does not match its extent`);
	const texture = device.createTexture({
		label,
		size: [width, height],
		format: 'rgba8unorm',
		usage: TEXTURE_BINDING | TEXTURE_COPY_DST
	});
	tracker.textureCreated();
	let view: GPUTextureView;
	try {
		view = texture.createView();
		const upload = new Uint8Array(data.length);
		upload.set(data);
		device.queue.writeTexture({ texture }, upload, { bytesPerRow: width * 4, rowsPerImage: height }, [width, height]);
	} catch (error) {
		texture.destroy();
		tracker.textureDestroyed();
		throw error;
	}
	let destroyed = false;
	return {
		texture,
		view,
		width,
		height,
		format: 'rgba8unorm',
		destroy() {
			if (destroyed) return;
			destroyed = true;
			texture.destroy();
			tracker.textureDestroyed();
		}
	};
}

export function createExternalImageTexture(
	device: GPUDevice,
	tracker: WebGpuResourceTracker,
	source: ImageBitmap,
	label: string
): WebGpuTarget {
	const texture = device.createTexture({
		label,
		size: [source.width, source.height],
		format: 'rgba8unorm',
		// copyExternalImageToTexture requires both COPY_DST and
		// RENDER_ATTACHMENT, even though this texture is only sampled afterward.
		usage:
			TEXTURE_BINDING |
			TEXTURE_COPY_DST |
			TEXTURE_RENDER_ATTACHMENT
	});
	tracker.textureCreated();
	let view: GPUTextureView;
	try {
		view = texture.createView();
		device.queue.copyExternalImageToTexture({ source }, { texture }, [source.width, source.height]);
	} catch (error) {
		texture.destroy();
		tracker.textureDestroyed();
		throw error;
	}
	let destroyed = false;
	return {
		texture,
		view,
		width: source.width,
		height: source.height,
		format: 'rgba8unorm',
		destroy() {
			if (destroyed) return;
			destroyed = true;
			texture.destroy();
			tracker.textureDestroyed();
		}
	};
}

export function createTrackedBuffer(
	device: GPUDevice,
	tracker: WebGpuResourceTracker,
	size: number,
	usage: GPUBufferUsageFlags,
	label: string
): { buffer: GPUBuffer; destroy(): void } {
	const buffer = device.createBuffer({ label, size: Math.ceil(size / 4) * 4, usage });
	tracker.bufferCreated();
	let destroyed = false;
	return {
		buffer,
		destroy() {
			if (destroyed) return;
			destroyed = true;
			buffer.destroy();
			tracker.bufferDestroyed();
		}
	};
}
