import {
  ART_SCALE,
  MARK_SCALE,
  TAU,
  TRAIL_BUCKETS,
  clamp,
  mulberry32,
  prepareTrail,
} from './simulation.js';

const MONO = 'ui-monospace,"SFMono-Regular",Menlo,Consolas,"Liberation Mono",monospace';

/** @param {HTMLCanvasElement} grain @param {number} w @param {number} h @param {number} seed */
export function paintPaper(grain, w, h, seed) {
  const random = mulberry32(seed ^ 0x18be),
    tile = document.createElement('canvas');
  tile.width = tile.height = 192;
  const tc = tile.getContext('2d');
  if (!tc) return;
  const image = tc.createImageData(192, 192);
  for (let i = 0; i < image.data.length; i += 4) {
    const dark = random() < 0.62;
    image.data[i] = dark ? 40 : 255;
    image.data[i + 1] = dark ? 32 : 250;
    image.data[i + 2] = dark ? 10 : 236;
    image.data[i + 3] = Math.round(random() * 0.07 * 255);
  }
  tc.putImageData(image, 0, 0);
  grain.width = w + 8;
  grain.height = h + 8;
  const gc = grain.getContext('2d');
  const pattern = gc?.createPattern(tile, 'repeat');
  if (!gc || !pattern) return;
  gc.fillStyle = pattern;
  gc.fillRect(0, 0, grain.width, grain.height);
}
const overlap = (a, b, gap = 0) =>
  a.x < b.x + b.w + gap && a.x + a.w > b.x - gap && a.y < b.y + b.h + gap && a.y + a.h > b.y - gap;
function labelPlacement(ctx, sim, label, used) {
  const w = sim.w,
    h = sim.h,
    tw = ctx.measureText(label.code).width,
    th = 14;
  const bounds = (x, y) =>
    label.vertical ? { x: x - th / 2, y: y - tw, w: th, h: tw } : { x, y: y - th / 2, w: tw, h: th };
  const base = {
    x: clamp(label.x, 18 / ART_SCALE, w - 64 / ART_SCALE),
    y: clamp(label.y, 65 / ART_SCALE, h - 70 / ART_SCALE),
  };
  const candidates = [base];
  for (const d of [22, 42, 72])
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, -1],
      [0, 1],
      [1, -1],
      [-1, -1],
      [1, 1],
      [-1, 1],
    ])
      candidates.push({ x: base.x + dx * d, y: base.y + dy * d });
  for (const p of candidates) {
    const b = bounds(p.x, p.y);
    if (
      b.x < 8 / ART_SCALE ||
      b.y < 8 / ART_SCALE ||
      b.x + b.w > w - 8 / ART_SCALE ||
      b.y + b.h > h - 8 / ART_SCALE
    )
      continue;
    if (used.some((r) => overlap(b, r, 6 / ART_SCALE))) continue;
    if (sim.phase.wordWeight > 0.6 && overlap(b, sim.homes.bounds, 10)) continue;
    let ringOverlap = false;
    for (let i = 0; i < sim.n; i++)
      if (sim.kind[i] === 1) {
        const dx = Math.max(b.x - sim.x[i], 0, sim.x[i] - b.x - b.w),
          dy = Math.max(b.y - sim.y[i], 0, sim.y[i] - b.y - b.h);
        if (dx * dx + dy * dy < (3.5 * MARK_SCALE + 2.5) ** 2) {
          ringOverlap = true;
          break;
        }
      }
    if (ringOverlap) continue;
    used.push(b);
    return p;
  }
  return null;
}
// Four link paths and twelve tracer-age paths avoid per-particle state changes and translucent clearing.
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./simulation.js').TranceSimulation} sim
 * @param {number} dpr
 */
