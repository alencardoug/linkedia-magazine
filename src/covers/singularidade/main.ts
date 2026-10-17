// Boot of the "Singularidade" cover (docs/COVERS.md, ./README.md). The HTML cover and its link work before, without
// and after the art. The art starts only when the device can show it — WebGL2, a cover that fits the viewport, no
// forced colours — and only goes live after a verified first frame; any later failure puts the HTML cover back with
// native entry. Reduced motion gets one still frame. `#pintura` shows the painted bitmap instead of the WebGL art
// (the fidelity check in e2e/cover.spec.mjs). Navigation is owned by EntryController and an independent deadline.
import { EntryController, type Decision } from './controller';
import {
  BIRTH_DELAY_MS,
  birthScale,
  diskLevel,
  EXIT_MS,
  exitState,
  FOLLOW,
  IDLE_AFTER_MS,
  ripple,
  RUSH,
  springStep,
  vividness,
  wander,
  type Vec,
} from './motion';
import { createQuality, initialScale, observeFrame, type Quality } from './quality';
import { Singularity } from './renderer';
import { bitmapScale, paintCover } from './snapshot';

const HINT_HTML = 'Clique ou toque em qualquer lugar para entrar.';
const HINT_LOADING = 'Preparando a capa… clique em qualquer lugar para ir às notícias.';
const hintLive = (): string =>
  `${matchMedia('(hover: none)').matches ? 'Toque' : 'Clique'} em qualquer lugar para atravessar o horizonte de eventos.`;

const CANVAS_PIXELS = 2_500_000; // drawing-buffer budget of the canvas itself
const HALF_RATE_AFTER_MS = 20_000; // without input: 30 fps…
const FREEZE_AFTER_MS = 120_000; // …then a still frame until the next input
const FONT_WAIT_MS = 1500;

interface Elements {
  root: HTMLElement;
  cover: HTMLElement;
  canvas: HTMLCanvasElement;
  link: HTMLAnchorElement;
  hint: HTMLElement | null;
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

function canShowArt(): boolean {
  if (matchMedia('(forced-colors: active)').matches) return false;
  if (typeof TextMetrics === 'undefined' || !('fontBoundingBoxAscent' in TextMetrics.prototype)) return false;
  return typeof WebGL2RenderingContext !== 'undefined';
}

/** The black hole: renderer, motion, adaptive quality and its frame loop. */
class Art {
  live = false;
  private renderer: Singularity | null = null;
  private quality: Quality;
  private home: Vec = [0, 0];
  private hole: Vec = [0, 0];
  private vel: Vec = [0, 0];
  private pointer: Vec | null = null;
  private lastInput = -Infinity;
  private born = 0;
  private exitAt: { t: number; at: Vec; rs0: number; disk0: number; vivid0: number } | null = null;
  private wave: { t: number; at: Vec; amplitude: number } | null = null;
  private raf = 0;
  private last = 0;
  private frames = 0;
  private frozen = false;
  private readonly still: boolean;
  private resizeTimer = 0;

  constructor(
    private readonly el: Elements,
    private readonly onFail: () => void,
    private readonly onExitDone: () => void,
  ) {
    this.still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const [w, h] = viewport();
    this.quality = createQuality(initialScale(w, h, this.canvasRatio()), performance.now());
  }

  /** Builds the renderer and draws a first frame; true once that frame is verified and the art is live. */
  async start(): Promise<boolean> {
    this.renderer = Singularity.create(this.el.canvas);
    if (!this.renderer) return false;
    await fontsReady();
    if (!fits()) return this.abort();
    this.rebuild();
    this.born = performance.now();
    this.lastInput = this.born;
    this.hole = this.home;
    this.draw(this.born);
    if (!this.renderer.healthy()) return this.abort();
    this.live = true;
    this.el.root.dataset.art = 'live';
    if (this.still) this.drawStill();
    else this.resume();
    return true;
  }

  /** The pointer or finger steers the hole; any input also wakes a frozen frame. */
  steer(x: number, y: number): void {
    this.pointer = [x, y];
    this.wake();
  }

  wake(): void {
    this.lastInput = performance.now();
    if (this.frozen && this.live && !this.still) {
      this.frozen = false;
      this.resume();
    }
  }

  /** Starts the exit toward `at` (CSS px; null = where the hole is). False when there is nothing to play. */
  exit(at: Vec | null): boolean {
    if (!this.live || this.still || this.quality.still) return false;
    const now = performance.now();
    const target = at ?? this.hole;
    const age = now - this.born;
    this.exitAt = { t: now, at: target, rs0: birthScale(age), disk0: diskLevel(age), vivid0: vividness(age) };
    this.wave = { t: now, at: target, amplitude: 22 };
    this.frozen = false;
    this.resume();
    return true;
  }

