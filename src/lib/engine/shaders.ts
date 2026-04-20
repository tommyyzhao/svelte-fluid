/*
 * svelte-fluid — shader sources
 * Derivative work of WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017, MIT.
 * https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
 *
 * All shader source strings ported verbatim from the original script.js
 * lines 440–913. The engine compiles them in `FluidEngine` — this module
 * touches no GL state.
 */

export const baseVertexShader = `
    precision highp float;

    attribute vec2 aPosition;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform vec2 texelSize;

    void main () {
        vUv = aPosition * 0.5 + 0.5;
        vL = vUv - vec2(texelSize.x, 0.0);
        vR = vUv + vec2(texelSize.x, 0.0);
        vT = vUv + vec2(0.0, texelSize.y);
        vB = vUv - vec2(0.0, texelSize.y);
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }
`;

export const blurVertexShader = `
    precision highp float;

    attribute vec2 aPosition;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    uniform vec2 texelSize;

    void main () {
        vUv = aPosition * 0.5 + 0.5;
        float offset = 1.33333333;
        vL = vUv - texelSize * offset;
        vR = vUv + texelSize * offset;
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }
`;

export const blurShader = `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    uniform sampler2D uTexture;

    void main () {
        vec4 sum = texture2D(uTexture, vUv) * 0.29411764;
        sum += texture2D(uTexture, vL) * 0.35294117;
        sum += texture2D(uTexture, vR) * 0.35294117;
        gl_FragColor = sum;
    }
`;

export const copyShader = `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    uniform sampler2D uTexture;

    void main () {
        gl_FragColor = texture2D(uTexture, vUv);
    }
`;

export const clearShader = `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    uniform sampler2D uTexture;
    uniform float value;

    void main () {
        gl_FragColor = value * texture2D(uTexture, vUv);
    }
`;

export const colorShader = `
    precision mediump float;

    uniform vec4 color;

    void main () {
        gl_FragColor = color;
    }
`;

export const checkerboardShader = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform float aspectRatio;

    #define SCALE 25.0

    void main () {
        vec2 uv = floor(vUv * SCALE * vec2(aspectRatio, 1.0));
        float v = mod(uv.x + uv.y, 2.0);
        v = v * 0.1 + 0.8;
        gl_FragColor = vec4(vec3(v), 1.0);
    }
