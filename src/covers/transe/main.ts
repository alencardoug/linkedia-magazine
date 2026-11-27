import { createBurst, drawBurst, EXIT_MS } from './burst';
import { EntryController, LONG_PRESS_MS, TAP_SLOP_PX, type Decision } from './controller';
import { drawScene, paintPaper } from './draw.js';
import { createQuality, observeFrame } from './quality';
import { ART_SCALE, CYCLE_SECONDS, TranceSimulation } from './simulation.js';

const SEED = 4224866490;
const OPENING_SCORE = 4;
const STILL_SCORE = 6;
const HALF_RATE_AFTER_MS = 20_000;
const FREEZE_AFTER_MS = 120_000;
const MAX_CANVAS_PIXELS = 6_000_000;
const HINT_HTML = 'Clique ou toque em qualquer lugar para entrar.';

interface Elements {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  grain: HTMLCanvasElement;
  label: HTMLElement;
}

class Art {
  live = false;
  private ctx: CanvasRenderingContext2D | null = null;
  private sim: TranceSimulation | null = null;
  private exitFrame: { started: number; shards: ReturnType<typeof createBurst> } | null = null;
  private quality = createQuality(1, 0);
  private density = 1;
  private ratio = 1;
  private reduced = false;
  private frozen = false;
  private raf = 0;
  private lastFrame = 0;
  private lastInput = 0;
  private lastGrain = 0;
  private grainStep = 0;

  constructor(
    private readonly el: Elements,
    private readonly onFallback: () => void,
    private readonly onExitDone: () => void,
  ) {}