  /** Back from the magazine (bfcache): a fresh birth, never the faded exit frame. */
  reborn(): void {
    if (!this.live || !this.renderer) return;
    if (!this.renderer.healthy()) return this.fail();
    this.exitAt = null;
    this.wave = null;
    this.pointer = null;
    this.born = performance.now();
    this.lastInput = this.born;
    this.hole = this.home;
    this.vel = [0, 0];
    this.frozen = false;
    if (this.still) return this.drawStill();
    this.draw(this.born); // replace the faded exit frame before the browser shows it
    this.resume();
  }

  pause(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  resume(): void {
    if (this.raf || !this.live || this.still) return; // reduced motion: the still frame never animates
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  /** Resizes, rotations and zoom: one rebuild after the burst. */
  scheduleRebuild(): void {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      if (!this.live) return;
      try {
        if (!fits()) return this.fail();
        this.rebuild();
        if (this.still) this.drawStill();
        else if (this.frozen) this.draw(performance.now());
      } catch {
        this.fail();
      }
    }, 150);
  }

  fail(): void {
    this.pause();
    clearTimeout(this.resizeTimer);
    this.renderer?.dispose();
    this.renderer = null;
    if (this.live) delete this.el.root.dataset.art;
    this.live = false;
    this.onFail();
  }

  private abort(): false {
    this.renderer?.dispose();
    this.renderer = null;
    return false;
  }

  private canvasRatio(): number {
    const [w, h] = viewport();
    return Math.min(devicePixelRatio || 1, 2, Math.sqrt(CANVAS_PIXELS / Math.max(w * h, 1)));
  }

  /** Paints the HTML cover into the texture and sizes the canvas and targets for the current viewport. */
  private rebuild(): void {
    const renderer = this.renderer;
    if (!renderer) return;
    const [w, h] = viewport();
    const side = renderer.maxTexture / Math.max(w, h);
    const bitmap = paintCover(this.el.cover, Math.min(bitmapScale(w, h, devicePixelRatio || 1), side));
    renderer.setCover(bitmap.canvas);
    bitmap.canvas.width = 0; // release the CPU copy
    this.home = bitmap.anchor;
    renderer.setSize(w, h, this.canvasRatio(), this.quality.scale);
  }

  private tick(now: number): void {
    this.raf = 0;
    try {
      const interval = now - this.last;
      this.last = now;
      const before = this.quality.scale;
      this.quality = observeFrame(this.quality, interval, now);
      if (this.quality.still && !this.exitAt) {
        this.draw(now);
        return; // too slow even at the lowest scale: keep this frame, stop animating
      }
      if (this.quality.scale !== before) {
        const [w, h] = viewport();
        this.renderer?.setSize(w, h, this.canvasRatio(), this.quality.scale);
      }
      const idle = now - this.lastInput;
      if (!this.exitAt && idle > FREEZE_AFTER_MS) {
        this.frozen = true;
        return;
      }
      this.frames += 1;
      const skip = !this.exitAt && idle > HALF_RATE_AFTER_MS && this.frames % 2 === 1;
      if (!skip) this.draw(now, Math.min(interval, 50) / 1000);
      if (this.frames % 120 === 0 && !this.renderer?.healthy()) return this.fail();
      if (this.exitAt && exitState(now - this.exitAt.t).done) {
        this.onExitDone();
        return;
      }
      this.raf = requestAnimationFrame((t) => this.tick(t));
    } catch {
      this.fail();
    }
  }

  private draw(now: number, dt = 0): void {
    const renderer = this.renderer;
    if (!renderer) return;
    const [, h] = viewport();
    let rs: number, fade = 1, disk: number, vivid: number, target: Vec;
    if (this.exitAt) {
      // An exit can start mid-birth: blend from where the birth was instead of popping to full size.
      const { t, at, rs0, disk0, vivid0 } = this.exitAt;
      const state = exitState(now - t);
      const blend = Math.min(1, (now - t) / 150);
      rs = state.rs - 1 + rs0 + (1 - rs0) * blend;
      fade = state.fade;
      disk = disk0 + (1 - disk0) * blend;
      vivid = vivid0 + (1 - vivid0) * blend;
      target = at;
    } else {
      const age = now - this.born;
      rs = birthScale(age);
      disk = diskLevel(age);
      vivid = vividness(age);
      if (!this.wave && age > BIRTH_DELAY_MS) this.wave = { t: this.born + BIRTH_DELAY_MS, at: this.home, amplitude: 10 };
      const steering = this.pointer && now - this.lastInput < IDLE_AFTER_MS;
      target = steering && this.pointer ? this.pointer : wander(this.home, Math.max(0, (now - this.lastInput - IDLE_AFTER_MS) / 1000), h);
    }
    [this.hole, this.vel] = springStep(this.hole, this.vel, target, this.exitAt ? RUSH : FOLLOW, dt);
    const wave = this.wave ? ripple(now - this.wave.t, this.wave.amplitude) : { radius: 0, amplitude: 0 };
    const at = this.wave?.at ?? [0, 0];
    renderer.render({
      hole: this.hole,
      rs,
      time: (now - this.born) / 1000,
      vivid,
      disk,
      fade,
      ripple: [at[0], at[1], wave.radius, wave.amplitude],
    });
  }

