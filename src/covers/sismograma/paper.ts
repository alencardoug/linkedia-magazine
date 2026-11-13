// The paper of the "Sismograma" sheet: analogue grain on its own canvas under the art, painted once per resize from a
// small random tile and nudged a pixel or two now and then (main.ts). The scanlines, the vignette and the rolling
// band are CSS (cover.css).

/** The grain canvas is this much larger than the viewport on every side, so a nudge never shows an edge. */
export const GRAIN_MARGIN = 4;
export const GRAIN_STEP_MS = 140;
const TILE = 192;
const MAX_ALPHA = 0.07;

/** Fills the canvas (CSS pixels, one backing pixel each) with dark and light specks. False without Canvas 2D. */
export function paintGrain(canvas: HTMLCanvasElement, width: number, height: number, random: () => number): boolean {
  const tile = document.createElement('canvas');
  tile.width = TILE;
  tile.height = TILE;
  const tg = tile.getContext('2d');
  if (!tg) return false;
  const image = tg.createImageData(TILE, TILE);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const dark = random() < 0.62;
    d[i] = dark ? 40 : 255;
    d[i + 1] = dark ? 32 : 250;
    d[i + 2] = dark ? 10 : 236;
    d[i + 3] = Math.round(random() * MAX_ALPHA * 255);
  }
  tg.putImageData(image, 0, 0);
  canvas.width = Math.ceil(width) + 2 * GRAIN_MARGIN;
  canvas.height = Math.ceil(height) + 2 * GRAIN_MARGIN;
  const g = canvas.getContext('2d');
  const pattern = g?.createPattern(tile, 'repeat');
  if (!g || !pattern) return false;
  g.fillStyle = pattern;
  g.fillRect(0, 0, canvas.width, canvas.height);
  return true;
}

/** The nudge of step `k`: both offsets within ±2 px, never the same twice in a row. */
export const grainShift = (k: number): [number, number] => [((k * 7) % 5) - 2, ((k * 3 + 1) % 5) - 2];
