// Particle field from the P12 Transe study. Units are logical pixels and simulation seconds.
const TAU = Math.PI * 2;
// One optical scale for the entire living material. Simulate in a smaller logical sheet, then draw at 1.6×.
// Dividing the density floors/caps by its area keeps a comparable ink coverage and breathing room.
const ART_SCALE = 1.6;
const DENSITY_AREA = ART_SCALE * ART_SCALE;
// Double dot diameters and every art stroke relative to the 1.6× study, with a more open network.
const MARK_SCALE = 2;
const NETWORK_SPACING = 1.5;
const PARTICLE_DENSITY = 1.6;
const TRAIL_HZ = 60;
const TRAIL_SECONDS = 3;
const TRAIL_SEGMENTS = TRAIL_HZ * TRAIL_SECONDS;
const TRAIL_CAPACITY = TRAIL_SEGMENTS + 1;
const TRAIL_BUCKETS = 12;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const lerp = (t, a, b) => a + t * (b - a);
const SAMPLE = Object.freeze([
  { code: '18472', weight: 8, tags: ['agentes', 'segurança'] },
  { code: '09631', weight: 6, tags: ['agentes', 'dados'] },
  { code: '23708', weight: 9, tags: ['avaliação'] },
]);

// Seeded randomness and improved 3D Perlin noise.
function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function createNoise3(seed) {
  const p = new Uint8Array(512),
    order = Uint8Array.from({ length: 256 }, (_, i) => i),
    r = mulberry32(seed);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1)),
      v = order[i];
    order[i] = order[j];
    order[j] = v;
  }
  for (let i = 0; i < 512; i++) p[i] = order[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y, z) => {
    h &= 15;
    const u = h < 8 ? x : y,
      v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return (h & 1 ? -u : u) + (h & 2 ? -v : v);
  };
  return (x, y, z) => {
    const fx = Math.floor(x),
      fy = Math.floor(y),
      fz = Math.floor(z),
      X = fx & 255,
      Y = fy & 255,
      Z = fz & 255;
    x -= fx;
    y -= fy;
    z -= fz;
    const u = fade(x),
      v = fade(y),
      w = fade(z),
      A = p[X] + Y,
      B = p[X + 1] + Y,
      AA = p[A] + Z,
      AB = p[A + 1] + Z,
      BA = p[B] + Z,
      BB = p[B + 1] + Z;
    return lerp(
      w,
      lerp(
        v,
        lerp(u, grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z)),
        lerp(u, grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z)),
      ),
      lerp(
        v,
        lerp(u, grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1)),
        lerp(u, grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1)),
      ),
    );
  };
}
function inside(x, y, b, pad = 0) {
  return x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad;
}
function rectDistance(x, y, b) {
  return Math.hypot(Math.max(b.x - x, 0, x - b.x - b.w), Math.max(b.y - y, 0, y - b.y - b.h));
}
function membershipShares(count, articles) {
  const n = Math.round(count * 0.55),
    sum = articles.reduce((s, a) => s + (a.weight > 0 ? a.weight : 1), 0);
  const raw = articles.map((a) => (n * (a.weight > 0 ? a.weight : 1)) / sum),
    out = raw.map(Math.floor);
  const order = raw.map((v, i) => ({ i, f: v - out[i] })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let i = 0, left = n - out.reduce((a, b) => a + b, 0); i < left; i++) out[order[i].i]++;
  return out;
}
function placeColonies(w, h, box, articles, random) {
  const inset = 0.1,
    min = Math.min(w, h),
    colonies = [];
  for (let i = 0; i < articles.length; i++) {
    let best = null,
      score = -Infinity;
    for (let k = 0; k < 30; k++) {
      const x = w * (inset + random() * (1 - 2 * inset)),
        y = h * (inset + random() * (1 - 2 * inset));
      if (inside(x, y, box, 24)) continue;
      const spacing = colonies.length
        ? Math.min(...colonies.map((c) => Math.hypot(c.x - x, c.y - y)))
        : min;
      if (spacing < 0.26 * min) continue;
      const s = spacing + Math.min(rectDistance(x, y, box), min) * 0.28;
      if (s > score) {
        score = s;
        best = { x, y };
      }
    }
    // A bounded fallback scans the available sheet on unusually short/zoomed viewports.
    if (!best) {
      for (let gy = 0; gy <= 16; gy++)
        for (let gx = 0; gx <= 16; gx++) {
          const x = w * (inset + (0.8 * gx) / 16),
            y = h * (inset + (0.8 * gy) / 16);
          if (inside(x, y, box, 24)) continue;
          const s = colonies.length
            ? Math.min(...colonies.map((c) => Math.hypot(c.x - x, c.y - y)))
            : min;
          if (s > score) {
            score = s;
            best = { x, y };
          }
        }
    }
    if (!best) best = { x: w * 0.8, y: h * 0.15 };
    colonies.push({
      ...best,
      code: articles[i].code,
      tags: articles[i].tags || [],
      phase: random() * TAU,
    });
  }
  return colonies;
}
function quietCircles(w, h, colonies, box, random) {
  const circles = [],
    radius = 0.2 * Math.min(w, h);
  for (let i = 0; i < 2; i++) {
    let best = null,
      score = -Infinity;
    for (let k = 0; k < 80; k++) {
      const x = w * (0.08 + random() * 0.84),
        y = h * (0.12 + random() * 0.76);
      const distance = Math.min(
        ...colonies.map((c) => Math.hypot(x - c.x, y - c.y)),
        ...circles.map((c) => Math.hypot(x - c.x, y - c.y)),
      );
      const s = distance + (inside(x, y, box, 0) ? radius * 0.15 : 0);
      if (s > score) {
        score = s;
        best = { x, y, r: radius };
      }
    }
    circles.push(best);
  }
  return circles;
}

