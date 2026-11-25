// firebase.json (1B-03): security headers on every path and exactly one Cache-Control rule per path.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IMAGE_HOSTS } from '../src/lib/labels';

const hosting = JSON.parse(readFileSync(resolve(import.meta.dirname, '../firebase.json'), 'utf8')).hosting;

// Only the two shapes used here: a `regex` rule, or a `source` glob that is a literal prefix + `/**`.
function matches(rule, path) {
  if (rule.regex) return new RegExp(rule.regex).test(path);
  if (rule.source === '**') return true;
  if (rule.source.endsWith('/**')) return path.startsWith(rule.source.slice(0, -2));
  throw new Error(`unsupported source in test: ${rule.source}`);
}

function headersFor(path) {
  return hosting.headers.filter((r) => matches(r, path)).flatMap((r) => r.headers);
}

function csp() {
  const value = headersFor('/').find((h) => h.key === 'Content-Security-Policy')?.value ?? '';
  return Object.fromEntries(
    value.split(';').map((d) => d.trim().split(/\s+/)).map(([name, ...sources]) => [name, sources]),
  );
}

describe('firebase.json', () => {
  it('keeps the site binding and clean URLs without trailing slashes', () => {
    expect(hosting.site).toBe('linkedia');
    expect(hosting.public).toBe('dist');
    expect(hosting.cleanUrls).toBe(true);
    expect(hosting.trailingSlash).toBe(false);
    expect(hosting.rewrites).toBeUndefined(); // static files only, no SPA fallback
    // The only redirects: the old /capas addresses (D-069), one short link the owner asked for (D-072) and the two
    // v1 category slugs merged into "IA na prática" (V2-05, D-084), with or without .html or a trailing slash, then
    // the project guide's move to its own site (V2-02b, 302 while validating; tests/governaproj-redirect.test.mjs),
    // then the AI guide's (V2-13b, same; tests/governaia-redirect.test.mjs).
    const rules = hosting.redirects.map((r) => ({ ...r, re: new RegExp(r.regex) }));
    const [archive, cover, meta, categories] = rules;
    const gproj = rules.slice(4, 7);
    const gia = rules.slice(7);
    expect(hosting.redirects).toHaveLength(9);
    expect(gia.every((r) => r.destination.startsWith('https://governaia.web.app/'))).toBe(true);
    expect([archive, cover, meta, categories].every((r) => r.type === 301)).toBe(true);
    expect(categories.destination).toBe('/categorias/ia-na-pratica');
    for (const slug of ['engenharia-de-ia', 'conhecimento-de-ia']) {
      for (const path of [`/categorias/${slug}`, `/categorias/${slug}/`, `/categorias/${slug}.html`]) {
        expect(categories.re.test(path), path).toBe(true);
      }
    }
    // No loop and no other category: the target and the kept or new slugs are served as pages.
    for (const path of ['/categorias/ia-na-pratica', '/categorias/lideranca-de-ia', '/categorias/engenharia-de-iax', '/categorias/x/engenharia-de-ia']) {
      expect(hosting.redirects.some((r) => new RegExp(r.regex).test(path)), path).toBe(false);
    }
    expect(gproj.every((r) => r.destination.startsWith('https://governaproj.web.app/'))).toBe(true);
    for (const path of ['/capas', '/capas/', '/capas.html']) expect(archive.re.test(path), path).toBe(true);
    for (const path of ['/capas/x', '/capas/x/', '/capas/x.html']) {
      expect(path.replace(cover.re, cover.destination.replace(':1', '$1')), path).toBe('/visual/x');
    }
    for (const path of ['/capasx', '/visual', '/capas/x/y']) {
      expect(archive.re.test(path) || cover.re.test(path), path).toBe(false);
    }
    const long = '/materias/meta-volta-aos-pesos-abertos-o-que-muda-para-quem-escolhe-modelo';
    expect(meta.destination).toBe(long);
    for (const path of ['/materias/meta-volta-aos-0013', '/materias/meta-volta-aos-0013/', '/materias/meta-volta-aos-0013.html']) {
      expect(meta.re.test(path), path).toBe(true);
    }
    for (const path of ['/materias/meta-volta-aos-00130', '/materias/meta-volta-aos-0014', long]) {
      expect(meta.re.test(path), path).toBe(false);
    }
  });

  it('sends a strict CSP that allows only same-origin scripts, styles and images, with no inline-script hash', () => {
    const p = csp();
    expect(p['default-src']).toEqual(["'none'"]);
    // Same-origin files only: the reading mode's pre-paint script is the file /modo.js (V2-06), so the hash the
    // retired theme script needed (1C-01) is gone and no inline script can run.
    expect(p['script-src']).toEqual(["'self'"]);
    expect(p['style-src']).toEqual(["'self'"]);
    expect(p['frame-ancestors']).toEqual(["'none'"]);
    expect(p['base-uri']).toEqual(["'none'"]);
    expect(p['form-action']).toEqual(["'none'"]);
    expect(JSON.stringify(p)).not.toMatch(/unsafe-|\*|data:/);
    // Image hosts allowed by the renderer must also be allowed by the CSP.
    for (const host of IMAGE_HOSTS) expect(p['img-src']).toContain(`https://${host}`);
  });

  it.each(['/', '/materias/exemplo', '/edicoes/2026-10-14', '/404.html', '/_astro/Base.css', '/modo.js'])(
    'sends the security headers on %s',
    (path) => {
      const keys = headersFor(path).map((h) => h.key);
      for (const key of [
        'Content-Security-Policy',
        'X-Content-Type-Options',
        'Referrer-Policy',
        'X-Frame-Options',
        'Permissions-Policy',
      ]) {
        expect(keys).toContain(key);
      }
    },
  );

  it.each([
    ['/', 'public, max-age=300, s-maxage=86400'],
    ['/materias/exemplo', 'public, max-age=300, s-maxage=86400'],
    ['/edicoes', 'public, max-age=300, s-maxage=86400'],
    ['/404.html', 'public, max-age=300, s-maxage=86400'],
    // A stable name, not hashed: a fix to the mode bootstrap reaches readers within 5 minutes (V2-06).
    ['/modo.js', 'public, max-age=300, s-maxage=86400'],
    ['/_astro/Base.Dxpvqxi0.css', 'public, max-age=31536000, immutable'],
    ['/_astro/a/b.js', 'public, max-age=31536000, immutable'],
  ])('gives %s exactly one Cache-Control', (path, expected) => {
    const values = headersFor(path).filter((h) => h.key === 'Cache-Control').map((h) => h.value);
    expect(values).toEqual([expected]);
  });
});
