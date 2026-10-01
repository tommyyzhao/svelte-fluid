import { describe, expect, it } from 'vitest';
import { NATIVE_WEBGPU_SHADERS } from '../webgpu/shaders.js';

describe('native distortion presentation', () => {
	it('maps visible bleed space through cover/contain image fitting', () => {
		const shader = NATIVE_WEBGPU_SHADERS.display;
		expect(shader).toContain('let visible_uv = (uv - bleed)');
		expect(shader).toContain('let visible_ratio = params.distortion_options.w');
		expect(shader).toContain('if (params.distortion_layout.y < 0.5)');
		expect(shader).toContain('image_uv /= max(params.distortion_layout.x, 0.01)');
	});

	it('gates velocity-direction distortion by dye and power', () => {
		const shader = NATIVE_WEBGPU_SHADERS.display;
		expect(shader).toContain('let flow = textureSampleLevel(velocity');
		expect(shader).toContain('let offset = textureSampleLevel(dye, linear_sampler, uv, 0.0).r');
		expect(shader).toContain('if (length(flow) > 0.00001) { flow_direction = normalize(flow); }');
		expect(shader).toContain('image_uv -= params.distortion_options.y * flow_direction * offset');
	});

	it('soft-clips image edges and preserves premultiplied alpha', () => {
		const shader = NATIVE_WEBGPU_SHADERS.display;
		expect(shader).toContain('var edge_alpha = smoothstep(0.0, edge_width, image_uv.x)');
		expect(shader).toContain('edge_alpha *= allowed');
		expect(shader).toContain('edge_alpha *= image_sample.a');
		expect(shader).toContain('return vec4f(image_sample.rgb * edge_alpha, edge_alpha)');
	});
});
