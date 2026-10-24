// Boot of the "Duas sombras" cover (docs/COVERS.md, ./README.md). The HTML cover — the museum label and a flat poster
// of the gallery — and its link work before, without and after the art. The art starts only when the device can show
// it (hardware WebGL2, a cover that fits the viewport, no forced colours) and goes live only after a verified first
// frame; any later failure puts the HTML cover back with native entry. Reduced motion gets one still frame.
// Navigation is owned by EntryController and an independent deadline.
import { EntryController, type Decision } from './controller';
import {
  EXIT_MS,
  exitState,
  followStep,
  IDLE_AFTER_MS,
  lamps,
  leanOf,
  pointerTarget,
  restBody,
  sweep,
  wander,
  type Body,
  type Vec,
} from './motion';
import { calibratedScale, createQuality, initialScale, MIN_SCALE, observeFrame, type Quality } from './quality';
import { Gallery, PIVOT, type V4 } from './renderer';
import { bandsFor, paramsFor, validParams, type SculptureParams } from './sculpture';
import { fitCamera, type Camera } from './stage';

const HINT_HTML = 'Clique ou toque em qualquer lugar para entrar.';
const HINT_LOADING = 'Acendendo as luzes… clique em qualquer lugar para ir às notícias.';
const hintLive = (): string =>
  matchMedia('(hover: none)').matches
    ? 'Arraste o dedo e a escultura vai junto. Toque em qualquer lugar para entrar.'
    : 'Mova o cursor e a escultura vai junto. Clique em qualquer lugar para entrar.';

const CANVAS_PIXELS = 2_500_000; // drawing-buffer budget at full scale
const HALF_RATE_AFTER_MS = 20_000; // without input: 30 fps…
const FREEZE_AFTER_MS = 120_000; // …then a still frame until the next input
const FONT_WAIT_MS = 1500;
const LAMP_FAR = 26;
const LAMP_NEAR = 1.4;

interface Elements {
  root: HTMLElement;
  cover: HTMLElement;
  room: HTMLElement;
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
  return typeof WebGL2RenderingContext !== 'undefined';
}

/** The sculpture carved at build time for this edition (data attributes), re-checked; the default otherwise. */
function sculptureOf(cover: HTMLElement): SculptureParams {
  const d = cover.dataset;
  const p = { theta: Number(d.theta), spacing: Number(d.spacing), thickness: Number(d.thickness), phase: Number(d.phase) };
  return validParams(p) ? p : paramsFor('');
}

/** The gallery: renderer, motion, adaptive quality and its frame loop. */
class Art {
  live = false;
  private gallery: Gallery | null = null;
  private quality: Quality;
  private camera: Camera = fitCamera(1);
  private body: Body = restBody();
  private pointer: Vec | null = null;
  private lastInput = -Infinity;
  private born = 0;
  private exitAt: { t: number; side: 'left' | 'right' | 'both' } | null = null;
  private raf = 0;
  private last = 0;
  private frames = 0;
  private frozen = false;
  /** Reduced motion: one finished frame, redrawn only after a resize (it may change while the page is open). */
  private still: boolean;
  private resizeTimer = 0;
  private readonly params: SculptureParams;

  constructor(
    private readonly el: Elements,
    private readonly onFail: () => void,
    private readonly onExitDone: () => void,
  ) {
    this.still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.params = sculptureOf(el.cover);
    const [w, h] = this.size();
    this.quality = createQuality(initialScale(w, h, this.ratio()), performance.now());
  }

  /** Builds the renderer and draws a first frame; true once that frame is verified and the art is live. */
  async start(): Promise<boolean> {
    this.gallery = Gallery.create(this.el.canvas, bandsFor(this.params), this.params.spacing, this.params.thickness);
    if (!this.gallery) return false;
    await fontsReady();
    if (!this.gallery) return false; // failed or left while the fonts loaded
    if (!fits()) return this.abort();
    this.rebuild();
    this.born = performance.now();
    this.lastInput = this.born;
    if (!this.calibrate()) return this.abort();
    if (this.still) this.drawFinished();
    else this.draw(this.born);
    if (!this.gallery.healthy()) return this.abort();
    this.live = true;
    this.el.root.dataset.art = 'live';
    if (!this.still) this.resume();
    return true;
  }

  /** The pointer or finger steers the sculpture (client px); any input also wakes a frozen frame. */
  steer(x: number, y: number): void {
    const r = this.el.room.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    this.pointer = [((x - r.left) / r.width) * 2 - 1, ((y - r.top) / r.height) * 2 - 1];
    this.wake();
  }

  wake(): void {
    this.lastInput = performance.now();
    if (this.frozen && this.live && !this.still) {
      this.frozen = false;
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
      this.drawFinished();
    } else {
      this.frozen = false;
      this.resume();
    }
  }