export function drawScene(ctx, sim, dpr) {
  const { w, h } = sim;
  ctx.save();
  ctx.setTransform(dpr * ART_SCALE, 0, 0, dpr * ART_SCALE, 0, 0);
  ctx.clearRect(0, 0, w, h);
  sim.prepare();
  for (const ghost of sim.ghosts) {
    const opacity = 0.13 * (1 - (sim.time - ghost.born) / 0.55);
    ctx.strokeStyle = 'rgba(34,24,16,' + Math.max(0, opacity) + ')';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (const [ax, ay, bx, by] of ghost.edges) {
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    }
    for (const [x, y, size] of ghost.points) {
      ctx.moveTo(x + size, y);
      ctx.arc(x, y, size, 0, TAU);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1 - 0.85 * sim.phase.wordWeight;
  for (const tr of sim.tracers) prepareTrail(tr);
  for (let bucket = 0; bucket < TRAIL_BUCKETS; bucket++) {
    ctx.strokeStyle = 'rgba(34,24,16,' + ((bucket + 0.5) / TRAIL_BUCKETS) * 0.48 + ')';
    ctx.lineWidth = 0.62 * MARK_SCALE;
    ctx.beginPath();
    for (const tr of sim.tracers) {
      const segments = tr.renderCount - 1,
        start = Math.floor((bucket * segments) / TRAIL_BUCKETS) + 1,
        end = Math.floor(((bucket + 1) * segments) / TRAIL_BUCKETS);
      let pen = false;
      for (let j = start; j <= end; j++) {
        const ax = tr.drawX[j - 1],
          ay = tr.drawY[j - 1],
          bx = tr.drawX[j],
          by = tr.drawY[j];
        if (Math.hypot(ax - bx, ay - by) > 100) {
          pen = false;
          continue;
        }
        if (!pen) ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        pen = true;
      }
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (let bucket = 0; bucket < 12; bucket++) {
    ctx.strokeStyle = 'rgba(34,24,16,' + ((bucket + 0.5) / 12) * 0.22 + ')';
    ctx.lineWidth = 0.6 * MARK_SCALE;
    ctx.beginPath();
    for (const link of sim.links) {
      if (link.alpha < 0.002 || Math.min(11, Math.floor((link.alpha / 0.22) * 12)) !== bucket) continue;
      const ax = sim.x[link.a],
        ay = sim.y[link.a],
        bx = sim.x[link.b],
        by = sim.y[link.b];
      ctx.moveTo(ax, ay);
      if (link.curve)
        ctx.quadraticCurveTo((ax + bx) / 2 - (by - ay) * 0.36, (ay + by) / 2 + (bx - ax) * 0.36, bx, by);
      else ctx.lineTo(bx, by);
    }
    ctx.stroke();
  }
  for (let group = 0; group < sim.groupCount; group++)
    for (let wordMember = 0; wordMember < 2; wordMember++)
      for (let bucket = 0; bucket < 4; bucket++) {
        ctx.globalAlpha = wordMember
          ? sim.letterGroupAlpha[group] * sim.wordAlpha
          : sim.groupAlpha[group];
        ctx.fillStyle =
          'rgba(' + (bucket % 2 ? '13,12,10,' : '34,24,16,') + (0.45 + ((bucket + 0.5) / 4) * 0.5) + ')';
        ctx.beginPath();
        for (let i = 0; i < sim.n; i++) {
          if (
            sim.groupIds[i] !== group ||
            Number(i < sim.wordCount) !== wordMember ||
            sim.kind[i] === 1 ||
            Math.min(3, Math.floor((sim.alpha[i] - 0.45) * 8)) !== bucket
          )
            continue;
          ctx.moveTo(sim.x[i] + sim.size[i] * 0.6 * MARK_SCALE, sim.y[i]);
          ctx.arc(sim.x[i], sim.y[i], sim.size[i] * 0.6 * MARK_SCALE, 0, TAU);
        }
        ctx.fill();
      }
  ctx.lineWidth = 0.85 * MARK_SCALE;
  ctx.strokeStyle = 'rgba(34,24,16,.8)';
  for (let group = 0; group < sim.groupCount; group++) {
    ctx.globalAlpha = sim.groupAlpha[group];
    ctx.beginPath();
    for (let i = 0; i < sim.n; i++)
      if (sim.kind[i] === 1 && sim.groupIds[i] === group) {
        ctx.moveTo(sim.x[i] + 3.5 * MARK_SCALE, sim.y[i]);
        ctx.arc(sim.x[i], sim.y[i], 3.5 * MARK_SCALE, 0, TAU);
      }
    ctx.stroke();
  }
  ctx.globalAlpha = 1 - 0.35 * sim.phase.wordWeight;
  ctx.font = '10.5px ' + MONO;
  ctx.textBaseline = 'middle';
  const usedLabels = [];
  for (const label of sim.labels) {
    const pos = labelPlacement(ctx, sim, label, usedLabels);
    if (!pos) continue;
    const { x, y } = pos;
    ctx.strokeStyle = 'rgba(34,24,16,.35)';
    ctx.lineWidth = 0.5 * MARK_SCALE;
    ctx.beginPath();
    ctx.moveTo(sim.x[label.node] + 4 * MARK_SCALE, sim.y[label.node] - 3 * MARK_SCALE);
    ctx.lineTo(x - 4, y + 2);
    ctx.stroke();
    ctx.save();
    ctx.translate(x, y);
    if (label.vertical) ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = 'rgba(34,24,16,.78)';
    ctx.fillText(label.code, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  for (const wave of sim.waves) {
    ctx.strokeStyle = 'rgba(34,24,16,' + 0.18 * (1 - wave.age / 0.9) + ')';
    ctx.lineWidth = 0.65 * MARK_SCALE;
    ctx.beginPath();
    ctx.arc(wave.x, wave.y, 900 * wave.age, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}
