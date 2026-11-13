// Boot of the "Sismograma" cover (docs/COVERS.md, ./README.md). The HTML cover — a lab sheet with the masthead, the
// work, the edition's lead headlines and a ruled poster — and its link work before, without and after the art. The art
// is Canvas 2D: it starts when the device can show it (a 2D context, a cover that fits the viewport, no forced
// colours) and goes live only after a first frame that left ink on the canvas; any later failure puts the HTML cover
// back with native entry. Reduced motion gets one still frame. Navigation is owned by EntryController and an
// independent deadline.
import { lineCode, lineInks, ordinalDate } from './codes';
import { EntryController, LONG_PRESS_MS, TAP_SLOP_PX, type Decision } from './controller';
import { drawSheet, type Sheet } from './draw';
import {
  addRipple,
  breathing,
  DRAG_C,
  EXIT_C,
  EXIT_MS,
  exitRadius,
  exitSpeed,
  lens,
  lensSigma,
  lensStrength,
  lineCount,
  penDone,
  pointStep,
  PRESS_C,
  RELIEF,
  RELIEF_CALM,
  reliefLift,
  RIPPLE_LIFE,
  RIPPLE_SPEED,
  rippleAt,
  RIPPLE_WAKE,
  rippleWave,
  rows,
  smoothRows,
  softLimit,
  STILL_T,
  type Ripple,
} from './field';
import { createMarkers, stepMarker, type Marker } from './markers';
import { createNoise3, mulberry32, type Noise3 } from './noise';
import { GRAIN_STEP_MS, grainShift, paintGrain } from './paper';
import { Pointers } from './pointer';
import { calibratedScale, createQuality, MIN_SCALE, observeFrame, type Quality } from './quality';
import { resampleRows, stepSprings } from './springs';

type Vec = readonly [number, number];

const HINT_HTML = 'Clique ou toque em qualquer lugar para entrar.';
const hintLive = (): string =>
  matchMedia('(hover: none)').matches
    ? 'Arraste o dedo: as linhas se abrem e ondulam. Segure para lançar uma onda. Toque em qualquer lugar para entrar.'
    : 'Passe o cursor: as linhas se abrem. Arraste ou segure o clique para lançar ondas. Clique em qualquer lugar para entrar.';

const CANVAS_PIXELS = 6_000_000; // backing-store budget; the ratio never passes min(devicePixelRatio, 2)
const HALF_RATE_AFTER_MS = 20_000; // without input: 30 fps…
const FREEZE_AFTER_MS = 120_000; // …then a still frame until the next input
const FONT_WAIT_MS = 1500;
const MASK_SCALE = 0.5; // the relief mask, in mask pixels per CSS pixel
const RELIEF_BLUR_PX = 10;
const RELIEF_GAP_EM = 0.09; // between the I and the A, so they read as two letters
const RELIEF_FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

interface Elements {
  root: HTMLElement;
  cover: HTMLElement;
  chart: HTMLElement;
  canvas: HTMLCanvasElement;
  grain: HTMLCanvasElement | null;
  link: HTMLAnchorElement;
}

interface Mask {
  alpha: Uint8Array;
  w: number;
  h: number;
  top: number;
}

const viewport = (): [number, number] => [document.documentElement.clientWidth, document.documentElement.clientHeight];

/** The cover fits the viewport without scrolling (else the HTML cover stays, scrollable). */
function fits(): boolean {
  const [w, h] = viewport();
  return document.body.scrollHeight <= h + 1 && document.body.scrollWidth <= w + 1;
}

async function fontsReady(): Promise<void> {
  if (!document.fonts) return;
  await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS))]);
}

function canShowArt(canvas: HTMLCanvasElement): boolean {
  if (matchMedia('(forced-colors: active)').matches) return false;
  return typeof CanvasRenderingContext2D !== 'undefined' && typeof canvas.getContext === 'function';
}

