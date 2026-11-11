// Boot of the "Micélio" cover (docs/COVERS.md, ./README.md). The HTML cover — masthead, the edition's lead headlines
// and a flat poster — and its link work before, without and after the art. The art starts only when the device can
// show it (hardware WebGL2 with float render targets, a cover that fits the viewport, no forced colours) and goes live
// only after a verified first frame; any later failure puts the HTML cover back with native entry. Reduced motion gets
// one still frame, simulated silently first. Navigation is owned by EntryController and an independent deadline.
import { EntryController, type Decision } from './controller';
import {
  agentCap,
  discRadius,
  EXIT_MS,
  exitState,
  maxAgents,
  SIM,
  START_AGENTS,
  trailSize,
} from './motion';
import { createQuality, observeFrame, START_MAX_MS, type Quality } from './quality';
import { Mycelium, type Node, type StepParams } from './renderer';

type Vec = readonly [number, number];

const HINT_HTML = 'Clique ou toque em qualquer lugar para entrar.';
const HINT_LOADING = 'O micélio está germinando… clique em qualquer lugar para ir às notícias.';
const hintLive = (): string =>
  matchMedia('(hover: none)').matches
    ? 'Arraste o dedo: ele é comida, e a rede corre até ele. Toque em qualquer lugar para entrar.'
    : 'O cursor é comida: a rede corre até ele. Clique em qualquer lugar para entrar.';

const CANVAS_PIXELS = 2_100_000; // drawing-buffer budget at full scale
const HALF_RATE_AFTER_MS = 20_000; // without input: 30 fps…
const FREEZE_AFTER_MS = 120_000; // …then a still frame until the next input
const FONT_WAIT_MS = 1500;
const POINTER_IDLE_MS = 4000; // then the food point wanders on its own
const STILL_STEPS = 240; // the still frame: this many silent steps, presented once
const STILL_CHUNK = 12; // steps per animation frame while simulating it

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

const nextFrame = (): Promise<number> => new Promise((resolve) => requestAnimationFrame(resolve));

/** The organism: simulation, pointer, adaptive agent count and quality, and its frame loop. */
class Art {
  live = false;
  private sim: Mycelium | null = null;
  private quality: Quality = createQuality(1, 0);
  private readonly seed: number;
  private readonly maxN: number;
  private n = START_AGENTS;
  private capN = START_AGENTS;
  /** Agent-count adaptation: frames in a row under 20 ms, frames over 40 ms, and halved once for good. */
  private good = 0;
  private slow = 0;
  private locked = false;
  private acc = 0;
  /** The pointer's food point, in trail texels (y up); `act` 0 → 1 while someone steers it. */
  private readonly ptr = { x: 0, y: 0, tx: 0, ty: 0, w: 0, r: 30, seen: -Infinity, act: 0 };
  private lastInput = -Infinity;
  private born = 0;
  private exitAt: { t: number; tap: Vec } | null = null;
  private raf = 0;
  private last = 0;
  private frames = 0;
  private frozen = false;
  /** Reduced motion: one settled frame, simulated again only after a resize (it may change while the page is open). */
  private still: boolean;
  private settling = 0;
  private resizeTimer = 0;

  constructor(
    private readonly el: Elements,
    private readonly onFail: () => void,
    private readonly onExitDone: () => void,
  ) {
    this.still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const seed = Number(el.cover.dataset.seed);
    this.seed = Number.isFinite(seed) ? seed >>> 0 : 1;
    this.maxN = maxAgents(matchMedia('(pointer: coarse)').matches);
  }

  /** Builds the simulation and draws a first frame; true once that frame is verified and the art is live. */
  async start(): Promise<boolean> {
    this.sim = Mycelium.create(this.el.canvas);
    if (!this.sim) return false;
    await fontsReady();
    if (!this.sim) return false; // failed or left while the fonts loaded
    if (!fits()) return this.abort();
    this.quality = createQuality(1, performance.now());
    this.rebuild();
    if (!this.calibrate()) return this.abort();
    this.rebuild(); // a fresh sheet after the timed steps
    this.born = performance.now();
    this.lastInput = this.born;
    if (this.still) {
      if (!(await this.settle())) return this.abort();
    } else this.draw(-1);
    if (!this.sim?.healthy()) return this.abort();
    this.live = true;
    this.el.root.dataset.art = 'live';
    if (!this.still) this.resume();
    return true;
  }

  /** The pointer or finger is food (client px); any input also wakes a frozen frame. */
  steer(x: number, y: number): void {
    const sim = this.sim;
    const r = this.el.room.getBoundingClientRect();
    if (!sim || r.width < 1 || r.height < 1) return;
    this.ptr.tx = ((x - r.left) / r.width) * sim.TW;
    this.ptr.ty = (1 - (y - r.top) / r.height) * sim.TH;
    this.ptr.seen = performance.now();
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
    if (still) this.pause(); // the current, grown picture stays as the still frame
    else {
      this.frozen = false;
      this.resume();
    }
  }

