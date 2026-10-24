// WebGL2 renderer of "Duas sombras": bakes the two words' distance fields once into R8 textures, then draws the
// gallery in one full-screen pass (shaders.ts) into a canvas sized at `scale` of its CSS size (the browser scales it
// up). `create` returns null without a hardware WebGL2 context, or when a shader or the bake does not build; the
// caller then keeps the HTML cover.
import { BAKE, BAKE_MARGIN, SCENE, VERTEX } from './shaders';
import { ORIGIN, W_DIA, W_IA, type Bands } from './sculpture';
import type { Camera } from './stage';

export type V4 = readonly [number, number, number, number];

export interface FrameParams {
  camera: Camera;
  /** Lean of the sculpture (radians) and its travel in world units. */
  yaw: number;
  pitch: number;
  shift: readonly [number, number, number];
  /** Lamps: xyz toward the lamp with w = 0 (directional), or its position with w = 1. */
  lampRight: V4;
  lampLeft: V4;
  /** Lamp levels, right ("DIA") and left ("IA"). */
  on: readonly [number, number];
  swell: number;
  sweep: number;
  fade: number;
  time: number;
}

/** Texels per cap height of the baked words: the shadows' edges stay sharp at full-screen size. */
const TEXELS = 384;
/** The sculpture's rest frame turns about the centre of its volume. */
export const PIVOT = [ORIGIN.x + W_DIA / 2, ORIGIN.y + 0.5, ORIGIN.z + W_IA / 2] as const;
const PAD = 0.12;

/** Software rasterizers (SwiftShader, llvmpipe…) would take seconds per frame of the ray marcher. */
export function isSoftwareRenderer(name: string): boolean {
  return /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render|offscreen/i.test(name);
}

/** World → rest rotation for a lean (yaw about y, then pitch about x), column-major for WebGL. */
export function restRotation(yaw: number, pitch: number): Float32Array {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // rest → world = Ry · Rx; world → rest is its transpose, whose columns are the rows of Ry · Rx
  return new Float32Array([cy, sy * sp, sy * cp, 0, cp, -sp, -sy, cy * sp, cy * cp]);
}

export class Gallery {
  /** Null without a hardware WebGL2 context: no WebGL2, a software one, or a shader or bake that does not build. */
  static create(canvas: HTMLCanvasElement, bands: Bands, spacing: number, thickness: number): Gallery | null {
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
      return new Gallery(canvas, gl, bands, spacing, thickness);
    } catch {
      return null;
    }
  }

  private readonly program: WebGLProgram;
  private readonly words: [WebGLTexture, WebGLTexture];
  private readonly locations = new Map<string, WebGLUniformLocation | null>();

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly gl: WebGL2RenderingContext,
    private readonly bands: Bands,
    private readonly spacing: number,
    private readonly thickness: number,
  ) {
    this.program = this.link(SCENE);
    const bake = this.link(BAKE);
    try {
      this.words = [this.bake(bake, 0, W_DIA), this.bake(bake, 1, W_IA)];
    } finally {
      gl.deleteProgram(bake);
    }
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

  /** The canvas at `scale` of its CSS size × pixel ratio (the scene is drawn at that size and scaled up by CSS). */
  setSize(cssWidth: number, cssHeight: number, pixelRatio: number, scale: number): void {
    this.canvas.width = Math.max(16, Math.round(cssWidth * pixelRatio * scale));
    this.canvas.height = Math.max(16, Math.round(cssHeight * pixelRatio * scale));
  }

  render(f: FrameParams): void {
    const { gl } = this;
    if (gl.isContextLost()) return;
    const at = (name: string): WebGLUniformLocation | null => {
      if (!this.locations.has(name)) this.locations.set(name, gl.getUniformLocation(this.program, name));
      return this.locations.get(name) ?? null;
    };
    const c = f.camera;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    gl.uniform2f(at('uRes'), this.canvas.width, this.canvas.height);
    gl.uniform3fv(at('uEye'), c.eye);
    gl.uniform3fv(at('uFwd'), c.fwd);
    gl.uniform3fv(at('uRight'), c.right);
    gl.uniform3fv(at('uUp'), c.up);
    gl.uniform1f(at('uTan'), c.tan);
    gl.uniform2fv(at('uLens'), c.shift);
    gl.uniform4fv(at('uLampR'), f.lampRight);
    gl.uniform4fv(at('uLampL'), f.lampLeft);
    gl.uniform2fv(at('uOn'), f.on);
    gl.uniform4f(at('uBands'), this.bands.normal[0], this.bands.normal[1], this.spacing, this.thickness);
    gl.uniform2f(at('uPhi'), this.bands.first, this.bands.last);
    gl.uniformMatrix3fv(at('uRot'), false, restRotation(f.yaw, f.pitch));
    gl.uniform3fv(at('uPivot'), PIVOT);
    gl.uniform3fv(at('uShift'), f.shift);
    gl.uniform3f(at('uLo'), ORIGIN.x - PAD, ORIGIN.y - PAD, ORIGIN.z - PAD);
    gl.uniform3f(at('uHi'), ORIGIN.x + W_DIA + PAD, ORIGIN.y + 1 + PAD, ORIGIN.z + W_IA + PAD);
    gl.uniform1f(at('uSwell'), f.swell);
    gl.uniform1f(at('uSweep'), f.sweep);
    gl.uniform1f(at('uFade'), f.fade);
    gl.uniform1f(at('uTime'), f.time);
    for (const [unit, name] of [[0, 'uDIA'], [1, 'uIA']] as const) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, this.words[unit]);
      gl.uniform1i(at(name), unit);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    const { gl } = this;
    for (const t of this.words) gl.deleteTexture(t);
    gl.deleteProgram(this.program);
  }

  private link(fragment: string): WebGLProgram {
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
    return program;
  }

  /** One word's distance field, baked by the GPU into an 8-bit texture (BAKE_RANGE around 0.5). */
  private bake(program: WebGLProgram, which: 0 | 1, width: number): WebGLTexture {
    const { gl } = this;
    const size = [width + 2 * BAKE_MARGIN, 1 + 2 * BAKE_MARGIN] as const;
    const w = Math.round(size[0] * TEXELS);
    const h = Math.round(size[1] * TEXELS);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('bake target');
      gl.disable(gl.DITHER); // exact distances, no ordered dither
      gl.viewport(0, 0, w, h);
      gl.useProgram(program);
      gl.uniform1i(gl.getUniformLocation(program, 'uWord'), which);
      gl.uniform2f(gl.getUniformLocation(program, 'uSize'), size[0], size[1]);
      gl.uniform2f(gl.getUniformLocation(program, 'uTexels'), w, h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } catch (e) {
      gl.deleteTexture(tex);
      throw e;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fbo);
    }
    return tex;
  }
}
