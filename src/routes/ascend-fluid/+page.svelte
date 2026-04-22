<!--
  Standalone replication of Ascend-Fluid's reveal effect.
  This is completely decoupled from svelte-fluid's FluidEngine —
  a direct port of the reference WebGL fluid simulation at
  Ascend-Fluid/scripts/fluid.js + Ascend-Fluid/templates/index.html.

  The fluid canvas acts as a reveal mask: where dye accumulates the
  canvas becomes transparent, showing the content (particles + text)
  behind it. No curl/vorticity, no bloom, no shading — just a minimal
  Navier-Stokes solver with a single display shader.
-->

<script lang="ts">
	import { onMount } from 'svelte';

	let heroEl: HTMLElement;
	let canvasEl: HTMLCanvasElement;

	// ---- Shader sources (from Ascend-Fluid/templates/index.html) ----

	const VERT = `
		precision highp float;
		attribute vec2 aPosition;
		varying vec2 vUv;
		varying vec2 vL;
		varying vec2 vR;
		varying vec2 vT;
		varying vec2 vB;
		uniform vec2 u_vertex_texel;
		void main () {
			vUv = aPosition * .5 + .5;
			vL = vUv - vec2(u_vertex_texel.x, 0.);
			vR = vUv + vec2(u_vertex_texel.x, 0.);
			vT = vUv + vec2(0., u_vertex_texel.y);
			vB = vUv - vec2(0., u_vertex_texel.y);
			gl_Position = vec4(aPosition, 0., 1.);
		}
	`;

	const FRAG_ADVECTION = `
		precision highp float;
		precision highp sampler2D;
		varying vec2 vUv;
		uniform sampler2D u_velocity_txr;
		uniform sampler2D u_input_txr;
		uniform vec2 u_vertex_texel;
		uniform vec2 u_output_textel;
		uniform float u_dt;
		uniform float u_dissipation;

		vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
			vec2 st = uv / tsize - 0.5;
			vec2 iuv = floor(st);
			vec2 fuv = fract(st);
			vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
			vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
			vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
			vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
			return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
		}

		void main () {
			vec2 coord = vUv - u_dt * bilerp(u_velocity_txr, vUv, u_vertex_texel).xy * u_vertex_texel;
			gl_FragColor = u_dissipation * bilerp(u_input_txr, coord, u_output_textel);
			gl_FragColor.a = 1.;
		}
	`;

	const FRAG_DIVERGENCE = `
		precision highp float;
		precision highp sampler2D;
		varying highp vec2 vUv;
		varying highp vec2 vL;
		varying highp vec2 vR;
		varying highp vec2 vT;
		varying highp vec2 vB;
		uniform sampler2D u_velocity_txr;
		void main () {
			float L = texture2D(u_velocity_txr, vL).x;
			float R = texture2D(u_velocity_txr, vR).x;
			float T = texture2D(u_velocity_txr, vT).y;
			float B = texture2D(u_velocity_txr, vB).y;
			float div = .5 * (R - L + T - B);
			gl_FragColor = vec4(div, 0., 0., 1.);
		}
	`;

	const FRAG_PRESSURE = `
		precision highp float;
		precision highp sampler2D;
		varying highp vec2 vUv;
		varying highp vec2 vL;
		varying highp vec2 vR;
		varying highp vec2 vT;
		varying highp vec2 vB;
		uniform sampler2D u_pressure_txr;
		uniform sampler2D u_divergence_txr;
		void main () {
			float L = texture2D(u_pressure_txr, vL).x;
			float R = texture2D(u_pressure_txr, vR).x;
			float T = texture2D(u_pressure_txr, vT).x;
			float B = texture2D(u_pressure_txr, vB).x;
			float divergence = texture2D(u_divergence_txr, vUv).x;
			float pressure = (L + R + B + T - divergence) * 0.25;
			gl_FragColor = vec4(pressure, 0., 0., 1.);
		}
	`;

	const FRAG_GRADIENT_SUBTRACT = `
		precision highp float;
		precision highp sampler2D;
		varying highp vec2 vUv;
		varying highp vec2 vL;
		varying highp vec2 vR;
		varying highp vec2 vT;
		varying highp vec2 vB;
		uniform sampler2D u_pressure_txr;
		uniform sampler2D u_velocity_txr;
		void main () {
			float L = texture2D(u_pressure_txr, vL).x;
			float R = texture2D(u_pressure_txr, vR).x;
			float T = texture2D(u_pressure_txr, vT).x;
			float B = texture2D(u_pressure_txr, vB).x;
			vec2 velocity = texture2D(u_velocity_txr, vUv).xy;
			velocity.xy -= vec2(R - L, T - B);
			gl_FragColor = vec4(velocity, 0., 1.);
		}
	`;

	const FRAG_SPLAT = `
		precision highp float;
		precision highp sampler2D;
		varying vec2 vUv;
		uniform sampler2D u_input_txr;
		uniform float u_ratio;
		uniform vec3 u_point_value;
		uniform vec2 u_point;
		uniform float u_point_size;
		void main () {
			vec2 p = vUv - u_point.xy;
			p.x *= u_ratio;
			vec3 splat = pow(2., -dot(p, p) / u_point_size) * u_point_value;
			vec3 base = texture2D(u_input_txr, vUv).xyz;
			gl_FragColor = vec4(base + splat, 1.);
		}
	`;

	const FRAG_DISPLAY = `
		precision highp float;
		precision highp sampler2D;
		varying vec2 vUv;
		uniform sampler2D u_output_texture;
		void main () {
			vec3 C = texture2D(u_output_texture, vUv).rgb;
			float a = max(C.r, max(C.g, C.b));
			a = pow(.1 * a, .1);
			a = clamp(a, 0., 1.);
			gl_FragColor = vec4(1. - C, 1. - a);
		}
	`;

	// ---- Simulation parameters (from Ascend-Fluid/scripts/fluid.js) ----

	onMount(() => {
		const params = {
			SIM_RESOLUTION: 128,
			DYE_RESOLUTION: 1024,
			DENSITY_DISSIPATION: 0.995,
			VELOCITY_DISSIPATION: 0.9,
			PRESSURE_ITERATIONS: 10,
			SPLAT_RADIUS: 3 / window.innerHeight,
			color: { r: 0.451, g: 0.01, b: 0.8 }
		};
		canvasEl.width = canvasEl.clientWidth;
		canvasEl.height = canvasEl.clientHeight;

		const gl = canvasEl.getContext('webgl')!;
		gl.getExtension('OES_texture_float');

		const pointer = {
			x: 0.65 * window.innerWidth,
			y: 0.5 * window.innerHeight,
			dx: 0,
			dy: 0,
			moved: false,
			firstMove: false
		};

		// Start auto-animation after 3 seconds
		const autoTimer = window.setTimeout(() => {
			pointer.firstMove = true;
		}, 3000);

		let prevTimestamp = Date.now();

		// ---- WebGL helpers ----

		function compileShader(source: string, type: number): WebGLShader {
			const shader = gl.createShader(type)!;
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				console.error('Shader compile error:', gl.getShaderInfoLog(shader));
			}
			return shader;
		}

		function createProgram(fragSource: string) {
			const vs = compileShader(VERT, gl.VERTEX_SHADER);
			const fs = compileShader(fragSource, gl.FRAGMENT_SHADER);
			const program = gl.createProgram()!;
			gl.attachShader(program, vs);
			gl.attachShader(program, fs);
			gl.linkProgram(program);
			if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
				console.error('Program link error:', gl.getProgramInfoLog(program));
			}
			const uniforms: Record<string, WebGLUniformLocation | null> = {};
			const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
			for (let i = 0; i < count; i++) {
				const name = gl.getActiveUniform(program, i)!.name;
				uniforms[name] = gl.getUniformLocation(program, name);
			}
			return { program, uniforms };
		}

		function createFBO(w: number, h: number, type: number = gl.RGBA) {
			gl.activeTexture(gl.TEXTURE0);
			const texture = gl.createTexture()!;
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texImage2D(gl.TEXTURE_2D, 0, type, w, h, 0, type, gl.FLOAT, null);
			const fbo = gl.createFramebuffer()!;
			gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
			gl.viewport(0, 0, w, h);
			gl.clear(gl.COLOR_BUFFER_BIT);
			return {
				fbo,
				width: w,
				height: h,
				attach(id: number) {
					gl.activeTexture(gl.TEXTURE0 + id);
					gl.bindTexture(gl.TEXTURE_2D, texture);
					return id;
				}
			};
		}

		type FBO = ReturnType<typeof createFBO>;

		function createDoubleFBO(w: number, h: number, type?: number) {
			let fbo1 = createFBO(w, h, type);
			let fbo2 = createFBO(w, h, type);
			return {
				width: w,
				height: h,
				texelSizeX: 1 / w,
				texelSizeY: 1 / h,
				read: () => fbo1,
				write: () => fbo2,
				swap() {
					const temp = fbo1;
					fbo1 = fbo2;
					fbo2 = temp;
				}
			};
		}

		function getResolution(resolution: number) {
			let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
			if (aspectRatio < 1) aspectRatio = 1 / aspectRatio;
			const min = Math.round(resolution);
			const max = Math.round(resolution * aspectRatio);
			if (gl.drawingBufferWidth > gl.drawingBufferHeight) {
				return { width: max, height: min };
			}
			return { width: min, height: max };
		}

		function blit(target: FBO | null) {
			gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
			gl.bufferData(
				gl.ARRAY_BUFFER,
				new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]),
				gl.STATIC_DRAW
			);
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
			gl.bufferData(
				gl.ELEMENT_ARRAY_BUFFER,
				new Uint16Array([0, 1, 2, 0, 2, 3]),
				gl.STATIC_DRAW
			);
			gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
			gl.enableVertexAttribArray(0);
			if (target == null) {
				gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
				gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			} else {
				gl.viewport(0, 0, target.width, target.height);
				gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
			}
			gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
		}

		// ---- Create programs ----

		const splatProgram = createProgram(FRAG_SPLAT);
		const divergenceProgram = createProgram(FRAG_DIVERGENCE);
		const pressureProgram = createProgram(FRAG_PRESSURE);
		const gradientSubtractProgram = createProgram(FRAG_GRADIENT_SUBTRACT);
		const advectionProgram = createProgram(FRAG_ADVECTION);
		const displayProgram = createProgram(FRAG_DISPLAY);

		// ---- Init framebuffers ----

		const simRes = getResolution(params.SIM_RESOLUTION);
		const dyeRes = getResolution(params.DYE_RESOLUTION);
		let outputColor = createDoubleFBO(dyeRes.width, dyeRes.height);
		let velocity = createDoubleFBO(simRes.width, simRes.height);
		let divergence = createFBO(simRes.width, simRes.height, gl.RGB);
		let pressure = createDoubleFBO(simRes.width, simRes.height, gl.RGB);

		// ---- Pointer events ----

		window.addEventListener('resize', () => {
			params.SPLAT_RADIUS = 3 / window.innerHeight;
			canvasEl.width = canvasEl.clientWidth;
			canvasEl.height = canvasEl.clientHeight;
		});

		canvasEl.addEventListener('click', (e) => {
			pointer.dx = 10;
			pointer.dy = 10;
			pointer.x = e.pageX;
			pointer.y = e.pageY;
			pointer.firstMove = true;
		});

		canvasEl.addEventListener('mousemove', (e) => {
			pointer.moved = true;
			pointer.dx = 5 * (e.pageX - pointer.x);
			pointer.dy = 5 * (e.pageY - pointer.y);
			pointer.x = e.pageX;
			pointer.y = e.pageY;
			pointer.firstMove = true;
		});

		canvasEl.addEventListener(
			'touchmove',
			(e) => {
				e.preventDefault();
				pointer.moved = true;
				pointer.dx = 8 * (e.targetTouches[0].pageX - pointer.x);
				pointer.dy = 8 * (e.targetTouches[0].pageY - pointer.y);
				pointer.x = e.targetTouches[0].pageX;
				pointer.y = e.targetTouches[0].pageY;
				pointer.firstMove = true;
			},
			{ passive: false }
		);

		// ---- Render loop ----

		let rafId: number;

		function render() {
			const dt = (Date.now() - prevTimestamp) / 1000;
			prevTimestamp = Date.now();

			// Auto-animation before first user interaction
			if (!pointer.firstMove) {
				pointer.moved = true;
				const newX =
					(0.65 +
						0.2 * Math.cos(0.006 * prevTimestamp) * Math.sin(0.008 * prevTimestamp)) *
					window.innerWidth;
				const newY = (0.5 + 0.12 * Math.sin(0.01 * prevTimestamp)) * window.innerHeight;
				pointer.dx = 10 * (newX - pointer.x);
				pointer.dy = 10 * (newY - pointer.y);
				pointer.x = newX;
				pointer.y = newY;
			}

			if (pointer.moved) {
				pointer.moved = false;

				gl.useProgram(splatProgram.program);
				gl.uniform1i(splatProgram.uniforms.u_input_txr, velocity.read().attach(0));
				gl.uniform1f(
					splatProgram.uniforms.u_ratio,
					canvasEl.width / canvasEl.height
				);
				gl.uniform2f(
					splatProgram.uniforms.u_point,
					pointer.x / canvasEl.width,
					1 - pointer.y / canvasEl.height
				);
				gl.uniform3f(
					splatProgram.uniforms.u_point_value,
					pointer.dx,
					-pointer.dy,
					1
				);
				gl.uniform1f(splatProgram.uniforms.u_point_size, params.SPLAT_RADIUS);
				blit(velocity.write());
				velocity.swap();

				gl.uniform1i(splatProgram.uniforms.u_input_txr, outputColor.read().attach(0));
				gl.uniform3f(
					splatProgram.uniforms.u_point_value,
					1 - params.color.r,
					1 - params.color.g,
					1 - params.color.b
				);
				blit(outputColor.write());
				outputColor.swap();
			}

			// Divergence
			gl.useProgram(divergenceProgram.program);
			gl.uniform2f(
				divergenceProgram.uniforms.u_vertex_texel,
				velocity.texelSizeX,
				velocity.texelSizeY
			);
			gl.uniform1i(divergenceProgram.uniforms.u_velocity_txr, velocity.read().attach(0));
			blit(divergence);

			// Pressure solve (Jacobi iterations)
			gl.useProgram(pressureProgram.program);
			gl.uniform2f(
				pressureProgram.uniforms.u_vertex_texel,
				velocity.texelSizeX,
				velocity.texelSizeY
			);
			gl.uniform1i(pressureProgram.uniforms.u_divergence_txr, divergence.attach(0));
			for (let i = 0; i < params.PRESSURE_ITERATIONS; i++) {
				gl.uniform1i(pressureProgram.uniforms.u_pressure_txr, pressure.read().attach(1));
				blit(pressure.write());
				pressure.swap();
			}

			// Gradient subtraction
			gl.useProgram(gradientSubtractProgram.program);
			gl.uniform2f(
				gradientSubtractProgram.uniforms.u_vertex_texel,
				velocity.texelSizeX,
				velocity.texelSizeY
			);
			gl.uniform1i(
				gradientSubtractProgram.uniforms.u_pressure_txr,
				pressure.read().attach(0)
			);
			gl.uniform1i(
				gradientSubtractProgram.uniforms.u_velocity_txr,
				velocity.read().attach(1)
			);
			blit(velocity.write());
			velocity.swap();

			// Advect velocity
			gl.useProgram(advectionProgram.program);
			gl.uniform2f(
				advectionProgram.uniforms.u_vertex_texel,
				velocity.texelSizeX,
				velocity.texelSizeY
			);
			gl.uniform2f(
				advectionProgram.uniforms.u_output_textel,
				velocity.texelSizeX,
				velocity.texelSizeY
			);
			gl.uniform1i(advectionProgram.uniforms.u_velocity_txr, velocity.read().attach(0));
			gl.uniform1i(advectionProgram.uniforms.u_input_txr, velocity.read().attach(0));
			gl.uniform1f(advectionProgram.uniforms.u_dt, dt);
			gl.uniform1f(
				advectionProgram.uniforms.u_dissipation,
				params.VELOCITY_DISSIPATION
			);
			blit(velocity.write());
			velocity.swap();

			// Advect dye
			gl.uniform2f(
				advectionProgram.uniforms.u_output_textel,
				outputColor.texelSizeX,
				outputColor.texelSizeY
			);
			gl.uniform1i(advectionProgram.uniforms.u_velocity_txr, velocity.read().attach(0));
			gl.uniform1i(advectionProgram.uniforms.u_input_txr, outputColor.read().attach(1));
			gl.uniform1f(advectionProgram.uniforms.u_dissipation, params.DENSITY_DISSIPATION);
			blit(outputColor.write());
			outputColor.swap();

			// Display: reveal shader
			gl.useProgram(displayProgram.program);
			gl.uniform1i(
				displayProgram.uniforms.u_output_texture,
				outputColor.read().attach(0)
			);
			blit(null);

			rafId = requestAnimationFrame(render);
		}

		rafId = requestAnimationFrame(render);

		// ---- Particles (tsParticles-compatible inline config) ----
		// Dynamically load tsParticles from CDN for this standalone demo
		const particleScript1 = document.createElement('script');
		particleScript1.src =
			'https://cdn.jsdelivr.net/npm/tsparticles-engine@2.12.0/tsparticles.engine.min.js';
		const particleScript2 = document.createElement('script');
		particleScript2.src =
			'https://cdn.jsdelivr.net/npm/tsparticles@2.12.0/tsparticles.bundle.min.js';
		particleScript2.onload = () => {
			// @ts-expect-error tsParticles global
			if (typeof tsParticles !== 'undefined') {
				// @ts-expect-error tsParticles global
				tsParticles.load('ascend-particles', {
					fpsLimit: 60,
					particles: {
						color: {
							value: [
								'#4A90D9', '#5B9BD5', '#6BAED6', '#7EC8E3', '#87CEEB',
								'#B0E0E6', '#ADD8E6', '#5F9EA0', '#4682B4', '#6495ED',
								'#7B68EE', '#9370DB', '#BA55D3', '#DDA0DD', '#EE82EE',
								'#FF69B4', '#FFB6C1', '#FFC0CB', '#98FB98', '#90EE90',
								'#00FA9A', '#00CED1'
							]
						},
						links: {
							color: '#000000',
							distance: 150,
							enable: true,
							opacity: 0.6,
							width: 1
						},
						move: {
							enable: true,
							speed: 0.8,
							outModes: { default: 'out' as const }
						},
						number: {
							density: { enable: true, area: 800 },
							value: 80
						},
						opacity: { value: { min: 0.3, max: 0.8 } },
						shape: { type: 'circle' },
						size: { value: { min: 3, max: 5 } }
					},
					interactivity: {
						events: {
							onHover: { enable: true, mode: 'grab' },
							onClick: { enable: true, mode: 'push' }
						}
					},
					detectRetina: true
				});
			}
		};
		document.head.appendChild(particleScript1);
		particleScript1.onload = () => document.head.appendChild(particleScript2);

		return () => {
			cancelAnimationFrame(rafId);
			clearTimeout(autoTimer);
			// Clean up particle scripts
			particleScript1.remove();
			particleScript2.remove();
		};
	});
</script>

<section class="hero" bind:this={heroEl}>
	<canvas class="fluid-canvas" bind:this={canvasEl}></canvas>
	<div id="ascend-particles" class="particles-container"></div>
	<div class="content">
		<h1>Ascend Fluid</h1>
		<p>Standalone replication of the reference reveal effect</p>
		<p class="subtitle">Move your cursor to reveal the particles behind the fluid cover</p>
	</div>
</section>

<style>
	.hero {
		position: relative;
		width: 100vw;
		height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		background: #000;
	}

	.fluid-canvas {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: 2;
	}

	.particles-container {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: 1;
	}

	.content {
		position: relative;
		z-index: 0;
		text-align: center;
		color: #fff;
		font-family: 'Almarai', sans-serif;
		pointer-events: none;
	}

	h1 {
		font-size: 4rem;
		font-weight: 700;
		letter-spacing: 0.02em;
		margin: 0 0 0.5rem;
		background: linear-gradient(135deg, #667eea, #764ba2, #f093fb);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	p {
		font-size: 1.2rem;
		opacity: 0.8;
		margin: 0 0 0.3rem;
	}

	.subtitle {
		font-size: 0.9rem;
		opacity: 0.5;
	}
</style>
