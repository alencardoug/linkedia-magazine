// §9.2: draws the wires of the architecture from the real node boxes (after the fonts load and on resize): the main
// flow as solid arrows, the observability signals as dashed lines along the two side channels. Each wire names the
// paths it belongs to (data-on), so the route buttons can light one path. Without JS the nodes keep their CSS arrows.
type Box = { l: number; r: number; t: number; b: number; cx: number; cy: number };

export function initArch(): void {
  const arch = document.querySelector<HTMLElement>('[data-arch]');
  const grid = arch?.querySelector<HTMLElement>('.arch-grid');
  const svg = grid?.querySelector<SVGSVGElement>('.arch-wires');
  if (!arch || !grid || !svg) return;

  const draw = () => {
    const g = grid.getBoundingClientRect();
    const box = (name: string): Box => {
      const b = grid.querySelector<HTMLElement>(`[data-node="${name}"]`)!.getBoundingClientRect();
      const l = b.left - g.left;
      const t = b.top - g.top;
      return { l, r: l + b.width, t, b: t + b.height, cx: l + b.width / 2, cy: t + b.height / 2 };
    };
    const n = Object.fromEntries(['user', 'api', 'orq', 'rag', 'repo', 'agent', 'sched', 'obs'].map((k) => [k, box(k)]));
    const f = (v: number) => v.toFixed(1);
    const out: string[] = [];
    const wire = (d: string, on: string, cls = 'wire') => out.push(`<path class="${cls}" data-on="${on}" d="${d}"/>`);
    const head = (x: number, y: number, dir: 'down' | 'left' | 'right', on: string, cls = 'wire-head') => {
      const d =
        dir === 'down'
          ? `M${f(x - 5)} ${f(y - 7)} L${f(x)} ${f(y)} L${f(x + 5)} ${f(y - 7)}`
          : dir === 'left'
            ? `M${f(x + 7)} ${f(y - 5)} L${f(x)} ${f(y)} L${f(x + 7)} ${f(y + 5)}`
            : `M${f(x - 7)} ${f(y - 5)} L${f(x)} ${f(y)} L${f(x - 7)} ${f(y + 5)}`;
      wire(d, on, cls);
    };
    // Main flow: from the bottom of one node to the top of the next, with an elbow when the centres differ.
    const down = (a: Box, b: Box, on: string) => {
      const x1 = a.l <= b.cx && b.cx <= a.r ? b.cx : a.cx;
      const y1 = a.b;
      const y2 = b.t - 2;
      const mid = (y1 + y2) / 2;
      wire(x1 === b.cx ? `M${f(x1)} ${f(y1)} V${f(y2)}` : `M${f(x1)} ${f(y1)} V${f(mid)} H${f(b.cx)} V${f(y2)}`, on);
      head(b.cx, y2, 'down', on);
    };
    down(n.user, n.api, 'rag agente');
    down(n.api, n.orq, 'rag agente');
    down(n.orq, n.rag, 'rag');
    down(n.orq, n.agent, 'agente');
    down(n.rag, n.repo, 'rag');
    down(n.agent, n.sched, 'agente');
    // Signals into observability: API, orchestration and agent along the right channel, RAG along the left one.
    const xr = g.width - 10;
    const xl = 10;
    const yo = n.obs.t + Math.min(36, (n.obs.b - n.obs.t) / 2);
    for (const [k, on] of [['api', 'rag agente'], ['orq', 'rag agente'], ['agent', 'agente']] as const) {
      wire(`M${f(n[k].r)} ${f(n[k].cy)} H${f(xr)} V${f(yo)} H${f(n.obs.r + 2)}`, on, 'signal');
    }
    wire(`M${f(n.rag.l)} ${f(n.rag.cy)} H${f(xl)} V${f(yo)} H${f(n.obs.l - 2)}`, 'rag', 'signal');
    head(n.obs.r + 2, yo, 'left', 'rag agente', 'signal-head');
    head(n.obs.l - 2, yo, 'right', 'rag', 'signal-head');
    svg.setAttribute('viewBox', `0 0 ${f(g.width)} ${f(g.height)}`);
    svg.innerHTML = out.join('');
    arch.dataset.wired = '';
  };

  let timer = 0;
  addEventListener('resize', () => {
    clearTimeout(timer);
    timer = window.setTimeout(draw, 120);
  });
  draw();
  document.fonts.ready.then(draw);
}
