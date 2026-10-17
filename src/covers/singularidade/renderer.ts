// WebGL2 renderer of the "Singularidade" cover: the scene pass (shaders.ts) into a half-float target when the device
// can render to one, a small bloom chain, and the composite onto the canvas. `create` returns null without WebGL2 or
// when a shader does not compile or link; the caller then keeps the HTML cover.
import { DOWN, FINAL, SCENE, UP, VERTEX } from './shaders';

export interface FrameParams {
  /** Hole centre, CSS px. */
  hole: readonly [number, number];
  /** Size of the hole: 0 none, 1 normal, > 1 swallowing. */
  rs: number;
  /** Seconds since the art started (disk rotation, dots). */
  time: number;
  /** 0: dots as the CSS cover draws them; 1: the animated field. Also fades bloom, vignette and grain in. */
  vivid: number;
  /** 0 → 1: the accretion disk lights up. */
  disk: number;
  /** 1 visible, 0 black. */
  fade: number;
  /** Gravitational-wave ripple: centre x, y (CSS px), front radius (px), amplitude (px). */
  ripple: readonly [number, number, number, number];
}

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
}

interface Pass {
  program: WebGLProgram;
  at: (name: string) => WebGLUniformLocation | null;
}

const TILT = 0.09; // the disk's normal leans this far (rad) from vertical toward the camera: nearly edge-on
const BLOOM = 0.85;
const DISK_N = [0, Math.cos(TILT), -Math.sin(TILT)];
const DISK_T1 = [1, 0, 0];
const DISK_T2 = [0, Math.sin(TILT), Math.cos(TILT)];

/** Software rasterizers (SwiftShader, llvmpipe…) would take seconds per frame of the ray tracer. */
export function isSoftwareRenderer(name: string): boolean {
  return /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render|offscreen/i.test(name);
}

