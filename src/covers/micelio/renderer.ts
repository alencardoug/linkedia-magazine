// WebGL2 plumbing of "Micélio", ported from the approved prototype: agents ping-pong between two vertex buffers by
// transform feedback, deposit additively into an RGBA16F trail, the trail diffuses and decays, and one full-screen pass
// shows it. Food (the masthead, one disc per headline node) is an R8 texture painted with Canvas 2D and mipmapped.
// `create` returns null without a hardware WebGL2 context, without float render targets (EXT_color_buffer_float: there
// is no 8-bit path) or when a shader does not build; the caller then keeps the HTML cover.
import { DEPOSIT_FS, DEPOSIT_VS, DISPLAY, DIFFUSE, TRI, UPDATE } from './shaders';
import { mulberry32, SIM } from './motion';

/** Software rasterizers (SwiftShader, llvmpipe…) would take seconds per frame of the simulation. */
export function isSoftwareRenderer(name: string): boolean {
  return /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render|offscreen/i.test(name);
}

const TAU = Math.PI * 2;
const FONT = (px: number): string => `800 ${px}px system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif`;

interface Program {
  p: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
}

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
}

/** A headline node: its centre in client px and the article's reading time. */
export interface Node {
  x: number;
  y: number;
  minutes: number;
}

/** One simulation step: the pointer food (trail texels), the rule and the mix, as the prototype's `step`. */
export interface StepParams {
  ptr: readonly [number, number, number, number]; // x, y, weight, radius
  far: readonly [number, number]; // length, strength
  hunger: readonly [number, number]; // strength, length
  sensorAngle: number;
  step: number;
  food: number; // static food amount
  respawn: number;
  fedIgnoreFood: boolean;
  decay: number;
}

export interface DrawParams {
  mask: number;
  wipe: number;
  tap: readonly [number, number]; // 0 … 1, y up
  ptr: readonly [number, number, number, number]; // canvas px: x, y, radius, glow
}