  start(reduced: boolean): boolean {
    this.pause();
    this.exitFrame = null;
    this.live = false;
    this.frozen = false;
    this.reduced = reduced;
    const { root, canvas, grain } = this.el;
    delete root.dataset.leaving;
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (width < 320 || height < 320) return this.fail();
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) return this.fail();
      this.ctx = ctx;
      this.ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
      canvas.width = Math.round(width * this.ratio);
      canvas.height = Math.round(height * this.ratio);
      const grainRatio = Math.min(1, this.ratio);
      paintPaper(grain, Math.round(width * grainRatio), Math.round(height * grainRatio), SEED);
      grain.style.transform = '';
      this.grainStep = 0;
      this.lastGrain = 0;
      this.lastInput = performance.now();
      this.quality = createQuality(1, this.lastInput);
      this.density = 1;
      const sim = this.makeSimulation(reduced ? STILL_SCORE : OPENING_SCORE);
      this.sim = sim;
      drawScene(ctx, sim, this.ratio);
      const scale = ART_SCALE * this.ratio;
      if (ctx.getImageData(Math.floor(sim.x[0]! * scale), Math.floor(sim.y[0]! * scale), 1, 1).data[3] === 0) {
        return this.fail();
      }
      this.live = true;
      root.dataset.art = 'live';
      this.rest(reduced);
      this.resume();
      return true;
    } catch {
      return this.fail();
    }
  }

  private makeSimulation(score: number, previous?: TranceSimulation): TranceSimulation {
    const w = window.innerWidth / ART_SCALE;
    const h = window.innerHeight / ART_SCALE;
    const label = this.el.label.getBoundingClientRect();
    const box = { x: label.x / ART_SCALE, y: label.y / ART_SCALE, w: label.width / ART_SCALE, h: label.height / ART_SCALE };
    const next = new TranceSimulation(w, h, box, SEED, this.density, { x: 0, y: 0, w, h });
    if (previous) {
      next.groupPlans.set(previous.groupPlans);
      next.teleportCount = previous.teleportCount;
    }
    next.settleAt(score);
    return next;
  }

  isStill(): boolean {
    return !this.live || this.reduced || this.frozen || this.quality.still;
  }

  pointer(id: number, x: number, y: number, at: number): void {
    this.wake();
    if (!this.isStill() && !this.exitFrame) this.sim?.pointers.move(id, x / ART_SCALE, y / ART_SCALE, at);
  }

  release(id: number): void {
    this.sim?.pointers.release(id);
  }

  releaseAll(): void {
    this.sim?.pointers.releaseAll();
  }

  wave(x: number, y: number): boolean {
    if (this.isStill() || !this.sim || this.exitFrame) return false;
    this.sim.wave(x / ART_SCALE, y / ART_SCALE);
    this.wake();
    return true;
  }

  wake(): void {
    this.lastInput = performance.now();
    if (this.frozen && !this.reduced && !this.quality.still) {
      this.frozen = false;
      this.rest(false);
      this.resume();
    }
  }

  exit(): boolean {
    if (this.isStill() || !this.sim) return false;
    this.exitFrame = { started: performance.now(), shards: createBurst(this.sim) };
    this.el.root.dataset.leaving = '';
    this.resume();
    return true;
  }

  pause(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.lastFrame = 0;
  }

  resume(): void {
    if (this.live && !this.raf && !document.hidden && (!this.isStill() || this.exitFrame)) {
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  fail(): false {
    const leaving = this.exitFrame !== null;
    this.pause();
    this.exitFrame = null;
    this.sim = null;
    this.ctx = null;
    this.live = false;
    delete this.el.root.dataset.art;
    delete this.el.root.dataset.leaving;
    this.rest(false);
    this.onFallback();
    if (leaving) this.onExitDone();
    return false;
  }

  private rest(value: boolean): void {
    if (value) this.el.root.dataset.rest = '';
    else delete this.el.root.dataset.rest;
  }

  private freeze(sim: TranceSimulation, ctx: CanvasRenderingContext2D): void {
    this.frozen = true;
    sim.settleAt(STILL_SCORE);
    drawScene(ctx, sim, this.ratio);
    this.rest(true);
  }

  private tick = (now: number): void => {
    this.raf = 0;
    const { ctx, sim, exitFrame } = this;
    if (!ctx || !sim || document.hidden) return;
    try {
      if (exitFrame) {
        const elapsed = now - exitFrame.started;
        drawBurst(ctx, sim.w, sim.h, this.ratio, exitFrame.shards, elapsed);
        if (elapsed >= EXIT_MS) return this.onExitDone();
      } else {
        this.advance(now, sim, ctx);
      }
      this.resume();
    } catch {
      this.fail();
    }
  };

  private advance(now: number, sim: TranceSimulation, ctx: CanvasRenderingContext2D): void {
    const idle = now - this.lastInput;
    if (idle >= FREEZE_AFTER_MS) return this.freeze(sim, ctx);
    const interval = this.lastFrame ? now - this.lastFrame : 1000 / 60;
    if (idle >= HALF_RATE_AFTER_MS && interval < 31) return;
    if (idle < HALF_RATE_AFTER_MS) this.quality = observeFrame(this.quality, interval, now);
    if (this.quality.still) return this.freeze(sim, ctx);
    this.lastFrame = now;
    sim.step(interval / 1000);
    drawScene(ctx, sim, this.ratio);

    if (this.density !== this.quality.scale && sim.pointers.map.size === 0 && sim.waves.length === 0 && sim.phase.wordWeight === 0) {
      this.density = this.quality.scale;
      this.sim = this.makeSimulation(sim.phase.cycle * CYCLE_SECONDS + sim.phase.t, sim);
    }
    if (now - this.lastGrain >= 140) {
      this.lastGrain = now;
      this.grainStep++;
      const x = (this.grainStep * 7) % 5 - 2;
      const y = (this.grainStep * 3 + 1) % 5 - 2;
      this.el.grain.style.transform = `translate(${x}px,${y}px)`;
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
  const cover = document.querySelector<HTMLElement>('[data-transe]');
  const canvas = cover?.querySelector<HTMLCanvasElement>('[data-canvas]');
  const grain = cover?.querySelector<HTMLCanvasElement>('[data-grain]');
  const label = cover?.querySelector<HTMLElement>('[data-label]');
  const link = cover?.querySelector<HTMLAnchorElement>('[data-enter]');
  const hint = cover?.querySelector<HTMLElement>('[data-hint]');
  if (!canvas || !grain || !label || !link || !hint) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const forced = matchMedia('(forced-colors: active)');
  const controller = new EntryController();
  let deadline = 0;
  let resizeTimer = 0;
  let gone = false;
  let fromStill = false;
  let held = false;
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
  const art = new Art(
    { root, canvas, grain, label },
    () => {
      controller.reset('html');
      endPress();
      hint.textContent = HINT_HTML;
    },
    go,
  );
  const start = (): void => {
    endPress();
    if (forced.matches) {
      art.fail();
      return;
    }
    if (!art.start(reduced.matches)) return;
    controller.reset('live');
    hint.textContent = reduced.matches ? HINT_HTML : matchMedia('(hover: none)').matches
      ? 'Segure para atrair os pontos. Toque breve para entrar.'
      : 'Mova o cursor para girar os pontos. Clique para entrar.';
  };
  const act = (decision: Decision, event: Event): void => {
    if (decision.kind === 'native') return;
    event.preventDefault();
    if (decision.kind === 'navigate') return go();
    if (decision.kind !== 'exit') return;
    if (fromStill) return go();
    controller.phase = 'leaving';
    deadline = window.setTimeout(go, EXIT_MS + 200);
    try {
      if (!art.exit()) go();
    } catch {
      go();
    }
  };

  link.addEventListener('click', (event) => {
    const decision = controller.click(event);
    const stay = held && event.detail > 0 && decision.kind === 'exit';
    held = false;
    if (stay) event.preventDefault();
    else act(decision, event);
  });
  link.addEventListener('dragstart', (event) => event.preventDefault());
  link.addEventListener('contextmenu', (event) => {
    if (art.live && (event as PointerEvent).pointerType === 'touch') event.preventDefault();
  });
  addEventListener('keydown', (event) => {
    fromStill = art.isStill();
    art.wake();
    act(controller.key({
      key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey,
      repeat: event.repeat, isComposing: event.isComposing, focus: focusOf(document.activeElement, link),
    }), event);
  });
  addEventListener('pointerdown', (event) => {
    fromStill = art.isStill();
    held = false;
    controller.pointerDown(event);
    art.pointer(event.pointerId, event.clientX, event.clientY, event.timeStamp);
    const again = press !== null;
    endPress();
    if (again || fromStill || event.button !== 0) return;
    const { pointerId: id, clientX: x, clientY: y } = event;
    press = { id, x, y, timer: window.setTimeout(() => {
      press = null;
      if (art.wave(x, y)) held = true;
    }, LONG_PRESS_MS) };
  });
  addEventListener('pointermove', (event) => {
    controller.pointerMove(event);
    if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > TAP_SLOP_PX) endPress();
    if (event.pointerType !== 'touch' || event.buttons !== 0) art.pointer(event.pointerId, event.clientX, event.clientY, event.timeStamp);
  });
  addEventListener('pointerup', (event) => {
    controller.pointerUp(event);
    if (press?.id === event.pointerId) endPress();
    if (event.pointerType === 'touch') art.release(event.pointerId);
  });
  addEventListener('pointercancel', (event) => {
    controller.pointerCancel(event);
    if (press?.id === event.pointerId) endPress();
    art.release(event.pointerId);
  });
  root.addEventListener('pointerleave', (event) => art.release(event.pointerId));
  addEventListener('blur', () => {
    endPress();
    art.releaseAll();
  });
  addEventListener('pagehide', () => {
    clearTimeout(deadline);
    clearTimeout(resizeTimer);
    endPress();
    art.releaseAll();
    art.pause();
  });
  addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    gone = false;
    held = false;
    fromStill = false;
    start();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      endPress();
      art.releaseAll();
      art.pause();
    } else {
      art.resume();
    }
  });
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    if (controller.phase !== 'leaving') {
      resizeTimer = window.setTimeout(() => {
        if (controller.phase !== 'leaving') start();
      }, 120);
    }
  });
  const adaptMotion = (): void => {
    if (controller.phase === 'leaving') go();
    else start();
  };
  reduced.addEventListener('change', adaptMotion);
  forced.addEventListener('change', adaptMotion);
  canvas.addEventListener('contextlost', () => art.fail());
  start();
}