  /** Starts the 3 s exit: the organism rushes to the tap (`at`, client px; null = the centre). False when nothing plays. */
  exit(at: Vec | null): boolean {
    if (!this.live || this.still || this.quality.still) return false;
    const r = this.el.room.getBoundingClientRect();
    const tap: Vec = at === null ? [0.5, 0.5] : [(at[0] - r.left) / r.width, 1 - (at[1] - r.top) / r.height];
    this.exitAt = { t: performance.now(), tap };
    this.el.root.dataset.leaving = '';
    this.frozen = false;
    this.resume();
    return true;
  }

  /** Back from the magazine (bfcache): a new sheet, never the white exit frame. */
  reborn(): void {
    delete this.el.root.dataset.leaving;
    if (!this.live || !this.sim) return;
    if (!this.sim.healthy() || !fits()) return this.fail();
    this.exitAt = null;
    this.born = performance.now();
    this.lastInput = this.born;
    this.frozen = false;
    this.rebuild(); // the viewport may have changed while the magazine was open
    if (this.still || this.quality.still) return void this.settle();
    this.draw(-1); // replace the white exit frame before the browser shows it
    this.resume();
  }

  pause(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Leaving the page: stop drawing and pending work; on a permanent departure also free the GPU resources. */
  leave(persisted: boolean): void {
    this.pause();
    this.settling++;
    clearTimeout(this.resizeTimer);
    if (!persisted) {
      this.sim?.dispose();
      this.sim = null;
      this.live = false;
    }
  }

  resume(): void {
    if (this.raf || !this.live || this.still) return; // reduced motion: the still frame never animates
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  /** The text around the nodes reflowed (the live hint is longer): the food follows the nodes, the organism stays. */
  refood(): void {
    const sim = this.sim;
    if (!this.live || !sim) return;
    const [w, h] = viewport();
    sim.paintFood(w, h, this.nodes(), discRadius);
    if (this.still || this.quality.still) void this.settle();
  }

  /** Resizes, rotations and zoom: one new sheet after the burst. */
  scheduleRebuild(): void {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      if (!this.live) return;
      try {
        if (!fits()) return this.fail();
        this.rebuild();
        if (this.still || this.quality.still) void this.settle();
        else if (this.frozen) this.draw(-1);
      } catch {
        this.fail();
      }
    }, 150);
  }

  fail(): void {
    this.pause();
    this.settling++;
    clearTimeout(this.resizeTimer);
    this.sim?.dispose();
    this.sim = null;
    if (this.live) delete this.el.root.dataset.art;
    delete this.el.root.dataset.leaving;
    this.live = false;
    this.onFail();
  }

  private abort(): false {
    this.sim?.dispose();
    this.sim = null;
    return false;
  }

  private ratio(w: number, h: number): number {
    return Math.min(devicePixelRatio || 1, 2, Math.sqrt(CANVAS_PIXELS / (w * h)));
  }