`;

export const displayShaderSource = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uTexture;
    uniform sampler2D uBloom;
    uniform sampler2D uSunrays;
    uniform sampler2D uDithering;
    uniform vec2 ditherScale;
    uniform vec2 texelSize;
    uniform int uContainerShapeType;
    uniform vec2 uContainerCenter;
    uniform float uContainerRadius;
    uniform float uContainerAspect;
    uniform float uContainerHalfW;
    uniform float uContainerHalfH;
    uniform float uContainerInnerCornerRadius;
    uniform float uContainerInnerRadius;
    uniform float uContainerOuterHalfW;
    uniform float uContainerOuterHalfH;
    uniform float uContainerOuterCornerRadius;
    uniform sampler2D uContainerMaskTexture;

    vec3 linearToGamma (vec3 color) {
        color = max(color, vec3(0));
        return max(1.055 * pow(color, vec3(0.416666667)) - 0.055, vec3(0));
    }

    void main () {
        vec3 c = texture2D(uTexture, vUv).rgb;

    #ifdef SHADING
        vec3 lc = texture2D(uTexture, vL).rgb;
        vec3 rc = texture2D(uTexture, vR).rgb;
        vec3 tc = texture2D(uTexture, vT).rgb;
        vec3 bc = texture2D(uTexture, vB).rgb;

        float dx = length(rc) - length(lc);
        float dy = length(tc) - length(bc);

        vec3 n = normalize(vec3(dx, dy, length(texelSize)));
        vec3 l = vec3(0.0, 0.0, 1.0);

        float diffuse = clamp(dot(n, l) + 0.7, 0.7, 1.0);
        c *= diffuse;
    #endif

    #ifdef BLOOM
        vec3 bloom = texture2D(uBloom, vUv).rgb;
    #endif

    #ifdef SUNRAYS
        float sunrays = texture2D(uSunrays, vUv).r;
        c *= sunrays;
    #ifdef BLOOM
        bloom *= sunrays;
    #endif
    #endif

    #ifdef BLOOM
        float noise = texture2D(uDithering, vUv * ditherScale).r;
        noise = noise * 2.0 - 1.0;
        bloom += noise / 255.0;
        bloom = linearToGamma(bloom);
        c += bloom;
    #endif

        float a = max(c.r, max(c.g, c.b));

    #ifdef CONTAINER_MASK
        float cmask = 1.0;
        if (uContainerShapeType == 0) {
            vec2 cp = vec2((vUv.x - uContainerCenter.x) * uContainerAspect,
                           vUv.y - uContainerCenter.y);
            cmask = 1.0 - smoothstep(uContainerRadius - 0.005,
                                      uContainerRadius + 0.005,
                                      length(cp));
        } else if (uContainerShapeType == 1) {
            // Frame: intersection of outside-inner and inside-outer
            // Inner mask: 0 inside inner rect, 1 outside
            float icr = uContainerInnerCornerRadius;
            float innerMask;
            if (icr > 0.0) {
                vec2 id = abs(vec2(vUv.x - uContainerCenter.x, vUv.y - uContainerCenter.y)) - vec2(uContainerHalfW, uContainerHalfH) + icr;
                float iDist = length(max(id, 0.0)) - icr;
                innerMask = smoothstep(-0.005, 0.005, iDist);
            } else {
                float fdx = abs(vUv.x - uContainerCenter.x) - uContainerHalfW;
                float fdy = abs(vUv.y - uContainerCenter.y) - uContainerHalfH;
                innerMask = smoothstep(-0.005, 0.005, max(fdx, fdy));
            }
            // Outer mask: 1 inside outer rect, 0 outside
            float ocr = uContainerOuterCornerRadius;
            float outerMask;
            if (ocr > 0.0) {
                vec2 od = abs(vec2(vUv.x - uContainerCenter.x, vUv.y - uContainerCenter.y)) - vec2(uContainerOuterHalfW, uContainerOuterHalfH) + ocr;
                float oDist = length(max(od, 0.0)) - ocr;
                outerMask = 1.0 - smoothstep(-0.005, 0.005, oDist);
            } else {
                float odx = abs(vUv.x - uContainerCenter.x) - uContainerOuterHalfW;
                float ody = abs(vUv.y - uContainerCenter.y) - uContainerOuterHalfH;
                outerMask = 1.0 - smoothstep(-0.005, 0.005, max(odx, ody));
            }
            cmask = innerMask * outerMask;
        } else if (uContainerShapeType == 2) {
            // Rounded rect: 1 inside, 0 outside
            vec2 rd = abs(vec2(vUv.x - uContainerCenter.x, vUv.y - uContainerCenter.y)) - vec2(uContainerHalfW, uContainerHalfH) + uContainerInnerCornerRadius;
            float rdDist = length(max(rd, 0.0)) - uContainerInnerCornerRadius;
            cmask = 1.0 - smoothstep(-0.005, 0.005, rdDist);
        } else if (uContainerShapeType == 3) {
            // Annulus: 1 in the ring between inner and outer circles, 0 elsewhere
            vec2 cp = vec2((vUv.x - uContainerCenter.x) * uContainerAspect,
                           vUv.y - uContainerCenter.y);
            float d = length(cp);
            float sdf = max(d - uContainerRadius, uContainerInnerRadius - d);
            cmask = 1.0 - smoothstep(-0.005, 0.005, sdf);
        } else if (uContainerShapeType == 4) {
            // SVG path: sample pre-rasterized mask texture
            cmask = texture2D(uContainerMaskTexture, vec2(vUv.x, 1.0 - vUv.y)).r;
        }
        c *= cmask;
        a *= cmask;
    #endif

        gl_FragColor = vec4(c, a);
    }
`;