// Counting-sort spatial hash. Each query visits only its nine neighbouring cells.
class Grid {
  constructor(w, h, r, capacity) {
    this.r = r;
    this.cols = Math.ceil((w + 80) / r);
    this.rows = Math.ceil((h + 80) / r);
    this.counts = new Uint16Array(this.cols * this.rows);
    this.starts = new Uint16Array(this.counts.length + 1);
    this.cursor = new Uint16Array(this.counts.length);
    this.order = new Uint16Array(capacity);
    this.cells = new Uint16Array(capacity);
  }
  cell(x, y) {
    return (
      clamp(Math.floor((y + 40) / this.r), 0, this.rows - 1) * this.cols +
      clamp(Math.floor((x + 40) / this.r), 0, this.cols - 1)
    );
  }
  rebuild(x, y, n) {
    this.counts.fill(0);
    for (let i = 0; i < n; i++) {
      const c = this.cell(x[i], y[i]);
      this.cells[i] = c;
      this.counts[c]++;
    }
    this.starts[0] = 0;
    for (let i = 0; i < this.counts.length; i++) this.starts[i + 1] = this.starts[i] + this.counts[i];
    this.cursor.set(this.starts.subarray(0, this.counts.length));
    for (let i = 0; i < n; i++) this.order[this.cursor[this.cells[i]]++] = i;
  }
  visit(x, y, fn) {
    const cell = this.cell(x, y),
      cy = Math.floor(cell / this.cols),
      cx = cell % this.cols;
    for (let yy = Math.max(0, cy - 1); yy <= Math.min(this.rows - 1, cy + 1); yy++)
      for (let xx = Math.max(0, cx - 1); xx <= Math.min(this.cols - 1, cx + 1); xx++) {
        const c = yy * this.cols + xx;
        for (let k = this.starts[c]; k < this.starts[c + 1]; k++) fn(this.order[k]);
      }
  }
}

// Bounded pointers, continuous attraction, speed-derived turbulence and one impulse per wave.
class Pointers {
  constructor() {
    this.map = new Map();
    this.energy = 0;
  }
  move(id, x, y, at) {
    let p = this.map.get(id);
    if (!p) {
      if (this.map.size >= 3) {
        const gone = [...this.map.values()].find((p) => !p.here);
        if (gone) this.map.delete(gone.id);
        else return false;
      }
      p = { id, x, y, at, speed: 0, weight: 0, here: true };
      this.map.set(id, p);
    } else {
      const speed = p.here ? Math.hypot(x - p.x, y - p.y) / Math.max(0.004, (at - p.at) / 1000) : 0;
      p.speed = lerp(0.35, p.speed, speed);
      p.x = x;
      p.y = y;
      p.at = at;
      p.here = true;
    }
    this.energy = Math.max(this.energy, clamp((p.speed * ART_SCALE - 600) / 1800, 0, 1));
    return true;
  }
  release(id) {
    const p = this.map.get(id);
    if (p) p.here = false;
  }
  releaseAll() {
    for (const p of this.map.values()) p.here = false;
  }
  step(dt) {
    this.energy *= Math.exp(-dt / 1.3);
    for (const p of this.map.values()) {
      p.speed *= Math.exp(-dt / 0.25);
      p.weight = p.here ? 1 - (1 - p.weight) * Math.exp(-dt / 0.1) : p.weight * Math.exp(-dt / 0.6);
      if (!p.here && p.weight < 0.01) this.map.delete(p.id);
    }
  }
}
function waveBand(age, distance, dt) {
  const r = 900 * age,
    previous = 900 * Math.max(0, age - dt);
  return age <= 0.9 && distance >= Math.max(0, previous - 35) && distance <= r + 35;
}
function labelStep(pos, target, dt) {
  const a = 1 - Math.exp(-dt / 1.2);
  pos.x += a * (target.x - pos.x);
  pos.y += a * (target.y - pos.y);
  return pos;
}

// Nearest eligible neighbours, degree at most three at both ends, bucketed by opacity at draw time.
function selectLinks(sim) {
  const { x, y, n, grid, radius: r } = sim,
    degree = sim.degree;
  degree.fill(0);
  let count = 0;
  for (let i = 0; i < n && count < 1400; i++) {
    const near = [];
    grid.visit(x[i], y[i], (j) => {
      if (j === i || degree[j] >= 3) return;
      const dx = x[j] - x[i],
        dy = y[j] - y[i],
        d2 = dx * dx + dy * dy;
      if (d2 < r * r && d2 > 1) near.push({ j, d2 });
    });
    near.sort((a, b) => a.d2 - b.d2 || a.j - b.j);
    for (const { j, d2 } of near) {
      if (degree[i] >= 3 || count >= 1400) break;
      if (degree[j] >= 3) continue;
      const key = Math.min(i, j) * sim.capacity + Math.max(i, j);
      if (sim.linkSeen.has(key)) continue;
      sim.linkSeen.add(key);
      degree[i]++;
      degree[j]++;
      const d = Math.sqrt(d2),
        visibility = sim.displayAlpha ? Math.sqrt(sim.displayAlpha[i] * sim.displayAlpha[j]) : 1,
        alpha = 0.22 * (1 - d / r) ** 2 * visibility;
      sim.links[count++] = {
        a: i,
        b: j,
        alpha,
        curve: ((Math.imul(i + 1, 73856093) ^ Math.imul(j + 1, 19349663)) & 3) === 0,
      };
    }
  }
  sim.links.length = count;
  sim.linkSeen.clear();
  return sim.links;
}