export class Singularity {
  /** Null without a hardware WebGL2 context: no WebGL2, a software one, or a shader that does not build. */
  static create(canvas: HTMLCanvasElement): Singularity | null {
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
      return new Singularity(canvas, gl);
    } catch {
      return null;
    }
  }

  private readonly scene: Pass;
  private readonly down: Pass;
  private readonly up: Pass;
  private readonly final: Pass;
  private readonly cover: WebGLTexture;
  private readonly hdr: boolean;
  private targets: Target[] = [];
  private view: [number, number] = [1, 1];

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly gl: WebGL2RenderingContext,
  ) {
    this.scene = this.pass(SCENE);
    this.down = this.pass(DOWN);
    this.up = this.pass(UP);
    this.final = this.pass(FINAL);
    this.hdr = gl.getExtension('EXT_color_buffer_float') !== null || gl.getExtension('EXT_color_buffer_half_float') !== null;
    this.cover = this.texture();
  }

  /** False once the context is lost or a draw has raised a GL error. */
  healthy(): boolean {
    const { gl } = this;
    return !gl.isContextLost() && gl.getError() === gl.NO_ERROR;
  }

  /** Waits until everything drawn so far is done (reads one pixel back): only for the start-up measurement. */
  finish(): void {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  }

  /** Largest bitmap side the GPU takes. */
  get maxTexture(): number {
    return this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
  }

  /** The painted HTML cover (snapshot.ts): the plane the hole bends. */
  setCover(source: TexImageSource): void {
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, this.cover);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  }

  /** Canvas at the CSS size × pixel ratio; the scene and bloom at `scale` of it. */
  setSize(cssWidth: number, cssHeight: number, pixelRatio: number, scale: number): void {
    const { gl } = this;
    this.view = [cssWidth, cssHeight];
    this.canvas.width = Math.max(1, Math.round(cssWidth * pixelRatio));
    this.canvas.height = Math.max(1, Math.round(cssHeight * pixelRatio));
    const w = Math.max(16, Math.round(this.canvas.width * scale));
    const h = Math.max(16, Math.round(this.canvas.height * scale));
    for (const t of this.targets) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    // scene, then the bloom chain at 1/2, 1/4, 1/8, 1/16 and the way back up at 1/8
    this.targets = [1, 2, 4, 8, 16, 8].map((d) => this.target(Math.max(1, Math.round(w / d)), Math.max(1, Math.round(h / d))));
  }

  render(f: FrameParams): void {
    const { gl } = this;
    if (gl.isContextLost() || this.targets.length === 0) return;
    const [scene, d1, d2, d3, d4, u3] = this.targets as [Target, Target, Target, Target, Target, Target];
    const [vw, vh] = this.view;
    this.draw(this.scene, scene, (at) => {
      gl.uniform2f(at('uRes'), scene.w, scene.h);
      gl.uniform2f(at('uView'), vw, vh);
      gl.uniform2f(at('uHole'), (2 * f.hole[0] - vw) / vh, -(2 * f.hole[1] - vh) / vh);
      gl.uniform1f(at('uRs'), Math.max(f.rs, 1e-4));
      gl.uniform1f(at('uTime'), f.time);
      gl.uniform1f(at('uVivid'), f.vivid);
      gl.uniform1f(at('uDisk'), f.disk);
      gl.uniform1f(at('uHue'), 0.08 * Math.sin(f.time * 0.05));
      gl.uniform4f(at('uWave'), f.ripple[0], f.ripple[1], f.ripple[2], f.ripple[3]);
      gl.uniform3fv(at('uN'), DISK_N);
      gl.uniform3fv(at('uT1'), DISK_T1);
      gl.uniform3fv(at('uT2'), DISK_T2);
      this.bind(at, 0, this.cover, 'uCover');
    });
    for (const [src, dst, threshold] of [[scene, d1, 1.1], [d1, d2, 0], [d2, d3, 0], [d3, d4, 0]] as const) {
      this.draw(this.down, dst, (at) => {
        this.bind(at, 0, src.tex, 'uSrc');
        gl.uniform2f(at('uTexel'), 1 / src.w, 1 / src.h);
        gl.uniform1f(at('uThreshold'), threshold);
      });
    }
    this.draw(this.up, u3, (at) => {
      this.bind(at, 0, d4.tex, 'uSrc');
      gl.uniform2f(at('uTexel'), 1 / d4.w, 1 / d4.h);
    });
    this.draw(this.final, null, (at) => {
      this.bind(at, 0, scene.tex, 'uScene');
      this.bind(at, 1, d2.tex, 'uBloom1');
      this.bind(at, 2, d3.tex, 'uBloom2');
      this.bind(at, 3, u3.tex, 'uBloom3');
      gl.uniform2f(at('uRes'), this.canvas.width, this.canvas.height);
      gl.uniform1f(at('uBloom'), BLOOM * f.vivid);
      gl.uniform1f(at('uTime'), f.time);
      gl.uniform1f(at('uFade'), f.fade);
      gl.uniform1f(at('uFx'), f.vivid);
    });
  }

  dispose(): void {
    const { gl } = this;
    for (const t of this.targets) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    this.targets = [];
    gl.deleteTexture(this.cover);
    for (const p of [this.scene, this.down, this.up, this.final]) gl.deleteProgram(p.program);
  }

  private pass(fragment: string): Pass {
    const { gl } = this;
    const program = gl.createProgram();
    for (const [type, source] of [
      [gl.VERTEX_SHADER, VERTEX],
      [gl.FRAGMENT_SHADER, fragment],
    ] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('createShader');
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
        throw new Error(gl.getShaderInfoLog(shader) ?? 'shader');
      }
      gl.attachShader(program, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'link');
    }
    const cache = new Map<string, WebGLUniformLocation | null>();
    const at = (name: string): WebGLUniformLocation | null => {
      if (!cache.has(name)) cache.set(name, gl.getUniformLocation(program, name));
      return cache.get(name) ?? null;
    };
    return { program, at };
  }

  private texture(): WebGLTexture {
    const { gl } = this;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private target(w: number, h: number): Target {
    const { gl } = this;
    const fbo = gl.createFramebuffer();
    const make = (half: boolean): WebGLTexture => {
      const tex = this.texture();
      if (half) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return tex;
    };
    let tex = make(this.hdr);
    if (this.hdr && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteTexture(tex);
      tex = make(false); // no renderable half floats after all: 8-bit targets, softer highlights
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, w, h };
  }

  private bind(at: Pass['at'], unit: number, tex: WebGLTexture, name: string): void {
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(at(name), unit);
  }

  private draw(pass: Pass, dst: Target | null, setup: (at: Pass['at']) => void): void {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fbo : null);
    gl.viewport(0, 0, dst ? dst.w : this.canvas.width, dst ? dst.h : this.canvas.height);
    gl.useProgram(pass.program);
    setup(pass.at);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