export const glassShaderSource = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uScene;

    // Glass parameters
    uniform float uGlassThickness;
    uniform float uGlassRefraction;
    uniform float uGlassReflectivity;
    uniform float uGlassChromatic;
    uniform vec2 uLightScreenPos;
    uniform float uTransparent;

    // Container shape uniforms (shared with display shader)
    uniform int uContainerShapeType;
    uniform vec2 uContainerCenter;
    uniform float uContainerRadius;
    uniform float uContainerAspect;
    uniform float uContainerHalfW;
    uniform float uContainerHalfH;
    uniform float uContainerInnerCornerRadius;
    uniform float uContainerInnerRadius;
    uniform float uContainerOuterHalfW;
    uniform float uContainerOuterHalfH;
    uniform float uContainerOuterCornerRadius;
    uniform sampler2D uContainerMaskTexture;

    // Rounded box SDF: negative inside, positive outside
    float roundedBoxSDF(vec2 p, vec2 halfSize, float cr) {
        vec2 d = abs(p) - halfSize + cr;
        return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - cr;
    }

    // Signed distance for non-circle shapes (rim model only)
    float containerSDF(vec2 uv) {
        if (uContainerShapeType == 1) {
            // Frame: fluid between inner and outer rects
            vec2 p = uv - uContainerCenter;
            float innerDist = roundedBoxSDF(p,
                vec2(uContainerHalfW, uContainerHalfH),
                uContainerInnerCornerRadius);
            float outerDist = roundedBoxSDF(p,
                vec2(uContainerOuterHalfW, uContainerOuterHalfH),
                uContainerOuterCornerRadius);
            return max(-innerDist, outerDist);
        } else if (uContainerShapeType == 2) {
            // Rounded rect
            vec2 p = uv - uContainerCenter;
            return roundedBoxSDF(p,
                vec2(uContainerHalfW, uContainerHalfH),
                uContainerInnerCornerRadius);
        } else if (uContainerShapeType == 3) {
            // Annulus
            vec2 p = vec2((uv.x - uContainerCenter.x) * uContainerAspect,
                           uv.y - uContainerCenter.y);
            float d = length(p);
            return max(d - uContainerRadius, uContainerInnerRadius - d);
        } else if (uContainerShapeType == 4) {
            // SVG path: narrow gradient from LINEAR filtering at boundary
            float m = texture2D(uContainerMaskTexture, vec2(uv.x, 1.0 - uv.y)).r;
            return 0.5 - m;
        }
        return 1.0;
    }

    // Normal via central differences (rim model only)
    vec2 containerNormal(vec2 uv) {
        float eps = 0.002;
        float dx = containerSDF(uv + vec2(eps, 0.0)) - containerSDF(uv - vec2(eps, 0.0));
        float dy = containerSDF(uv + vec2(0.0, eps)) - containerSDF(uv - vec2(0.0, eps));
        vec2 g = vec2(dx, dy);
        float len = length(g);
        return len > 0.0001 ? g / len : vec2(0.0);
    }

    void main () {
        vec4 scene = texture2D(uScene, vUv);

        vec3 lightDir = normalize(vec3(2.0 * (uLightScreenPos.x - 0.5), 2.0 * (uLightScreenPos.y - 0.5), 0.6));
        vec3 viewDir = vec3(0.0, 0.0, 1.0);
        vec3 halfVec = normalize(lightDir + viewDir);

        float ior = 1.0 + uGlassRefraction;
        float eta = 1.0 / ior;

        if (uContainerShapeType == 0) {
            // ======== HEMISPHERE ORB MODEL (circles) ========
            // Full-surface glass dome: Snell's law refraction, Fresnel,
            // focused specular, chromatic aberration, rim glow.
            vec2 p = vec2((vUv.x - uContainerCenter.x) * uContainerAspect,
                           vUv.y - uContainerCenter.y);
            float d = length(p);

            if (d >= uContainerRadius) {
                gl_FragColor = uTransparent > 0.5 ? vec4(0.0) : scene;
                return;
            }

            // Normalized position on unit disk and hemisphere normal
            vec2 pn = p / uContainerRadius;
            float r2 = dot(pn, pn);
            // Clamp to avoid NaN at the extreme boundary
            float r2c = min(r2, 0.99);
            float nz = sqrt(1.0 - r2c);
            vec3 N = vec3(pn, nz);

            float cosI = nz;

            // Fresnel across the entire dome surface
            float fresnel = uGlassReflectivity
                + (1.0 - uGlassReflectivity) * pow(1.0 - cosI, 5.0);

            // Snell's law refraction with chromatic aberration.
            // Spread is large enough to produce visible color separation.
            vec3 I = vec3(0.0, 0.0, -1.0);
            float spread = uGlassChromatic * 0.15;
            vec3 Tr = refract(I, N, eta * (1.0 + spread));
            vec3 Tg = refract(I, N, eta);
            vec3 Tb = refract(I, N, eta * (1.0 - spread));

            // Scale refraction to produce visible lens distortion.
            // Larger multiplier = stronger magnification/compression.
            float scale = uContainerRadius * 0.5;
            vec2 afix = vec2(1.0 / uContainerAspect, 1.0);

            vec2 uvR = clamp(vUv + Tr.xy * scale * afix, 0.0, 1.0);
            vec2 uvG = clamp(vUv + Tg.xy * scale * afix, 0.0, 1.0);
            vec2 uvB = clamp(vUv + Tb.xy * scale * afix, 0.0, 1.0);

            vec3 refracted = vec3(
                texture2D(uScene, uvR).r,
                texture2D(uScene, uvG).g,
                texture2D(uScene, uvB).b
            );

            // Light from the fluid that the glass surface can catch.
            // No fluid = no light = no highlights (no phantom outline).
            float fluidLight = dot(refracted, vec3(0.299, 0.587, 0.114));

            // Focused specular (bright point on dome where light reflects)
            float specFocused = pow(max(dot(N, halfVec), 0.0), 128.0);

            // Broad rim specular (visible shine along the glass wall)
            float rimFactor = 1.0 - cosI; // 0 at center, 1 at rim
            float specBroad = pow(max(dot(N, halfVec), 0.0), 8.0)
                * smoothstep(0.3, 0.9, rimFactor);

            float spec = (specFocused + specBroad * 0.35)
                * fresnel * fluidLight;

            // Rim glow: caustic light at the glass wall, driven by fluid
            float rimGlow = smoothstep(0.4, 0.95, rimFactor)
                * 0.25 * fresnel * fluidLight;

            // Fresnel-darkened refraction + fluid-driven highlights
            vec3 glassColor = refracted * (1.0 - fresnel * 0.25)
                + vec3(spec + rimGlow);

            // Narrow anti-aliasing fade at the very boundary only.
            // The refracted UVs pull from inside the circle (valid fluid),
            // so the glass effect should extend all the way to the rim —
            // that's where the fishbowl wall is most visible.
            float nr = sqrt(r2);
            float edgeFade = 1.0 - smoothstep(0.99, 1.0, nr);
            float alpha = uTransparent > 0.5 ? edgeFade : scene.a;
            gl_FragColor = vec4(mix(scene.rgb, glassColor, edgeFade), alpha);

        } else {
            // ======== RIM MODEL (frame, roundedRect, annulus, svgPath) ========
            // Glass band at the container boundary with chromatic aberration.
            float sdf = containerSDF(vUv);
            float glassMask = 1.0 - smoothstep(0.0, uGlassThickness, abs(sdf));

            if (glassMask < 0.001) {
                // Outside the container boundary: transparent in transparent mode
                // Inside (fluid area): pass through scene content
                gl_FragColor = (uTransparent > 0.5 && sdf > 0.0) ? vec4(0.0) : scene;
                return;
            }

            vec2 n2d = containerNormal(vUv);
            float nz = sqrt(max(0.0, 1.0 - dot(n2d, n2d)));
            vec3 N = vec3(n2d, nz);

            float cosTheta = clamp(abs(sdf) / uGlassThickness, 0.0, 1.0);
            float fresnel = uGlassReflectivity
                + (1.0 - uGlassReflectivity) * pow(1.0 - cosTheta, 5.0);

            // Chromatic rim refraction (red least, blue most displaced)
            float spread = uGlassChromatic * 0.5;
            float strBase = (ior - 1.0) * glassMask * 0.08;

            vec2 uvR = clamp(vUv - n2d * strBase * (1.0 - spread), 0.0, 1.0);
            vec2 uvG = clamp(vUv - n2d * strBase, 0.0, 1.0);
            vec2 uvB = clamp(vUv - n2d * strBase * (1.0 + spread), 0.0, 1.0);

            vec3 refracted = vec3(
                texture2D(uScene, uvR).r,
                texture2D(uScene, uvG).g,
                texture2D(uScene, uvB).b
            );

            // Light from the fluid — no fluid = no highlights
            float fluidLight = dot(refracted, vec3(0.299, 0.587, 0.114));

            // Specular + rim glow, driven by fluid brightness
            float spec = pow(max(dot(N, halfVec), 0.0), 64.0)
                * glassMask * fresnel * fluidLight;
            float rimGlow = glassMask * fresnel * 0.15 * fluidLight;

            vec3 glassColor = refracted + vec3(spec + rimGlow);
            // In transparent mode: opaque inside the shape, fade out outside
            float alpha = uTransparent > 0.5 ? (sdf < 0.0 ? 1.0 : glassMask) : scene.a;
            gl_FragColor = vec4(mix(scene.rgb, glassColor, glassMask), alpha);
        }
    }