  /** Reduced motion: the composed final state, once (again after a resize). */
  private drawStill(): void {
    const [, h] = viewport();
    this.hole = [this.home[0], this.home[1] + 0.2 * h];
    this.born = performance.now() - 10_000;
    this.renderer?.render({ hole: this.hole, rs: 1, time: 4, vivid: 1, disk: 1, fade: 1, ripple: [0, 0, 0, 0] });
  }
}

/** `#pintura`: the bitmap the renderer would bend, shown flat over the HTML (fidelity check). */
function showPainting(el: Elements): void {
  const [w, h] = viewport();
  const ratio = devicePixelRatio || 1;
  const bitmap = paintCover(el.cover, bitmapScale(w, h, ratio));
  el.canvas.width = Math.round(w * ratio);
  el.canvas.height = Math.round(h * ratio);
  el.canvas.getContext('2d')?.drawImage(bitmap.canvas, 0, 0, el.canvas.width, el.canvas.height);
  el.root.dataset.art = 'pintura';
}

function focusOf(active: Element | null, link: HTMLAnchorElement): 'page' | 'cover-link' | 'control' {
  if (active === link) return 'cover-link';
  if (!active || active === document.body || active === document.documentElement) return 'page';
  return active.closest('a[href], button, input, select, textarea, summary, [tabindex], [contenteditable]') ? 'control' : 'page';
}

export function boot(): void {
  const root = document.documentElement;
  const cover = document.querySelector<HTMLElement>('[data-sg]');
  const canvas = document.querySelector<HTMLCanvasElement>('[data-canvas]');
  const link = document.querySelector<HTMLAnchorElement>('[data-enter]');
  const hint = document.querySelector<HTMLElement>('[data-hint]');
  if (!cover || !canvas || !link) return;
  const el: Elements = { root, cover, canvas, link, hint };
  const setHint = (text: string): void => {
    if (hint) hint.textContent = text;
  };

  const controller = new EntryController();
  let art: Art | null = null;
  let deadline = 0;
  let gone = false;
  const go = (): void => {
    if (gone) return;
    gone = true;
    clearTimeout(deadline);
    location.assign(link.href);
  };
  const fallback = (): void => {
    controller.reset('html');
    setHint(HINT_HTML);
  };
  const act = (decision: Decision, event: Event): void => {
    if (decision.kind === 'native') return;
    event.preventDefault();
    if (decision.kind === 'navigate') return go();
    if (decision.kind === 'exit') {
      if (!art?.exit(decision.at)) return go();
      controller.phase = 'leaving';
      deadline = window.setTimeout(go, EXIT_MS + 250); // even if no frame ever comes again
    }
  };

  link.addEventListener('click', (e) => act(controller.click(e), e));
  link.addEventListener('dragstart', (e) => e.preventDefault());
  addEventListener('keydown', (e) => {
    art?.wake();
    const focus = focusOf(document.activeElement, link);
    act(controller.key({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, repeat: e.repeat, isComposing: e.isComposing, focus }), e);
  });
  addEventListener('pointerdown', (e) => {
    controller.pointerDown(e);
    art?.steer(e.clientX, e.clientY);
  });
  addEventListener('pointermove', (e) => {
    controller.pointerMove(e);
    if (e.pointerType === 'mouse' || e.buttons !== 0) art?.steer(e.clientX, e.clientY);
  });
  addEventListener('pointerup', (e) => controller.pointerUp(e));
  addEventListener('pointercancel', (e) => controller.pointerCancel(e));
  addEventListener('pagehide', () => {
    clearTimeout(deadline);
    art?.pause();
  });
  addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    gone = false;
    controller.reset(art?.live ? 'live' : 'html');
    art?.reborn();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) art?.pause();
    else if (controller.phase !== 'leaving') art?.resume();
  });

  if (location.hash === '#pintura') return showPainting(el);
  if (!canShowArt()) return;

  art = new Art(el, fallback, go);
  const started = art;
  const slow = window.setTimeout(() => {
    if (!started.live) setHint(HINT_LOADING);
  }, 400);
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); // allow a restore
    started.fail();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    void restart();
  });
  addEventListener('resize', () => started.scheduleRebuild());
  const restart = async (): Promise<void> => {
    try {
      if (await started.start()) {
        controller.reset('live');
        setHint(hintLive());
      } else {
        fallback();
      }
    } catch {
      started.fail();
    } finally {
      clearTimeout(slow);
    }
  };
  void restart();
}
