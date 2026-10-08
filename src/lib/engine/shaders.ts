/*
 * svelte-fluid — shader sources
 * Derivative work of WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017, MIT.
 * https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
 *
 * All shader source strings ported verbatim from the original script.js
 * lines 440–913. The engine compiles them in `FluidEngine` — this module
 * touches no GL state.
 */

/** Passive thickness: canvas-height units, identical for every pigment. */
export const DYE_SPLAT_DOSE = 0.06;
export const DYE_HEIGHT_CEILING = 0.24;

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

/**
 * ADR 0099 settle probe: each output pixel is the max |channel| (masked by
 * uChannels) over an 8x8 source tile. Texel-centre samples are exact under
 * LINEAR filtering, and CLAMP_TO_EDGE repeats edge texels, which cannot raise a max.
 */
export const settleMaxShader = `
    precision highp float;
    precision highp sampler2D;

    uniform sampler2D uSource;
    uniform vec2 uSourceTexel;
    uniform vec4 uChannels;
    uniform int uFlagMode;
    uniform float uFade;
    uniform float uHeightVisibility;
    uniform float uDyeVisibilityGain;
    uniform float uInertSolver;

    void main () {
        vec2 base = (floor(gl_FragCoord.xy) * 8.0 + 0.5) * uSourceTexel;
        float m = 0.0;
        vec4 flags = vec4(0.0);
        for (int y = 0; y < 8; y++) {
            for (int x = 0; x < 8; x++) {
                vec4 sampleValue = texture2D(uSource, base + vec2(float(x), float(y)) * uSourceTexel);
                vec4 raw = abs(sampleValue);
                // Validate raw channels before masking: NaN * 0 is not a validity test.
                bool valid = raw.r >= 0.0 && raw.r <= 65504.0 && raw.g >= 0.0 && raw.g <= 65504.0 && raw.b >= 0.0 && raw.b <= 65504.0 && raw.a >= 0.0 && raw.a <= 65504.0;
                bool dye = uChannels.b > 0.0 && uFlagMode != 3;
                if (dye) valid = valid && sampleValue.a >= 0.0 && sampleValue.a <= ${DYE_HEIGHT_CEILING};
                // Inert transport must not change RGB through advection's ±1000 clamp.
                if (dye && uInertSolver > 0.5) valid = valid && raw.r <= 1000.0 && raw.g <= 1000.0 && raw.b <= 1000.0;
                vec4 v = raw * uChannels;
                float value = max(max(v.r, v.g), max(v.b, v.a));
                value = min(65504.0, value * uDyeVisibilityGain);
                // Same reduction targets: a sentinel/boolean blocks quietness while
                // height can expose black pigment or change an arbitrary image.
                if (uHeightVisibility != 0.0) {
                    bool heightVisible = sampleValue.a > 0.0 && (uHeightVisibility < 0.0 || value + sampleValue.a * uHeightVisibility >= (0.5 / 255.0));
                    if (heightVisible) {
                        m = 65504.0;
                        flags.rgb = vec3(1.0);
                    }
                }
                m = max(m, value);
                // Half-float source fields cannot contain finite magnitudes above 65504.
                if (!valid) m = 65504.0;
                if (uFlagMode == 1) {
                    flags.r = max(flags.r, value < 0.5 ? 0.0 : 1.0);
                    flags.g = max(flags.g, valid ? 0.0 : 1.0);
                    flags.b = max(flags.b, any(notEqual(sampleValue.xy, vec2(0.0))) ? 1.0 : 0.0);
                }
                if (uFlagMode == 2) {
                    flags.r = max(flags.r, value < (0.5 / 255.0) ? 0.0 : 1.0);
                    flags.g = max(flags.g, value * uFade < (0.5 / 255.0) ? 0.0 : 1.0);
                    flags.b = max(flags.b, value == 0.0 ? 0.0 : 1.0);
                    if (!valid || value >= 65504.0) flags.rgb = vec3(1.0);
                }
                if (uFlagMode == 3) flags = max(flags, v);
            }
        }
        gl_FragColor = uFlagMode == 0 ? vec4(m, 0.0, 0.0, 1.0) : vec4(flags.rgb, 1.0);
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

/** Passive layer thickness in canvas-height units, stored independently in dye.a.
 * No calibrated free-surface or wave coupling; XY uses the same units.
 */
export const DYE_GEOMETRY_GLSL = `
    uniform sampler2D uHeightTexture;
    uniform vec2 uHeightTexel;
    uniform float uHeightAspect;

    float dyeHeight (float thickness) {
        return max(thickness, 0.0);
    }

    vec3 dyeNormal (vec2 uv) {
        float l = dyeHeight(texture2D(uHeightTexture, uv - vec2(uHeightTexel.x, 0.0)).a);
        float r = dyeHeight(texture2D(uHeightTexture, uv + vec2(uHeightTexel.x, 0.0)).a);
        float b = dyeHeight(texture2D(uHeightTexture, uv - vec2(0.0, uHeightTexel.y)).a);
        float t = dyeHeight(texture2D(uHeightTexture, uv + vec2(0.0, uHeightTexel.y)).a);
        vec2 slope = vec2(r - l, t - b) / (2.0 * uHeightTexel * vec2(uHeightAspect, 1.0));
        return normalize(vec3(-slope, 1.0));
    }

    vec2 dyeRefraction (vec2 uv, vec3 n, float h) {
        vec3 ray = refract(vec3(0.0, 0.0, -1.0), n, 1.0 / 1.33);
        return ray.xy / max(-ray.z, 0.001) * h * vec2(1.0 / uHeightAspect, 1.0);
    }

    float dyeSpecular (vec3 n, float h) {
        // Normalized Blinn-Phong BRDF, dielectric Schlick F0=0.02, studio key.
        vec3 l = normalize(vec3(-0.35, 0.45, 1.0));
        vec3 halfVector = normalize(l + vec3(0.0, 0.0, 1.0));
        float fresnel = 0.02 + 0.98 * pow(1.0 - halfVector.z, 5.0);
        float coverage = 1.0 - exp(-h / 0.06);
        return (130.0 / (8.0 * 3.14159265)) * pow(max(dot(n, halfVector), 0.0), 128.0)
            * fresnel * max(dot(n, l), 0.0) * coverage;
    }
