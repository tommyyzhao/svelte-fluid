import type { LiquidExperiment } from './types.js';
import { coverImageBytes } from './living-cover.js';

export type PhotonGrid = 64 | 128 | 256;
export interface CausticGeometry { relief: number; depth: number; phase: number; centerX: number; centerY: number; index: number }
export const CAUSTIC_DEFAULTS: CausticGeometry = { relief: 0.85, depth: 0.85, phase: 0, centerX: 0.52, centerY: 0.48, index: 1.333 };
export const CAUSTIC_APERTURE = 1.5;
// At most aperture² * outputPixels irradiance could land in one pixel. Scaling
// by 1024 bounds even that impossible-all-rays-coincident case below 36,865,
// within finite r16float at the explicit 16,777,216-pixel output limit.
const LIGHT_STORAGE_SCALE = 1024;
const MAX_PHOTONS = 256 ** 2, PHOTON_BYTES = MAX_PHOTONS * 32, UNIFORM_BYTES = 64;
const MEMORY_BUDGET = 256 * 1024 ** 2;
/** An explicit band-limited linear wave spectrum, not animated noise. Mode
 * amplitudes taper with k^-2. Dispersion is omega²=k(1+(0.025k)²), in model
 * units; Tessendorf's course notes §4.2. No calibrated ocean spectrum claim. */
export const CAUSTIC_WAVES = [[12, 7], [-9, 18], [23, 5], [6, 27], [-29, 14], [21, -24], [35, -9], [-18, -33]].map(([kx, ky], i) => {
	const k = Math.hypot(kx, ky); return { kx, ky, amplitude: 1.8 / k ** 2, omega: Math.sqrt(k * (1 + (0.025 * k) ** 2)), phase: i * 2.399963229728653 };
});

/** Analytic prescribed interface, not a fluid solver. z is up; DOM x/y are down-screen. */
function causticJet(x: number, y: number, aspect: number, g: CausticGeometry): [number, number, number, number, number, number] {
	const dx = x - (g.centerX - 0.5) * aspect, dy = y - (g.centerY - 0.5);
	const bump = 0.035 * Math.exp(-(dx * dx + dy * dy) / 0.032);
	let h = bump, hx = -2 * dx / 0.032 * bump, hy = -2 * dy / 0.032 * bump;
	let hxx = (-2 / 0.032 + 4 * dx * dx / 0.032 ** 2) * bump, hxy = 4 * dx * dy / 0.032 ** 2 * bump, hyy = (-2 / 0.032 + 4 * dy * dy / 0.032 ** 2) * bump;
	for (const wave of CAUSTIC_WAVES) { const angle = wave.kx * x + wave.ky * y - wave.omega * g.phase + wave.phase; const value = wave.amplitude * Math.cos(angle), gradient = -wave.amplitude * Math.sin(angle); h += value; hx += gradient * wave.kx; hy += gradient * wave.ky; hxx -= value * wave.kx ** 2; hxy -= value * wave.kx * wave.ky; hyy -= value * wave.ky ** 2; }
	return [0.14 + g.relief * h, g.relief * hx, g.relief * hy, g.relief * hxx, g.relief * hxy, g.relief * hyy];
}

export function causticHeight(x: number, y: number, aspect: number, g: CausticGeometry): [number, number, number] { const [h, hx, hy] = causticJet(x, y, aspect, g); return [h, hx, hy]; }

/** A vertical incident ray refracts once through air/water and reaches z=-depth.
 * PBRT 4e, Specular Reflection and Transmission. No Fresnel loss is modeled:
 * the declared experiment transmits unit incident flux, not calibrated water optics. */
export function projectCausticRay(x: number, y: number, aspect: number, g: CausticGeometry): [number, number] {
	const [h, hx, hy] = causticHeight(x, y, aspect, g), length = Math.hypot(hx, hy, 1);
	const nx = -hx / length, ny = -hy / length, nz = 1 / length, eta = 1 / g.index;
	const k = eta * nz - Math.sqrt(1 - eta * eta * (1 - nz * nz));
	const dz = -eta + k * nz, distance = (h + g.depth) / -dz;
	return [x + k * nx * distance, y + k * ny * distance];
}

export function causticJacobian(x: number, y: number, aspect: number, g: CausticGeometry, epsilon = 1e-5): [number, number, number, number] {
	const l = projectCausticRay(x - epsilon, y, aspect, g), r = projectCausticRay(x + epsilon, y, aspect, g);
	const t = projectCausticRay(x, y - epsilon, aspect, g), b = projectCausticRay(x, y + epsilon, aspect, g);
	return [(r[0] - l[0]) / (2 * epsilon), (b[0] - t[0]) / (2 * epsilon), (r[1] - l[1]) / (2 * epsilon), (b[1] - t[1]) / (2 * epsilon)];
}