/** The sheet: geometry, the elastic lines, pointers, ripples and markers, adaptive density and its frame loop. */
class Art {
  live = false;
  private ctx: CanvasRenderingContext2D | null = null;
  private quality: Quality = createQuality(1, 0);
  private readonly seed: number;
  private readonly n: number;
  private readonly noise: Noise3;
  private readonly inks: string[];
  private readonly codes: string[];
  private readonly pointers = new Pointers();
  private ripples: Ripple[] = [];
  private markers: Marker[] = [];
  private sheet: Sheet | null = null;
  /** The elastic state: displacement and velocity of every point. What is shown (`sheet.u`) adds the ripples. */
  private u: Float32Array = new Float32Array(0);
  private v: Float32Array = new Float32Array(0);
  private swell: Float32Array = new Float32Array(0);
  private goal: Float32Array = new Float32Array(0);
  private relief: Float32Array = new Float32Array(0);
  private mask: Mask | null = null;
  private S = 1;
  private step = 8;
  /** The art's clock, seconds: it stops while nothing is drawn. */
  private t = 0;
  /** Seconds since the pen started plotting the sheet (Infinity: plotted). */
  private pen = Infinity;
  private exitAt: { t: number; x: number; y: number; reach: number; from: number[] } | null = null;
  private lastInput = -Infinity;
  private raf = 0;
  private last = 0;
  private lastAdvance = 0;
  private lastGrain = 0;
  private grainStep = 0;
  private frames = 0;
  private frozen = false;
  /** Reduced motion: one still frame, redrawn only after a resize (it may change while the page is open). */
  private still: boolean;
  private resizeTimer = 0;

  constructor(
    private readonly el: Elements,
    private readonly onFail: () => void,
    private readonly onExitDone: () => void,
  ) {
    this.still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const data = el.cover.dataset;
    const seed = Number(data.seed);
    this.seed = Number.isFinite(seed) ? seed >>> 0 : 1;
    this.n = lineCount(Number(data.lines) - 15); // `data-lines` is the count itself: clamped again, 15 if broken
    this.noise = createNoise3(this.seed);
    this.inks = lineInks(this.n, this.seed);
    const ordinal = ordinalDate(data.date ?? '');
    this.codes = Array.from({ length: this.n }, (_, i) => lineCode(i, this.seed, ordinal));
  }

  /** Builds the sheet and draws a first frame; true once that frame is verified and the art is live. `prepare` runs
   * right before the cover is measured (it sets the hint the live cover shows). */
  async start(prepare: (still: boolean) => void): Promise<boolean> {
    this.ctx = this.el.canvas.getContext('2d');
    if (!this.ctx) return false;
    await fontsReady();
    if (!this.ctx) return false; // left while the fonts loaded
    prepare(this.still);
    if (!fits()) return this.abort();
    // The cost of one frame at the coarsest point step (after an untimed warm-up) sets the starting density.
    this.quality = createQuality(MIN_SCALE, performance.now());
    this.pen = Infinity;
    this.exitAt = null;
    if (!this.rebuild()) return this.abort();
    this.settle(STILL_T);
    this.frame(1 / 60);
    const t0 = performance.now();
    this.frame(1 / 60);
    const scale = calibratedScale(performance.now() - t0, 1);
    if (scale === null || !this.inked()) return this.abort();
    this.quality = createQuality(scale, performance.now());
    if (!this.rebuild()) return this.abort();
    this.frozen = false;
    if (this.still) this.drawStill();
    else {
      // The pen plots the sheet from an empty canvas.
      this.settle(0);
      this.pen = 0;
      this.clear();
    }
    this.live = true;
    this.el.root.dataset.art = 'live';
    this.rest(this.still);
    this.lastInput = performance.now();
    if (!this.still) this.resume();
    return true;
  }

  /** A pointer is over the sheet or moved (client px); `pressed`: a finger down or a mouse button held. */
  pointer(id: number, x: number, y: number, timeMs: number, pressed: boolean): void {
    this.wake();
    if (!this.animated()) return;
    const earned = this.pointers.move(id, x, y, timeMs, pressed);
    for (let i = 0; i < earned; i++) this.ripple(x, y, DRAG_C * this.S, RIPPLE_SPEED);
  }

  release(id: number): void {
    this.pointers.release(id);
  }

  releaseAll(): void {
    this.pointers.releaseAll();
  }

  /** A long press: one damped ring from there. False when nothing is animated. */
  wave(x: number, y: number): boolean {
    this.wake();
    if (!this.animated()) return false;
    this.ripple(x, y, PRESS_C * this.S, RIPPLE_SPEED);
    return true;
  }

  /** Any input wakes a frozen frame. */
  wake(): void {
    this.lastInput = performance.now();
    if (this.frozen && this.live && !this.still) {
      this.frozen = false;
      this.rest(false);
      this.resume();
    }
  }