  /** The headline nodes (client px) and their reading times: food discs under them. */
  private nodes(): Node[] {
    return [...this.el.cover.querySelectorAll<HTMLElement>('[data-node]')].map((i) => {
      const b = i.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2, minutes: Number(i.dataset.min) };
    });
  }

  /** A new sheet sized to the viewport: canvas, trails, the edition's dust, the food. */
  private rebuild(): void {
    const sim = this.sim;
    if (!sim) return;
    const [w, h] = viewport();
    const s = this.ratio(w, h) * this.quality.scale;
    sim.setCanvas(w * s, h * s);
    const [tw, th] = trailSize(w, h);
    this.capN = agentCap(tw, th, this.maxN);
    this.n = Math.min(this.n, this.capN);
    sim.build(tw, th, this.maxN, this.seed);
    const p = this.ptr;
    p.x = p.tx = tw / 2;
    p.y = p.ty = th / 2;
    p.w = 0;
    p.act = 0;
    p.r = Math.max(22, Math.min(36, 0.034 * tw));
    sim.paintFood(w, h, this.nodes(), discRadius);
  }

  /** Times one step and frame at the starting agent count (after an untimed warm-up); false when even that is too slow. */
  private calibrate(): boolean {
    const sim = this.sim;
    if (!sim) return false;
    this.step(-1);
    this.draw(-1);
    sim.finish();
    const t0 = performance.now();
    this.step(-1);
    this.draw(-1);
    sim.finish();
    return performance.now() - t0 <= START_MAX_MS && sim.healthy();
  }

  /** The still frame: STILL_STEPS silent steps over a few animation frames, then one presented frame. */
  private async settle(): Promise<boolean> {
    const run = ++this.settling;
    this.pause();
    for (let done = 0; done < STILL_STEPS; done += STILL_CHUNK) {
      await nextFrame();
      if (run !== this.settling || !this.sim) return false;
      for (let i = 0; i < STILL_CHUNK; i++) this.step(-1, true);
    }
    this.draw(-1, true);
    return true;
  }

  private tick(now: number): void {
    this.raf = 0;
    try {
      const interval = now - this.last;
      this.last = now;
      const before = this.quality;
      this.quality = observeFrame(this.quality, interval, now);
      if (this.quality.still && !this.exitAt) return; // stalling or too slow: the grown picture stays as it is
      if (this.quality.scale !== before.scale) {
        const [w, h] = viewport();
        const s = this.ratio(w, h) * this.quality.scale;
        this.sim?.setCanvas(w * s, h * s);
      }
      const idle = now - this.lastInput;
      if (!this.exitAt && idle > FREEZE_AFTER_MS) {
        this.frozen = true;
        return;
      }
      this.frames += 1;
      const halfRate = !this.exitAt && idle > HALF_RATE_AFTER_MS;
      if (!(halfRate && this.frames % 2 === 1)) this.advance(now, Math.min(interval, 100) / 1000, halfRate);
      if (this.frames % 120 === 0 && !this.sim?.healthy()) return this.fail();
      if (this.exitAt && exitState(now - this.exitAt.t).done) {
        this.onExitDone();
        return;
      }
      this.raf = requestAnimationFrame((t) => this.tick(t));
    } catch {
      this.fail();
    }
  }

  /** One displayed frame: adapt the agent count, move the food point, run 0–2 steps, draw. */
  private advance(now: number, dt: number, halfRate: boolean): void {
    if (!this.exitAt && !halfRate && !this.locked) {
      // Double after 60 frames in a row under 20 ms; halve once, for good, when frames pass 40 ms.
      if (dt < 0.02) {
        this.slow = 0;
        if (++this.good >= 60 && this.n < this.capN) {
          this.n = Math.min(this.capN, this.n * 2);
          this.good = 0;
        }
      } else {
        this.good = 0;
        if (dt > 0.04 && ++this.slow >= 12 && this.n > 16_000) {
          this.n = Math.round(this.n / 2);
          this.locked = true;
        }
      }
    }
    const sim = this.sim;
    if (!sim) return;
    const p = this.ptr;
    const t = (now - this.born) / 1000;
    const idle = now - p.seen > POINTER_IDLE_MS;
    if (idle) {
      p.tx = sim.TW * (0.5 + 0.38 * Math.cos(0.13 * t + 1.3));
      p.ty = sim.TH * (0.5 + 0.36 * Math.sin(0.19 * t));
    }
    const k = 1 - Math.exp(-dt * (idle ? 1.5 : 7));
    p.x += (p.tx - p.x) * k;
    p.y += (p.ty - p.y) * k;
    p.act += ((idle ? 0 : 1) - p.act) * (1 - Math.exp(-dt * (idle ? 0.5 : 3)));
    p.w += ((t > 3 ? 2 : 0) - p.w) * (1 - Math.exp(-dt * 1.5));
    const e = this.exitAt ? (now - this.exitAt.t) / 1000 : -1;
    this.acc += dt * 60;
    let steps = Math.max(0, Math.min(halfRate ? 1 : 2, Math.floor(this.acc + 0.25)));
    this.acc = Math.min(this.acc - steps, 1);
    while (steps-- > 0) this.step(e);
    this.draw(e);
  }

  /** One simulation step; `e` = seconds since the exit began (−1: none); `quiet`: no pointer (the still frame). */
  private step(e: number, quiet = false): void {
    const sim = this.sim;
    if (!sim) return;
    const { TW, TH } = sim;
    const p = this.ptr;
    let s: StepParams;
    if (e >= 0 && this.exitAt) {
      const [tx, ty] = this.exitAt.tap;
      s = {
        ptr: [tx * TW, ty * TH, 6, 14],
        far: [0.35 * Math.max(TW, TH), 1],
        hunger: [0, 1],
        sensorAngle: 0.2,
        step: SIM.step * 1.6,
        food: exitState(e * 1000).food,
        respawn: 0,
        fedIgnoreFood: false, // every agent hungry
        decay: 0.85,
      };
    } else {
      const w = quiet ? 0 : p.w * (1 + (SIM.pointerWeight / 2 - 1) * p.act);
      s = {
        ptr: [p.x, p.y, w, p.r],
        far: [3 * p.r, 0.3 + (SIM.far - 0.3) * p.act],
        hunger: [quiet ? 0 : SIM.hunger * p.act, SIM.hungerReach * p.r],
        sensorAngle: SIM.sensorAngle,
        step: SIM.step,
        food: 1,
        respawn: SIM.respawn,
        fedIgnoreFood: true,
        decay: SIM.decay,
      };
    }
    sim.step(this.n, s);
  }

  private draw(e: number, quiet = false): void {
    const sim = this.sim;
    if (!sim) return;
    const x = e >= 0 ? exitState(e * 1000) : null;
    const sx = sim.width / sim.TW;
    const p = this.ptr;
    sim.draw({
      mask: x ? x.food : 1,
      wipe: x ? x.wipe : 0,
      tap: this.exitAt?.tap ?? [0.5, 0.5],
      ptr: [p.x * sx, (p.y * sim.height) / sim.TH, p.r * sx, x || quiet ? 0 : 0.07 * p.w],
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
  const cover = document.querySelector<HTMLElement>('[data-mc]');
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
        started.refood();
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
