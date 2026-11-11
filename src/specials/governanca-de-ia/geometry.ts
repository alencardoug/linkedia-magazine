// Hero splice of the S4 direction (3-21 sketch, 3-22 page): six cool strands (corporate pillars) from the top right
// and six warm strands (technical pillars) from the bottom right run through one splice wrapped by two binding bands
// (ink and gold: the integration layer's two pillars). One warm strand leaves the splice and ends exactly where the
// lede's "a ponte entre eles" underline starts. Shared by the build (first state) and the module script, which
// redraws it after the fonts load and on resize. Colours come from CSS classes so both schemes recolour them.
export interface Point {
  x: number;
  y: number;
}

const f = (n: number) => n.toFixed(1);

function splice(W: number) {
  const cx = W - 360;
  const cy = 430;
  return { cx, cy, x0: cx - 150, x1: cx + 150, y: (k: number) => cy - 33 + k * 6 };
}

interface Strand {
  kind: 'cool' | 'warm';
  i: number;
  exit: boolean;
  d: string;
}

function strands(W: number, H: number, end: Point | null): Strand[] {
  const s = splice(W);
  const out: Strand[] = [];
  for (let i = 0; i < 6; i++) {
    const yk = s.y(2 * i);
    const sx = W - 300 + i * 46;
    out.push({
      kind: 'cool',
      i,
      exit: false,
      d: `M${f(sx)} -20 C${f(sx)} 210 ${f(s.x1 + 140)} ${f(yk)} ${f(s.x1)} ${f(yk)} L${f(s.x0)} ${f(yk)} C${f(s.x0 - 100)} ${f(yk)} ${f(s.x0 - 190)} ${f(yk - 110 + i * 10)} ${f(s.x0 - 300)} ${f(yk - 220 + i * 22)}`,
    });
  }
  for (let j = 0; j < 6; j++) {
    const yk = s.y(2 * j + 1);
    const sx = W - 320 + j * 46;
    const exit = j === 0 && end !== null;
    const head = `M${f(sx)} ${f(H + 20)} C${f(sx)} ${f(H - 240)} ${f(s.x1 + 140)} ${f(yk)} ${f(s.x1)} ${f(yk)} L${f(s.x0)} ${f(yk)}`;
    const tail =
      exit && end
        ? ` C${f(s.x0 - 150)} ${f(yk)} ${f(s.x0 - 110)} ${f(end.y + 64)} ${f(s.x0 - 280)} ${f(end.y + 64)} L${f(end.x - 40)} ${f(end.y + 64)} C${f(end.x - 100)} ${f(end.y + 64)} ${f(end.x - 60)} ${f(end.y)} ${f(end.x)} ${f(end.y)}`
        : ` C${f(s.x0 - 100)} ${f(yk)} ${f(s.x0 - 190)} ${f(yk + 110 - j * 8)} ${f(s.x0 - 300)} ${f(yk + 200 - j * 18)}`;
    out.push({ kind: 'warm', i: j, exit, d: head + tail });
  }
  return out;
}

function bands(W: number) {
  const s = splice(W);
  return [
    { cls: 'band-ink', x: s.cx - 70, y: s.cy - 52, w: 26, h: 104 },
    { cls: 'band-gold', x: s.cx + 44, y: s.cy - 52, w: 26, h: 104 },
  ];
}

const tone = (s: Strand) => `${s.kind === 'cool' ? 'c' : 'w'}${s.i + 1}`;

/** Inner SVG markup of the splice for a W×H hero; `end` is where the exit strand stops (null: no exit strand). */
export function spliceSvg(W: number, H: number, end: Point | null): string {
  const st = strands(W, H, end);
  const sp = splice(W);
  const paths = st
    .map((s, n) => `<path class="strand t-${tone(s)} d${n}${s.exit ? ' exit' : ''}" d="${s.d}" pathLength="1"${s.exit ? '' : ' mask="url(#gv-fade)"'}/>`)
    .join('');
  // Strands passing over each band (alternate slots): short redraws with a field-coloured gap for over/under.
  const over = bands(W)
    .map((b, n) =>
      st
        .filter((_, k) => (k + n) % 2 === 0)
        .map((s) => {
          const y = sp.y(s.kind === 'cool' ? 2 * s.i : 2 * s.i + 1);
          const d = `M${f(b.x - 6)} ${f(y)} H${f(b.x + b.w + 6)}`;
          return `<path class="gap" d="${d}"/><path class="over t-${tone(s)}" d="${d}"/>`;
        })
        .join(''),
    )
    .join('');
  const rects = bands(W)
    .map((b) => `<rect class="${b.cls}" x="${f(b.x)}" y="${f(b.y)}" width="${b.w}" height="${b.h}" rx="5"/>`)
    .join('');
  return (
    `<defs><linearGradient id="gv-fadeg" gradientUnits="userSpaceOnUse" x1="${f(sp.x0 - 300)}" y1="0" x2="${f(sp.x0 - 30)}" y2="0">` +
    `<stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>` +
    `<mask id="gv-fade" maskUnits="userSpaceOnUse" x="0" y="-40" width="${W}" height="${H + 80}"><rect x="0" y="-40" width="${W}" height="${H + 80}" fill="url(#gv-fadeg)"/></mask></defs>` +
    `<g class="strands">${paths}</g>${rects}<g class="overs">${over}</g>`
  );
}
