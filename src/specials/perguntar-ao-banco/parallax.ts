// NL→SQL special (S6): pointer parallax on the hero's glass stack, ±4°. Decorative only: fine pointers, off under
// reduced motion; without JS the stack simply stays still.
const hero = document.querySelector<HTMLElement>('[data-hero]');
const stack = document.querySelector<HTMLElement>('[data-stack]');
const fine = matchMedia('(pointer: fine)');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

if (hero && stack) {
  const set = (x: number, y: number) => {
    stack.style.setProperty('--px', x.toFixed(3));
    stack.style.setProperty('--py', y.toFixed(3));
  };
  hero.addEventListener('pointermove', (e) => {
    if (!fine.matches || reduce.matches) return;
    const r = hero.getBoundingClientRect();
    set(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
  });
  hero.addEventListener('pointerleave', () => set(0, 0));
  reduce.addEventListener('change', () => set(0, 0));
}