// Tracer history uses elapsed simulation time, never the display's frame count.
function createTrail(x, y) {
  const hx = new Float32Array(TRAIL_CAPACITY),
    hy = new Float32Array(TRAIL_CAPACITY);
  hx[0] = x;
  hy[0] = y;
  return {
    x,
    y,
    hx,
    hy,
    head: 1,
    length: 1,
    sampleClock: 0,
    drawX: new Float32Array(TRAIL_CAPACITY),
    drawY: new Float32Array(TRAIL_CAPACITY),
    renderCount: 1,
  };
}
function sampleTrail(tr, fromX, fromY, dt) {
  if (!(dt > 0)) return;
  const interval = 1 / TRAIL_HZ;
  tr.sampleClock += dt;
  while (tr.sampleClock >= interval - 1e-10) {
    const f = clamp((dt - (tr.sampleClock - interval)) / dt, 0, 1);
    tr.hx[tr.head] = lerp(f, fromX, tr.x);
    tr.hy[tr.head] = lerp(f, fromY, tr.y);
    tr.head = (tr.head + 1) % TRAIL_CAPACITY;
    tr.length = Math.min(TRAIL_CAPACITY, tr.length + 1);
    tr.sampleClock = Math.max(0, tr.sampleClock - interval);
  }
}
// Every vertex represents a fixed age. Sliding interpolation moves the tail and fade boundaries each frame;
// the last vertex is the live tip, including on displays faster than the history sampling frequency.
function prepareTrail(tr) {
  const segments = Math.min(TRAIL_SEGMENTS, tr.length - 1),
    phase = clamp(tr.sampleClock * TRAIL_HZ, 0, 1);
  for (let i = 0; i < segments; i++) {
    const lag = segments - i,
      a = (tr.head - 1 - lag + TRAIL_CAPACITY) % TRAIL_CAPACITY,
      b = (a + 1) % TRAIL_CAPACITY;
    tr.drawX[i] = lerp(phase, tr.hx[a], tr.hx[b]);
    tr.drawY[i] = lerp(phase, tr.hy[a], tr.hy[b]);
  }
  tr.drawX[segments] = tr.x;
  tr.drawY[segments] = tr.y;
  tr.renderCount = segments + 1;
  return tr.renderCount;
}