`;

export const bloomPrefilterShader = `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform vec3 curve;
    uniform float threshold;

    void main () {
        vec3 c = texture2D(uTexture, vUv).rgb;
        float br = max(c.r, max(c.g, c.b));
        float rq = clamp(br - curve.x, 0.0, curve.y);
        rq = curve.z * rq * rq;
        c *= max(rq, br - threshold) / max(br, 0.0001);
        gl_FragColor = vec4(c, 0.0);
    }
`;

export const bloomBlurShader = `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uTexture;

    void main () {
        vec4 sum = vec4(0.0);
        sum += texture2D(uTexture, vL);
        sum += texture2D(uTexture, vR);
        sum += texture2D(uTexture, vT);
        sum += texture2D(uTexture, vB);
        sum *= 0.25;
        gl_FragColor = sum;
    }
`;

export const bloomFinalShader = `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uTexture;
    uniform float intensity;

    void main () {
        vec4 sum = vec4(0.0);
        sum += texture2D(uTexture, vL);
        sum += texture2D(uTexture, vR);
        sum += texture2D(uTexture, vT);
        sum += texture2D(uTexture, vB);
        sum *= 0.25;
        gl_FragColor = sum * intensity;
    }
`;

export const sunraysMaskShader = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;

    void main () {
        vec4 c = texture2D(uTexture, vUv);
        float br = max(c.r, max(c.g, c.b));
        c.a = 1.0 - min(max(br * 20.0, 0.0), 0.8);
        gl_FragColor = c;
    }
`;