/** Chain rule through normalized surface normal, Snell direction and plane hit.
 * One analytic height jet replaces five finite-difference ray evaluations. */
export function causticRayDifferential(x: number, y: number, aspect: number, g: CausticGeometry) {
	const [h, hx, hy, hxx, hxy, hyy] = causticJet(x, y, aspect, g), length = Math.hypot(hx, hy, 1);
	const n = [-hx / length, -hy / length, 1 / length], eta = 1 / g.index;
	const root = Math.sqrt(1 - eta ** 2 * (1 - n[2] ** 2)), factor = eta * n[2] - root;
	const ray = [factor * n[0], factor * n[1], -eta + factor * n[2]], distance = (h + g.depth) / -ray[2];
	const column = (a: number, b: number, dh: number, identity: number[]) => {
		const dot = -a * n[0] - b * n[1], dn = [(-a - n[0] * dot) / length, (-b - n[1] * dot) / length, -n[2] * dot / length];
		const df = (eta - eta ** 2 * n[2] / root) * dn[2], dr = dn.map((value, i) => value * factor + n[i] * df);
		const dd = dh / -ray[2] + (h + g.depth) * dr[2] / ray[2] ** 2;
		return [identity[0] + dr[0] * distance + ray[0] * dd, identity[1] + dr[1] * distance + ray[1] * dd];
	};
	const cx = column(hxx, hxy, hx, [1, 0]), cy = column(hxy, hyy, hy, [0, 1]);
	return { point: [x + ray[0] * distance, y + ray[1] * distance], jacobian: [cx[0], cy[0], cx[1], cy[1]] };
}

export function causticPhoton(ix: number, iy: number, grid: PhotonGrid, width: number, height: number, g: CausticGeometry, interleaved = true) {
	const aspect = width / height, dx = CAUSTIC_APERTURE * aspect / grid, dy = CAUSTIC_APERTURE / grid;
	const x = ((ix + 0.5) / grid - 0.5) * CAUSTIC_APERTURE * aspect, y = ((iy + 0.5) / grid - 0.5) * CAUSTIC_APERTURE;
	const { point: p, jacobian: j } = causticRayDifferential(x, y, aspect, g);
	const a = [height * j[0] * dx, height * j[2] * dx], b = [height * j[1] * dy, height * j[3] * dy];
	// The same point set is two checkerboard cosets of a diamond lattice.
	// Each half-density lattice retains half the power and affine partition of
	// unity. A rotated footprint decorrelates nonlinear source-cell striations;
	// this is neither random jitter nor twice as many rays. Transform before
	// the native-pixel floor, otherwise flat affine reconstruction changes.
	const basis = causticFootprint(interleaved ? [a[0] + b[0], a[1] + b[1], a[0] - b[0], a[1] - b[1]] : [...a, ...b]);
	return { x: width / 2 + p[0] * height, y: height / 2 + p[1] * height, basis, flux: dx * dy };
}

/** Retain the full shear of the projected source cell. Only its independent
 * transverse spans are floored to a native pixel near a fold. Longer-column
 * Gram-Schmidt is a bounded footprint regularizer, not a singular-value model. */
export function causticFootprint(columns: number[]): [number, number, number, number] {
	let [ax, ay, bx, by] = columns;
	if (ax * ax + ay * ay < bx * bx + by * by) [ax, ay, bx, by] = [bx, by, ax, ay];
	const length = Math.hypot(ax, ay); if (length < 1e-8) return [1, 0, 0, 1];
	const ex = ax / length, ey = ay / length, parallel = bx * ex + by * ey, perpendicular = -bx * ey + by * ex;
	const span = (perpendicular < 0 ? -1 : 1) * Math.max(1, Math.abs(perpendicular));
	return [ex * Math.max(1, length), ey * Math.max(1, length), parallel * ex - span * ey, parallel * ey + span * ex];
}

/** Exact continuous escaped-flux integral. Clip the four bilinear tent
 * quadrants in source coordinates; degree-two triangle quadrature is exact.
 * Kept on CPU for explicit diagnostics, not per-frame GPU readback machinery. */