// Colonies, free particles and tracers with fixed-size history rings.
class Simulation {
  constructor(w, h, box, seed, articles = SAMPLE, scale = 1) {
    this.w = w;
    this.h = h;
    this.time = 0;
    this.random = mulberry32(seed);
    this.noise = createNoise3(seed);
    const floor = wordForViewport(w * ART_SCALE, h * ART_SCALE) === 'IA' ? 96 : 176;
    this.capacity = Math.max(
      floor,
      clamp(
        Math.round(((w * h) / 2600) * PARTICLE_DENSITY),
        Math.round((180 / DENSITY_AREA) * PARTICLE_DENSITY),
        Math.round((700 / DENSITY_AREA) * PARTICLE_DENSITY),
      ),
    );
    this.n = Math.max(floor, Math.round(this.capacity * scale));
    this.x = new Float32Array(this.capacity);
    this.y = new Float32Array(this.capacity);
    this.vx = new Float32Array(this.capacity);
    this.vy = new Float32Array(this.capacity);
    this.kickX = new Float32Array(this.capacity);
    this.kickY = new Float32Array(this.capacity);
    this.size = new Float32Array(this.capacity);
    this.alpha = new Float32Array(this.capacity);
    this.fx = new Float32Array(this.capacity);
    this.fy = new Float32Array(this.capacity);
    this.kind = new Uint8Array(this.capacity);
    this.member = new Int8Array(this.capacity);
    this.member.fill(-1);
    this.degree = new Uint8Array(this.capacity);
    this.colonies = placeColonies(w, h, box, articles, this.random);
    const shares = membershipShares(this.n, articles);
    this.quiet = quietCircles(w, h, this.colonies, box, this.random);
    this.radius = (w * ART_SCALE < 600 ? 70 : 92) * NETWORK_SPACING;
    this.grid = new Grid(w, h, this.radius, this.capacity);
    this.links = [];
    this.linkSeen = new Set();
    this.pointers = new Pointers();
    this.waves = [];
    let cursor = 0;
    this.colonies.forEach((c, k) => {
      c.members = shares[k];
      c.radius = (40 + 26 * Math.sqrt(c.members / 10)) * NETWORK_SPACING;
      c.node = cursor;
      for (let j = 0; j < c.members; j++, cursor++) {
        this.member[cursor] = k;
        const a = this.random() * TAU,
          dist = Math.sqrt(this.random()) * c.radius * (0.38 + 0.23 * Math.sin(a * 3 + c.phase) ** 2);
        this.init(cursor, c.x + Math.cos(a) * dist, c.y + Math.sin(a) * dist);
      }
    });
    for (let i = cursor; i < this.n; i++) {
      let x = 0,
        y = 0;
      for (let tries = 0; tries < 80; tries++) {
        x = this.random() * w;
        y = this.random() * h;
        if (!inside(x, y, box, 28) && !this.quiet.some((q) => Math.hypot(x - q.x, y - q.y) < q.r)) break;
      }
      this.init(i, x, y);
    }
    this.tracerCount = Math.round((w * ART_SCALE < 600 ? 12 : 16) / ART_SCALE);
    this.tracers = [];
    for (let i = 0; i < this.tracerCount; i++) {
      const start = i % this.colonies.length,
        c = this.colonies[start],
        a = this.random() * TAU;
      this.tracers.push({
        ...createTrail(c.x + Math.cos(a) * 20, c.y + Math.sin(a) * 20),
        vx: 0,
        vy: 0,
        kickX: 0,
        kickY: 0,
        target:
          (start + 1 + Math.floor(this.random() * (this.colonies.length - 1))) % this.colonies.length,
      });
    }
    this.labels = [];
    this.colonies.forEach((c, k) => {
      this.kind[c.node] = 1;
      this.labels.push({
        node: c.node,
        colony: k,
        code: c.code,
        vertical: false,
        x: this.x[c.node] + 12,
        y: this.y[c.node] - 8,
      });
    });
    for (let j = 0; j < Math.min(4, Math.max(3, Math.round(this.n / 100))); j++) {
      const node = cursor + Math.floor(this.random() * Math.max(1, this.n - cursor));
      this.kind[node] = 1;
      this.labels.push({
        node,
        colony: -1,
        code: String(1000 + Math.floor(this.random() * 89000)).padStart(5, '0'),
        vertical: this.random() < 0.55,
        x: this.x[node] + 12,
        y: this.y[node] - 8,
      });
    }
    this.grid.rebuild(this.x, this.y, this.n);
  }
  init(i, x, y) {
    this.x[i] = x;
    this.y[i] = y;
    const a = this.random() * TAU;
    this.vx[i] = Math.cos(a) * 8;
    this.vy[i] = Math.sin(a) * 8;
    this.size[i] = 0.7 + this.random() * 1.5;
    this.alpha[i] = 0.45 + this.random() * 0.5;
    this.kind[i] = this.random() < 0.03 ? 1 : 0;
  }
  wave(x, y) {
    if (this.waves.length >= 4) this.waves.shift();
    this.waves.push({ x, y, age: 0, hit: new Uint8Array(this.capacity + this.tracerCount) });
  }
  step(inputDt) {
    const dt = clamp(inputDt, 0, 1 / 30);
    if (dt === 0) return;
    this.time += dt;
    this.pointers.step(dt);
    for (const wave of this.waves) wave.age += dt;
    this.waves = this.waves.filter((w) => w.age <= 0.9);
    this.grid.rebuild(this.x, this.y, this.n);
    const { x, y, vx, vy, fx, fy, n, noise } = this,
      t = this.time,
      E = this.pointers.energy;
    for (let i = 0; i < n; i++) {
      const angle =
        2 *
        TAU *
        (noise(x[i] / 620, y[i] / 620, t / 26) +
          E * 0.33 * noise(x[i] / 206.667, y[i] / 206.667, t / 11));
      let ax = 22 * (1 + 3 * E) * Math.cos(angle),
        ay = 22 * (1 + 3 * E) * Math.sin(angle);
      const separation = 14 * NETWORK_SPACING * (1 - 0.5 * (this.phase?.wordWeight || 0));
      this.grid.visit(x[i], y[i], (j) => {
        if (i === j) return;
        const dx = x[i] - x[j],
          dy = y[i] - y[j],
          d2 = dx * dx + dy * dy;
        if (d2 > 1e-6 && d2 < separation * separation) {
          const d = Math.sqrt(d2),
            f = 180 * (1 - d / separation);
          ax += (f * dx) / d;
          ay += (f * dy) / d;
        }
      });
      const m = this.member[i];
      if (m >= 0) {
        const c = this.colonies[m],
          dx = c.x - x[i],
          dy = c.y - y[i],
          d = Math.hypot(dx, dy);
        if (d > c.radius) {
          const f = Math.min((60 * (d - c.radius)) / c.radius, 90);
          ax += (dx / d) * f;
          ay += (dy / d) * f;
        }
      } else
        for (const q of this.quiet) {
          const dx = x[i] - q.x,
            dy = y[i] - q.y,
            d = Math.hypot(dx, dy);
          if (d > 1e-5 && d < q.r) {
            const f = 40 * (1 - d / q.r);
            ax += (dx / d) * f;
            ay += (dy / d) * f;
          }
        }
      for (const p of this.pointers.map.values()) {
        const dx = p.x - x[i],
          dy = p.y - y[i],
          d = Math.hypot(dx, dy);
        if (d > 18 && d < 260) {
          const f = 520 * (1 - d / 260) * p.weight;
          ax += f * (dx / d - (0.3 * dy) / d);
          ay += f * (dy / d + (0.3 * dx) / d);
        }
      }
      if (this.targets) {
        ax += (this.targets.x[i] - x[i]) * this.pull;
        ay += (this.targets.y[i] - y[i]) * this.pull;
      }
      fx[i] = ax;
      fy[i] = ay;
    }
    for (let i = 0; i < n; i++) {
      const damping = this.motionDamping || 1.6,
        cap = this.motionCap || 70;
      vx[i] = (vx[i] + fx[i] * dt) * Math.exp(-damping * dt);
      vy[i] = (vy[i] + fy[i] * dt) * Math.exp(-damping * dt);
      const speed = Math.hypot(vx[i], vy[i]);
      if (speed > cap) {
        vx[i] *= cap / speed;
        vy[i] *= cap / speed;
      }
      this.kickX[i] *= Math.exp(-3.2 * dt);
      this.kickY[i] *= Math.exp(-3.2 * dt);
      for (const wave of this.waves) {
        const dx = x[i] - wave.x,
          dy = y[i] - wave.y,
          d = Math.hypot(dx, dy);
        if (!wave.hit[i] && d > 1e-5 && waveBand(wave.age, d, dt)) {
          this.kickX[i] += (420 * dx) / d;
          this.kickY[i] += (420 * dy) / d;
          wave.hit[i] = 1;
        }
      }
      x[i] += (vx[i] + this.kickX[i]) * dt;
      y[i] += (vy[i] + this.kickY[i]) * dt;
      if (!(this.vortexAmount > 0.001)) {
        if (x[i] < -40) x[i] = this.w + 40;
        else if (x[i] > this.w + 40) x[i] = -40;
        if (y[i] < -40) y[i] = this.h + 40;
        else if (y[i] > this.h + 40) y[i] = -40;
      }
    }
    for (let ti = 0; ti < this.tracers.length; ti++) {
      const tr = this.tracers[ti];
      const c = this.colonies[tr.target],
        dx = c.x - tr.x,
        dy = c.y - tr.y,
        d = Math.hypot(dx, dy);
      if (d < 35) {
        const related = this.colonies
          .map((q, i) => ({ i, related: q.tags.some((tag) => c.tags.includes(tag)) }))
          .filter((q) => q.i !== tr.target);
        const preferred = related.filter((q) => q.related),
          choices = this.random() < 0.65 && preferred.length ? preferred : related;
        tr.target = choices[Math.floor(this.random() * choices.length)].i;
      }
      const a =
        2 *
        TAU *
        (noise(tr.x / 620, tr.y / 620, t / 26) +
          E * 0.33 * noise(tr.x / 206.667, tr.y / 206.667, t / 11));
      let ax = (70 * dx) / Math.max(1, d) + 33 * (1 + 3 * E) * Math.cos(a),
        ay = (70 * dy) / Math.max(1, d) + 33 * (1 + 3 * E) * Math.sin(a);
      for (const p of this.pointers.map.values()) {
        const px = p.x - tr.x,
          py = p.y - tr.y,
          pd = Math.hypot(px, py);
        if (pd > 18 && pd < 260) {
          const f = 520 * (1 - pd / 260) * p.weight;
          ax += f * (px / pd - (0.3 * py) / pd);
          ay += f * (py / pd + (0.3 * px) / pd);
        }
      }
      if (this.vortexAmount > 0.001) {
        const v = vortexPoint(
          ti,
          this.tracers.length,
          this.time,
          this.vortex.x,
          this.vortex.y,
          this.vortex.radius,
        );
        ax += (v[0] - tr.x) * 75 * this.vortexAmount;
        ay += (v[1] - tr.y) * 75 * this.vortexAmount;
      }
      tr.vx = (tr.vx + ax * dt) * Math.exp(-0.6 * dt);
      tr.vy = (tr.vy + ay * dt) * Math.exp(-0.6 * dt);
      const tracerCap = 160 + 440 * (this.vortexAmount || 0),
        speed = Math.hypot(tr.vx, tr.vy);
      if (speed > tracerCap) {
        tr.vx *= tracerCap / speed;
        tr.vy *= tracerCap / speed;
      }
      tr.kickX *= Math.exp(-3.2 * dt);
      tr.kickY *= Math.exp(-3.2 * dt);
      for (const wave of this.waves) {
        const dx = tr.x - wave.x,
          dy = tr.y - wave.y,
          d = Math.hypot(dx, dy),
          index = this.capacity + ti;
        if (!wave.hit[index] && d > 1e-5 && waveBand(wave.age, d, dt)) {
          tr.kickX += (420 * dx) / d;
          tr.kickY += (420 * dy) / d;
          wave.hit[index] = 1;
        }
      }
      const fromX = tr.x,
        fromY = tr.y;
      tr.x += (tr.vx + tr.kickX) * dt;
      tr.y += (tr.vy + tr.kickY) * dt;
      sampleTrail(tr, fromX, fromY, dt);
    }
    for (const label of this.labels) {
      // The ring is a member of its colony, so the number follows the living material, never a fixed centre.
      labelStep(label, { x: x[label.node] + 12, y: y[label.node] - 8 }, dt);
    }
  }
  prepare() {
    this.grid.rebuild(this.x, this.y, this.n);
    return selectLinks(this);
  }
}