export const sunraysShader = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform float weight;

    #define ITERATIONS 16

    void main () {
        float Density = 0.3;
        float Decay = 0.95;
        float Exposure = 0.7;

        vec2 coord = vUv;
        vec2 dir = vUv - 0.5;

        dir *= 1.0 / float(ITERATIONS) * Density;
        float illuminationDecay = 1.0;

        float color = texture2D(uTexture, vUv).a;

        for (int i = 0; i < ITERATIONS; i++)
        {
            coord -= dir;
            float col = texture2D(uTexture, coord).a;
            color += col * illuminationDecay * weight;
            illuminationDecay *= Decay;
        }

        gl_FragColor = vec4(color * Exposure, 0.0, 0.0, 1.0);
    }
`;

export const splatShader = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTarget;
    uniform float aspectRatio;
    uniform vec3 color;
    uniform vec2 point;
    uniform float radius;

    void main () {
        vec2 p = vUv - point.xy;
        p.x *= aspectRatio;
        vec3 splat = exp(-dot(p, p) / radius) * color;
        vec3 base = texture2D(uTarget, vUv).xyz;
        gl_FragColor = vec4(clamp(base + splat, -1000.0, 1000.0), 1.0);
    }
`;

export const advectionShader = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 texelSize;
    uniform vec2 dyeTexelSize;
    uniform float dt;
    uniform float dissipation;

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
    #ifdef MANUAL_FILTERING
        vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
        vec4 result = bilerp(uSource, coord, dyeTexelSize);
    #else
        vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
        vec4 result = texture2D(uSource, coord);
    #endif
        float decay = 1.0 + dissipation * dt;
        gl_FragColor = clamp(result / decay, -1000.0, 1000.0);
    }
`;

export const divergenceShader = `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uVelocity;

    void main () {
        float L = texture2D(uVelocity, vL).x;
        float R = texture2D(uVelocity, vR).x;
        float T = texture2D(uVelocity, vT).y;
        float B = texture2D(uVelocity, vB).y;

        vec2 C = texture2D(uVelocity, vUv).xy;
        if (vL.x < 0.0) { L = -C.x; }
        if (vR.x > 1.0) { R = -C.x; }
        if (vT.y > 1.0) { T = -C.y; }
        if (vB.y < 0.0) { B = -C.y; }

        float div = 0.5 * (R - L + T - B);
        gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
    }
`;

export const curlShader = `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uVelocity;

    void main () {
        float L = texture2D(uVelocity, vL).y;
        float R = texture2D(uVelocity, vR).y;
        float T = texture2D(uVelocity, vT).x;
        float B = texture2D(uVelocity, vB).x;
        float vorticity = R - L - T + B;
        gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
    }
`;

export const vorticityShader = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uVelocity;
    uniform sampler2D uCurl;
    uniform float curl;
    uniform float dt;

    void main () {
        float L = texture2D(uCurl, vL).x;
        float R = texture2D(uCurl, vR).x;
        float T = texture2D(uCurl, vT).x;
        float B = texture2D(uCurl, vB).x;
        float C = texture2D(uCurl, vUv).x;

        vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
        force /= length(force) + 0.0001;
        force *= curl * C;
        force.y *= -1.0;

        vec2 velocity = texture2D(uVelocity, vUv).xy;
        velocity += force * dt;
        velocity = min(max(velocity, -1000.0), 1000.0);
        gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
`;