  /** Showing a still frame (idle, reduced motion, too slow): an activation then enters at once. */
  isStill(): boolean {
    return !this.live || this.still || this.frozen || this.quality.still;
  }

  /** Reduced motion turned on or off while the page is open. */
  setStill(still: boolean): void {
    this.still = still;
    if (!this.live || this.exitAt) return;
    if (still) {
      this.pause();
      this.drawStill();
      this.rest(true);
    } else {
      this.frozen = false;
      this.rest(false);
      this.resume();
    }
  }

  /** Starts the entry: a strong ripple from the tap (`at`, client px; null = the middle of the plot), the sheet erased
   * outward from there, the markers sliding to the edges. False when nothing plays. */
  exit(at: Vec | null): boolean {
    const s = this.sheet;
    if (!s || !this.animated()) return false;
    const [x, y] = at ?? [s.W / 2, (s.top + s.bottom) / 2];
    const reach = Math.max(Math.hypot(x, y), Math.hypot(s.W - x, y), Math.hypot(x, s.H - y), Math.hypot(s.W - x, s.H - y));
    this.ripple(x, y, EXIT_C * this.S, exitSpeed(reach));
    this.exitAt = { t: performance.now(), x, y, reach, from: this.markers.map((m) => m.x) };
    this.el.root.dataset.leaving = '';
    this.frozen = false;
    this.rest(false);
    this.resume();
    return true;
  }

  /** Back from the magazine (bfcache): a new sheet, never the erased one. */
  reborn(): void {
    delete this.el.root.dataset.leaving;
    if (!this.live) return;
    this.exitAt = null;
    this.frozen = false;
    this.lastInput = performance.now();
    try {
      if (!fits() || !this.rebuild()) return this.fail();
      if (this.still || this.quality.still) return this.drawStill();
      this.settle(0);
      this.pen = 0;
      this.clear();
      this.rest(false);
      this.resume();
    } catch {
      this.fail();
    }
  }

  pause(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Leaving the page: stop drawing and pending work; on a permanent departure also free the canvases. */
  leave(persisted: boolean): void {
    this.pause();
    clearTimeout(this.resizeTimer);
    if (!persisted) {
      this.el.canvas.width = this.el.canvas.height = 0;
      if (this.el.grain) this.el.grain.width = this.el.grain.height = 0;
      this.ctx = null;
      this.sheet = null;
      this.live = false;
    }
  }

  resume(): void {
    if (this.raf || !this.live || this.still) return; // reduced motion: the still frame never animates
    this.last = this.lastAdvance = performance.now();
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  /** Resizes, rotations and zoom: one new sheet after the burst. */
  scheduleRebuild(): void {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      if (!this.live) return;
      try {
        if (!fits() || !this.rebuild()) return this.fail();
        if (this.still || this.quality.still) return this.drawStill();
        this.pen = Infinity;
        this.settle(this.t);
        if (this.frozen) this.draw();
      } catch {
        this.fail();
      }
    }, 150);
  }

  fail(): void {
    this.pause();
    clearTimeout(this.resizeTimer);
    this.clear();
    this.sheet = null;
    this.ctx = null;
    if (this.live) delete this.el.root.dataset.art;
    delete this.el.root.dataset.leaving;
    delete this.el.root.dataset.rest;
    this.live = false;
    this.onFail();
  }

  private abort(): false {
    this.clear();
    this.sheet = null;
    this.ctx = null;
    return false;
  }

  private animated(): boolean {
    return this.live && !this.still && !this.frozen && !this.quality.still && !this.exitAt && this.sheet !== null;
  }

  /** `data-rest`: the sheet shows a still frame, so the rolling band of the paper stops too (cover.css). */
  private rest(on: boolean): void {
    if (on) this.el.root.dataset.rest = '';
    else delete this.el.root.dataset.rest;
  }

  private clear(): void {
    const { canvas } = this.el;
    this.ctx?.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx?.clearRect(0, 0, canvas.width, canvas.height);
  }

  private ripple(x: number, y: number, C: number, speed: number): void {
    this.ripples = addRipple(this.ripples, { x, y, t0: this.t, C, speed }, this.t);
  }

