// GLSL ES 3.00 sources of the "Singularidade" renderer (renderer.ts runs them; README.md explains the physics).
// Units: lengths in Schwarzschild radii r_s = 2GM/c², so the horizon is r = 1, the photon sphere r = 1.5 and the
// innermost stable orbit r = 3. Image units: y up, the viewport height spans [-1, 1].

/** Full-screen triangle from gl_VertexID: no buffers. */
export const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * The scene: one light ray per pixel, integrated through the black hole's gravity from the camera to the plane of
 * the cover (or into the horizon), crossing the accretion disk on the way. The orbit equation of light in the
 * Schwarzschild metric, d²u/dφ² + u = 3Mu², is integrated in Cartesian form, a = -3/2 · h² · r⃗ / r⁵ (h = |r⃗ × v⃗|,
 * conserved), with steps proportional to the distance. The cover is sampled once, after the loop, so every pixel of
 * a quad reaches the texture lookup and the mip level stays valid.
 */
export const SCENE = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2 uRes;       // render target, px
uniform vec2 uView;      // viewport, CSS px (the cover bitmap spans it)
uniform vec2 uHole;      // hole centre, image units
uniform float uRs;       // size of the hole: 0 none, 1 normal, >1 swallowing the camera
uniform float uTime;     // s
uniform float uVivid;    // 0: dots as the CSS cover draws them; 1: the animated colour field
uniform float uHue;      // slow drift of the disk palette
uniform float uDisk;     // 0 → 1: the disk lights up after gravity has started bending the cover
uniform vec4 uWave;      // ripple: centre (CSS px), front radius (px), amplitude (px)
uniform sampler2D uCover;
uniform vec3 uN, uT1, uT2; // disk normal and in-plane basis

const float D = 30.0;            // camera → hole
const float S = 22.0;            // hole → cover plane
const float F = 2.0;             // focal length, image units
const float R_IN = 3.0;          // innermost stable circular orbit
const float R_OUT = 12.0;
const int MAX_STEPS = 220;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 1.7; a *= 0.5; }
  return s;
}
vec3 hsv(float h, float s, float v) {
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0, 4, 2), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1), k, s);
}
// Hot palette: deep magenta → orange → white → ice blue, as temperature × redshift rises.
vec3 diskPalette(float t, float hue) {
  t = clamp(t, 0.0, 3.0);
  vec3 deep = hsv(fract(0.92 + hue), 0.9, 0.55), mid = hsv(fract(0.06 + hue), 0.85, 1.0);
  vec3 hot = vec3(1.0, 0.93, 0.8), ice = vec3(0.75, 0.88, 1.0);
  vec3 c = t < 0.6 ? mix(vec3(0), deep, t / 0.6)
         : t < 1.1 ? mix(deep, mid, (t - 0.6) / 0.5)
         : t < 1.7 ? mix(mid, hot, (t - 1.1) / 0.6)
         : mix(hot, ice, clamp((t - 1.7) / 1.0, 0.0, 1.0));
  return c * (0.35 + t);
}
// The cover's dot grid in CSS px (2.6vh cells, like the CSS background), filtered by the pixel footprint fp.
vec3 dots(vec2 cs, float fp, float t) {
  float cell = uView.y * 0.026, rad = 1.3;
  vec2 id = floor(cs / cell);
  float d = length((fract(cs / cell) - 0.5) * cell) - rad;
  float cov = 1.0 - smoothstep(-max(fp, 0.5), max(fp, 0.5), d);
  cov = mix(cov, 3.1416 * rad * rad / (cell * cell), smoothstep(cell * 0.25, cell * 0.6, fp));
  vec3 calm = vec3(0.47, 0.67, 1.0) * 0.28;
  float hue = 0.53 + 0.33 * (cs.x / uView.x) + 0.06 * sin(cs.y * 0.01);
  float wave = 0.55 + 0.45 * sin(dot(id, vec2(0.21, 0.13)) - t * 1.6) * (0.5 + 0.5 * sin(id.x * 0.07 + t * 0.4));
  float twinkle = 0.6 + 0.4 * hash(id + floor(t * 2.0));
  vec3 vivid = hsv(fract(hue), 0.75, 0.9) * (0.25 + 0.6 * wave * twinkle);
  return mix(calm, vivid, uVivid) * cov;
}
vec2 coverUV(vec3 hitWorld) {
  vec2 q = hitWorld.xy * F / (D + S);               // where the point would be seen without gravity
  vec2 uv = vec2(q.x * uRes.y / uRes.x, q.y) * 0.5 + 0.5;
  return vec2(uv.x, 1.0 - uv.y);
}