export function causticFootprintIntegral(x: number, y: number, basis: number[], width: number, height: number) {
	const [ax, ay, bx, by] = basis, determinant = ax * by - ay * bx;
	const rx = Math.abs(ax) + Math.abs(bx), ry = Math.abs(ay) + Math.abs(by);
	const pixels = (2 * Math.ceil(rx) + 1) * (2 * Math.ceil(ry) + 1);
	if (x + rx <= 0 || x - rx >= width || y + ry <= 0 || y - ry >= height) return { captured: 0, pixels: 0, area: Math.abs(determinant) };
	if (x - rx >= 0 && x + rx <= width && y - ry >= 0 && y + ry <= height) return { captured: 1, pixels, area: Math.abs(determinant) };
	let captured = 0;
	for (const u0 of [-1, 0]) for (const v0 of [-1, 0]) {
		let polygon = [[u0, v0], [u0 + 1, v0], [u0 + 1, v0 + 1], [u0, v0 + 1]];
		for (const [a, b, c] of [[ax, bx, x], [-ax, -bx, width - x], [ay, by, y], [-ay, -by, height - y]]) {
			const next: number[][] = [];
			for (let i = 0; i < polygon.length; i++) {
				const p = polygon[i], q = polygon[(i + 1) % polygon.length], dp = a * p[0] + b * p[1] + c, dq = a * q[0] + b * q[1] + c;
				if (dp >= 0) next.push(p);
				if ((dp >= 0) !== (dq >= 0)) { const t = dp / (dp - dq); next.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
			}
			polygon = next;
		}
		const su = u0 < 0 ? 1 : -1, sv = v0 < 0 ? 1 : -1;
		for (let i = 1; i + 1 < polygon.length; i++) {
			const [p, q, r] = [polygon[0], polygon[i], polygon[i + 1]];
			const area = Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1])) / 2;
			const sumU = p[0] + q[0] + r[0], sumV = p[1] + q[1] + r[1], uv = (sumU * sumV + p[0] * p[1] + q[0] * q[1] + r[0] * r[1]) / 12;
			captured += area * (1 + su * sumU / 3 + sv * sumV / 3 + su * sv * uv);
		}
	}
	return { captured: Math.max(0, Math.min(1, captured)), pixels, area: Math.abs(determinant) };
}

export function causticFluxBudget(grid: PhotonGrid, width: number, height: number, g: CausticGeometry, interleaved = true) {
	let captured = 0, splatPixels = 0;
	for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
		const p = causticPhoton(x, y, grid, width, height, g, interleaved);
		const footprint = causticFootprintIntegral(p.x, p.y, p.basis, width, height);
		captured += p.flux * footprint.captured; splatPixels += footprint.pixels;
	}
	const incident = CAUSTIC_APERTURE ** 2 * width / height;
	return { incident, captured, escaped: Math.max(0, incident - captured), splatPixels };
}

/** Fixed registration shared with the existing Arles image studies. */
export function causticPhotoCrop(aspect: number, sourceAspect: number) {
	if (![aspect, sourceAspect].every((value) => Number.isFinite(value) && value > 0)) throw new Error('Photo crop requires finite positive aspects.');
	return [0.9 * Math.min(1, aspect / sourceAspect), 0.9 * Math.min(1, sourceAspect / aspect)] as const;
}

/** Illustrative relighting of a printed photograph, not recovered reflectance.
 * The linear-light exposure has ambient fill and a white-preserving shoulder.
 * It is identity at irradiance=1 and never changes the optical flux attachment. */
export function causticPhotoColor(linear: number, irradiance: number) {
	const gain = 0.7 + 0.3 * irradiance;
	return linear * gain / (1 + linear * (gain - 1));
}

export function causticMemoryPlan(width: number, height: number, previousPixels = 0, sourceBytes = 0) {
	if (![width, height, previousPixels, sourceBytes].every(Number.isInteger) || width < 1 || height < 1 || previousPixels < 0 || sourceBytes < 0) throw new Error('Invalid native caustic dimensions.');
	const attachmentBytes = width * height * 2, outputBytes = width * height * 4;
	const engineBytes = PHOTON_BYTES + UNIFORM_BYTES + attachmentBytes + sourceBytes;
	const peakResizeBytes = engineBytes + previousPixels * 2 + outputBytes;
	if (width * height > 16_777_216 || peakResizeBytes > MEMORY_BUDGET) throw new Error('Native caustic size exceeds its explicit attachment budget; no lower-resolution substitution.');
	return { attachmentBytes, outputBytes, engineBytes, peakResizeBytes };
}