  /** A new sheet sized to the viewport: the canvas, the rows inside the plot, the points, the relief, the paper. */
  private rebuild(): boolean {
    const { canvas, chart, grain } = this.el;
    const [W, H] = viewport();
    const box = chart.getBoundingClientRect();
    if (!this.ctx || W < 1 || H < 1 || box.height < 48) return false;
    const ratio = Math.min(devicePixelRatio || 1, 2, Math.sqrt(CANVAS_PIXELS / (W * H)));
    canvas.width = Math.round(W * ratio);
    canvas.height = Math.round(H * ratio);
    const { S, y } = rows(box.top, box.bottom, this.n);
    this.S = S;
    this.buildMask(W, box.top, box.bottom);
    this.sheet = {
      W,
      H,
      ratio,
      n: this.n,
      m: 0,
      xs: new Float32Array(0),
      base: Float32Array.from({ length: this.n }, (_, i) => y(i)),
      u: new Float32Array(0),
      hot: new Uint8Array(0),
      inks: this.inks,
      codes: this.codes,
      codeEvery: W < 600 ? 2 : 1,
      top: box.top,
      bottom: box.bottom,
    };
    this.points(false);
    this.markers = createMarkers(W);
    this.pointers.clear();
    this.ripples = [];
    if (grain) paintGrain(grain, W, H, mulberry32(this.seed));
    return true;
  }

  /** Lays the points along the lines at the current quality; `keep`: carry the elastic state over (resampled). */
  private points(keep: boolean): void {
    const s = this.sheet;
    if (!s) return;
    const step = pointStep(this.quality.scale);
    const m = Math.ceil(s.W / step) + 3; // from one step left of the sheet to at least one step right of it
    const size = this.n * m;
    if (keep && s.m > 1) {
      this.u = resampleRows(this.u, this.n, s.m, m);
      this.v = resampleRows(this.v, this.n, s.m, m);
    } else {
      this.u = new Float32Array(size);
      this.v = new Float32Array(size);
    }
    s.u = new Float32Array(size);
    this.swell = new Float32Array(size);
    this.step = step;
    s.m = m;
    s.xs = Float32Array.from({ length: m }, (_, k) => (k - 1) * step);
    this.goal = new Float32Array(size);
    // The relief: the mask sampled under every point, then smoothed along each line.
    const raw = new Float32Array(size);
    s.hot = new Uint8Array(size);
    const mask = this.mask;
    if (mask) {
      for (let i = 0; i < this.n; i++) {
        const my = Math.floor((s.base[i]! - mask.top) * MASK_SCALE);
        if (my < 0 || my >= mask.h) continue;
        for (let k = 0; k < m; k++) {
          const mx = Math.floor(s.xs[k]! * MASK_SCALE);
          if (mx < 0 || mx >= mask.w) continue;
          const a = mask.alpha[my * mask.w + mx]! / 255;
          raw[i * m + k] = a;
          if (a > 0.5) s.hot[i * m + k] = 1;
        }
      }
    }
    this.relief = smoothRows(raw, this.n, m, Math.max(1, Math.round(RELIEF_BLUR_PX / step)));
  }

  /** "IA" in the heaviest sans, its capitals 58% of the plot high and at most 70% of the width wide, centred 6% left
   * of the middle; kept as an alpha mask at MASK_SCALE (CSS pixels, never device pixels). */
  private buildMask(W: number, top: number, bottom: number): void {
    this.mask = null;
    if (!RELIEF) return;
    const height = bottom - top;
    const w = Math.max(2, Math.ceil(W * MASK_SCALE));
    const h = Math.max(2, Math.ceil(height * MASK_SCALE));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return;
    g.font = `900 100px ${RELIEF_FONT}`;
    const probe = g.measureText('A');
    const cap = probe.actualBoundingBoxAscent > 10 ? probe.actualBoundingBoxAscent : 72;
    const widths = [g.measureText('I').width, probe.width];
    const total = widths[0]! + widths[1]! + 100 * RELIEF_GAP_EM;
    const k = Math.min((0.58 * height) / cap, (0.7 * W) / Math.max(1, total)); // scale from the 100 px probe
    g.setTransform(MASK_SCALE, 0, 0, MASK_SCALE, 0, 0);
    g.font = `900 ${100 * k}px ${RELIEF_FONT}`;
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    const left = 0.44 * W - (total * k) / 2;
    const baseline = height / 2 + (cap * k) / 2;
    g.fillText('I', left, baseline);
    g.fillText('A', left + (widths[0]! + 100 * RELIEF_GAP_EM) * k, baseline);
    const data = g.getImageData(0, 0, w, h).data;
    const alpha = new Uint8Array(w * h);
    for (let j = 0; j < alpha.length; j++) alpha[j] = data[4 * j + 3]!;
    this.mask = { alpha, w, h, top };
  }