export const pressureShader = `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;

    void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        float C = texture2D(uPressure, vUv).x;
        float divergence = texture2D(uDivergence, vUv).x;
        float pressure = (L + R + B + T - divergence) * 0.25;
        gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
    }
`;

export const gradientSubtractShader = `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;

    void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        vec2 velocity = texture2D(uVelocity, vUv).xy;
        velocity.xy -= vec2(R - L, T - B);
        gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
`;

/**
 * Multiplies a target FBO by an inline SDF mask. Used as a ping-pong blit
 * after each velocity and dye write to zero out cells outside (or inside)
 * the container shape. The SDF is computed per-fragment from uniforms — no
 * separate mask texture is needed.
 *
 * Shape selection via `uShapeType`:
 *   0 — circle:      1 inside, 0 outside. Aspect-corrected.
 *   1 — frame:        innerMask * outerMask. Box SDF in UV space (no aspect).
 *   2 — roundedRect:  1 inside, 0 outside. Inigo Quilez rounded-box SDF.
 *   3 — annulus:      1 in ring, 0 inside inner / outside outer. Aspect-corrected.
 */
export const applyMaskShader = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTarget;
    uniform int uShapeType;
    uniform float uCx;
    uniform float uCy;
    uniform float uRadius;
    uniform float uAspect;
    uniform float uHalfW;
    uniform float uHalfH;
    uniform float uInnerCornerRadius;
    uniform float uInnerRadius;
    uniform float uOuterHalfW;
    uniform float uOuterHalfH;
    uniform float uOuterCornerRadius;
    uniform sampler2D uMaskTexture;

    void main () {
        vec4 val = texture2D(uTarget, vUv);
        float mask = 1.0;

        if (uShapeType == 0) {
            // Circle: keep inside, zero outside
            vec2 p = vec2((vUv.x - uCx) * uAspect, vUv.y - uCy);
            float d = length(p);
            mask = 1.0 - smoothstep(uRadius - 0.005, uRadius + 0.005, d);
        } else if (uShapeType == 1) {
            // Frame: intersection of outside-inner and inside-outer
            float icr = uInnerCornerRadius;
            float innerMask;
            if (icr > 0.0) {
                vec2 id = abs(vec2(vUv.x - uCx, vUv.y - uCy)) - vec2(uHalfW, uHalfH) + icr;
                float iDist = length(max(id, 0.0)) - icr;
                innerMask = smoothstep(-0.005, 0.005, iDist);
            } else {
                float dx = abs(vUv.x - uCx) - uHalfW;
                float dy = abs(vUv.y - uCy) - uHalfH;
                innerMask = smoothstep(-0.005, 0.005, max(dx, dy));
            }
            float ocr = uOuterCornerRadius;
            float outerMask;
            if (ocr > 0.0) {
                vec2 od = abs(vec2(vUv.x - uCx, vUv.y - uCy)) - vec2(uOuterHalfW, uOuterHalfH) + ocr;
                float oDist = length(max(od, 0.0)) - ocr;
                outerMask = 1.0 - smoothstep(-0.005, 0.005, oDist);
            } else {
                float odx = abs(vUv.x - uCx) - uOuterHalfW;
                float ody = abs(vUv.y - uCy) - uOuterHalfH;
                outerMask = 1.0 - smoothstep(-0.005, 0.005, max(odx, ody));
            }
            mask = innerMask * outerMask;
        } else if (uShapeType == 2) {
            // Rounded rect: keep inside, zero outside
            vec2 rd = abs(vec2(vUv.x - uCx, vUv.y - uCy)) - vec2(uHalfW, uHalfH) + uInnerCornerRadius;
            float rdDist = length(max(rd, 0.0)) - uInnerCornerRadius;
            mask = 1.0 - smoothstep(-0.005, 0.005, rdDist);
        } else if (uShapeType == 3) {
            // Annulus: 1 in the ring, 0 inside inner / outside outer
            vec2 p = vec2((vUv.x - uCx) * uAspect, vUv.y - uCy);
            float d = length(p);
            float sdf = max(d - uRadius, uInnerRadius - d);
            mask = 1.0 - smoothstep(-0.005, 0.005, sdf);
        } else if (uShapeType == 4) {
            // SVG path: sample pre-rasterized mask texture
            mask = texture2D(uMaskTexture, vec2(vUv.x, 1.0 - vUv.y)).r;
        }

        gl_FragColor = val * mask;
    }
`;