export interface CausticLight extends LiquidExperiment {
	setRelief(value: number): void;
	setDepth(value: number): void;
	setPosition(x: number, y: number): void;
	setPhase(value: number): void;
	setPhotonGrid(value: PhotonGrid): void;
	/** Diagnostic null-refraction control, not an additional UI setting. */
	setIndex(value: number): void;
	/** Explicit diagnostic only. Reads the linear receiver, never the tone-mapped picture. */
	readLight(): Promise<{ width: number; height: number; values: Float32Array; flux: number; maximum: number; finite: boolean }>;
}

const shader = /* wgsl */ `
struct Params { display: vec4f, geometry: vec4f, center: vec4f, extra: vec4f };
struct Photon { centerPower: vec4f, basis: vec4f };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> photons: array<Photon>;
struct Surface { height: vec3f, curvature: vec3f };
fn surface(p: vec2f) -> Surface {
	let d=p-(params.center.xy-0.5)*vec2f(params.display.x/params.display.y,1);
	let bump=0.035*exp(-dot(d,d)/0.032);
	var h=vec3f(bump,-2.0*d/0.032*bump);
	var curvature=bump*(vec3f(-2.0/0.032,0,-2.0/0.032)+4.0/0.001024*vec3f(d.x*d.x,d.x*d.y,d.y*d.y));
	${CAUSTIC_WAVES.map((wave, i) => `let angle${i}=dot(p,vec2f(${wave.kx}.0,${wave.ky}.0))-${wave.omega}*params.geometry.z+${wave.phase}; let value${i}=${wave.amplitude}*cos(angle${i}); h+=vec3f(value${i},-${wave.amplitude}*sin(angle${i})*vec2f(${wave.kx}.0,${wave.ky}.0)); curvature-=value${i}*vec3f(${wave.kx ** 2}.0,${wave.kx * wave.ky}.0,${wave.ky ** 2}.0);`).join('\n')}
	return Surface(vec3f(0.14,0,0)+params.geometry.x*h,params.geometry.x*curvature);
}
fn rayDerivative(raw: vec3f,n: vec3f,normalLength: f32,factor: f32,eta: f32,root: f32) -> vec3f {
	let dn=(raw-n*dot(n,raw))/normalLength;
	return factor*dn+(eta-eta*eta*n.z/root)*dn.z*n;
}
fn regularize(a0: vec2f,b0: vec2f) -> vec4f {
	var a=a0; var b=b0; if (dot(a,a)<dot(b,b)) { a=b0; b=a0; }
	let n=length(a); if (n<0.00000001) { return vec4f(1,0,0,1); }
	let e=a/n; let transverse=vec2f(-e.y,e.x); let parallel=dot(b,e); let perpendicular=dot(b,transverse);
	let span=select(1.0,-1.0,perpendicular<0.0)*max(1.0,abs(perpendicular));
	return vec4f(e*max(1.0,n),e*parallel+transverse*span);
}
@compute @workgroup_size(64) fn projectPhotons(@builtin(global_invocation_id) id: vec3u) {
	let grid=u32(params.display.z); if (id.x>=grid*grid) { return; }
	let aspect=params.display.x/params.display.y; let cell=vec2f(${CAUSTIC_APERTURE}*aspect,${CAUSTIC_APERTURE})/f32(grid);
	let p=(vec2f(f32(id.x%grid),f32(id.x/grid))+0.5-f32(grid)*0.5)*cell;
	let jet=surface(p); let h=jet.height; let normalLength=length(vec3f(-h.y,-h.z,1)); let n=vec3f(-h.y,-h.z,1)/normalLength;
	let eta=1.0/params.geometry.w; let root=sqrt(1.0-eta*eta*(1.0-n.z*n.z)); let factor=eta*n.z-root;
	let ray=vec3f(0,0,-eta)+factor*n; let distance=(h.x+params.geometry.y)/(-ray.z); let hit=p+ray.xy*distance;
	let tx=rayDerivative(vec3f(-jet.curvature.x,-jet.curvature.y,0),n,normalLength,factor,eta,root);
	let ty=rayDerivative(vec3f(-jet.curvature.y,-jet.curvature.z,0),n,normalLength,factor,eta,root);
	let jx=vec2f(1,0)+tx.xy*distance+ray.xy*(h.y/(-ray.z)+(h.x+params.geometry.y)*tx.z/(ray.z*ray.z));
	let jy=vec2f(0,1)+ty.xy*distance+ray.xy*(h.z/(-ray.z)+(h.x+params.geometry.y)*ty.z/(ray.z*ray.z));
	let a=jx*cell.x*params.display.y; let b=jy*cell.y*params.display.y;
	let basis=regularize(select(a,a+b,params.center.z>0.5),select(b,a-b,params.center.z>0.5));
	let pixel=hit*params.display.y+params.display.xy*0.5;
	let area=abs(basis.x*basis.w-basis.y*basis.z);
	let power=cell.x*cell.y*params.display.y*params.display.y/(area*${LIGHT_STORAGE_SCALE}.0);
	photons[id.x]=Photon(vec4f(pixel,power,0),basis);
}
`;
const splatShader = /* wgsl */ `
struct Params { display: vec4f, geometry: vec4f, center: vec4f, extra: vec4f };
struct Photon { centerPower: vec4f, basis: vec4f };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> photons: array<Photon>;
struct Vertex { @builtin(position) clip: vec4f, @location(0) local: vec2f, @location(1) @interpolate(flat) power: f32 };
@vertex fn vertex(@builtin(vertex_index) i: u32,@builtin(instance_index) instance: u32) -> Vertex {
	let corner=array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(-1,1),vec2f(1,-1),vec2f(1,1))[i];
	let p=photons[instance]; let pixel=p.centerPower.xy+corner.x*p.basis.xy+corner.y*p.basis.zw;
	return Vertex(vec4f((pixel/params.display.xy*2.0-1.0)*vec2f(1,-1),0,1),corner,p.centerPower.z);
}
@fragment fn fragment(in: Vertex) -> @location(0) vec4f {
	let tent=max(vec2f(0),1.0-abs(in.local)); return vec4f(in.power*tent.x*tent.y,0,0,0);
}
`;
const presentationShader = /* wgsl */ `
@group(0) @binding(0) var light: texture_2d<f32>;
@vertex fn vertex(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3))[i],0,1); }
@fragment fn fragment(@builtin(position) p: vec4f) -> @location(0) vec4f {
	let irradiance=textureLoad(light,vec2i(p.xy),0).r*${LIGHT_STORAGE_SCALE}.0;
	// Positive, monotone exposure of a linear energy attachment. No bloom,
	// neighborhood glow, procedural light pattern, or temporal accumulation.
	// A fixed matte receiver, not a specular water-sheet image. The finite
	// light source extends outside this crop, so its edge is not a silhouette.
	let base=vec3f(0.025,0.026,0.020); let lit=vec3f(0.31,0.37,0.25)*irradiance*0.24;
	let mapped=1.0-exp(-(base+lit)); return vec4f(pow(mapped,vec3f(1.0/2.2)),1);
}
`;

