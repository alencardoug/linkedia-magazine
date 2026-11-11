// Redraws the hero splice so the exit strand ends exactly where the "a ponte entre eles" underline starts, after the
// fonts load and on resize. Narrow screens (and forced colours) hide the drawing and keep the static strip.
import { spliceSvg } from './geometry';

export function initHero(): void {
  const hero = document.querySelector<HTMLElement>('.hero');
  const svg = document.querySelector<SVGSVGElement>('.threads');
  const phrase = document.querySelector<HTMLElement>('.ponte-phrase');
  if (!hero || !svg || !phrase) return;
  const wide = matchMedia('(min-width: 900px)');
  let drawn = false;

  const draw = () => {
    if (!wide.matches) return;
    const h = hero.getBoundingClientRect();
    const p = phrase.getBoundingClientRect();
    const W = Math.round(h.width);
    const H = Math.round(h.height);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.innerHTML = spliceSvg(W, H, { x: p.left - h.left, y: p.bottom - h.top + 5.5 });
    // The first redraw keeps the entrance running; later ones show the finished state at once.
    if (drawn) svg.classList.add('drawn');
    drawn = true;
  };

  let timer = 0;
  addEventListener('resize', () => {
    clearTimeout(timer);
    timer = window.setTimeout(draw, 120);
  });
  wide.addEventListener('change', draw);
  draw();
  document.fonts.ready.then(draw);
}