  /** Where every point wants to be now — the breathing (calmer inside the letters), the relief, the lens of each
   * pointer and part of the ripples, which the springs answer late — and the ripples themselves under the soft
   * limit, which are shown as they are: a spring of 9 rad/s would swallow a wave that passes in a tenth of a second.
   * `quiet`: the still frame. */
  private compute(quiet: boolean): void {
    const s = this.sheet;
    if (!s) return;
    const { n, m, xs, base, W } = s;
    const { S, t, goal, swell, relief, noise } = this;
    const lift = RELIEF ? reliefLift(S, 1, t) : 0;
    const rings = quiet ? [] : this.ripples.filter((r) => t - r.t0 <= RIPPLE_LIFE);
    const length = rippleWave(S);
    const sigma = lensSigma(W);
    const lenses = quiet
      ? []
      : this.pointers.list.map((p) => ({ x: p.x, y: p.y, B: lensStrength(S, p.speed, sigma) * p.weight }));
    for (let i = 0; i < n; i++) {
      const y = base[i]!;
      const row = i * m;
      for (let k = 0; k < m; k++) {
        const x = xs[k]!;
        const inside = relief[row + k]!;
        let target = S * breathing(noise, x, i, t, W) * (1 - RELIEF_CALM * inside) + lift * inside;
        let ring = 0;
        for (const r of rings) ring += rippleAt(r.C, r.speed, t - r.t0, Math.sqrt((x - r.x) ** 2 + (y - r.y) ** 2), length);
        if (ring !== 0) {
          ring = softLimit(ring, S);
          target += RIPPLE_WAKE * ring;
        }
        for (const p of lenses) target += lens(p.B, sigma, x - p.x, y - p.y);
        goal[row + k] = target;
        swell[row + k] = ring;
      }
    }
  }

  /** What is shown: the elastic state plus the ripples. */
  private show(): void {
    const s = this.sheet;
    if (!s) return;
    const { u, swell } = this;
    for (let j = 0; j < u.length; j++) s.u[j] = u[j]! + swell[j]!;
  }

  /** The sheet at rest at time `t`: every point on its goal, nothing moving. */
  private settle(t: number): void {
    const s = this.sheet;
    if (!s) return;
    this.t = t;
    this.compute(true);
    this.u.set(this.goal);
    this.v.fill(0);
    this.show();
  }

  /** The still frame: the relief at its highest, drawn once. */
  private drawStill(): void {
    this.pause();
    this.pen = Infinity;
    this.settle(STILL_T);
    this.draw();
    this.rest(true);
  }

  /** One simulated and drawn frame. */
  private frame(dt: number): void {
    const s = this.sheet;
    if (!s) return;
    this.compute(false);
    stepSprings(this.u, this.v, this.goal, s.n, s.m, dt);
    this.show();
    this.draw();
  }

  private draw(): void {
    const s = this.sheet;
    if (!s || !this.ctx) return;
    const x = this.exitAt;
    const erase = x ? { x: x.x, y: x.y, r: exitRadius(performance.now() - x.t, x.reach) } : null;
    drawSheet(this.ctx, s, { pen: this.pen, markers: this.markers, erase });
  }

  /** The first frame left ink on the canvas (read back down the middle column, which every line crosses). */
  private inked(): boolean {
    const { canvas } = this.el;
    if (!this.ctx || canvas.height < 1) return false;
    const data = this.ctx.getImageData(Math.floor(canvas.width / 2), 0, 1, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) return true;
    return false;
  }

