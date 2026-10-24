// GLSL ES 3.00 sources of the "Duas sombras" renderer (renderer.ts runs them; README.md explains the scene).
// World units are cap heights: floor y = 0, left wall x = 0, right wall z = 0. The blades are evaluated in the
// sculpture's rest frame, so its rigid motion keeps the distance field a true bound for sphere tracing.
import { glslWord, ORIGIN, W_DIA, W_IA } from './sculpture';

/** Margin around each word in its baked distance texture, and the distance range an 8-bit texel stores. */
export const BAKE_MARGIN = 0.3;
export const BAKE_RANGE = 0.3;

const f = (n: number): string => n.toFixed(4);

/** Full-screen triangle from gl_VertexID: no buffers. */
export const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Bakes one word's signed distance (uWord 0: "DIA", 1: "IA") into an R8 texture, ±BAKE_RANGE around 0.5. */
export const BAKE = `#version 300 es
precision highp float;
out vec4 outColor;
uniform int uWord;
uniform vec2 uSize;     // word box with its margin, cap heights
uniform vec2 uTexels;   // texture size
float box(vec2 p, vec2 lo, vec2 hi) {
  vec2 c = 0.5 * (lo + hi), h = 0.5 * (hi - lo);
  vec2 d = abs(p - c) - h;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
float edge(vec2 p, vec2 a, vec2 b) { vec2 e = b - a; return dot(p - a, normalize(vec2(e.y, -e.x))); }
float quad(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d) {
  return max(max(edge(p, a, b), edge(p, b, c)), max(edge(p, c, d), edge(p, d, a)));
}
float bowl(vec2 p, vec2 c, float inner, float outer) {
  float r = length(p - c);
  return max(max(r - outer, inner - r), c.x - p.x);
}
${glslWord('DIA')}
${glslWord('IA')}
void main() {
  vec2 p = gl_FragCoord.xy / uTexels * uSize - ${f(BAKE_MARGIN)};
  float d = uWord == 0 ? word_DIA(p) : word_IA(p);
  outColor = vec4(clamp(d / ${f(2 * BAKE_RANGE)} + 0.5, 0.0, 1.0), 0.0, 0.0, 1.0);
}`;

/**
 * The gallery: a room corner (analytic planes), two lamps whose pools follow the sculpture, and the blades, found by
 * sphere tracing V ∩ bands (two texture taps per step). Shadows are traced toward each lamp through the sculpture's
 * box only; the clear glass block adds Fresnel and bright edges and casts nothing.
 */