void main() {
  vec2 img = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  vec3 hole = vec3(uHole * D / F, D);
  vec3 p = -hole / uRs, v = normalize(vec3(img, F));
  vec3 hv = cross(p, v);
  float h2 = dot(hv, hv);
  float plane = S / uRs;
  vec3 glow = vec3(0);
  float cover = 0.0;                                 // opacity gathered from the disk, front to back
  vec2 uvHit = vec2(0.5);
  int kind = 0;                                      // 0 lost, 1 cover plane, 2 horizon, 3 escaped backwards
  for (int i = 0; i < MAX_STEPS; i++) {
    float r2 = dot(p, p), r = sqrt(r2);
    float dt = max(0.06 * r, 0.012);
    vec3 prev = p;
    v += (-1.5 * h2 * p / (r2 * r2 * r)) * dt;
    p += v * dt;
    float s0 = dot(prev, uN), s1 = dot(p, uN);
    if (s0 * s1 < 0.0 && cover < 0.995 && uDisk > 0.0) {
      vec3 q = mix(prev, p, s0 / (s0 - s1));
      float rq = length(q);
      if (rq > R_IN && rq < R_OUT) {
        float phi = atan(dot(q, uT2), dot(q, uT1)) - sqrt(0.5 / (rq * rq * rq)) * uTime * 5.0; // Keplerian shear
        float x = (rq - R_IN) / (R_OUT - R_IN);
        float temp = pow(R_IN / rq, 0.75) * pow(max(1.0 - sqrt(R_IN / rq), 0.0), 0.25) * 2.6;
        float beta = sqrt(0.5 / rq);                 // orbital speed, c
        float g = sqrt(1.0 - 1.0 / rq) * sqrt(1.0 - beta * beta) /
                  (1.0 - beta * dot(normalize(cross(uN, q)), -normalize(v))); // gravitational × Doppler shift
        vec2 sp = vec2(rq * 2.2, phi * 3.0);
        float streak = fbm(vec2(sp.x * 1.5, sp.y * 1.27 + fbm(sp * 0.7) * 2.0));
        float bands = 0.6 + 0.4 * sin(rq * 6.0 + streak * 5.0);
        float dens = smoothstep(0.0, 0.04, x) * (1.0 - smoothstep(0.25, 1.0, x)) * (0.3 + 0.9 * streak) * bands;
        vec3 c = diskPalette(temp * g * 1.2, uHue) * pow(g, 3.0) * dens * 2.4; // beaming ∝ g³
        float a = clamp(dens * 1.2, 0.0, 1.0) * uDisk;
        glow += (1.0 - cover) * c * a;
        cover += (1.0 - cover) * a;
      }
    }
    if (r < 1.0) { kind = 2; break; }
    if (p.z > plane) {
      vec3 q = mix(prev, p, (plane - prev.z) / (p.z - prev.z));
      uvHit = coverUV(q * uRs + hole);
      kind = 1;
      break;
    }
    if (r > 60.0 && v.z < 0.0) { kind = 3; break; }
  }
  // Gravitational-wave ripple: a radial displacement of the cover around uWave.xy.
  vec2 rel = uvHit * uView - uWave.xy;
  float dist = length(rel) + 1e-4;
  float front = dist - uWave.z;
  float shift = uWave.w * sin(front * 0.06) * exp(-front * front / 6000.0);
  vec2 uv = uvHit + rel / dist * shift / uView;
  vec2 gx = dFdx(uv), gy = dFdy(uv);
  const float MAX_GRAD = 0.02;                       // across a lensing seam: cap instead of a blurry top mip
  if (dot(gx, gx) > MAX_GRAD * MAX_GRAD) gx = normalize(gx) * MAX_GRAD;
  if (dot(gy, gy) > MAX_GRAD * MAX_GRAD) gy = normalize(gy) * MAX_GRAD;
  vec3 ink = textureGrad(uCover, clamp(uv, 0.0, 1.0), gx, gy).rgb;
  float fp = max(length(gx * uView), length(gy * uView));
  float rippleGlow = uWave.w > 1e-3 ? 1.0 + 3.0 * abs(shift) / uWave.w : 1.0;
  vec3 field = dots(uv * uView, fp, uTime) * rippleGlow;
  bool inside = all(greaterThanEqual(uv, vec2(0))) && all(lessThanEqual(uv, vec2(1)));
  vec3 base = vec3(0.039, 0.051, 0.149);
  vec3 bg = kind == 1 ? (inside ? max(ink, base + field) : base + field * 0.6)
          : kind == 3 ? vec3(0.02, 0.02, 0.05)
          : vec3(0);
  outColor = vec4(glow + (1.0 - cover) * bg, 1.0);
}`;

/** Bloom, down: 4-tap box filter to half size; the first pass keeps only bright light. */
export const DOWN = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uSrc;
uniform vec2 uTexel;     // 1 / source size
uniform float uThreshold;
void main() {
  vec2 uv = gl_FragCoord.xy * 2.0 * uTexel;
  vec3 c = texture(uSrc, uv + uTexel * vec2(-1, -1)).rgb + texture(uSrc, uv + uTexel * vec2(1, -1)).rgb +
           texture(uSrc, uv + uTexel * vec2(-1, 1)).rgb + texture(uSrc, uv + uTexel * vec2(1, 1)).rgb;
  c *= 0.25;
  if (uThreshold > 0.0) c *= smoothstep(uThreshold, uThreshold + 0.6, max(c.r, max(c.g, c.b)));
  outColor = vec4(c, 1.0);
}`;