  private tick(now: number): void {
    this.raf = 0;
    try {
      const interval = now - this.last;
      this.last = now;
      const before = this.quality;
      this.quality = observeFrame(this.quality, interval, now);
      if (this.quality.still && !this.exitAt) return this.drawStill(); // stalling or too slow: a still sheet
      if (this.quality.scale !== before.scale && pointStep(this.quality.scale) !== this.step) this.points(true);
      const idle = now - this.lastInput;
      if (!this.exitAt && idle > FREEZE_AFTER_MS) {
        this.frozen = true;
        this.rest(true);
        return;
      }
      this.frames += 1;
      const halfRate = !this.exitAt && idle > HALF_RATE_AFTER_MS;
      if (!(halfRate && this.frames % 2 === 1)) {
        this.advance(now, Math.min(now - this.lastAdvance, 100) / 1000);
        this.lastAdvance = now;
      }
      if (this.exitAt && now - this.exitAt.t >= EXIT_MS) {
        this.onExitDone();
        return;
      }
      this.raf = requestAnimationFrame((t) => this.tick(t));
    } catch {
      this.fail();
    }
  }

  /** One displayed frame: the clock, the pointers, the markers, the springs, the drawing, the grain. */
  private advance(now: number, dt: number): void {
    const s = this.sheet;
    if (!s) return;
    this.t += dt;
    if (this.pen < penDone(s.n)) this.pen += dt;
    else this.pen = Infinity;
    this.pointers.step(dt);
    this.ripples = this.ripples.filter((r) => this.t - r.t0 <= RIPPLE_LIFE);
    const x = this.exitAt;
    if (x) {
      // The markers slide off the sheet, A to the left and B to the right.
      const e = Math.min(1, (now - x.t) / EXIT_MS);
      const ease = e * e * (3 - 2 * e);
      this.markers.forEach((m, j) => {
        const from = x.from[j] ?? m.rest;
        m.x = from + ((j === 0 ? -40 : s.W + 40) - from) * ease;
      });
    } else {
      const pushes = this.pointers.list.map((p) => [p.x, p.weight] as const);
      for (const m of this.markers) {
        let kick = 0;
        for (const r of this.ripples) kick += rippleAt(r.C, r.speed, this.t - r.t0, Math.abs(m.x - r.x), rippleWave(this.S));
        stepMarker(m, pushes, kick, dt);
      }
    }
    this.frame(dt);
    if (this.el.grain && now - this.lastGrain > GRAIN_STEP_MS) {
      this.lastGrain = now;
      const [dx, dy] = grainShift(++this.grainStep);
      this.el.grain.style.transform = `translate(${dx}px,${dy}px)`; // CSSOM: allowed by the CSP
    }
  }
}

function focusOf(active: Element | null, link: HTMLAnchorElement): 'page' | 'cover-link' | 'control' {
  if (active === link) return 'cover-link';
  if (!active || active === document.body || active === document.documentElement) return 'page';
  return active.closest('a[href], button, input, select, textarea, summary, [tabindex], [contenteditable]') ? 'control' : 'page';
}