const photoPresentationShader = /* wgsl */ `
struct Params { display: vec4f, geometry: vec4f, center: vec4f, extra: vec4f };
@group(0) @binding(0) var light: texture_2d<f32>;
@group(0) @binding(1) var photo: texture_2d<f32>;
@group(0) @binding(2) var filtered: sampler;
@group(0) @binding(3) var<uniform> params: Params;
@vertex fn vertex(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3))[i],0,1); }
fn encode(linear: vec3f) -> vec3f { return select(1.055*pow(max(linear,vec3f(0)),vec3f(1.0/2.4))-0.055,12.92*linear,linear<=vec3f(0.0031308)); }
@fragment fn fragment(@builtin(position) p: vec4f) -> @location(0) vec4f {
	let dimensions=vec2f(textureDimensions(photo,0)); let sourceAspect=dimensions.x/dimensions.y;
	let aspect=params.display.x/params.display.y;
	let scale=0.9*vec2f(min(1.0,aspect/sourceAspect),min(1.0,sourceAspect/aspect));
	// No camera movement, UV displacement, feedback texture or recovered scene
	// geometry. The immutable sRGB source is decoded by texture sampling.
	let uv=(p.xy/params.display.xy-0.5)*scale+vec2f(0.5,0.475);
	let color=textureSampleGrad(photo,filtered,uv,vec2f(scale.x/params.display.x,0),vec2f(0,scale.y/params.display.y)).rgb;
	let irradiance=textureLoad(light,vec2i(p.xy),0).r*${LIGHT_STORAGE_SCALE}.0;
	let gain=0.7+0.3*irradiance;
	let exposed=color*gain/(1.0+color*(gain-1.0));
	return vec4f(encode(exposed),1);
}
`;
const photoMipShader = /* wgsl */ `
@group(0) @binding(0) var previous: texture_2d<f32>;
@group(0) @binding(1) var filtered: sampler;
struct Vertex { @builtin(position) clip: vec4f, @location(0) uv: vec2f };
@vertex fn vertex(@builtin(vertex_index) i: u32) -> Vertex { let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3))[i]; return Vertex(vec4f(p,0,1),p*vec2f(0.5,-0.5)+0.5); }
@fragment fn fragment(in: Vertex) -> @location(0) vec4f { return textureSampleLevel(previous,filtered,in.uv,0); }
`;