`;

/** Exact IEC 61966-2-1 transfer; GLSL ES 1.00 compatible. */
export const SRGB_TRANSFER_GLSL = `
    vec3 srgbToLinear (vec3 c) {
        c = max(c, vec3(0.0));
        return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
    }

    vec3 dyeToLinear (vec3 c) {
        c = max(c, vec3(0.0));
        float peak = max(1.0, max(c.r, max(c.g, c.b)));
        return srgbToLinear(min(c, vec3(1.0))) * peak;
    }

    vec3 linearToSrgb (vec3 c) {
        c = max(c, vec3(0.0));
        return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
    }
`;

/**
 * Khronos PBR Neutral highlight compression (exact constants) without its toe
 * offset; AgX default look (bwrensch polynomial fit).
 */
export const TONE_MAP_GLSL = `
    // The Khronos toe subtracts up to 0.04 linear (a PBR Fresnel-F0
    // compensation). Authored dye is display-referred, so below the shoulder
    // colours must pass through unchanged (ADR-0081).
    vec3 toneMapNeutral (vec3 color) {
        const float startCompression = 0.76;
        const float desaturation = 0.15;
        float peak = max(color.r, max(color.g, color.b));
        if (peak < startCompression) return color;
        const float d = 1.0 - startCompression;
        float newPeak = 1.0 - d * d / (peak + d - startCompression);
        color *= newPeak / peak;
        float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
        return mix(color, vec3(newPeak), g);
    }

    vec3 toneMapAgx (vec3 color) {
        const mat3 inset = mat3(
            0.842479062253094, 0.0423282422610123, 0.0423756549057051,
            0.0784335999999992, 0.878468636469772, 0.0784336,
            0.0792237451477643, 0.0791661274605434, 0.879142973793104);
        const mat3 outset = mat3(
            1.19687900512017, -0.0528968517574562, -0.0529716355144438,
            -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
            -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
        const float minEv = -12.47393;
        const float maxEv = 4.026069;
        vec3 v = inset * max(color, vec3(1e-10));
        v = (clamp(log2(v), minEv, maxEv) - minEv) / (maxEv - minEv);
        vec3 v2 = v * v;
        vec3 v4 = v2 * v2;
        v = 15.5 * v4 * v2 - 40.14 * v4 * v + 31.96 * v4 - 6.868 * v2 * v + 0.4298 * v2 + 0.1191 * v - 0.00232;
        // AgX produces display-gamma values; EOTF returns linear light for our
        // one final sRGB encode, not a second encode of the polynomial output.
        return pow(clamp(outset * v, 0.0, 1.0), vec3(2.2));
    }

    vec3 toneMap (vec3 color) {
        color = max(color, vec3(0.0));
    #if defined(TONE_MAP_AGX)
        return toneMapAgx(color);
    #elif defined(TONE_MAP_NEUTRAL)
        return clamp(toneMapNeutral(color), 0.0, 1.0);
    #else
        return clamp(color, 0.0, 1.0);
    #endif
    }
`;

export const displayShaderSource = `
    precision mediump float;
    precision highp sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uTexture;
    uniform sampler2D uBloom;
    uniform sampler2D uSunrays;
    uniform sampler2D uDithering;
    uniform highp vec2 ditherScale;
    uniform highp vec2 texelSize;
    uniform vec3 uBackColor;
    uniform float uCompositeBackground;
    precision highp float;
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

#ifdef MASK_SDF
    // Jump-flood SDFs in mask texels (negative inside); uSdfScale converts
    // container (x) / obstruction (y) texels to target pixels (ADR-0084).
    uniform sampler2D uContainerSdf;
    uniform sampler2D uObstructionSdf;
    uniform vec2 uSdfScale;
#endif

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

#ifdef CONTRAST_FLOOR
    // x: +1 lifts failing pixels up to luminance y, -1 drops them down to y; z/w: luminance
    // <= z or >= w already passes against the reference and is left alone (ADR-0086).
    uniform vec4 uContrastFloor;
    // Reference colour (0-1): the page behind a transparent canvas, or the text colour.
    uniform vec3 uContrastRef;
#endif

#ifdef CONTRAST_OUTLINE
    // Halo colour (display sRGB, clears minContrast vs the page) and its width in target pixels (ADR-0086).
    uniform vec3 uOutlineColor;
    uniform float uOutlinePx;
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

${SRGB_TRANSFER_GLSL}
${TONE_MAP_GLSL}

#if defined(SHADING) || defined(SPECULAR) || defined(REFRACTION)
${DYE_GEOMETRY_GLSL}
#endif
#ifdef SPECULAR
    uniform float uSpecular;
#endif
#ifdef REFRACTION
    uniform float uRefraction;
#endif

#ifdef CONTRAST_FLOOR
    // Linear-light WCAG luminance correction; mirrored by applyContrastFloor in contrast.ts.
    vec3 contrastLift (vec3 lin) {
        float l = dot(lin, vec3(0.2126, 0.7152, 0.0722));
        if (l <= uContrastFloor.z || l >= uContrastFloor.w) return lin;
        if (uContrastFloor.x > 0.0) {
            float peak = max(lin.r, max(lin.g, lin.b));
            // Keep hue by brightening first; mix toward white for the rest.
            float k = (l > 1e-5 && peak > 1e-5) ? min(uContrastFloor.y / l, 1.0 / peak) : 1.0;
            lin *= k;
            l = dot(lin, vec3(0.2126, 0.7152, 0.0722));
            lin += (vec3(1.0) - lin) * clamp((uContrastFloor.y - l) / max(1.0 - l, 1e-4), 0.0, 1.0);
        } else {
            lin *= uContrastFloor.y / l;
        }
        return lin;
    }
#endif

    // ±1 LSB blue noise (64² LDR_LLL1 texture), shared by every output mode.
    vec3 ditherNoise () {
        return vec3((texture2D(uDithering, vUv * ditherScale).r * 2.0 - 1.0) / 255.0);
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

    // Inside-coverage of a signed distance measured in target pixels: exactly
    // one pixel of anti-aliasing at any DPR (ADR-0084).
    float pixelCoverage (float dPx) {
        return clamp(0.5 - dPx, 0.0, 1.0);
    }

    precision mediump float;
    void main () {
        vec4 dye = texture2D(uTexture, vUv);
        vec3 c = dye.rgb;

    #if defined(SHADING) || defined(SPECULAR) || defined(REFRACTION)
        highp vec3 n = dyeNormal(vUv);
        highp float h = dyeHeight(dye.a);
    #endif
    #ifdef SHADING
        // Artistic ambient/key ratio, true unit normal and the same studio
        // light as specular. No legacy slope gain masquerading as geometry.
        float diffuse = 0.7 + 0.3 * max(dot(n, normalize(vec3(-0.35, 0.45, 1.0))), 0.0);
        c *= diffuse;
    #endif
    #ifdef SPECULAR
        c = linearToSrgb(dyeToLinear(c) + vec3(uSpecular * dyeSpecular(n, h)));
    #endif

    #ifdef BLOOM
        vec3 bloom = texture2D(uBloom, vUv).rgb;
    #endif

    #ifdef SUNRAYS
        // Sunrays are an artistic occlusion mask tuned against display-referred
        // dye in 0.8.0; keep applying them there so ray contrast is unchanged.
        float sunrays = texture2D(uSunrays, vUv).r;
        c *= sunrays;
    #ifdef BLOOM
        bloom *= sunrays;
    #endif
    #endif

    #ifdef BLOOM
        // Bloom is a display-space glow, composited exactly where and how 0.8.0
        // did (encoded, added to display-referred dye, inside the coverage that
        // reveal/distortion read). A linear-light add was tried and rejected: it
        // flattened wisp/gap contrast into haze on every bloom preset (ADR-0081).
        c += linearToSrgb(bloom);
    #endif

        float a = max(c.r, max(c.g, c.b));
        precision highp float;
        float cmask = 1.0;

    #ifdef CONTAINER_MASK
        // Aspect-corrected container coordinates are in canvas-height units,
        // so dividing by texelSize.y yields pixels; raw UV x uses texelSize.x.
        if (uContainerShapeType == 0) {
            vec2 cp = vec2((vUv.x - uContainerCenter.x) * uContainerAspect,
                           vUv.y - uContainerCenter.y);
            cmask = pixelCoverage((length(cp) - uContainerRadius) / texelSize.y);
        } else if (uContainerShapeType == 1) {
            // Frame: intersection of outside-inner and inside-outer
            // Inner mask: 0 inside inner rect, 1 outside
            float icr = uContainerInnerCornerRadius;
            float innerMask;
            if (icr > 0.0) {
                vec2 ip = vec2((vUv.x - uContainerCenter.x) * uContainerAspect, vUv.y - uContainerCenter.y);
                vec2 id = abs(ip) - vec2(uContainerHalfW * uContainerAspect, uContainerHalfH) + icr;
                float iDist = length(max(id, 0.0)) + min(max(id.x, id.y), 0.0) - icr;
                innerMask = pixelCoverage(-iDist / texelSize.y);
            } else {
                float fdx = (abs(vUv.x - uContainerCenter.x) - uContainerHalfW) / texelSize.x;
                float fdy = (abs(vUv.y - uContainerCenter.y) - uContainerHalfH) / texelSize.y;
                innerMask = pixelCoverage(-max(fdx, fdy));
            }
            // Outer mask: 1 inside outer rect, 0 outside
            float ocr = uContainerOuterCornerRadius;
            float outerMask;
            if (ocr > 0.0) {
                vec2 op = vec2((vUv.x - uContainerCenter.x) * uContainerAspect, vUv.y - uContainerCenter.y);
                vec2 od = abs(op) - vec2(uContainerOuterHalfW * uContainerAspect, uContainerOuterHalfH) + ocr;
                float oDist = length(max(od, 0.0)) + min(max(od.x, od.y), 0.0) - ocr;
                outerMask = pixelCoverage(oDist / texelSize.y);
            } else {
                float odx = (abs(vUv.x - uContainerCenter.x) - uContainerOuterHalfW) / texelSize.x;
                float ody = (abs(vUv.y - uContainerCenter.y) - uContainerOuterHalfH) / texelSize.y;
                outerMask = pixelCoverage(max(odx, ody));
            }
            cmask = innerMask * outerMask;
        } else if (uContainerShapeType == 2) {
            // Rounded rect: 1 inside, 0 outside
            vec2 rp = vec2((vUv.x - uContainerCenter.x) * uContainerAspect, vUv.y - uContainerCenter.y);
            vec2 rd = abs(rp) - vec2(uContainerHalfW * uContainerAspect, uContainerHalfH) + uContainerInnerCornerRadius;
            float rdDist = length(max(rd, 0.0)) + min(max(rd.x, rd.y), 0.0) - uContainerInnerCornerRadius;
            cmask = pixelCoverage(rdDist / texelSize.y);
        } else if (uContainerShapeType == 3) {
            // Annulus: 1 in the ring between inner and outer circles, 0 elsewhere
            vec2 cp = vec2((vUv.x - uContainerCenter.x) * uContainerAspect,
                           vUv.y - uContainerCenter.y);
            float d = length(cp);
            float sdf = max(d - uContainerRadius, uContainerInnerRadius - d);
            cmask = pixelCoverage(sdf / texelSize.y);
        } else if (uContainerShapeType == 4) {
        #ifdef MASK_SDF
            cmask = pixelCoverage(texture2D(uContainerSdf, vec2(vUv.x, 1.0 - vUv.y)).r * uSdfScale.x);
        #else
            // WebGL1: bilinear coverage of the pre-rasterized mask.
            cmask = texture2D(uContainerMaskTexture, vec2(vUv.x, 1.0 - vUv.y)).r;
        #endif
        }
    #endif

    #ifdef CONTRAST_OUTLINE
        float contMask = cmask;
    #endif
    #ifdef OBSTRUCTION_MASK
        // Interior obstructions cut out of the visible region too, so the
        // display matches the masked physics. Orthogonal to CONTAINER_MASK.
        // Coverage is kept for the optional OBSTRUCTION_FILL paint below —
        // the rasterized mask is anti-aliased, so fill edges stay smooth.
    #ifdef MASK_SDF
        float obCoverage = pixelCoverage(texture2D(uObstructionSdf, vec2(vUv.x, 1.0 - vUv.y)).r * uSdfScale.y);
    #else
        float obCoverage = texture2D(uObstructionMask, vec2(vUv.x, 1.0 - vUv.y)).r;
    #endif
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
    #ifdef MASK_SDF
        // Same guard as the 5-tap max below: the bilinear coverage ramp (one
        // mask texel) dilated by one target pixel, so overlays do not move.
        float solidEdge = clamp(0.5 - texture2D(uObstructionSdf, solidUv).r + 1.0 / uSdfScale.y, 0.0, 1.0);
    #else
        float solidEdge = texture2D(uObstructionMask, solidUv).r;
        solidEdge = max(solidEdge, texture2D(uObstructionMask, solidUv + vec2(texelSize.x, 0.0)).r);
        solidEdge = max(solidEdge, texture2D(uObstructionMask, solidUv - vec2(texelSize.x, 0.0)).r);
        solidEdge = max(solidEdge, texture2D(uObstructionMask, solidUv + vec2(0.0, texelSize.y)).r);
        solidEdge = max(solidEdge, texture2D(uObstructionMask, solidUv - vec2(0.0, texelSize.y)).r);
    #endif
        flowMask *= 1.0 - smoothstep(0.05, 0.45, solidEdge);
    #endif

    #ifdef CONTAINER_MASK
        if (uContainerShapeType == 4) {
            vec2 containerUv = vec2(vUv.x, 1.0 - vUv.y);
        #ifdef MASK_SDF
            float containerEdge = clamp(0.5 + texture2D(uContainerSdf, containerUv).r + 1.0 / uSdfScale.x, 0.0, 1.0);
        #else
            float containerEdge = 1.0 - texture2D(uContainerMaskTexture, containerUv).r;
            containerEdge = max(containerEdge, 1.0 - texture2D(uContainerMaskTexture, containerUv + vec2(texelSize.x, 0.0)).r);
            containerEdge = max(containerEdge, 1.0 - texture2D(uContainerMaskTexture, containerUv - vec2(texelSize.x, 0.0)).r);
            containerEdge = max(containerEdge, 1.0 - texture2D(uContainerMaskTexture, containerUv + vec2(0.0, texelSize.y)).r);
            containerEdge = max(containerEdge, 1.0 - texture2D(uContainerMaskTexture, containerUv - vec2(0.0, texelSize.y)).r);
        #endif
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
    #ifdef REFRACTION
        // Convert a canvas-UV ray displacement into the fitted image's units.
        vec2 shift = dyeRefraction(vUv, n, h) / max(1.0 - 2.0 * uBleed, 0.01);
        if (uDistortionFit == 0) {
            if (visRatio > uImgRatio) shift.y *= uImgRatio / visRatio;
            else shift.x *= visRatio / uImgRatio;
        } else {
            if (visRatio > uImgRatio) shift.x *= visRatio / uImgRatio;
            else shift.y *= uImgRatio / visRatio;
        }
        imgUv += uRefraction * shift / max(uDistortionScale, 0.01);
    #endif

        vec3 img = texture2D(uDistortionTexture, vec2(imgUv.x, 1.0 - imgUv.y)).rgb;

        // Soft edge fade to prevent harsh clipping at image borders
        float ew = 0.004;
        float edgeAlpha = smoothstep(0.0, ew, imgUv.x) * smoothstep(1.0, 1.0 - ew, imgUv.x);
        edgeAlpha *= smoothstep(0.0, ew, imgUv.y) * smoothstep(1.0, 1.0 - ew, imgUv.y);

        float alpha = edgeAlpha * cmask;
    #ifdef SPECULAR
        img = linearToSrgb(srgbToLinear(img) + vec3(uSpecular * dyeSpecular(n, h)));
    #endif
        gl_FragColor = vec4(clamp(img + ditherNoise(), 0.0, 1.0) * alpha, alpha);
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
        // The canvas context is premultiplied: emit colour × alpha so revealed
        // pixels composite as see-through instead of brightening the page.
        gl_FragColor = vec4(clamp(color + ditherNoise(), 0.0, 1.0) * alpha, alpha);
    #else
    #if defined(TONE_MAP_NEUTRAL) || defined(TONE_MAP_AGX)
        // Display-referred dye + glow: decode once, tone-map, encode once.
        highp vec3 display = clamp(linearToSrgb(toneMap(dyeToLinear(c))), 0.0, 1.0);
    #else
        // 'none' (default): 0.8.0 exactly. HDR dye stays unclamped through the
        // composite, so coverage above 1 darkens the backColor term and keeps
        // saturated wax over light backs (LavaLamp); the final write clips.
        precision mediump float;
        vec3 display = max(c, vec3(0.0));
    #endif
        // The background/fill composite stays display-referred, exactly what
        // the browser does with the transparent canvas over a page of the same
        // colour, so opaque and transparent modes agree and light backColors
        // keep dye hue as in 0.8.0.
        float outAlpha = max(display.r, max(display.g, display.b));
        if (uCompositeBackground > 0.5) {
            display += uBackColor * (1.0 - outAlpha);
            outAlpha = 1.0;
        }
        outAlpha = min(outAlpha, 1.0);
    #ifdef CONTRAST_FLOOR
        {
            // Pixels whose composite over the reference misses minContrast become
            // opaque corrected colour; passing pixels are untouched (ADR-0086).
            vec3 comp = clamp(display + uContrastRef * (1.0 - outAlpha), 0.0, 1.0);
            vec3 fixedComp = linearToSrgb(contrastLift(srgbToLinear(comp)));
            vec3 delta = abs(fixedComp - comp);
            float need = smoothstep(0.0, 0.02, max(delta.r, max(delta.g, delta.b)));
            // Transparent canvas: undyed pixels are the page itself (nothing to correct),
            // and the fix covers only where the dye is shown. Opaque canvas: the
            // composite already includes the back colour.
            float cover = uCompositeBackground > 0.5 ? 1.0 : cmask;
            if (uCompositeBackground < 0.5) need *= smoothstep(0.0, 0.02, outAlpha);
            display = mix(display, fixedComp * cover, need);
            outAlpha = mix(outAlpha, cover, need);
        }
    #endif
    #ifdef CONTRAST_OUTLINE
        {
            // Thin halo just outside the glyph boundary (ADR-0086). The band follows the
            // container boundary only: contMask is the pre-obstruction coverage, so glyph
            // interiors and obstruction holes inside them get no halo and stay bit-identical.
            float band;
        #ifdef MASK_SDF
            band = pixelCoverage(texture2D(uContainerSdf, vec2(vUv.x, 1.0 - vUv.y)).r * uSdfScale.x - uOutlinePx);
        #else
            // WebGL1 / no jump flood: widest coverage among taps on two rings around the pixel.
            band = 0.0;
            vec2 mUv = vec2(vUv.x, 1.0 - vUv.y);
            for (int i = 0; i < 8; i++) {
                float ang = 0.78539816 * float(i);
                vec2 dir = vec2(cos(ang), sin(ang)) * texelSize;
                band = max(band, texture2D(uContainerMaskTexture, mUv + dir * uOutlinePx).r);
                band = max(band, texture2D(uContainerMaskTexture, mUv + dir * (0.5 * uOutlinePx)).r);
            }
        #endif
        #ifndef MASK_SDF
            // The bilinear mask ramp is wider than a pixel; steepen it so the core is solid.
            band = clamp(band * 2.0, 0.0, 1.0);
        #endif
            float halo = band * (1.0 - contMask);
        #ifdef OBSTRUCTION_MASK
            halo *= 1.0 - obCoverage;
        #endif
            if (uCompositeBackground > 0.5) {
                // Opaque canvas: replace the composite, never add to it.
                display = mix(display, uOutlineColor, halo);
            } else {
                display += uOutlineColor * halo;
                outAlpha = min(outAlpha + halo, 1.0);
            }
        }
    #endif
    #ifdef OBSTRUCTION_FILL
        display = mix(display, uObstructionFillColor, obCoverage);
        outAlpha = max(outAlpha, obCoverage);
    #endif
        display = clamp(display + ditherNoise() * outAlpha, 0.0, outAlpha);
        gl_FragColor = vec4(display, outAlpha);
    #endif
    }
`;

export const glassShaderSource = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uScene;
    uniform float uRefraction;
    ${DYE_GEOMETRY_GLSL}

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

    // No new target: refract the existing scene with the dye surface before
    // the container's glass optics. Never sample the framebuffer being written.
    vec4 layerScene (vec2 uv) {
        if (uRefraction <= 0.0) return texture2D(uScene, uv);
        float h = dyeHeight(texture2D(uHeightTexture, uv).a);
        vec2 shift = uRefraction * dyeRefraction(uv, dyeNormal(uv), h);
        return texture2D(uScene, clamp(uv + shift, 0.0, 1.0));
    }

    void main () {
        vec4 scene = layerScene(vUv);

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
                layerScene(uvR).r,
                layerScene(uvG).g,
                layerScene(uvB).b
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
            gl_FragColor = vec4(clamp(mix(scene.rgb, glassColor, edgeFade), 0.0, alpha), alpha);

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
                layerScene(uvR).r,
                layerScene(uvG).g,
                layerScene(uvB).b
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
            gl_FragColor = vec4(clamp(mix(scene.rgb, glassColor, glassMask), 0.0, alpha), alpha);
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
        // Max-channel brightness as in 0.8.0: a luminance key starves saturated
        // blue/red dye of bloom. The passing energy is linear light and the
        // display pass encodes it, as 0.8.0 did (ADR-0081).
        vec3 c = max(texture2D(uTexture, vUv).rgb, vec3(0.0));
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
    uniform float uKaris;

    // Karis average on the first downsample only: luminance-weighted taps stop
    // a single over-bright texel from flashing as a bloom firefly (ADR-0081).
    float tapWeight (vec3 c) {
        return mix(1.0, 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))), uKaris);
    }

    void main () {
        vec3 l = texture2D(uTexture, vL).rgb;
        vec3 r = texture2D(uTexture, vR).rgb;
        vec3 t = texture2D(uTexture, vT).rgb;
        vec3 b = texture2D(uTexture, vB).rgb;
        vec4 w = vec4(tapWeight(l), tapWeight(r), tapWeight(t), tapWeight(b));
        vec3 sum = l * w.x + r * w.y + t * w.z + b * w.w;
        gl_FragColor = vec4(sum / dot(w, vec4(1.0)), 0.0);
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
    precision mediump float;
    precision highp sampler2D;

    varying highp vec2 vUv;
    uniform sampler2D uTexture;

    void main () {
        highp vec4 c = texture2D(uTexture, vUv);
        float br = max(c.r, max(c.g, c.b));
        c.a = 1.0 - min(max(br * 20.0, 0.0), 0.8);
        gl_FragColor = c;
    }
`;

export const sunraysShader = `
    precision mediump float;
    precision highp sampler2D;

    varying highp vec2 vUv;
    uniform sampler2D uTexture;
    uniform highp float weight;

    #define ITERATIONS 16

    void main () {
        highp float Density = 0.3;
        highp float Decay = 0.95;
        highp float Exposure = 0.7;

        highp vec2 coord = vUv;
        highp vec2 dir = vUv - 0.5;

        dir *= 1.0 / float(ITERATIONS) * Density;
        highp float illuminationDecay = 1.0;

        highp float color = texture2D(uTexture, vUv).a;

        for (int i = 0; i < ITERATIONS; i++)
        {
            coord -= dir;
            highp float col = texture2D(uTexture, coord).a;
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
    uniform float uDose;
    uniform vec2 point;
    uniform float radius;
    uniform sampler2D uStickyMask;
    uniform float uStickyAmplify;

    void main () {
        vec2 p = vUv - point.xy;
        p.x *= aspectRatio;
        float weight = exp(-dot(p, p) / radius);
        float stickyVal = texture2D(uStickyMask, vec2(vUv.x, 1.0 - vUv.y)).r;
        weight *= 1.0 + stickyVal * uStickyAmplify;
        vec4 base = texture2D(uTarget, vUv);
        float thickness = uDose > 0.0 ? clamp(base.a + weight * uDose, 0.0, ${DYE_HEIGHT_CEILING}) : base.a;
        gl_FragColor = vec4(clamp(base.rgb + weight * color, -1000.0, 1000.0), thickness);
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
    uniform float uDose[MAX_FLOW_SOURCE_BATCH];
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
        float dose = 0.0;

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
            dose += amount * uDose[i];
        }

        float stickyVal = texture2D(uStickyMask, vec2(vUv.x, 1.0 - vUv.y)).r;
        float amplify = 1.0 + stickyVal * uStickyAmplify;
        vec4 base = texture2D(uTarget, vUv);
        float thickness = dose > 0.0 ? clamp(base.a + dose * amplify, 0.0, ${DYE_HEIGHT_CEILING}) : base.a;
        gl_FragColor = vec4(clamp(base.rgb + splat * amplify, -1000.0, 1000.0), thickness);
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
    uniform float uHeightCeiling;

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
        if (uHeightCeiling > 0.0) gl_FragColor.a = clamp(gl_FragColor.a, 0.0, uHeightCeiling);
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
    uniform float uHeightCeiling;

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
        if (uHeightCeiling > 0.0) gl_FragColor.a = clamp(gl_FragColor.a, 0.0, uHeightCeiling);
    }
`;

/**
 * Opt-in second-order MacCormack advection for the velocity field only (epic
 * 0001 Phase 2). Compiled into its own program; the shared advectionShader keeps
 * the dye/scalar/velocity semi-Lagrangian path byte-identical.
 *
 * Pass A (the engine forward-advects velocity into uPhiHat with no dissipation)
 * supplies phi_hat. This pass reconstructs phi^n (uVelocity), computes the
 * reverse-advected phi_bar, and forms the BFECC correction phi_hat + 0.5*(phi^n -
 * phi_bar). The Selle 2008 limiter clamps the result to the local stencil range
 * for monotonicity, and a first-order guard falls back to phi_hat next to solids
 * and open boundaries where the symmetric stencil would sample invalid data.
 *
 * Only runs WITH hardware linear filtering (the engine forces semi-Lagrangian
 * otherwise), so uVelocity sampling relies on hardware bilinear directly.
 */
export const advectionMacCormackShader = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uPhiHat;
    uniform vec2 texelSize;
    uniform float dt;
    uniform float dissipation;
    uniform vec4 dissipationVector;
    uniform float uUseDissipationVector;
    uniform float uMultiplicative;
    uniform sampler2D uStickyMask;
    uniform float uStickyStrength;
    uniform vec4 uOpenEdges;
    uniform sampler2D uSolidClearance;
    uniform float uHasSolidClearance;
${inlineMaskGLSL}

    // uPhiHat (velocitySource) is a NEAREST-filtered scratch FBO, so the reverse
    // back-trace sample is bilinearly reconstructed by hand. uVelocity is LINEAR,
    // so its off-grid samples use hardware bilinear directly.
    vec2 bilerpPhiHat (vec2 uv) {
        vec2 st = uv / texelSize - 0.5;
        vec2 iuv = floor(st);
        vec2 fuv = fract(st);
        vec2 a = texture2D(uPhiHat, (iuv + vec2(0.5, 0.5)) * texelSize).xy;
        vec2 b = texture2D(uPhiHat, (iuv + vec2(1.5, 0.5)) * texelSize).xy;
        vec2 c = texture2D(uPhiHat, (iuv + vec2(0.5, 1.5)) * texelSize).xy;
        vec2 d = texture2D(uPhiHat, (iuv + vec2(1.5, 1.5)) * texelSize).xy;
        return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
    }

    void main () {
        // phi^n at this cell and the symmetric forward/reverse departure offset.
        vec2 phiN = texture2D(uVelocity, vUv).xy;
        vec2 disp = dt * phiN * texelSize;
        vec2 coordFwd = vUv - disp;

        // phi_hat = forward SL advection (pass A); phi_bar = reverse advection of
        // phi_hat. The correction cancels the leading SL diffusion error.
        vec2 phiHat = texture2D(uPhiHat, vUv).xy;
        vec2 phiBar = bilerpPhiHat(vUv + disp);
        vec2 corrected = phiHat + 0.5 * (phiN - phiBar);

        // Selle 2008 limiter: clamp the correction to the value range of the four
        // phi^n texels of the bilinear stencil around the departure point. Sampling
        // at texel centers returns exact texels even under LINEAR filtering.
        vec2 st = coordFwd / texelSize - 0.5;
        vec2 iuv = floor(st);
        vec2 s00 = texture2D(uVelocity, (iuv + vec2(0.5, 0.5)) * texelSize).xy;
        vec2 s10 = texture2D(uVelocity, (iuv + vec2(1.5, 0.5)) * texelSize).xy;
        vec2 s01 = texture2D(uVelocity, (iuv + vec2(0.5, 1.5)) * texelSize).xy;
        vec2 s11 = texture2D(uVelocity, (iuv + vec2(1.5, 1.5)) * texelSize).xy;
        vec2 lo = min(min(s00, s10), min(s01, s11));
        vec2 hi = max(max(s00, s10), max(s01, s11));
        corrected = clamp(corrected, lo, hi);

        // One conservative clearance lookup proves that the Chebyshev ball
        // containing both departure segments and both 2x2 stencils is fluid.
        // The +1 covers the limiter's otherwise-unused neighbor at zero or an
        // exact-integer displacement. Long traces simply request more clearance.
        float im = inlineMaskValue(vUv);
        float traceRadius = ceil(max(abs(dt * phiN.x), abs(dt * phiN.y))) + 1.0;
        bool nearSolid = im < 0.5;
        if (uHasSolidClearance > 0.5) {
            float solidClearance = floor(texture2D(uSolidClearance, vUv).r * 255.0 + 0.5);
            nearSolid = nearSolid || solidClearance <= traceRadius;
        }
        bool nearOpenEdge =
            (uOpenEdges.x > 0.5 && vUv.x <= traceRadius * texelSize.x) ||
            (uOpenEdges.y > 0.5 && vUv.x >= 1.0 - traceRadius * texelSize.x) ||
            (uOpenEdges.z > 0.5 && vUv.y >= 1.0 - traceRadius * texelSize.y) ||
            (uOpenEdges.w > 0.5 && vUv.y <= traceRadius * texelSize.y);
        if (nearSolid || nearOpenEdge) {
            corrected = phiHat;
        }

        // Identical dissipation / sticky / inline-mask compositing to the velocity
        // branch of advectionShader, so MacCormack-on vs SL stays apples-to-apples.
        vec4 result = vec4(corrected, 0.0, 0.0);
        float stickyVal = texture2D(uStickyMask, vec2(vUv.x, 1.0 - vUv.y)).r;
        if (uMultiplicative > 0.5) {
            float scalarDissipation = mix(dissipation, dissipationVector.r, uUseDissipationVector);
            float adjDissipation;
            if (uStickyStrength >= 0.0) {
                adjDissipation = mix(scalarDissipation, 1.0, stickyVal * uStickyStrength);
            } else {
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

/**
 * Local vorticity-magnitude thresholds for adaptive confinement. Single-sourced
 * here (GL-free) and interpolated into the vorticityShader below; FluidEngine.ts
 * re-exports them so the TypeScript mirror and tests cannot drift from the GLSL.
 */
export const VORTICITY_ADAPTIVE_LO = 0.02;
export const VORTICITY_ADAPTIVE_HI = 0.08;

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
    uniform float uHasSolidMask;
    uniform float curl;
    uniform float dt;
    uniform float uAdaptiveMix;
    uniform float uVorticityScale;
    uniform sampler2D uSolidNeighbors;

    void main () {
        float L = texture2D(uCurl, vL).x;
        float R = texture2D(uCurl, vR).x;
        float T = texture2D(uCurl, vT).x;
        float B = texture2D(uCurl, vB).x;
        float C = texture2D(uCurl, vUv).x;
        float attenuation = 1.0;
        if (uHasSolidMask >= 0.5) {
            vec4 nb = texture2D(uSolidNeighbors, vUv);
            attenuation = clamp(1.0 - max(max(nb.x, nb.y), max(nb.z, nb.w)), 0.0, 1.0);
        }

        vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
        force /= length(force) + 0.0001;
        float omega = abs(C) * 2.0 * uVorticityScale;
        float adaptiveWeight = smoothstep(${VORTICITY_ADAPTIVE_LO}, ${VORTICITY_ADAPTIVE_HI}, omega);
        float confinement = mix(curl * C, curl * C * adaptiveWeight, clamp(uAdaptiveMix, 0.0, 1.0));
        force *= confinement * attenuation;
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

/*
 * Jump-flood signed distance field (ADR-0084). Seeds store the offset from
 * the texel to its nearest 0.5-coverage crossing, in texels, rather than an
 * absolute position: half floats keep ~1/1000-texel precision near the edge,
 * where accuracy matters, instead of ~0.25 texel at absolute coordinate 512.
 * |offset.x| > 5000 marks "no seed" (sentinel 1e4, see jump-flood.ts).
 */
export const jumpFloodSeedShader = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uSource;
    uniform vec2 uTexel;

    void main () {
        float c = texture2D(uSource, vUv).r;
        float l = texture2D(uSource, vUv - vec2(uTexel.x, 0.0)).r;
        float r = texture2D(uSource, vUv + vec2(uTexel.x, 0.0)).r;
        float b = texture2D(uSource, vUv - vec2(0.0, uTexel.y)).r;
        float t = texture2D(uSource, vUv + vec2(0.0, uTexel.y)).r;
        bool inside = c >= 0.5;
        bool edge = (l >= 0.5) != inside || (r >= 0.5) != inside ||
                    (b >= 0.5) != inside || (t >= 0.5) != inside;
        if (!edge) {
            gl_FragColor = vec4(1.0e4, 1.0e4, 0.0, 1.0);
            return;
        }
        // Steeper one-sided difference = the side the crossing lies on, so a
        // hard 0/1 step lands on the half-texel edge (mirror: seedOffset()).
        float gx = abs(r - c) > abs(c - l) ? r - c : c - l;
        float gy = abs(t - c) > abs(c - b) ? t - c : c - b;
        float g2 = gx * gx + gy * gy;
        vec2 o = g2 < 1.0e-6 ? vec2(0.0) : -(c - 0.5) * vec2(gx, gy) / g2;
        float len = length(o);
        if (len > 1.0) o /= len;
        gl_FragColor = vec4(o, 0.0, 1.0);
    }
`;

export const jumpFloodStepShader = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uSeeds;
    uniform vec2 uTexel;
    uniform float uStep;

    void main () {
        vec2 best = vec2(1.0e4);
        float bestD = 1.0e9;
        for (int j = -1; j <= 1; j++) {
            for (int i = -1; i <= 1; i++) {
                vec2 o = vec2(float(i), float(j)) * uStep;
                vec2 uv = vUv + o * uTexel;
                if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) continue;
                vec2 s = texture2D(uSeeds, uv).xy;
                if (abs(s.x) > 5000.0) continue;
                vec2 cand = s + o;
                float d = dot(cand, cand);
                if (d < bestD) {
                    bestD = d;
                    best = cand;
                }
            }
        }
        gl_FragColor = vec4(best, 0.0, 1.0);
    }
`;

export const jumpFloodDistanceShader = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uSeeds;
    uniform sampler2D uSource;

    void main () {
        vec2 s = texture2D(uSeeds, vUv).xy;
        // No seed anywhere (empty or full mask): clamp to a large finite value.
        float d = abs(s.x) > 5000.0 ? 1.0e4 : length(s);
        gl_FragColor = vec4(texture2D(uSource, vUv).r >= 0.5 ? -d : d, 0.0, 0.0, 1.0);
    }
`;