export function boot(): void {
  const root = document.documentElement;
  const cover = document.querySelector<HTMLElement>('[data-sg]');
  const chart = document.querySelector<HTMLElement>('[data-chart]');
  const canvas = document.querySelector<HTMLCanvasElement>('[data-canvas]');
  const grain = document.querySelector<HTMLCanvasElement>('[data-grain]');
  const link = document.querySelector<HTMLAnchorElement>('[data-enter]');
  const hint = document.querySelector<HTMLElement>('[data-hint]');
  if (!cover || !chart || !canvas || !link) return;
  const el: Elements = { root, cover, chart, canvas, grain, link };
  const setHint = (text: string): void => {
    if (hint && hint.textContent !== text) hint.textContent = text;
  };

  const controller = new EntryController();
  let art: Art | null = null;
  let deadline = 0;
  let gone = false;
  let fromStill = false; // the gesture began on a still frame: it enters at once
  let held = false; // the gesture fired a long-press wave: its click stays on the cover
  let press: { id: number; x: number; y: number; timer: number } | null = null;
  const endPress = (): void => {
    if (press) clearTimeout(press.timer);
    press = null;
  };
  const go = (): void => {
    if (gone) return;
    gone = true;
    clearTimeout(deadline);
    location.assign(link.href);
  };
  const fallback = (): void => {
    controller.reset('html');
    endPress();
    setHint(HINT_HTML);
  };
  const act = (decision: Decision, event: Event): void => {
    if (decision.kind === 'native') return;
    event.preventDefault();
    if (decision.kind === 'navigate') return go();
    if (decision.kind === 'exit') {
      if (fromStill || !art?.exit(decision.at)) return go();
      controller.phase = 'leaving';
      deadline = window.setTimeout(go, EXIT_MS + 250); // even if no frame ever comes again
    }
  };

  link.addEventListener('click', (e) => {
    const decision = controller.click(e);
    const stay = held && e.detail > 0 && decision.kind === 'exit'; // the wave of a long press was the whole gesture
    held = false;
    if (stay) e.preventDefault();
    else act(decision, e);
  });
  link.addEventListener('dragstart', (e) => e.preventDefault());
  // A long touch on the sheet is a wave, not the link's menu; a right click keeps the browser's.
  link.addEventListener('contextmenu', (e) => {
    if (art?.live && (e as PointerEvent).pointerType === 'touch') e.preventDefault();
  });
  addEventListener('keydown', (e) => {
    fromStill = art?.isStill() ?? true;
    art?.wake();
    const focus = focusOf(document.activeElement, link);
    act(controller.key({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, repeat: e.repeat, isComposing: e.isComposing, focus }), e);
  });
  addEventListener('pointerdown', (e) => {
    fromStill = art?.isStill() ?? true;
    held = false;
    controller.pointerDown(e);
    art?.pointer(e.pointerId, e.clientX, e.clientY, e.timeStamp, true);
    const again = press !== null; // a second finger: no long press
    endPress();
    if (again || !art?.live || fromStill || e.button !== 0) return;
    const { pointerId: id, clientX: x, clientY: y } = e;
    press = {
      id,
      x,
      y,
      timer: window.setTimeout(() => {
        press = null;
        if (art?.wave(x, y)) held = true;
      }, LONG_PRESS_MS),
    };
  });
  addEventListener('pointermove', (e) => {
    controller.pointerMove(e);
    if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP_SLOP_PX) endPress();
    if (e.pointerType !== 'touch' || e.buttons !== 0) art?.pointer(e.pointerId, e.clientX, e.clientY, e.timeStamp, e.buttons !== 0);
  });
  addEventListener('pointerup', (e) => {
    controller.pointerUp(e);
    if (press?.id === e.pointerId) endPress();
    if (e.pointerType === 'touch') art?.release(e.pointerId);
    else art?.pointer(e.pointerId, e.clientX, e.clientY, e.timeStamp, false); // the mouse stays over the sheet
  });
  addEventListener('pointercancel', (e) => {
    controller.pointerCancel(e);
    if (press?.id === e.pointerId) endPress();
    art?.release(e.pointerId);
  });
  root.addEventListener('pointerleave', (e) => art?.release(e.pointerId)); // the mouse left the window
  addEventListener('blur', () => {
    endPress();
    art?.releaseAll();
  });
  addEventListener('pagehide', (e) => {
    clearTimeout(deadline);
    endPress();
    art?.leave(e.persisted);
  });
  addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    gone = false;
    held = false;
    controller.reset(art?.live ? 'live' : 'html');
    art?.reborn();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) art?.pause();
    else if (controller.phase !== 'leaving') art?.resume();
  });

  if (!canShowArt(canvas)) return;

  art = new Art(el, fallback, go);
  const started = art;
  let starting = false;
  const begin = async (): Promise<void> => {
    if (starting || started.live) return;
    starting = true;
    try {
      // The live hint is longer than the HTML one, so it is set before the cover is measured.
      if (await started.start((still) => setHint(still ? HINT_HTML : hintLive()))) controller.reset('live');
      else fallback();
    } catch {
      started.fail();
    } finally {
      starting = false;
    }
  };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  reduced.addEventListener('change', () => {
    started.setStill(reduced.matches);
    if (!started.live) return;
    setHint(reduced.matches ? HINT_HTML : hintLive());
    started.scheduleRebuild(); // the hint changed the layout
  });
  const forced = matchMedia('(forced-colors: active)');
  forced.addEventListener('change', () => {
    if (forced.matches) started.fail(); // system colours: the HTML cover
    else void begin();
  });
  let retry = 0;
  addEventListener('resize', () => {
    if (started.live) return started.scheduleRebuild();
    // The cover did not fit (or stopped fitting): try again once the window settles.
    clearTimeout(retry);
    retry = window.setTimeout(() => {
      if (!forced.matches && !gone) void begin();
    }, 300);
  });
  void begin();
}
