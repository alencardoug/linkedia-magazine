import { ART_SCALE, clamp, MARK_SCALE, TAU } from './simulation.js';

export const EXIT_MS = 760;
export const FLASH_DELAY_MS = 190;

interface Field {
  w: number;
  h: number;
  n: number;
  x: Float32Array;
  y: Float32Array;
  size: Float32Array;
  alpha: Float32Array;
  displayAlpha: Float32Array;
  kind: Uint8Array;
}

interface Shard {
  x: number;
  y: number;
  dx: number;
  dy: number;
  radius: number;
  opacity: number;
  ring: boolean;
}

/** Snapshot the visible positions once. Each point keeps its own random heading throughout the exit. */
export function createBurst(field: Field, random = Math.random): Shard[] {
  const span = Math.hypot(field.w, field.h);
  const shards: Shard[] = [];
  for (let i = 0; i < field.n; i++) {
    const heading = random() * TAU;
    const distance = span * (0.58 + 0.92 * random());
    const ring = field.kind[i] === 1;
    shards.push({
      x: field.x[i]!,
      y: field.y[i]!,
      dx: Math.cos(heading) * distance,
      dy: Math.sin(heading) * distance,
      radius: (ring ? 3.5 : field.size[i]! * 0.6) * MARK_SCALE,
      opacity: field.alpha[i]! * Math.max(0.3, field.displayAlpha[i]!),
      ring,
    });
  }
  return shards;
}

export function burstFrame(elapsedMs: number, width: number, height: number) {
  const progress = clamp(elapsedMs / EXIT_MS, 0, 1);
  const light = clamp((elapsedMs - FLASH_DELAY_MS) / (EXIT_MS - FLASH_DELAY_MS), 0, 1);
  // A single light front, centred on the viewport, expands beyond its furthest corner.
  return {
    progress,
    travel: progress * (0.86 + 0.14 * progress),
    lightOpacity: Math.min(1, light * 3),
    lightRadius: Math.hypot(width / 2, height / 2) * (0.04 + 1.85 * (1 - (1 - light) ** 2)),
  };
}

export function drawBurst(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  ratio: number,
  shards: readonly Shard[],
  elapsedMs: number,
): void {
  const frame = burstFrame(elapsedMs, width, height);
  const scale = ART_SCALE * ratio;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = '#221810';
  ctx.globalAlpha = 0.22 * (1 - frame.progress);
  ctx.lineWidth = 0.65;
  ctx.beginPath();
  for (const point of shards) {
    const back = Math.max(0, frame.travel - 0.058);
    ctx.moveTo(point.x + point.dx * back, point.y + point.dy * back);
    ctx.lineTo(point.x + point.dx * frame.travel, point.y + point.dy * frame.travel);
  }
  ctx.stroke();

  ctx.fillStyle = '#221810';
  ctx.lineWidth = 0.85 * MARK_SCALE;
  for (const point of shards) {
    ctx.globalAlpha = point.opacity * (1 - frame.progress);
    ctx.beginPath();
    ctx.arc(point.x + point.dx * frame.travel, point.y + point.dy * frame.travel, point.radius, 0, TAU);
    if (point.ring) ctx.stroke();
    else ctx.fill();
  }

  if (frame.lightOpacity > 0) {
    const cx = width / 2;
    const cy = height / 2;
    const light = ctx.createRadialGradient(cx, cy, 0, cx, cy, frame.lightRadius);
    light.addColorStop(0, '#ffffff');
    light.addColorStop(0.56, '#fffdf2');
    light.addColorStop(0.77, 'rgba(255, 247, 204, .87)');
    light.addColorStop(1, 'rgba(255, 243, 178, 0)');
    ctx.globalAlpha = frame.lightOpacity;
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();
}
