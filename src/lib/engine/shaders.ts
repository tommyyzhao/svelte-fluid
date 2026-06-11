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
    uniform vec3 uBackColor;
    uniform float uCompositeBackground;
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

#ifdef OBSTRUCTION_MASK
    uniform sampler2D uObstructionMask;
#ifdef OBSTRUCTION_FILL
    uniform vec3 uObstructionFillColor;
#endif
#endif

#ifdef FLOW_VISUALIZATION
    uniform sampler2D uFlowPrimary;
    uniform sampler2D uFlowVelocity;
    uniform int uFlowVisMode;
    uniform int uFlowScalarChannel;
    uniform int uFlowTransfer;
    uniform int uFlowGlowMode;
    uniform int uFlowUseRange;
    uniform float uFlowScale;
    uniform vec2 uFlowScalarRange;
    uniform vec3 uFlowScalarColor;
#endif

#ifdef REVEAL
    uniform float uRevealSensitivity;
    uniform float uRevealCurve;
    uniform vec3 uRevealCoverColor;
    uniform vec3 uRevealAccentColor;
    uniform vec3 uRevealFringeColor;
#endif

#ifdef DISTORTION
    uniform sampler2D uDistortionTexture;
    uniform sampler2D uVelocity;
    uniform float uDistortionPower;
    uniform float uImgRatio;
    uniform float uCanvasRatio;
    uniform float uDistortionScale;
    uniform int uDistortionFit;
    uniform vec2 uBleed;
#endif

    vec3 linearToGamma (vec3 color) {
        color = max(color, vec3(0));
        return max(1.055 * pow(color, vec3(0.416666667)) - 0.055, vec3(0));
    }

#ifdef FLOW_VISUALIZATION
    float channel(vec4 v, int ch) {
        if (ch == 0) return v.r;
        if (ch == 1) return v.g;
        return v.b;
    }

    vec3 transfer(float value, int transferKind) {
        float t = clamp(value, 0.0, 1.0);
        if (transferKind == 1) {
            return mix(vec3(0.02, 0.07, 0.17), vec3(0.25, 0.75, 1.0), t);
        }
        if (transferKind == 2) {
            return mix(vec3(0.015, 0.018, 0.035), vec3(0.07, 0.09, 0.45), t);
        }
        if (transferKind == 3) {
            return mix(mix(vec3(0.07, 0.04, 0.25), vec3(0.0, 0.56, 0.55), smoothstep(0.0, 0.55, t)), vec3(0.98, 0.9, 0.18), smoothstep(0.45, 1.0, t));
        }
        if (transferKind == 4) {
            vec3 c0 = vec3(0.04, 0.08, 0.55);
            vec3 c1 = vec3(0.00, 0.70, 0.95);
            vec3 c2 = vec3(0.05, 0.72, 0.22);
            vec3 c3 = vec3(1.00, 0.88, 0.05);
            vec3 c4 = vec3(0.90, 0.08, 0.02);
            vec3 a = mix(c0, c1, smoothstep(0.00, 0.28, t));
            vec3 b = mix(a, c2, smoothstep(0.22, 0.52, t));
            vec3 c = mix(b, c3, smoothstep(0.48, 0.78, t));
            return mix(c, c4, smoothstep(0.72, 1.00, t));
        }
        return mix(mix(vec3(0.10, 0.025, 0.005), vec3(1.0, 0.34, 0.04), smoothstep(0.0, 0.55, t)), vec3(1.5, 1.1, 0.45), smoothstep(0.45, 1.0, t));
    }

    float mapFlowValue(float rawValue) {
        if (uFlowUseRange == 1) {
            float ranged = (rawValue - uFlowScalarRange.x) / max(uFlowScalarRange.y - uFlowScalarRange.x, 0.00001);
            return ranged * uFlowScale;
        }
        return rawValue * uFlowScale;
    }