  /** Starts the exit; `at` (client px) picks the lamp that rushes in, null = both. False when nothing plays. */
  exit(at: Vec | null): boolean {
    if (!this.live || this.still || this.quality.still) return false;
    const r = this.el.room.getBoundingClientRect();
    const side = at === null ? 'both' : at[0] < r.left + r.width / 2 ? 'left' : 'right';
    this.exitAt = { t: performance.now(), side };
    this.el.root.dataset.leaving = '';
    this.frozen = false;
    this.resume();
    return true;
  }

  /** Back from the magazine (bfcache): a fresh birth, never the dark exit frame. */
  reborn(): void {
    delete this.el.root.dataset.leaving;
    if (!this.live || !this.gallery) return;
    if (!this.gallery.healthy() || !fits()) return this.fail();
    this.exitAt = null;
    this.pointer = null;
    this.body = restBody();
    this.born = performance.now();
    this.lastInput = this.born;
    this.frozen = false;
    this.rebuild(); // the viewport may have changed while the magazine was open
    if (this.still || this.quality.still) return this.drawFinished();
    this.draw(this.born); // replace the dark exit frame before the browser shows it
    this.resume();
  }

  pause(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Leaving the page: stop drawing and pending work; on a permanent departure also free the GPU resources. */
  leave(persisted: boolean): void {
    this.pause();
    clearTimeout(this.resizeTimer);
    if (!persisted) {
      this.gallery?.dispose();
      this.gallery = null;
      this.live = false;
    }
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
        this.rebuild(); // resizing the canvas clears it: a still or frozen frame must be drawn again
        if (this.still || this.quality.still) this.drawFinished();
        else if (this.frozen) this.draw(performance.now());
      } catch {
        this.fail();
      }
    }, 150);
  }

  fail(): void {
    this.pause();
    clearTimeout(this.resizeTimer);
    this.gallery?.dispose();
    this.gallery = null;
    if (this.live) delete this.el.root.dataset.art;
    delete this.el.root.dataset.leaving;
    this.live = false;
    this.onFail();
  }

  private abort(): false {
    this.gallery?.dispose();
    this.gallery = null;
    return false;
  }

  /** The art's CSS size: the room, where the canvas lives. */
  private size(): [number, number] {
    const r = this.el.room.getBoundingClientRect();
    return [Math.max(1, r.width), Math.max(1, r.height)];
  }

  private ratio(): number {
    const [w, h] = this.size();
    return Math.min(devicePixelRatio || 1, 2, Math.sqrt(CANVAS_PIXELS / (w * h)));
  }

  /** Times one finished, fully lit frame at the minimum scale (after an untimed warm-up) and picks the starting scale
   * from it; false when even that frame is too slow to animate. */
  private calibrate(): boolean {
    const gallery = this.gallery;
    if (!gallery) return false;
    const [w, h] = this.size();
    gallery.setSize(w, h, this.ratio(), MIN_SCALE);
    this.drawFinished();
    gallery.finish();
    const t0 = performance.now();
    this.drawFinished();
    gallery.finish();
    const scale = calibratedScale(performance.now() - t0, this.quality.scale);
    if (scale === null || !gallery.healthy()) return false;
    this.quality = createQuality(scale, performance.now());
    gallery.setSize(w, h, this.ratio(), scale);
    return true;
  }

  /** Sizes the canvas and fits the camera to the room's current shape. */
  private rebuild(): void {
    const [w, h] = this.size();
    this.camera = fitCamera(w / h);
    this.gallery?.setSize(w, h, this.ratio(), this.quality.scale);
  }

  private tick(now: number): void {
    this.raf = 0;
    try {
      const interval = now - this.last;
      this.last = now;
      const before = this.quality;
      this.quality = observeFrame(this.quality, interval, now);
      if (this.quality.still && !this.exitAt) {
        if (!before.still) this.drawFinished(); // stalling or too slow at the lowest scale: a finished, readable frame
        return;
      }
      if (this.quality.scale !== before.scale) {
        const [w, h] = this.size();
        this.gallery?.setSize(w, h, this.ratio(), this.quality.scale);
      }
      const idle = now - this.lastInput;
      if (!this.exitAt && idle > FREEZE_AFTER_MS) {
        this.frozen = true;
        return;
      }
      this.frames += 1;
      const skip = !this.exitAt && idle > HALF_RATE_AFTER_MS && this.frames % 2 === 1;
      if (!skip) this.draw(now, Math.min(interval, 50) / 1000);
      if (this.frames % 120 === 0 && !this.gallery?.healthy()) return this.fail();
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
    const gallery = this.gallery;
    if (!gallery) return;
    const age = now - this.born;
    const steering = this.pointer && now - this.lastInput < IDLE_AFTER_MS;
    const target =
      steering && this.pointer
        ? pointerTarget(this.pointer[0], this.pointer[1])
        : wander(Math.max(0, (now - this.lastInput - IDLE_AFTER_MS) / 1000), age / 1000);
    this.body = followStep(this.body, target, dt);
    const { yaw, pitch } = leanOf(this.body);
    const [u, v] = this.body.pos;
    const shift = [u * Math.SQRT1_2, v, -u * Math.SQRT1_2] as const;
    let lampRight: V4 = [0, 0, 1, 0];
    let lampLeft: V4 = [1, 0, 0, 0];
    let on = lamps(age);
    let swell = 0;
    let fade = 1;
    if (this.exitAt) {
      const s = exitState(now - this.exitAt.t);
      const d = LAMP_FAR + (LAMP_NEAR - LAMP_FAR) * s.approach;
      const [px, py, pz] = [PIVOT[0] + shift[0], PIVOT[1] + shift[1], PIVOT[2] + shift[2]];
      if (this.exitAt.side !== 'left') lampRight = [px, py, pz + d, 1];
      if (this.exitAt.side !== 'right') lampLeft = [px + d, py, pz, 1];
      on = [1, 1];
      swell = s.swell;
      fade = s.fade;
    }
    gallery.render({ camera: this.camera, yaw, pitch, shift, lampRight, lampLeft, on, swell, sweep: sweep(age), fade, time: age / 1000 });
  }

  /** The finished composition (both lamps on, the sculpture at home): reduced motion, a still device, calibration. */
  private drawFinished(): void {
    this.gallery?.render({
      camera: this.camera,
      yaw: 0,
      pitch: 0,
      shift: [0, 0, 0],
      lampRight: [0, 0, 1, 0],
      lampLeft: [1, 0, 0, 0],
      on: [1, 1],
      swell: 0,
      sweep: -9,
      fade: 1,
      time: 0,
    });
  }
}