/** Bloom, up: tent filter from the smallest level back to 1/8 size. */
export const UP = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uSrc;
uniform vec2 uTexel;
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel * 0.5;
  vec3 c = texture(uSrc, uv + uTexel * vec2(-1, 0)).rgb + texture(uSrc, uv + uTexel * vec2(1, 0)).rgb +
           texture(uSrc, uv + uTexel * vec2(0, -1)).rgb + texture(uSrc, uv + uTexel * vec2(0, 1)).rgb;
  outColor = vec4(c * 0.25, 1.0);
}`;

/**
 * Composite: scene + bloom, tone map, vignette and grain (both fade in with the art), fade to black. The tone map is
 * the identity up to 0.92 and compresses only the highlights above it, so the painted cover keeps the HTML's
 * colours when the art takes over.
 */
export const FINAL = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uScene, uBloom1, uBloom2, uBloom3;
uniform vec2 uRes;
uniform float uBloom, uTime, uFade, uFx;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 knee(vec3 c) {
  const float K = 0.92;
  return mix(c, K + (1.0 - K) * (1.0 - exp(-(c - K) / (1.0 - K))), step(K, c));
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = texture(uScene, uv).rgb;
  c += (texture(uBloom1, uv).rgb * 0.5 + texture(uBloom2, uv).rgb * 0.8 + texture(uBloom3, uv).rgb * 1.2) * uBloom;
  c = knee(c);
  c *= mix(mix(1.0, 0.72, uFx), 1.0, 1.0 - smoothstep(0.35, 1.25, length(uv - 0.5) * 1.4));
  c += (hash(gl_FragCoord.xy + fract(uTime) * 97.0) - 0.5) * 0.022 * uFx;
  outColor = vec4(c * uFade, 1.0);
}`;