#endif

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
        float cmask = 1.0;

    #ifdef CONTAINER_MASK
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
                vec2 ip = vec2((vUv.x - uContainerCenter.x) * uContainerAspect, vUv.y - uContainerCenter.y);
                vec2 id = abs(ip) - vec2(uContainerHalfW * uContainerAspect, uContainerHalfH) + icr;
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
                vec2 op = vec2((vUv.x - uContainerCenter.x) * uContainerAspect, vUv.y - uContainerCenter.y);
                vec2 od = abs(op) - vec2(uContainerOuterHalfW * uContainerAspect, uContainerOuterHalfH) + ocr;
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
            vec2 rp = vec2((vUv.x - uContainerCenter.x) * uContainerAspect, vUv.y - uContainerCenter.y);
            vec2 rd = abs(rp) - vec2(uContainerHalfW * uContainerAspect, uContainerHalfH) + uContainerInnerCornerRadius;
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
    #endif

    #ifdef OBSTRUCTION_MASK
        // Interior obstructions cut out of the visible region too, so the
        // display matches the masked physics. Orthogonal to CONTAINER_MASK.
        // Coverage is kept for the optional OBSTRUCTION_FILL paint below —
        // the rasterized mask is anti-aliased, so fill edges stay smooth.
        float obCoverage = texture2D(uObstructionMask, vec2(vUv.x, 1.0 - vUv.y)).r;
        cmask *= (1.0 - obCoverage);
    #endif

    #if defined(CONTAINER_MASK) || defined(OBSTRUCTION_MASK)
        c *= cmask;
        a *= cmask;
    #endif

        float flowMask = cmask;
    #if defined(CONTAINER_MASK) || defined(OBSTRUCTION_MASK)
        // Speed/pressure overlays expose projection noise at the one-cell
        // solid/fluid seam. Keep the antialiased display crop, but draw field
        // visualization only in fully open cells.
        flowMask *= smoothstep(0.75, 0.98, cmask);
    #endif

    #ifdef OBSTRUCTION_MASK
        vec2 solidUv = vec2(vUv.x, 1.0 - vUv.y);
        float solidEdge = texture2D(uObstructionMask, solidUv).r;
        solidEdge = max(solidEdge, texture2D(uObstructionMask, solidUv + vec2(texelSize.x, 0.0)).r);
        solidEdge = max(solidEdge, texture2D(uObstructionMask, solidUv - vec2(texelSize.x, 0.0)).r);
        solidEdge = max(solidEdge, texture2D(uObstructionMask, solidUv + vec2(0.0, texelSize.y)).r);
        solidEdge = max(solidEdge, texture2D(uObstructionMask, solidUv - vec2(0.0, texelSize.y)).r);
        flowMask *= 1.0 - smoothstep(0.05, 0.45, solidEdge);
    #endif

    #ifdef CONTAINER_MASK
        if (uContainerShapeType == 4) {
            vec2 containerUv = vec2(vUv.x, 1.0 - vUv.y);
            float containerEdge = 1.0 - texture2D(uContainerMaskTexture, containerUv).r;
            containerEdge = max(containerEdge, 1.0 - texture2D(uContainerMaskTexture, containerUv + vec2(texelSize.x, 0.0)).r);
            containerEdge = max(containerEdge, 1.0 - texture2D(uContainerMaskTexture, containerUv - vec2(texelSize.x, 0.0)).r);
            containerEdge = max(containerEdge, 1.0 - texture2D(uContainerMaskTexture, containerUv + vec2(0.0, texelSize.y)).r);
            containerEdge = max(containerEdge, 1.0 - texture2D(uContainerMaskTexture, containerUv - vec2(0.0, texelSize.y)).r);
            flowMask *= 1.0 - smoothstep(0.05, 0.45, containerEdge);
        }
    #endif

    #ifdef FLOW_VISUALIZATION
        float flowValue = 0.0;
        if (uFlowVisMode == 1) {
            flowValue = mapFlowValue(length(texture2D(uFlowPrimary, vUv).xy));
        } else if (uFlowVisMode == 2) {
            flowValue = mapFlowValue(abs(texture2D(uFlowPrimary, vUv).r));
        } else {
            float rawScalar = channel(texture2D(uFlowPrimary, vUv), uFlowScalarChannel);
            flowValue = mapFlowValue(rawScalar);
        }
        vec3 flowColor = transfer(flowValue, uFlowTransfer);
        if (uFlowVisMode == 3) {
            flowColor *= uFlowScalarColor;
        }
        if (uFlowGlowMode == 1) {
            float speedGlow = length(texture2D(uFlowVelocity, vUv).xy) * uFlowScale;
            flowColor += vec3(smoothstep(0.35, 1.2, speedGlow)) * 0.25;
        } else if (uFlowGlowMode == 2) {
            flowColor += uFlowScalarColor * smoothstep(0.35, 1.0, flowValue) * 0.22;
        }
        c = max(c, flowColor * flowMask);
        a = max(a, max(c.r, max(c.g, c.b)));
    #endif

    #ifdef DISTORTION
        float offset = texture2D(uTexture, vUv).r;
        vec2 vel = texture2D(uVelocity, vUv).xy;
        vel += 0.001;

        // Remap from full canvas UV to visible sub-region UV.
        // When bleed > 0 the canvas extends beyond the visible area;
        // the image should fill only the visible portion.
        vec2 visUv = (vUv - uBleed) / max(1.0 - 2.0 * uBleed, 0.01);

        // Aspect-ratio-corrected UV (use visible UV for image mapping)
        // Compute visible-area aspect ratio (differs from canvas ratio when bleed is set)
        float visRatio = uCanvasRatio * (1.0 - 2.0 * uBleed.x) / max(1.0 - 2.0 * uBleed.y, 0.01);
        vec2 imgUv = visUv - 0.5;
        if (uDistortionFit == 0) {
            // Cover: image fills visible area, may crop
            if (visRatio > uImgRatio) {
                imgUv.y *= uImgRatio / visRatio;
            } else {
                imgUv.x *= visRatio / uImgRatio;
            }
        } else {
            // Contain: full image visible, may have borders
            if (visRatio > uImgRatio) {
                imgUv.x *= visRatio / uImgRatio;
            } else {
                imgUv.y *= uImgRatio / visRatio;
            }
        }
        imgUv /= max(uDistortionScale, 0.01);
        imgUv += 0.5;

        // Apply velocity-directed distortion
        imgUv -= uDistortionPower * normalize(vel) * offset;

        vec3 img = texture2D(uDistortionTexture, vec2(imgUv.x, 1.0 - imgUv.y)).rgb;

        // Soft edge fade to prevent harsh clipping at image borders
        float ew = 0.004;
        float edgeAlpha = smoothstep(0.0, ew, imgUv.x) * smoothstep(1.0, 1.0 - ew, imgUv.x);
        edgeAlpha *= smoothstep(0.0, ew, imgUv.y) * smoothstep(1.0, 1.0 - ew, imgUv.y);

        gl_FragColor = vec4(img * edgeAlpha * cmask, edgeAlpha * cmask);
    #elif defined(REVEAL)
        float raw = clamp(a * uRevealSensitivity, 0.0, 1.0);
        // pow shapes the input; smoothstep sharpens the transition into a
        // crisp S-curve so the Gaussian tail doesn't create a long gradient.
        // Below ~0.1 shaped: solid cover. Above 0.5: fully revealed.
        float revealAmount = smoothstep(0.0, 0.5, pow(raw, uRevealCurve));
        float alpha = (1.0 - revealAmount) * cmask;
        // Two-tone fringe: cover → fringeColor at the outer edge,
        // fringeColor → accentColor toward the transparent center.
        // Avoids dark intermediate values from mixing distant colors.
        float outerBlend = smoothstep(0.0, 0.15, revealAmount);
        float innerBlend = smoothstep(0.15, 0.4, revealAmount);
        vec3 color = mix(mix(uRevealCoverColor, uRevealFringeColor, outerBlend), uRevealAccentColor, innerBlend);
        gl_FragColor = vec4(color, alpha);
    #else
    #ifdef OBSTRUCTION_FILL
        // Paint the obstruction footprint as a solid object on top of the
        // (already cropped) dye, before background compositing.
        c = mix(c, uObstructionFillColor, obCoverage);
        a = max(a, obCoverage);
    #endif
        if (uCompositeBackground > 0.5) {
            gl_FragColor = vec4(c + uBackColor * (1.0 - a), 1.0);
        } else {
            gl_FragColor = vec4(c, a);
        }
    #endif
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

    // Interior obstructions (cut out as a clean hole in the glass).
    uniform sampler2D uObstructionMask;
    uniform float uHasObstruction;

    // Rounded box SDF: negative inside, positive outside.
    // Aspect-corrected so corners are circular in physical space.
    float roundedBoxSDF(vec2 p, vec2 halfSize, float cr, float aspect) {
        vec2 pa = vec2(p.x * aspect, p.y);
        vec2 ha = vec2(halfSize.x * aspect, halfSize.y);
        vec2 d = abs(pa) - ha + cr;
        return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - cr;
    }

    // Signed distance for non-circle shapes (rim model only)
    float containerSDF(vec2 uv) {
        if (uContainerShapeType == 1) {
            // Frame: fluid between inner and outer rects
            vec2 p = uv - uContainerCenter;
            float innerDist = roundedBoxSDF(p,
                vec2(uContainerHalfW, uContainerHalfH),
                uContainerInnerCornerRadius, uContainerAspect);
            float outerDist = roundedBoxSDF(p,
                vec2(uContainerOuterHalfW, uContainerOuterHalfH),
                uContainerOuterCornerRadius, uContainerAspect);
            return max(-innerDist, outerDist);
        } else if (uContainerShapeType == 2) {
            // Rounded rect
            vec2 p = uv - uContainerCenter;
            return roundedBoxSDF(p,
                vec2(uContainerHalfW, uContainerHalfH),
                uContainerInnerCornerRadius, uContainerAspect);
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

        // Obstructed pixels read as a clean cutout: transparent (transparent
        // mode) or the untouched scene color. Glass rim around obstacles is
        // future work — see ADR-0034.
        if (uHasObstruction > 0.5) {
            float obstruct = texture2D(uObstructionMask, vec2(vUv.x, 1.0 - vUv.y)).r;
            if (obstruct > 0.5) {
                gl_FragColor = uTransparent > 0.5 ? vec4(0.0) : scene;
                return;
            }
        }

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
            // Base magnification is uniform across the dome. glassThickness
            // adds extra refraction at the rim (thicker glass = stronger
            // rim band) without changing the center distortion.
            float rimFactor = 1.0 - cosI; // 0 at center, 1 at rim
            float rimBoost = smoothstep(0.3, 0.95, rimFactor) * uGlassThickness * 5.0;
            float scale = uContainerRadius * 0.5 * (1.0 + rimBoost);
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
            float thicknessFactor = 1.0 + uGlassThickness * 8.0;
            float specBroad = pow(max(dot(N, halfVec), 0.0), 8.0)
                * smoothstep(0.3, 0.9, rimFactor);

            float spec = (specFocused + specBroad * 0.35 * thicknessFactor)
                * fresnel * fluidLight;

            // Rim glow: caustic light at the glass wall, driven by fluid
            float rimGlow = smoothstep(0.4, 0.95, rimFactor)
                * (0.25 + uGlassThickness * 3.0) * fresnel * fluidLight;

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
    uniform sampler2D uStickyMask;
    uniform float uStickyAmplify;

    void main () {
        vec2 p = vUv - point.xy;
        p.x *= aspectRatio;
        vec3 splat = exp(-dot(p, p) / radius) * color;
        float stickyVal = texture2D(uStickyMask, vec2(vUv.x, 1.0 - vUv.y)).r;
        splat *= 1.0 + stickyVal * uStickyAmplify;
        vec3 base = texture2D(uTarget, vUv).xyz;
        gl_FragColor = vec4(clamp(base + splat, -1000.0, 1000.0), 1.0);
    }
`;

export const flowSourceShader = `
    precision highp float;
    precision highp sampler2D;

    #define MAX_FLOW_SOURCE_BATCH 4

    varying vec2 vUv;
    uniform sampler2D uTarget;
    uniform float aspectRatio;
    uniform int uCount;
    uniform int uKind[MAX_FLOW_SOURCE_BATCH];
    uniform int uProfile[MAX_FLOW_SOURCE_BATCH];
    uniform vec2 uFrom[MAX_FLOW_SOURCE_BATCH];
    uniform vec2 uTo[MAX_FLOW_SOURCE_BATCH];
    uniform vec4 uRect[MAX_FLOW_SOURCE_BATCH];
    uniform vec3 uColor[MAX_FLOW_SOURCE_BATCH];
    uniform float uRadius[MAX_FLOW_SOURCE_BATCH];
    uniform sampler2D uStickyMask;
    uniform float uStickyAmplify;

    float profileWeight(int profile, float t) {
        if (profile != 1) return 1.0;
        float centered = t * 2.0 - 1.0;
        return max(0.0, 1.0 - centered * centered);
    }

    vec2 aspectVec(vec2 p) {
        return vec2(p.x * aspectRatio, p.y);
    }

    void main () {
        vec3 splat = vec3(0.0);

        for (int i = 0; i < MAX_FLOW_SOURCE_BATCH; i++) {
            if (i >= uCount) break;

            float d2 = 0.0;
            float t = 0.5;

            if (uKind[i] == 0) {
                vec2 d = aspectVec(vUv - uFrom[i]);
                d2 = dot(d, d);
            } else if (uKind[i] == 1) {
                vec2 pa = aspectVec(vUv - uFrom[i]);
                vec2 ba = aspectVec(uTo[i] - uFrom[i]);
                t = clamp(dot(pa, ba) / max(dot(ba, ba), 0.000001), 0.0, 1.0);
                vec2 d = pa - ba * t;
                d2 = dot(d, d);
            } else {
                vec2 mn = uRect[i].xy;
                vec2 mx = uRect[i].xy + uRect[i].zw;
                vec2 closest = clamp(vUv, mn, mx);
                vec2 d = aspectVec(vUv - closest);
                d2 = dot(d, d);
                t = clamp((vUv.y - mn.y) / max(uRect[i].w, 0.000001), 0.0, 1.0);
            }

            float amount = exp(-d2 / max(uRadius[i], 0.000001)) * profileWeight(uProfile[i], t);
            splat += amount * uColor[i];
        }

        float stickyVal = texture2D(uStickyMask, vec2(vUv.x, 1.0 - vUv.y)).r;
        splat *= 1.0 + stickyVal * uStickyAmplify;
        vec3 base = texture2D(uTarget, vUv).xyz;
        gl_FragColor = vec4(clamp(base + splat, -1000.0, 1000.0), 1.0);
    }
`;

export const flowOutletShader = `
    precision highp float;
    precision highp sampler2D;

    #define MAX_FLOW_OUTLET_BATCH 4

    varying vec2 vUv;
    uniform sampler2D uTarget;
    uniform int uCount;
    uniform int uEdge[MAX_FLOW_OUTLET_BATCH];
    uniform float uFrom[MAX_FLOW_OUTLET_BATCH];
    uniform float uTo[MAX_FLOW_OUTLET_BATCH];
    uniform float uWidth[MAX_FLOW_OUTLET_BATCH];
    uniform float uKeep[MAX_FLOW_OUTLET_BATCH];

    void main () {
        vec4 value = texture2D(uTarget, vUv);
        float keepProduct = 1.0;

        for (int i = 0; i < MAX_FLOW_OUTLET_BATCH; i++) {
            if (i >= uCount) break;

            float along = uEdge[i] < 2 ? vUv.y : vUv.x;
            float width = max(uWidth[i], 0.0001);
            float normal = 1.0;
            if (uEdge[i] == 0) normal = 1.0 - smoothstep(0.0, width, vUv.x);
            else if (uEdge[i] == 1) normal = smoothstep(1.0 - width, 1.0, vUv.x);
            else if (uEdge[i] == 2) normal = smoothstep(1.0 - width, 1.0, vUv.y);
            else normal = 1.0 - smoothstep(0.0, width, vUv.y);

            float gate = step(uFrom[i], along) * step(along, uTo[i]) * normal;
            keepProduct *= mix(1.0, uKeep[i], gate);
        }

        gl_FragColor = value * keepProduct;
    }
`;

export const flowForceShader = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uScalar;
    uniform float dt;
    uniform vec2 uGravity;
    uniform vec2 uBuoyancyDirection;
    uniform float uBuoyancyStrength;
    uniform float uBuoyancyAmbient;
    uniform int uScalarChannel;

    float channel(vec4 v, int ch) {
        if (ch == 0) return v.r;
        if (ch == 1) return v.g;
        return v.b;
    }

    void main () {
        vec2 velocity = texture2D(uVelocity, vUv).xy;
        velocity += uGravity * dt;
        if (uBuoyancyStrength != 0.0) {
            float scalar = channel(texture2D(uScalar, vUv), uScalarChannel);
            velocity += normalize(uBuoyancyDirection + vec2(0.00001)) * (scalar - uBuoyancyAmbient) * uBuoyancyStrength * dt;
        }
        gl_FragColor = vec4(clamp(velocity, -1000.0, 1000.0), 0.0, 1.0);
    }
`;

export const prescribedFieldShader = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTarget;
    uniform int uMode;
    uniform int uOutputKind;
    uniform int uUseGrid;
    uniform sampler2D uGridTexture;
    uniform float uGridScale;
    uniform int uScalarChannel;

    void main () {
        vec4 base = texture2D(uTarget, vUv);
        if (uUseGrid == 1) {
            vec4 grid = texture2D(uGridTexture, vUv);
            if (uOutputKind == 0) {
                vec2 field = (grid.rg * 2.0 - 1.0) * uGridScale;
                vec2 outV = uMode == 0 ? field : base.xy + field;
                gl_FragColor = vec4(clamp(outV, -1000.0, 1000.0), 0.0, 1.0);
            } else {
                float scalar = grid.r * uGridScale;
                vec3 scalarValue = vec3(0.0);
                if (uScalarChannel == 0) scalarValue.r = scalar;
                else if (uScalarChannel == 1) scalarValue.g = scalar;
                else scalarValue.b = scalar;
                gl_FragColor = uMode == 0 ? vec4(scalarValue, 1.0) : vec4(base.rgb + scalarValue, 1.0);
            }
        } else {
            gl_FragColor = base;
        }
    }
`;

/**
 * Inline container/obstruction mask — Phase 1a of epic 0001.
 *
 * A verbatim functional copy of `applyMaskShader`'s mask computation,
 * injectable into solver shaders so the field multiply happens in the
 * producing pass instead of a separate full-resolution ping-pong blit.
 * `uApplyInlineMask` gates the whole thing to 1.0 (no-op) when physics
 * masking is inactive. Uniform names match `applyMaskShader` so the engine
 * can share one uniform-setting helper.
 */
const inlineMaskGLSL = `
    uniform highp float uApplyInlineMask;
    uniform int uShapeType;
    uniform highp float uCx;
    uniform highp float uCy;
    uniform highp float uRadius;
    uniform highp float uAspect;
    uniform highp float uHalfW;
    uniform highp float uHalfH;
    uniform highp float uInnerCornerRadius;
    uniform highp float uInnerRadius;
    uniform highp float uOuterHalfW;
    uniform highp float uOuterHalfH;
    uniform highp float uOuterCornerRadius;
    uniform sampler2D uMaskTexture;
    uniform sampler2D uObstructionMask;
    uniform highp float uHasObstruction;

    highp float inlineMaskValue(highp vec2 uv) {
        if (uApplyInlineMask < 0.5) return 1.0;
        highp float mask = 1.0;
        if (uShapeType == 0) {
            highp vec2 p = vec2((uv.x - uCx) * uAspect, uv.y - uCy);
            highp float d = length(p);
            mask = 1.0 - smoothstep(uRadius - 0.005, uRadius + 0.005, d);
        } else if (uShapeType == 1) {
            highp float icr = uInnerCornerRadius;
            highp float innerMask;
            if (icr > 0.0) {
                highp vec2 ip = vec2((uv.x - uCx) * uAspect, uv.y - uCy);
                highp vec2 id = abs(ip) - vec2(uHalfW * uAspect, uHalfH) + icr;
                highp float iDist = length(max(id, 0.0)) - icr;
                innerMask = smoothstep(-0.005, 0.005, iDist);
            } else {
                highp float dx = abs(uv.x - uCx) - uHalfW;
                highp float dy = abs(uv.y - uCy) - uHalfH;
                innerMask = smoothstep(-0.005, 0.005, max(dx, dy));
            }
            highp float ocr = uOuterCornerRadius;
            highp float outerMask;
            if (ocr > 0.0) {
                highp vec2 op = vec2((uv.x - uCx) * uAspect, uv.y - uCy);
                highp vec2 od = abs(op) - vec2(uOuterHalfW * uAspect, uOuterHalfH) + ocr;
                highp float oDist = length(max(od, 0.0)) - ocr;
                outerMask = 1.0 - smoothstep(-0.005, 0.005, oDist);
            } else {
                highp float odx = abs(uv.x - uCx) - uOuterHalfW;
                highp float ody = abs(uv.y - uCy) - uOuterHalfH;
                outerMask = 1.0 - smoothstep(-0.005, 0.005, max(odx, ody));
            }
            mask = innerMask * outerMask;
        } else if (uShapeType == 2) {
            highp vec2 rp = vec2((uv.x - uCx) * uAspect, uv.y - uCy);
            highp vec2 rd = abs(rp) - vec2(uHalfW * uAspect, uHalfH) + uInnerCornerRadius;
            highp float rdDist = length(max(rd, 0.0)) - uInnerCornerRadius;
            mask = 1.0 - smoothstep(-0.005, 0.005, rdDist);
        } else if (uShapeType == 3) {
            highp vec2 p = vec2((uv.x - uCx) * uAspect, uv.y - uCy);
            highp float d = length(p);
            highp float sdf = max(d - uRadius, uInnerRadius - d);
            mask = 1.0 - smoothstep(-0.005, 0.005, sdf);
        } else if (uShapeType == 4) {
            mask = texture2D(uMaskTexture, vec2(uv.x, 1.0 - uv.y)).r;
        }
        if (uHasObstruction > 0.5) {
            highp float obstruct = texture2D(uObstructionMask, vec2(uv.x, 1.0 - uv.y)).r;
            mask *= (obstruct > 0.5 ? 0.0 : 1.0);
        }
        return mask;
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
    uniform vec4 dissipationVector;
    uniform float uUseDissipationVector;
    uniform float uMultiplicative;
    uniform sampler2D uStickyMask;
    uniform float uStickyStrength;
${inlineMaskGLSL}

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
        float stickyVal = texture2D(uStickyMask, vec2(vUv.x, 1.0 - vUv.y)).r;
        // Inline container/obstruction mask replaces the post-advection
        // applyMask blit (epic 0001 Phase 1a). Identity 1.0 when inactive.
        float im = inlineMaskValue(vUv);
        if (uMultiplicative > 0.5) {
            float scalarDissipation = mix(dissipation, dissipationVector.r, uUseDissipationVector);
            float adjDissipation;
            if (uStickyStrength >= 0.0) {
                // Dye: preserve on mask (dissipation → 1.0)
                adjDissipation = mix(scalarDissipation, 1.0, stickyVal * uStickyStrength);
            } else {
                // Velocity: dampen on mask (dissipation → near-zero)
                adjDissipation = scalarDissipation * max(0.0, 1.0 + stickyVal * uStickyStrength);
            }
            gl_FragColor = clamp(adjDissipation * result, -1000.0, 1000.0) * im;
        } else {
            vec4 baseDissipation = mix(vec4(dissipation), dissipationVector, uUseDissipationVector);
            vec4 adjDissipation = mix(baseDissipation, vec4(0.0), stickyVal * uStickyStrength);
            vec4 decay = vec4(1.0) + adjDissipation * dt;
            gl_FragColor = clamp(result / decay, -1000.0, 1000.0) * im;
        }
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
    uniform vec4 uOpenEdges;
    uniform sampler2D uSolidMask;
    uniform sampler2D uSolidNeighbors;
    uniform float uHasSolidMask;

    float solidAt(vec2 uv) {
        if (uHasSolidMask < 0.5) return 0.0;
        return texture2D(uSolidMask, vec2(clamp(uv.x, 0.0, 1.0), 1.0 - clamp(uv.y, 0.0, 1.0))).r;
    }

    void main () {
        float L = texture2D(uVelocity, vL).x;
        float R = texture2D(uVelocity, vR).x;
        float T = texture2D(uVelocity, vT).y;
        float B = texture2D(uVelocity, vB).y;

        vec2 C = texture2D(uVelocity, vUv).xy;
        if (uOpenEdges.x < 0.5) {
            if (vL.x < 0.0) { L = -C.x; }
        }
        if (uOpenEdges.y < 0.5) {
            if (vR.x > 1.0) { R = -C.x; }
        }
        if (uOpenEdges.z < 0.5) {
            if (vT.y > 1.0) { T = -C.y; }
        }
        if (uOpenEdges.w < 0.5) {
            if (vB.y < 0.0) { B = -C.y; }
        }

        if (uHasSolidMask >= 0.5) {
            if (solidAt(vUv) > 0.5) {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                return;
            }
            vec4 nb = texture2D(uSolidNeighbors, vUv);
            if (nb.x > 0.5) { L = -C.x; }
            if (nb.y > 0.5) { R = -C.x; }
            if (nb.z > 0.5) { T = -C.y; }
            if (nb.w > 0.5) { B = -C.y; }
        }

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

export const viscosityShader = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform sampler2D uSolidMask;
    uniform sampler2D uSolidNeighbors;
    uniform float uHasSolidMask;
    uniform float uAlpha;
${inlineMaskGLSL}
    float solidAt(vec2 uv) {
        if (uHasSolidMask < 0.5) return 0.0;
        return texture2D(uSolidMask, vec2(clamp(uv.x, 0.0, 1.0), 1.0 - clamp(uv.y, 0.0, 1.0))).r;
    }

    vec2 neighborVelocity(vec2 uv, float neighborSolid, vec2 center) {
        if (neighborSolid > 0.5) return center;
        return texture2D(uVelocity, uv).xy;
    }

    void main () {
        float im = inlineMaskValue(vUv);
        vec4 nb = vec4(0.0);
        if (uHasSolidMask >= 0.5) {
            if (solidAt(vUv) > 0.5) {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0) * im;
                return;
            }
            nb = texture2D(uSolidNeighbors, vUv);
        }
        vec2 C = texture2D(uVelocity, vUv).xy;
        vec2 source = texture2D(uSource, vUv).xy;
        vec2 L = neighborVelocity(vL, nb.x, C);
        vec2 R = neighborVelocity(vR, nb.y, C);
        vec2 T = neighborVelocity(vT, nb.z, C);
        vec2 B = neighborVelocity(vB, nb.w, C);
        vec2 velocity = (source + uAlpha * (L + R + T + B)) / (1.0 + 4.0 * uAlpha);
        gl_FragColor = vec4(clamp(velocity, -1000.0, 1000.0), 0.0, 1.0) * im;
    }
`;

export const wallFrictionShader = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uSolidMask;
    uniform vec2 texelSize;
    uniform float uHasSolidMask;
    uniform float uWallFriction;
    uniform float uWallFrictionWidth;

    float solidAt(vec2 uv) {
        if (uHasSolidMask < 0.5) return 0.0;
        return texture2D(uSolidMask, vec2(clamp(uv.x, 0.0, 1.0), 1.0 - clamp(uv.y, 0.0, 1.0))).r;
    }

    void main () {
        vec2 velocity = texture2D(uVelocity, vUv).xy;
        if (uHasSolidMask < 0.5 || uWallFriction <= 0.0) {
            gl_FragColor = vec4(velocity, 0.0, 1.0);
            return;
        }
        float center = solidAt(vUv);
        if (center > 0.5) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
        }

        float width = clamp(uWallFrictionWidth, 1.0, 2.0);
        vec2 dx = vec2(texelSize.x, 0.0);
        vec2 dy = vec2(0.0, texelSize.y);
        float edge = 0.0;
        edge = max(edge, solidAt(vUv + dx));
        edge = max(edge, solidAt(vUv - dx));
        edge = max(edge, solidAt(vUv + dy));
        edge = max(edge, solidAt(vUv - dy));
        if (width > 1.5) {
            edge = max(edge, 0.65 * solidAt(vUv + dx * 2.0));
            edge = max(edge, 0.65 * solidAt(vUv - dx * 2.0));
            edge = max(edge, 0.65 * solidAt(vUv + dy * 2.0));
            edge = max(edge, 0.65 * solidAt(vUv - dy * 2.0));
        }

        float damping = clamp(1.0 - uWallFriction * edge, 0.0, 1.0);
        gl_FragColor = vec4(velocity * damping, 0.0, 1.0);
    }
`;

/**
 * Jacobi pressure iteration. `uPressureScale` folds the warm-start memory
 * coefficient into the FIRST iteration (set to PRESSURE on iteration 0,
 * 1.0 afterwards) — the same math as the old standalone clear pass, since
 * Jacobi only reads the previous iterate through its neighbors, without a
 * full-resolution blit (epic 0001 1c). Neighbor solidity comes from the
 * face-aperture texture (1b); the C4 fetch keeps the substituted neighbor
 * consistent with the scaled center.
 */
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
    uniform float uPressureScale;
    uniform sampler2D uStickyMask;
    uniform float uStickyPressure;
    uniform sampler2D uSolidMask;
    uniform sampler2D uSolidNeighbors;
    uniform float uHasSolidMask;

    float solidAt(vec2 uv) {
        if (uHasSolidMask < 0.5) return 0.0;
        return texture2D(uSolidMask, vec2(clamp(uv.x, 0.0, 1.0), 1.0 - clamp(uv.y, 0.0, 1.0))).r;
    }

    void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        if (uHasSolidMask >= 0.5) {
            if (solidAt(vUv) > 0.5) {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                return;
            }
            float C = texture2D(uPressure, vUv).x;
            vec4 nb = texture2D(uSolidNeighbors, vUv);
            if (nb.x > 0.5) { L = C; }
            if (nb.y > 0.5) { R = C; }
            if (nb.z > 0.5) { T = C; }
            if (nb.w > 0.5) { B = C; }
        }
        float divergence = texture2D(uDivergence, vUv).x;
        float pressure = ((L + R + B + T) * uPressureScale - divergence) * 0.25;
        float stickyVal = texture2D(uStickyMask, vec2(vUv.x, 1.0 - vUv.y)).r;
        pressure += stickyVal * uStickyPressure;
        gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
    }
`;

/**
 * Two Jacobi pressure iterations in ONE pass (epic 0001 — measured-regime
 * optimization). Profiling showed the loop is pass-count bound (~40 µs of
 * render-pass overhead per ping-pong blit on ANGLE/Metal), not bandwidth
 * bound, so halving pass count beats minimizing fetches.
 *
 * The inner level evaluates iteration k at the center and 4 neighbors; the
 * outer level combines them into iteration k+1. Positions are clamped to
 * texel centers so out-of-domain neighbors reproduce CLAMP_TO_EDGE single-
 * pass behavior exactly. `uScaleInner` carries the warm-start fold for the
 * first pair (see pressureShader).
 */
export const pressureJacobi2Shader = `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    uniform highp vec2 texelSize;
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;
    uniform float uScaleInner;
    uniform sampler2D uStickyMask;
    uniform float uStickyPressure;
    uniform sampler2D uSolidMask;
    uniform sampler2D uSolidNeighbors;
    uniform float uHasSolidMask;

    float solidAt(vec2 uv) {
        if (uHasSolidMask < 0.5) return 0.0;
        return texture2D(uSolidMask, vec2(clamp(uv.x, 0.0, 1.0), 1.0 - clamp(uv.y, 0.0, 1.0))).r;
    }

    vec2 clampToTexelCenter(vec2 uv) {
        return clamp(uv, 0.5 * texelSize, vec2(1.0) - 0.5 * texelSize);
    }

    float innerIterate(vec2 uv) {
        float L = texture2D(uPressure, uv - vec2(texelSize.x, 0.0)).x;
        float R = texture2D(uPressure, uv + vec2(texelSize.x, 0.0)).x;
        float T = texture2D(uPressure, uv + vec2(0.0, texelSize.y)).x;
        float B = texture2D(uPressure, uv - vec2(0.0, texelSize.y)).x;
        if (uHasSolidMask >= 0.5) {
            if (solidAt(uv) > 0.5) return 0.0;
            float C = texture2D(uPressure, uv).x;
            vec4 nb = texture2D(uSolidNeighbors, uv);
            if (nb.x > 0.5) { L = C; }
            if (nb.y > 0.5) { R = C; }
            if (nb.z > 0.5) { T = C; }
            if (nb.w > 0.5) { B = C; }
        }
        float divergence = texture2D(uDivergence, uv).x;
        float p = ((L + R + B + T) * uScaleInner - divergence) * 0.25;
        p += texture2D(uStickyMask, vec2(uv.x, 1.0 - uv.y)).r * uStickyPressure;
        return p;
    }

    void main () {
        float L = innerIterate(clampToTexelCenter(vUv - vec2(texelSize.x, 0.0)));
        float R = innerIterate(clampToTexelCenter(vUv + vec2(texelSize.x, 0.0)));
        float T = innerIterate(clampToTexelCenter(vUv + vec2(0.0, texelSize.y)));
        float B = innerIterate(clampToTexelCenter(vUv - vec2(0.0, texelSize.y)));
        if (uHasSolidMask >= 0.5) {
            if (solidAt(vUv) > 0.5) {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                return;
            }
            float C = innerIterate(vUv);
            vec4 nb = texture2D(uSolidNeighbors, vUv);
            if (nb.x > 0.5) { L = C; }
            if (nb.y > 0.5) { R = C; }
            if (nb.z > 0.5) { T = C; }
            if (nb.w > 0.5) { B = C; }
        }
        float divergence = texture2D(uDivergence, vUv).x;
        float pressure = (L + R + B + T - divergence) * 0.25;
        pressure += texture2D(uStickyMask, vec2(vUv.x, 1.0 - vUv.y)).r * uStickyPressure;
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
    uniform sampler2D uSolidMask;
    uniform sampler2D uSolidNeighbors;
    uniform float uHasSolidMask;
${inlineMaskGLSL}
    float solidAt(vec2 uv) {
        if (uHasSolidMask < 0.5) return 0.0;
        return texture2D(uSolidMask, vec2(clamp(uv.x, 0.0, 1.0), 1.0 - clamp(uv.y, 0.0, 1.0))).r;
    }

    void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        vec2 velocity = texture2D(uVelocity, vUv).xy;
        float im = inlineMaskValue(vUv);
        if (uHasSolidMask >= 0.5) {
            if (solidAt(vUv) > 0.5) {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0) * im;
                return;
            }
            float C = texture2D(uPressure, vUv).x;
            vec4 nb = texture2D(uSolidNeighbors, vUv);
            if (nb.x > 0.5) { L = C; }
            if (nb.y > 0.5) { R = C; }
            if (nb.z > 0.5) { T = C; }
            if (nb.w > 0.5) { B = C; }
        }
        velocity.xy -= vec2(R - L, T - B);
        gl_FragColor = vec4(velocity, 0.0, 1.0) * im;
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
    uniform sampler2D uObstructionMask;
    uniform float uHasObstruction;

    void main () {
        vec4 val = texture2D(uTarget, vUv);
        // Default mask 1.0; uShapeType with no matching branch (e.g. -1, used
        // when obstructions exist but there is no container) leaves it at 1.0.
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
                vec2 ip = vec2((vUv.x - uCx) * uAspect, vUv.y - uCy);
                vec2 id = abs(ip) - vec2(uHalfW * uAspect, uHalfH) + icr;
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
                vec2 op = vec2((vUv.x - uCx) * uAspect, vUv.y - uCy);
                vec2 od = abs(op) - vec2(uOuterHalfW * uAspect, uOuterHalfH) + ocr;
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
            vec2 rp = vec2((vUv.x - uCx) * uAspect, vUv.y - uCy);
            vec2 rd = abs(rp) - vec2(uHalfW * uAspect, uHalfH) + uInnerCornerRadius;
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

        // Interior obstructions subtract from the allowed region regardless of
        // container shape (orthogonal): allowed = container * (1 - obstruction).
        if (uHasObstruction > 0.5) {
            float obstruct = texture2D(uObstructionMask, vec2(vUv.x, 1.0 - vUv.y)).r;
            mask *= (obstruct > 0.5 ? 0.0 : 1.0);
        }

        gl_FragColor = val * mask;
    }
`;