const CYCLE_SECONDS = 10;
const FIELD_PERIOD_SECONDS = 32;
const MOTION_SPEED = 0.7;
const HOP_RATE = 3;
const canHop = (p) => ['corrente', 'salto', 'órbita', 'acaso'].includes(p.name);
function vortexPoint(i, count, time, x, y, radius) {
  const u = (i + 0.5) / count,
    r = radius * (0.035 + 0.965 * Math.pow(u, 0.72)),
    angle = ((i % 3) * TAU) / 3 + u * TAU * 1.35 + time * 3.1;
  return [x + Math.cos(angle) * r, y + Math.sin(angle) * r * 0.88];
}
const ease = (t) => {
  t = clamp(t, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const wordForViewport = (w, h) => (w < 900 || w < h || h < 520 ? 'IA' : 'LinkedIA');
const GLYPHS = Object.freeze({
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  i: ['010', '000', '110', '010', '010', '010', '111'],
  n: ['00000', '00000', '11110', '10001', '10001', '10001', '10001'],
  k: ['10000', '10000', '10010', '10100', '11000', '10100', '10010'],
  e: ['00000', '00000', '01110', '10001', '11111', '10000', '01110'],
  d: ['00001', '00001', '01111', '10001', '10001', '10001', '01111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
});
function phaseAt(time) {
  const t = ((time % CYCLE_SECONDS) + CYCLE_SECONDS) % CYCLE_SECONDS;
  const p = {
    t,
    cycle: Math.floor(time / CYCLE_SECONDS),
    name: 'corrente',
    wordWeight: 0,
    blink: 1,
    mode: 0,
    returnMix: 0,
  };
  if (t < 0.5) return p;
  if (t < 1.25) return { ...p, name: 'salto' };
  if (t < 1.75) return { ...p, name: 'órbita', mode: 1 };
  if (t < 2) return { ...p, name: 'acaso', mode: 2 };
  if (t < 4) return { ...p, name: 'reconhecimento', mode: 1, wordWeight: ease((t - 2) / 2) };
  if (t < 5)
    return {
      ...p,
      name: 'sinal',
      mode: 1,
      wordWeight: 1,
      blink: 0.15 + 0.85 * (0.5 + 0.5 * Math.cos(TAU * (t - 4))),
    };
  if (t < 7) return { ...p, name: 'nome', mode: 1, wordWeight: 1 };
  const release = ease((t - 7) / 3);
  return {
    ...p,
    name: t < 9 ? 'ruptura' : 'retorno',
    mode: 2,
    wordWeight: 1 - release,
    returnMix: release,
  };
}
function sampleWord(word, count, stage, seed) {
  const cells = [],
    glyphs = [];
  let cursor = 0;
  for (const letter of word) {
    const glyph = GLYPHS[letter],
      start = cursor;
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < glyph[y].length; x++)
        if (glyph[y][x] === '1') cells.push({ x: cursor + x, y, letter });
    cursor += glyph[0].length + 2;
    glyphs.push({ letter, start, width: glyph[0].length });
  }
  const width = cursor - 2,
    pitch = Math.min((stage.w * 0.84) / width, (stage.h * 0.7) / 7),
    left = stage.x + (stage.w - width * pitch) / 2,
    top = stage.y + (stage.h - 7 * pitch) / 2;
  const x = new Float32Array(count),
    y = new Float32Array(count),
    random = mulberry32(seed ^ 0x12ab);
  for (let i = 0; i < count; i++) {
    const cell = cells[i % cells.length],
      layer = Math.floor(i / cells.length),
      a = i * 2.399963229728653,
      r = layer ? 0.16 + 0.055 * (layer % 3) : 0.045;
    x[i] = left + (cell.x + 0.5 + Math.cos(a) * r + (random() - 0.5) * 0.04) * pitch;
    y[i] = top + (cell.y + 0.5 + Math.sin(a) * r + (random() - 0.5) * 0.04) * pitch;
  }
  return {
    x,
    y,
    pitch,
    cells,
    glyphs,
    bounds: { x: left, y: top, w: width * pitch, h: 7 * pitch },
    word,
  };
}
function makePlans(groups, seed) {
  const random = mulberry32(seed ^ 0x45b12),
    plans = [];
  for (let mode = 0; mode < 3; mode++) {
    const centers = [];
    for (let g = 0; g < groups; g++) {
      let best = null,
        score = -1;
      for (let k = 0; k < 40; k++) {
        const x = 0.13 + 0.74 * random(),
          y = 0.16 + 0.68 * random(),
          d = centers.length ? Math.min(...centers.map((c) => Math.hypot(c.x - x, c.y - y))) : 1;
        if (d > score) {
          best = { x, y, phase: random() * TAU };
          score = d;
        }
      }
      centers.push(best);
    }
    plans.push(centers);
  }
  return plans;
}
const reflect = (n) => {
  const a = ((n % 2) + 2) % 2;
  return a <= 1 ? a : 2 - a;
};
function fieldPoint(group, lx, ly, mode, t, stage, plans) {
  const c = plans[mode][group],
    u = (TAU * t) / FIELD_PERIOD_SECONDS;
  const cx = c.x + 0.14 * Math.sin(u * 3 + c.phase),
    cy = c.y + 0.13 * Math.cos(u * 5 + c.phase);
  const a = c.phase + u * (4 + mode) + 0.85 * Math.sin(u * 7 + c.phase),
    stretch = 0.9 + 0.42 * Math.sin(u * 9 + c.phase);
  let x = cx + (lx * Math.cos(a) - ly * Math.sin(a)) * 0.12 * stretch,
    y = cy + ((lx * Math.sin(a) + ly * Math.cos(a)) * 0.19) / (0.8 + 0.3 * stretch);
  const dx = x - 0.5,
    dy = y - 0.5,
    twist = 0.72 * Math.sin(u * 8 + Math.hypot(dx, dy) * 6 + mode);
  x = 0.5 + dx * Math.cos(twist) - dy * Math.sin(twist);
  y = 0.5 + dx * Math.sin(twist) + dy * Math.cos(twist);
  x += 0.09 * Math.sin(y * TAU + u * 6);
  y += 0.08 * Math.sin(x * TAU - u * 7);
  return [stage.x + reflect(x) * stage.w, stage.y + reflect(y) * stage.h];
}
class TranceSimulation extends Simulation {
  constructor(w, h, box, seed, scale, stage) {
    const word = wordForViewport(w * ART_SCALE, h * ART_SCALE),
      groups = word === 'IA' ? 5 : 7;
    const articles = Array.from({ length: groups }, (_, i) => ({
      ...SAMPLE[i % 3],
      code: i < 3 ? SAMPLE[i].code : String(31000 + i * 1297),
    }));
    super(w, h, box, seed, articles, scale);
    this.stage = stage;
    this.word = word;
    this.groupCount = groups;
    this.plans = makePlans(groups, seed);
    this.wordCount = Math.round(this.n * 0.78);
    this.homes = sampleWord(word, this.wordCount, stage, seed);
    this.targets = { x: new Float32Array(this.capacity), y: new Float32Array(this.capacity) };
    this.groupIds = new Uint8Array(this.capacity);
    this.localX = new Float32Array(this.capacity);
    this.localY = new Float32Array(this.capacity);
    this.displayAlpha = new Float32Array(this.capacity);
    this.groupAlpha = new Float32Array(groups);
    this.groupAlpha.fill(1);
    const random = mulberry32(seed ^ 0xc1212);
    for (let i = 0; i < this.n; i++) {
      this.groupIds[i] = i % groups;
      this.member[i] = i % groups;
      const a = random() * TAU,
        r = Math.sqrt(random());
      this.localX[i] = Math.cos(a) * r;
      this.localY[i] = Math.sin(a) * r;
      this.kind[i] = 0;
    }
    this.labels = [];
    for (let j = 0; j < 6; j++) {
      const node = this.wordCount + Math.floor(((this.n - this.wordCount) * j) / 6);
      this.kind[node] = 1;
      this.labels.push({
        node,
        colony: j < 3 ? j : -1,
        code: j < 3 ? SAMPLE[j].code : String(10000 + Math.floor(random() * 89000)),
        vertical: j >= 3 && j % 2 === 1,
        x: this.x[node] + 12,
        y: this.y[node] - 8,
      });
    }
    this.startAt = 0;
    this.fixedScore = 0;
    this.phase = phaseAt(0);
    this.teleportCount = 0;
    this.lastCycle = 0;
    this.groupPlans = new Uint8Array(groups);
    this.hopSlot = -1;
    this.lastHopAt = new Float64Array(groups);
    this.lastLetterHopAt = new Float64Array(groups);
    this.letterGroupAlpha = new Float32Array(groups);
    this.letterGroupAlpha.fill(1);
    this.lastHopAt.fill(-Infinity);
    this.lastLetterHopAt.fill(-Infinity);
    this.ghosts = [];
    this.wordAlpha = 1;
    this.motionCap = 300 * MOTION_SPEED;
    this.motionDamping = 8;
    this.pull = 45;
    this.vortex = { weight: 0, x: w / 2, y: h / 2, radius: Math.min(w, h) * 0.38 };
    this.vortexAmount = 0;
  }

  /** Place the field in its requested pose, then settle local forces without simulating a whole cycle. */
  settleAt(score) {
    const phase = phaseAt(score);
    this.lastCycle = phase.cycle;
    this.hopSlot = Math.floor(phase.t * HOP_RATE);
    this.pointers.map.clear();
    this.pointers.energy = 0;
    this.vortex.weight = 0;
    this.ghosts = [];
    this.waves = [];
    this.lastHopAt.fill(-Infinity);
    this.lastLetterHopAt.fill(-Infinity);
    this.vx.fill(0);
    this.vy.fill(0);
    this.kickX.fill(0);
    this.kickY.fill(0);
    for (let i = 0; i < this.n; i++) {
      const [x, y] = this.worldPoint(i, phase);
      if (i < this.wordCount) {
        this.x[i] = lerp(phase.wordWeight, x, this.homes.x[i]);
        this.y[i] = lerp(phase.wordWeight, y, this.homes.y[i]);
      } else {
        this.x[i] = x;
        this.y[i] = y;
      }
    }
    this.fixedScore = score;
    for (let i = 0; i < 32; i++) this.step(1 / 60);
    this.fixedScore = null;
    this.startAt = this.time - score;
  }
  groupMode(g, p) {
    return canHop(p) ? this.groupPlans[g] : p.mode;
  }
  worldPoint(i, p) {
    const g = this.groupIds[i],
      mode = i >= this.wordCount ? this.groupPlans[g] : this.groupMode(g, p),
      a = fieldPoint(
        g,
        this.localX[i],
        this.localY[i],
        mode,
        p.t * MOTION_SPEED,
        this.stage,
        this.plans,
      );
    if (p.returnMix > 0) {
      const b = fieldPoint(g, this.localX[i], this.localY[i], 0, 0, this.stage, this.plans);
      a[0] = lerp(p.returnMix, a[0], b[0]);
      a[1] = lerp(p.returnMix, a[1], b[1]);
    }
    return a;
  }
  teleport(g, p) {
    const whole = p.wordWeight === 0;
    const points = [],
      edges = [],
      members = new Set();
    for (let i = 0; i < this.n; i++)
      if (this.groupIds[i] === g && (whole || i >= this.wordCount)) {
        members.add(i);
        points.push([this.x[i], this.y[i], this.size[i]]);
      }
    for (const link of this.links)
      if (members.has(link.a) && members.has(link.b))
        edges.push([this.x[link.a], this.y[link.a], this.x[link.b], this.y[link.b]]);
    this.ghosts.push({ points, edges, born: this.time });
    if (this.ghosts.length > 7) this.ghosts.shift();
    this.teleportCount++;
    this.groupPlans[g] = (this.groupPlans[g] + 1) % 3;
    this.lastHopAt[g] = this.time;
    if (whole) this.lastLetterHopAt[g] = this.time;
    for (const i of members) {
      const pos = this.worldPoint(i, p);
      this.x[i] = pos[0];
      this.y[i] = pos[1];
      this.vx[i] = this.vy[i] = this.kickX[i] = this.kickY[i] = 0;
    }
  }
  step(inputDt) {
    const dt = clamp(inputDt, 0, 1 / 30);
    if (dt === 0) return;
    const score = this.fixedScore === null ? this.time + dt - this.startAt : this.fixedScore,
      p = phaseAt(score);
    this.phase = p;
    const active = [...this.pointers.map.values()].filter((pointer) => pointer.here);
    if (active.length) {
      const cx = active.reduce((sum, p) => sum + p.x, 0) / active.length,
        cy = active.reduce((sum, p) => sum + p.y, 0) / active.length;
      if (this.vortex.weight < 0.001) {
        this.vortex.x = cx;
        this.vortex.y = cy;
      } else {
        const f = 1 - Math.exp(-dt / 0.035);
        this.vortex.x = lerp(f, this.vortex.x, cx);
        this.vortex.y = lerp(f, this.vortex.y, cy);
      }
      this.vortex.weight = 1 - (1 - this.vortex.weight) * Math.exp(-dt / 0.065);
    } else {
      this.vortex.weight *= Math.exp(-dt / 0.18);
      if (this.vortex.weight < 0.0001) this.vortex.weight = 0;
    }
    // All nodes participate outside the name. A fully formed word keeps the approved interaction exactly.
    this.vortexAmount = this.vortex.weight * (1 - p.wordWeight);
    if (p.cycle !== this.lastCycle) {
      this.groupPlans.fill(0);
      this.hopSlot = -1;
      this.lastCycle = p.cycle;
    }
    const slot = Math.floor(p.t * HOP_RATE);
    if (slot !== this.hopSlot) {
      this.hopSlot = slot;
      if (slot > 0 && this.vortexAmount < 0.05) this.teleport((slot - 1) % this.groupCount, p);
    }
    for (let g = 0; g < this.groupCount; g++) {
      this.groupAlpha[g] = 0.08 + 0.92 * ease((this.time + dt - this.lastHopAt[g]) / 0.2);
      this.letterGroupAlpha[g] = 0.08 + 0.92 * ease((this.time + dt - this.lastLetterHopAt[g]) / 0.2);
    }
    this.wordAlpha = 1 - p.wordWeight + p.wordWeight * p.blink;
    this.pull = 45 + 35 * p.wordWeight;
    this.motionDamping = 8 + 2 * p.wordWeight;
    this.motionCap = 300 * MOTION_SPEED + (900 - 300 * MOTION_SPEED) * this.vortexAmount;
    this.pull += 160 * this.vortexAmount;
    this.motionDamping += 18 * this.vortexAmount;
    for (let g = 0; g < this.groupCount; g++) {
      const a = fieldPoint(g, 0, 0, this.groupMode(g, p), p.t * MOTION_SPEED, this.stage, this.plans);
      this.colonies[g].x = a[0];
      this.colonies[g].y = a[1];
    }
    for (let i = 0; i < this.n; i++) {
      let [tx, ty] = this.worldPoint(i, p);
      // Only letter particles assemble; background particles retain their free field, without a halo.
      if (p.wordWeight > 0 && i < this.wordCount) {
        tx = lerp(p.wordWeight, tx, this.homes.x[i]);
        ty = lerp(p.wordWeight, ty, this.homes.y[i]);
      }
      for (const pointer of this.pointers.map.values()) {
        const dx = tx - pointer.x,
          dy = ty - pointer.y,
          d = Math.hypot(dx, dy),
          reach = p.wordWeight > 0.8 ? 150 : 260;
        if (d > 1 && d < reach) {
          const f = (1 - d / reach) * pointer.weight * 0.65,
            twist = f * (1 + this.pointers.energy);
          tx -= dx * f * 0.25 + dy * twist;
          ty -= dy * f * 0.25 - dx * twist;
        }
      }
      if (this.vortexAmount > 0) {
        const v = vortexPoint(
          i,
          this.n,
          this.time + dt,
          this.vortex.x,
          this.vortex.y,
          this.vortex.radius,
        );
        tx = lerp(this.vortexAmount, tx, v[0]);
        ty = lerp(this.vortexAmount, ty, v[1]);
      }
      this.targets.x[i] = tx;
      this.targets.y[i] = ty;
      this.displayAlpha[i] =
        i < this.wordCount
          ? this.letterGroupAlpha[this.groupIds[i]] * this.wordAlpha
          : this.groupAlpha[this.groupIds[i]];
    }
    super.step(dt);
    if (this.vortexAmount > 0.001) {
      const capture = 1 - Math.exp(-18 * this.vortexAmount * dt);
      for (let i = 0; i < this.n; i++) {
        this.x[i] += capture * (this.targets.x[i] - this.x[i]);
        this.y[i] += capture * (this.targets.y[i] - this.y[i]);
      }
    }
    this.ghosts = this.ghosts.filter((g) => this.time - g.born < 0.55);
  }
}

export {
  ART_SCALE,
  MARK_SCALE,
  TRAIL_BUCKETS,
  CYCLE_SECONDS,
  TAU,
  clamp,
  mulberry32,
  prepareTrail,
  phaseAt,
  TranceSimulation,
};