function decodeHalf(value: number): number {
	const sign = value & 0x8000 ? -1 : 1, exponent = value >> 10 & 31, fraction = value & 1023;
	return sign * (exponent === 0 ? fraction * 2 ** -24 : exponent === 31 ? fraction ? NaN : Infinity : (1 + fraction / 1024) * 2 ** (exponent - 15));
}

export async function createCausticLight(device: GPUDevice, format: GPUTextureFormat,
	{ photonGrid = 128, interleaved = true, image, onError }: { photonGrid?: PhotonGrid; /** Diagnostic single-lattice comparison; no extra UI setting. */ interleaved?: boolean; /** Caller owns the bitmap; the model owns an immutable native GPU copy. */ image?: ImageBitmap; onError?: (message: string) => void } = {}): Promise<CausticLight> {
	if (![64, 128, 256].includes(photonGrid)) throw new Error('Light sample grid must be 64, 128 or 256.');
	const sourceWidth = image?.width ?? 0, sourceHeight = image?.height ?? 0;
	const sourceInfo = image ? coverImageBytes(sourceWidth, sourceHeight) : { bytes: 0, levels: 0 };
	if (sourceWidth > device.limits.maxTextureDimension2D || sourceHeight > device.limits.maxTextureDimension2D || sourceInfo.bytes > 192 * 1024 ** 2) throw new Error('Native caustic photograph exceeds the explicit source budget; no downsampled substitute.');
	const modules = [shader, splatShader, image ? photoPresentationShader : presentationShader, ...(image ? [photoMipShader] : [])].map((code, i) => device.createShaderModule({ label: `Forward caustic ${i}`, code }));
	for (const module of modules) { const errors = (await module.getCompilationInfo()).messages.filter((m) => m.type === 'error'); if (errors.length) throw new Error(errors.map((m) => `${m.lineNum}: ${m.message}`).join('\n')); }
	const project = await device.createComputePipelineAsync({ layout: 'auto', compute: { module: modules[0], entryPoint: 'projectPhotons' } });
	const add: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one', operation: 'add' };
	const splat = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: modules[1], entryPoint: 'vertex' }, fragment: { module: modules[1], entryPoint: 'fragment', targets: [{ format: 'r16float', blend: { color: add, alpha: add } }] } });
	const present = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: modules[2], entryPoint: 'vertex' }, fragment: { module: modules[2], entryPoint: 'fragment', targets: [{ format }] } });
	const mip = image ? await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: modules[3], entryPoint: 'vertex' }, fragment: { module: modules[3], entryPoint: 'fragment', targets: [{ format: 'rgba8unorm-srgb' }] } }) : undefined;
	device.pushErrorScope('validation'); device.pushErrorScope('out-of-memory');
	let uniform: GPUBuffer | undefined, photons: GPUBuffer | undefined, photo: GPUTexture | undefined, sampler: GPUSampler | undefined;
	let projectionGroup: GPUBindGroup, splatGroup: GPUBindGroup;
	const destroyStartup = () => { uniform?.destroy(); photons?.destroy(); photo?.destroy(); };
	try {
		uniform = device.createBuffer({ size: UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
		photons = device.createBuffer({ label: 'Bounded light-ray footprints', size: PHOTON_BYTES, usage: GPUBufferUsage.STORAGE });
		const bind = (pipeline: GPUComputePipeline | GPURenderPipeline) => device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform! } }, { binding: 1, resource: { buffer: photons! } }] });
		projectionGroup = bind(project); splatGroup = bind(splat);
		if (image && mip) {
			photo = device.createTexture({ label: 'Immutable native caustic photograph and mips', size: [sourceWidth, sourceHeight], format: 'rgba8unorm-srgb', mipLevelCount: sourceInfo.levels, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
			device.queue.copyExternalImageToTexture({ source: image }, { texture: photo }, [sourceWidth, sourceHeight]);
			sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear', mipmapFilter: 'linear' });
			const encoder = device.createCommandEncoder({ label: 'One-time linear-light photograph prefilter' });
			for (let level = 1; level < sourceInfo.levels; level++) {
				const group = device.createBindGroup({ layout: mip.getBindGroupLayout(0), entries: [{ binding: 0, resource: photo.createView({ baseMipLevel: level - 1, mipLevelCount: 1 }) }, { binding: 1, resource: sampler }] });
				const pass = encoder.beginRenderPass({ colorAttachments: [{ view: photo.createView({ baseMipLevel: level, mipLevelCount: 1 }), loadOp: 'clear', storeOp: 'store' }] });
				pass.setPipeline(mip); pass.setBindGroup(0, group); pass.draw(3); pass.end();
			}
			device.queue.submit([encoder.finish()]);
		}
	} catch (error) { destroyStartup(); await Promise.allSettled([device.popErrorScope(), device.popErrorScope()]); throw error; }
	try {
		const startupErrors = await Promise.all([device.popErrorScope(), device.popErrorScope()]);
		if (startupErrors.some(Boolean)) throw new Error(startupErrors.filter(Boolean).map((e) => e!.message).join('\n'));
	} catch (error) { destroyStartup(); throw error; }
	const params = uniform, rays = photons;
	let width = 1, height = 1, disposed = false, dirty = true, failure = '', readPending = false;
	let texture: GPUTexture | undefined, view: GPUTextureView | undefined, presentationGroup: GPUBindGroup | undefined;
	let peakResizeBytes = PHOTON_BYTES + UNIFORM_BYTES + sourceInfo.bytes, projectionDispatches = 0, splatPasses = 0, presentationPasses = 0;
	const g = { ...CAUSTIC_DEFAULTS }, data = new Float32Array(16);
	const changed = () => { dirty = true; };
	const bounded = (value: number, min: number, max: number, label: string) => { if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be in [${min}, ${max}].`); return value; };
	const fail = (message: string) => { if (disposed) return; failure = message; try { onError?.(message); } catch { /* A consumer cannot break GPU ownership. */ } };
	const engine: CausticLight = {
		get memoryBytes() { return PHOTON_BYTES + UNIFORM_BYTES + sourceInfo.bytes + (texture ? width * height * 2 : 0); },
		setRelief(value) { const next = bounded(value, 0, 1, 'Surface relief'); if (!disposed && g.relief !== next) { g.relief = next; changed(); } },
		setDepth(value) { const next = bounded(value, 0.15, 1, 'Receiver depth'); if (!disposed && g.depth !== next) { g.depth = next; changed(); } },
		setIndex(value) { const next = bounded(value, 1, 1.6, 'Refractive index'); if (!disposed && g.index !== next) { g.index = next; changed(); } },
		setPosition(x, y) { bounded(x, 0, 1, 'Lens x'); bounded(y, 0, 1, 'Lens y'); if (!disposed && (g.centerX !== x || g.centerY !== y)) { g.centerX = x; g.centerY = y; changed(); } },
		setPhase(value) { bounded(value, -1000, 1000, 'Surface phase'); if (!disposed && g.phase !== value) { g.phase = value; changed(); } },
		setPhotonGrid(value) { if (![64, 128, 256].includes(value)) throw new Error('Light sample grid must be 64, 128 or 256.'); if (!disposed && photonGrid !== value) { photonGrid = value; changed(); } },
		resize(w, h) {
			if (disposed || (texture && w === width && h === height)) return;
			if (readPending) throw new Error('Finish the explicit light readback before resizing.');
			if (w > device.limits.maxTextureDimension2D || h > device.limits.maxTextureDimension2D) throw new Error('Native caustic dimensions exceed this device.');
			const plan = causticMemoryPlan(w, h, texture ? width * height : 0, sourceInfo.bytes);
			device.pushErrorScope('validation'); device.pushErrorScope('out-of-memory');
			let candidate: GPUTexture | undefined;
			try {
				candidate = device.createTexture({ label: 'Native linear caustic irradiance', size: [w, h], format: 'r16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC });
				const nextView = candidate.createView(), entries: GPUBindGroupEntry[] = [{ binding: 0, resource: nextView }];
				if (photo && sampler) entries.push({ binding: 1, resource: photo.createView() }, { binding: 2, resource: sampler }, { binding: 3, resource: { buffer: params } });
				const group = device.createBindGroup({ layout: present.getBindGroupLayout(0), entries });
				const old = texture; texture = candidate; view = nextView; presentationGroup = group; width = w; height = h; peakResizeBytes = plan.peakResizeBytes; changed(); old?.destroy();
			} catch (error) { candidate?.destroy(); throw error; }
			finally { void Promise.all([device.popErrorScope(), device.popErrorScope()]).then((errors) => { const message = errors.filter(Boolean).map((e) => e!.message).join('\n'); if (message) fail(message); }).catch((error) => fail(String(error))); }
		},
		reset() { if (!disposed) { g.centerX = CAUSTIC_DEFAULTS.centerX; g.centerY = CAUSTIC_DEFAULTS.centerY; g.phase = 0; changed(); } },
		step(_encoder, dt, input) { if (disposed || !input.active || !Number.isFinite(dt) || dt <= 0 || ![input.x, input.y].every(Number.isFinite)) return; this.setPosition(Math.max(0, Math.min(1, input.x)), Math.max(0, Math.min(1, input.y))); },
		render(encoder, target) {
			if (disposed) return; if (failure) throw new Error(failure); if (!texture || !view || !presentationGroup) throw new Error('Resize the caustic receiver before rendering.');
			if (dirty) {
				data.set([width, height, photonGrid, 0, g.relief, g.depth, g.phase, g.index, g.centerX, g.centerY, Number(interleaved), 0]); device.queue.writeBuffer(params, 0, data);
				const compute = encoder.beginComputePass({ label: 'Project equal-flux light samples' }); compute.setPipeline(project); compute.setBindGroup(0, projectionGroup); compute.dispatchWorkgroups(Math.ceil(photonGrid ** 2 / 64)); compute.end(); projectionDispatches++;
				const accumulation = encoder.beginRenderPass({ label: 'Add normalized light footprints', colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] }); accumulation.setPipeline(splat); accumulation.setBindGroup(0, splatGroup); accumulation.draw(6, photonGrid ** 2); accumulation.end(); splatPasses++; dirty = false;
			}
			const pass = encoder.beginRenderPass({ label: 'Expose native caustic receiver', colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] }); pass.setPipeline(present); pass.setBindGroup(0, presentationGroup); pass.draw(3); pass.end(); presentationPasses++;
		},
		async inspect() {
			if (disposed) throw new Error('Caustic light disposed.');
			const budget = causticFluxBudget(photonGrid, width, height, g, interleaved);
			return { finite: !failure && Object.values(g).every(Number.isFinite), mass: budget.incident, initialMass: budget.incident, min: 0, max: 0.14 + g.relief * 0.087, kinetic: 0,
				details: { ...g, width, height, photonGrid, interleaved: Number(interleaved), photonCount: photonGrid ** 2, stateBytes: UNIFORM_BYTES, photonBytes: PHOTON_BYTES, sourceWidth, sourceHeight, sourceBytes: sourceInfo.bytes, mipLevels: sourceInfo.levels, startupMipPasses: Math.max(0, sourceInfo.levels - 1), attachmentBytes: texture ? width * height * 2 : 0, resolvedCanvasBytes: width * height * 4, peakResizeBytes, projectionDispatches, splatPasses, presentationPasses, expectedFlux: budget.incident, capturedFlux: budget.captured, escapedFlux: budget.escaped, splatPixelBound: budget.splatPixels, dirty: Number(dirty), transmission: 1 } };
		},
		async readLight() {
			if (disposed || failure || !texture || dirty || readPending) throw new Error('Light readback requires one completed, current receiver and no pending readback.');
			const bytesPerRow = Math.ceil(width * 2 / 256) * 256, bytes = bytesPerRow * height;
			if (this.memoryBytes + width * height * 4 + bytes > MEMORY_BUDGET) throw new Error('Explicit light readback exceeds its peak attachment budget.');
			readPending = true;
			let read: GPUBuffer | undefined;
			try {
				read = device.createBuffer({ label: 'Explicit linear-light diagnostic', size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
				const encoder = device.createCommandEncoder(); encoder.copyTextureToBuffer({ texture }, { buffer: read, bytesPerRow }, [width, height]); device.queue.submit([encoder.finish()]); await read.mapAsync(GPUMapMode.READ);
				const source = new Uint16Array(read.getMappedRange()), values = new Float32Array(width * height); let sum = 0, maximum = 0, finite = true;
				for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const value = decodeHalf(source[y * bytesPerRow / 2 + x]) * LIGHT_STORAGE_SCALE; values[y * width + x] = value; sum += value; maximum = Math.max(maximum, value); finite &&= Number.isFinite(value) && value >= 0; }
				return { width, height, values, flux: sum / height ** 2, maximum, finite };
			} finally { read?.destroy(); readPending = false; }
		},
		dispose() { if (!disposed) { disposed = true; texture?.destroy(); params.destroy(); rays.destroy(); photo?.destroy(); } }
	};
	return engine;
}