function focusOf(active: Element | null, link: HTMLAnchorElement): 'page' | 'cover-link' | 'control' {
  if (active === link) return 'cover-link';
  if (!active || active === document.body || active === document.documentElement) return 'page';
  return active.closest('a[href], button, input, select, textarea, summary, [tabindex], [contenteditable]') ? 'control' : 'page';
}

export function boot(): void {
  const root = document.documentElement;
  const cover = document.querySelector<HTMLElement>('[data-ds]');
  const room = document.querySelector<HTMLElement>('[data-room]');
  const canvas = document.querySelector<HTMLCanvasElement>('[data-canvas]');
  const link = document.querySelector<HTMLAnchorElement>('[data-enter]');
  const hint = document.querySelector<HTMLElement>('[data-hint]');
  if (!cover || !room || !canvas || !link) return;
  const el: Elements = { root, cover, room, canvas, link, hint };
  const setHint = (text: string): void => {
    if (hint) hint.textContent = text;
  };

  const controller = new EntryController();
  let art: Art | null = null;
  let deadline = 0;
  let gone = false;
  let fromStill = false; // the gesture began on a still frame: it enters at once
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
      if (fromStill || !art?.exit(decision.at)) return go();
      controller.phase = 'leaving';
      deadline = window.setTimeout(go, EXIT_MS + 250); // even if no frame ever comes again
    }
  };

  link.addEventListener('click', (e) => act(controller.click(e), e));
  link.addEventListener('dragstart', (e) => e.preventDefault());
  addEventListener('keydown', (e) => {
    fromStill = art?.isStill() ?? true;
    art?.wake();
    const focus = focusOf(document.activeElement, link);
    act(controller.key({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, repeat: e.repeat, isComposing: e.isComposing, focus }), e);
  });
  addEventListener('pointerdown', (e) => {
    fromStill = art?.isStill() ?? true;
    controller.pointerDown(e);
    art?.steer(e.clientX, e.clientY);
  });
  addEventListener('pointermove', (e) => {
    controller.pointerMove(e);
    if (e.pointerType === 'mouse' || e.buttons !== 0) art?.steer(e.clientX, e.clientY);
  });
  addEventListener('pointerup', (e) => controller.pointerUp(e));
  addEventListener('pointercancel', (e) => controller.pointerCancel(e));
  addEventListener('pagehide', (e) => {
    clearTimeout(deadline);
    art?.leave(e.persisted);
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

  if (!canShowArt()) return;

  art = new Art(el, fallback, go);
  const started = art;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  reduced.addEventListener('change', () => started.setStill(reduced.matches));
  const forced = matchMedia('(forced-colors: active)');
  forced.addEventListener('change', () => {
    if (forced.matches) started.fail(); // system colours: the HTML cover
  });
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