export class Mycelium {
  static create(canvas: HTMLCanvasElement): Mycelium | null {
    try {
      const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
        failIfMajorPerformanceCaveat: true, // the browser would render in software: keep the HTML cover
      });
      if (!gl) return null;
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const name: unknown = gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
      if (typeof name === 'string' && isSoftwareRenderer(name)) return null;
      if (!gl.getExtension('EXT_color_buffer_float')) return null;
      return new Mycelium(canvas, gl);
    } catch {
      return null;
    }
  }

  TW = 0;
  TH = 0;
  private readonly upd: Program;
  private readonly dep: Program;
  private readonly dif: Program;
  private readonly dis: Program;
  private readonly buf: WebGLBuffer[] = [];
  private readonly vao: WebGLVertexArrayObject[] = [];
  private readonly tf: WebGLTransformFeedback[] = [];
  private readonly tri: WebGLVertexArrayObject;
  private readonly foodTex: WebGLTexture;
  private readonly food2d = document.createElement('canvas');
  private trail: Target[] = [];
  private cur = 0;
  private src = 0;
  private frameNo = 0;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly gl: WebGL2RenderingContext,
  ) {
    this.upd = this.program(UPDATE, '#version 300 es\nvoid main(){}', ['vState']);
    this.dep = this.program(DEPOSIT_VS, DEPOSIT_FS);
    this.dif = this.program(TRI, DIFFUSE);
    this.dis = this.program(TRI, DISPLAY);
    gl.useProgram(this.upd.p);
    gl.uniform1i(this.upd.u.uTrail, 0);
    gl.uniform1i(this.upd.u.uFood, 1);
    gl.useProgram(this.dif.p);
    gl.uniform1i(this.dif.u.uTrail, 0);
    gl.useProgram(this.dis.p);
    gl.uniform1i(this.dis.u.uTrail, 0);
    gl.uniform1i(this.dis.u.uFood, 1);
    for (let i = 0; i < 2; i++) {
      const b = gl.createBuffer();
      const v = gl.createVertexArray();
      const t = gl.createTransformFeedback();
      gl.bindVertexArray(v);
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, t);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, b);
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
      gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);
      this.buf.push(b);
      this.vao.push(v);
      this.tf.push(t);
    }
    this.tri = gl.createVertexArray();
    this.foodTex = gl.createTexture();
  }

  private program(vs: string, fs: string, feedback?: string[]): Program {
    const { gl } = this;
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
      const s = gl.createShader(type);
      if (!s) throw new Error('shader');
      gl.shaderSource(s, src);
      gl.compileShader(s);
      gl.attachShader(p, s);
      gl.deleteShader(s);
    }
    if (feedback) gl.transformFeedbackVaryings(p, feedback, gl.SEPARATE_ATTRIBS);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link');
    const u: Program['u'] = {};
    for (let i = (gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number) - 1; i >= 0; i--) {
      const info = gl.getActiveUniform(p, i);
      if (info) u[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  private target(w: number, h: number): Target {
    const { gl } = this;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo');
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fbo };
  }

  /** A new sheet: empty trails of `tw`×`th` texels and the edition's dust for `maxN` agents. */
  build(tw: number, th: number, maxN: number, seed: number): void {
    const { gl } = this;
    this.TW = tw;
    this.TH = th;
    for (const t of this.trail) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    this.trail = [this.target(tw, th), this.target(tw, th)];
    this.cur = 0;
    const rnd = mulberry32(seed);
    const data = new Float32Array(maxN * 4);
    for (let i = 0; i < maxN; i++) {
      data[4 * i] = rnd() * tw;
      data[4 * i + 1] = rnd() * th;
      data[4 * i + 2] = rnd() * TAU;
    }
    for (const b of this.buf) {
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_COPY);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.src = 0;
    this.frameNo = 0;
  }

  /** Paints the food: the masthead and one soft disc under each headline node (`w`×`h`: the CSS viewport). */
  paintFood(w: number, h: number, nodes: readonly Node[], radius: (minutes: number) => number): void {
    const { gl, TW, TH } = this;
    const c = this.food2d;
    c.width = TW;
    c.height = TH;
    const x = c.getContext('2d');
    if (!x) throw new Error('2d');
    x.fillStyle = '#000';
    x.fillRect(0, 0, TW, TH);
    const two = w / h < 0.8;
    const lines = two ? ['Linked', 'IA'] : ['LinkedIA'];
    x.font = FONT(100);
    x.textAlign = 'center';
    const wide = Math.max(...lines.map((l) => x.measureText(l).width));
    const px = (100 * (two ? 0.82 : 0.74) * TW) / wide;
    const cy = TH * (two ? 0.27 : 0.45);
    x.font = FONT(px);
    x.fillStyle = '#fff';
    lines.forEach((l, i) => x.fillText(l, TW / 2, cy + px * 0.36 + (i - (lines.length - 1) / 2) * px * 0.98));
    for (const n of nodes) {
      const nx = (n.x / w) * TW;
      const ny = (n.y / h) * TH;
      const r = radius(n.minutes);
      const g = x.createRadialGradient(nx, ny, 0, nx, ny, r);
      g.addColorStop(0, '#fff');
      g.addColorStop(0.55, '#fff');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.beginPath();
      x.arc(nx, ny, r, 0, TAU);
      x.fill();
    }
    gl.bindTexture(gl.TEXTURE_2D, this.foodTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, c);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Drawing-buffer size in device px. */
  setCanvas(width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  get width(): number {
    return this.canvas.width;
  }

  get height(): number {
    return this.canvas.height;
  }

  /** One step for the first `n` agents: update, deposit, diffuse and decay. */
  step(n: number, s: StepParams): void {
    const { gl, upd, dep, dif, TW, TH } = this;
    const u = upd.u;
    this.frameNo++;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(upd.p);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.foodTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.trail[this.cur].tex);
    gl.uniform2f(u.uSize, TW, TH);
    gl.uniform1ui(u.uFrame, this.frameNo);
    gl.uniform4f(u.uPtr, ...s.ptr);
    gl.uniform2f(u.uFar, ...s.far);
    gl.uniform2f(u.uHung, ...s.hunger);
    gl.uniform4f(u.uRule, SIM.sensorOffset, s.sensorAngle, SIM.turn, s.step);
    gl.uniform4f(u.uMix, SIM.food, s.food, SIM.jitter, s.respawn);
    gl.uniform4f(u.uLife, SIM.cap, SIM.leave, SIM.fed, s.fedIgnoreFood ? 1 : 0);
    gl.bindVertexArray(this.vao[this.src]);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.tf[1 - this.src]);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, n);
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    this.src = 1 - this.src;
    // deposit (additive) into the current trail
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.trail[this.cur].fbo);
    gl.viewport(0, 0, TW, TH);
    gl.useProgram(dep.p);
    gl.uniform2f(dep.u.uSize, TW, TH);
    gl.uniform1f(dep.u.uDep, SIM.deposit * Math.sqrt(128000 / n));
    gl.bindVertexArray(this.vao[this.src]);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, n);
    gl.disable(gl.BLEND);
    // diffuse and decay into the other trail
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.trail[1 - this.cur].fbo);
    gl.useProgram(dif.p);
    gl.bindTexture(gl.TEXTURE_2D, this.trail[this.cur].tex);
    gl.uniform2f(dif.u.uPx, 1 / TW, 1 / TH);
    gl.uniform2f(dif.u.uDecay, s.decay, SIM.ghost);
    gl.bindVertexArray(this.tri);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.cur = 1 - this.cur;
  }

  draw(d: DrawParams): void {
    const { gl, dis, canvas } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(dis.p);
    gl.bindVertexArray(this.tri);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.foodTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.trail[this.cur].tex);
    gl.uniform2f(dis.u.uRes, canvas.width, canvas.height);
    gl.uniform2f(dis.u.uTap, d.tap[0] * canvas.width, d.tap[1] * canvas.height);
    gl.uniform4f(dis.u.uLook, SIM.exposure, 0.12 * d.mask, d.wipe, SIM.gamma);
    gl.uniform4f(dis.u.uPtr, ...d.ptr);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  healthy(): boolean {
    const { gl } = this;
    return !gl.isContextLost() && gl.getError() === gl.NO_ERROR;
  }

  /** Waits until everything issued so far is done (reads one pixel back): only for the start-up measurement. */
  finish(): void {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  }

  dispose(): void {
    const { gl } = this;
    for (const t of this.trail) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    this.trail = [];
    for (const b of this.buf) gl.deleteBuffer(b);
    for (const v of this.vao) gl.deleteVertexArray(v);
    for (const t of this.tf) gl.deleteTransformFeedback(t);
    gl.deleteVertexArray(this.tri);
    gl.deleteTexture(this.foodTex);
    for (const p of [this.upd, this.dep, this.dif, this.dis]) gl.deleteProgram(p.p);
  }
}