export const SCENE = `#version 300 es
precision highp float;
precision highp sampler2D;
out vec4 outColor;

uniform vec2 uRes;              // render target, px
uniform vec3 uEye, uFwd, uRight, uUp;
uniform float uTan;             // half height of the frame at distance 1
uniform vec2 uLens;             // lens shift at distance 1
uniform vec4 uLampR, uLampL;    // xyz: direction toward the lamp (w = 0) or its position (w = 1)
uniform vec2 uOn;               // right ("DIA") and left ("IA") lamp levels
uniform vec4 uBands;            // normal x, normal z, spacing, thickness
uniform vec2 uPhi;              // first and last band centre
uniform mat3 uRot;              // world → rest rotation
uniform vec3 uPivot, uShift;    // rest pivot; world translation of the sculpture
uniform vec3 uLo, uHi;          // rest-frame box of the blades
uniform float uSwell;           // exit: the shadows bleed (cap heights)
uniform float uSweep;           // birth: where the glaze highlight runs
uniform float uFade, uTime;
uniform sampler2D uDIA, uIA;

const vec3 ORIGIN = vec3(${f(ORIGIN.x)}, ${f(ORIGIN.y)}, ${f(ORIGIN.z)});
const float W_DIA = ${f(W_DIA)};
const float W_IA = ${f(W_IA)};
const float M = ${f(BAKE_MARGIN)};
const float R = ${f(BAKE_RANGE)};
const float SHARP = 80.0;       // soft-shadow hardness: small, distant lamps
// Most the 8-bit, bilinearly filtered word fields can overstate a distance: half a quantisation step (2R/255) plus a
// texel (1/384) of reconstruction error near corners. Marching subtracts it, so no blade is stepped over.
const float ERR = ${f(BAKE_RANGE / 255 + 1 / 384 + 0.0005)};

const vec3 ACID = vec3(0.791, 0.905, 0.323);  // #E6F49A, linear
const vec3 VERM = vec3(0.905, 0.102, 0.045);  // #F45A3C
const vec3 CHALK = vec3(0.905, 0.855, 0.716); // #F4EEDC
const vec3 ULTRA = vec3(0.019, 0.044, 1.0);   // #263BFF
const vec3 CORAL = vec3(1.0, 0.084, 0.184);   // #FF5277
const vec3 LAMP = vec3(1.0, 0.96, 0.9);
const vec3 SKY = vec3(0.15, 0.136, 0.2);      // violet ambient

float word(sampler2D tex, vec2 p, float width) {
  vec2 size = vec2(width, 1.0) + 2.0 * M;
  vec2 st = (p + M) / size;
  float d = (textureLod(tex, st, 0.0).r - 0.5) * 2.0 * R;
  vec2 o = max(abs(st - 0.5) - 0.5, 0.0) * size;
  return d + length(o);
}
float volume(vec3 q) {
  return max(word(uDIA, vec2(q.x - ORIGIN.x, q.y - ORIGIN.y), W_DIA),
             word(uIA, vec2(ORIGIN.z + W_IA - q.z, q.y - ORIGIN.y), W_IA));
}
float bands(vec3 q) {
  float phi = dot(q.xz, uBands.xy);
  float k = clamp(floor((phi - uPhi.x) / uBands.z + 0.5), 0.0, floor((uPhi.y - uPhi.x) / uBands.z + 0.5));
  return abs(phi - (uPhi.x + k * uBands.z)) - 0.5 * uBands.w;
}
vec3 toRest(vec3 p) { return uRot * (p - uPivot - uShift) + uPivot; }
float blades(vec3 q, out float cut) {
  float v = volume(q), b = bands(q);
  cut = v - b;
  return max(v, b);
}
float blades(vec3 q) { float c; return blades(q, c); }

vec2 boxHit(vec3 ro, vec3 rd, vec3 lo, vec3 hi) {
  vec3 r = rd + vec3(lessThan(abs(rd), vec3(1e-7))) * 1e-7; // axis-aligned lamps: no 0 × ∞ on a slab boundary
  vec3 inv = 1.0 / r;
  vec3 a = (lo - ro) * inv, b = (hi - ro) * inv;
  vec3 mn = min(a, b), mx = max(a, b);
  return vec2(max(max(mn.x, mn.y), mn.z), min(min(mx.x, mx.y), mx.z));
}

// Soft shadow toward a lamp (world ray); swell > 0 fattens only the shadows (it stays below the baked range R).
float shadow(vec3 ro, vec3 rd, float tmax) {
  vec3 qo = toRest(ro), qd = uRot * rd;
  vec2 tb = boxHit(qo, qd, uLo - 0.02 - uSwell, uHi + 0.02 + uSwell);
  if (tb.x > tb.y || tb.y < 0.0 || tb.x > tmax) return 1.0;
  float t = max(tb.x, 0.004), end = min(tb.y, tmax), res = 1.0;
  for (int i = 0; i < 72; i++) {
    float h = blades(qo + qd * t) - uSwell - ERR;
    res = min(res, SHARP * h / t);
    if (res < 0.001) return 0.0;
    t += clamp(h, 0.003, 0.08);
    if (t > end) break;
  }
  return clamp(res, 0.0, 1.0);
}

void lampAt(vec4 lamp, vec3 p, out vec3 l, out float dist) {
  if (lamp.w < 0.5) { l = normalize(lamp.xyz); dist = 60.0; }
  else { vec3 d = lamp.xyz - p; dist = length(d); l = d / dist; }
}

// Each lamp's pool on its wall: an ellipse around its word, following the sculpture.
float pool(vec3 p, bool left) {
  vec2 e = left ? vec2(p.z - (ORIGIN.z + 0.5 * W_IA + uShift.z), p.y - (ORIGIN.y + 0.5 + uShift.y)) / vec2(1.2, 1.0)
                : vec2(p.x - (ORIGIN.x + 0.5 * W_DIA + uShift.x), p.y - (ORIGIN.y + 0.5 + uShift.y)) / vec2(1.75, 1.0);
  return 1.0 - smoothstep(0.78, 1.18, length(e));
}

float roomHit(vec3 ro, vec3 rd, out int id) {
  float t = 1e9;
  id = -1;
  if (rd.y < 0.0) { float s = -ro.y / rd.y; if (s < t) { t = s; id = 0; } }
  if (rd.x < 0.0) { float s = -ro.x / rd.x; if (s < t) { t = s; id = 1; } }
  if (rd.z < 0.0) { float s = -ro.z / rd.z; if (s < t) { t = s; id = 2; } }
  return t;
}
vec3 normalOf(int id) { return id == 0 ? vec3(0, 1, 0) : id == 1 ? vec3(1, 0, 0) : vec3(0, 0, 1); }
vec3 albedo(int id) { return id == 0 ? CHALK : id == 1 ? ACID : VERM; }

float cornerAO(vec3 p) {
  float a = 1.0 - 0.5 * exp(-(p.x + p.z) * 2.5);
  a *= 1.0 - 0.3 * exp(-p.y * 7.0) * (exp(-p.x * 5.0) + exp(-p.z * 5.0));
  return clamp(a, 0.0, 1.0);
}

vec3 roomLight(vec3 p, int id, bool shadows) {
  vec3 n = normalOf(id);
  vec3 c = SKY + vec3(0.2) * n.y;
  for (int i = 0; i < 2; i++) {
    bool left = i == 1;
    if (id != (left ? 1 : 2)) continue;
    float on = left ? uOn.y : uOn.x;
    if (on <= 0.0) continue;
    vec3 l; float dl;
    lampAt(left ? uLampL : uLampR, p, l, dl);
    float s = pool(p, left) * max(dot(n, l), 0.0);
    if (s > 0.0) c += LAMP * on * s * (shadows ? shadow(p + n * 0.002, l, dl) : 1.0);
  }
  if (id == 0 && shadows) c *= mix(0.6, 1.0, shadow(p + n * 0.002, normalize(vec3(0.1, 1.0, 0.1)), 6.0));
  vec3 col = albedo(id) * c * cornerAO(p);
  if (id != 0 && p.y < 0.07) col *= 0.8; // skirting
  return col;
}

vec3 restNormal(vec3 q) {
  const vec2 k = vec2(1, -1);
  const float e = 0.0015;
  return normalize(k.xyy * blades(q + k.xyy * e) + k.yyx * blades(q + k.yyx * e) +
                   k.yxy * blades(q + k.yxy * e) + k.xxx * blades(q + k.xxx * e));
}

// Glazed ceramic: ultramarine faces, coral where a band face meets the letter cut.
vec3 shadeBlade(vec3 p, vec3 q, vec3 rd, float cut) {
  vec3 nq = restNormal(q);
  vec3 n = transpose(uRot) * nq;
  vec3 alb = cut > -0.006 ? ULTRA : CORAL;
  float ao = 0.0;
  for (int i = 1; i <= 3; i++) { float h = 0.03 * float(i); ao += (h - blades(q + nq * h)) / h; }
  ao = clamp(1.0 - 0.35 * ao, 0.3, 1.0);
  vec3 c = (SKY * 1.3 + vec3(0.22) * max(n.y, 0.0)) * ao;
  vec3 spec = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    float on = i == 0 ? uOn.x : uOn.y;
    vec3 l; float dl;
    lampAt(i == 0 ? uLampR : uLampL, p, l, dl);
    float ndl = dot(n, l);
    if (ndl <= 0.0 || on <= 0.0) continue;
    float sh = shadow(p + n * 0.004, l, dl);
    c += LAMP * on * ndl * sh;
    spec += LAMP * on * sh * pow(max(dot(n, normalize(l - rd)), 0.0), 120.0) * 0.8;
  }
  vec3 r = reflect(rd, n);
  int rid;
  float rt = roomHit(p, r, rid);
  vec3 env = rid >= 0 ? roomLight(p + r * rt, rid, false) : vec3(0.02);
  float fr = 0.04 + 0.96 * pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
  float sweep = exp(-pow((dot(q.xz, vec2(0.7071)) + q.y * 0.4 - uSweep) * 3.0, 2.0));
  return mix(alb * c, env, fr) + spec + (alb * 0.9 + 0.25) * sweep;
}

vec3 tonemap(vec3 c) {
  c = c / (1.0 + max(c - 0.8, 0.0) * 0.6);
  return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  vec3 rd = normalize(uFwd + uRight * (uLens.x + uv.x * uTan) + uUp * (uLens.y + uv.y * uTan));
  vec3 ro = uEye;
  int id;
  float tRoom = roomHit(ro, rd, id);
  float pix = 2.0 * uTan / uRes.y;
  vec3 qo = toRest(ro), qd = uRot * rd;
  vec2 tb = boxHit(qo, qd, uLo, uHi);
  bool hit = false;
  float tHit = tRoom, cut = 0.0;
  if (tb.x < tb.y && tb.y > 0.0 && tb.x < tRoom) {
    float t = max(tb.x, 0.0), end = min(tb.y, tRoom);
    for (int i = 0; i < 120; i++) {
      float c;
      float d = blades(qo + qd * t, c) - ERR;
      if (d < 0.6 * pix * t) { hit = true; tHit = t; cut = c; break; }
      t += d;
      if (t > end) break;
    }
  }
  vec3 col = hit ? shadeBlade(ro + rd * tHit, qo + qd * tHit, rd, cut)
           : id >= 0 ? roomLight(ro + rd * tRoom, id, true) : vec3(0.02);
  // the clear glass block: Fresnel on its faces, bright edges, no shadow
  vec3 lo = uLo + 0.06, hi = uHi - 0.06;
  vec2 g = boxHit(qo, qd, lo, hi);
  if (g.x < g.y && g.x > 0.0) {
    for (int k = 0; k < 2; k++) {
      float tg = k == 0 ? g.x : g.y;
      if (tg >= tHit) continue;
      vec3 h = qo + qd * tg;
      vec3 rel = (h - 0.5 * (lo + hi)) / (0.5 * (hi - lo));
      vec3 a = abs(rel);
      vec3 nf = a.x > a.y && a.x > a.z ? vec3(sign(rel.x), 0, 0) : a.y > a.z ? vec3(0, sign(rel.y), 0) : vec3(0, 0, sign(rel.z));
      vec3 inside = (1.0 - abs(nf)) * (0.5 * (hi - lo) - abs(h - 0.5 * (lo + hi))) + 9.0 * abs(nf);
      float fr = 0.04 + 0.96 * pow(1.0 - abs(dot(nf, qd)), 5.0);
      float rim = 1.0 - smoothstep(0.0, 0.018, min(min(inside.x, inside.y), inside.z));
      col = col * vec3(0.975, 0.985, 0.995) + vec3(0.85, 0.92, 1.0) * (fr * 0.5 + rim * 0.22);
    }
  }
  col = tonemap(col);
  vec2 s = gl_FragCoord.xy / uRes;
  col *= mix(1.0, 0.86, smoothstep(0.45, 1.1, length(s - 0.5) * 1.3));
  col += (fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.012;
  outColor = vec4(col * uFade, 1.0);
}`;
