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
  });

  it('sends a strict CSP that allows only same-origin scripts, styles and images', () => {
    const p = csp();
    expect(p['default-src']).toEqual(["'none'"]);
    expect(p['script-src']).toEqual(["'self'"]);
    expect(p['style-src']).toEqual(["'self'"]);
    expect(p['frame-ancestors']).toEqual(["'none'"]);
    expect(p['base-uri']).toEqual(["'none'"]);
    expect(p['form-action']).toEqual(["'none'"]);
    expect(JSON.stringify(p)).not.toMatch(/unsafe-|\*|data:/);
    // Image hosts allowed by the renderer must also be allowed by the CSP.
    for (const host of IMAGE_HOSTS) expect(p['img-src']).toContain(`https://${host}`);
  });

  it.each(['/', '/materias/exemplo', '/edicoes/2026-10-14', '/404.html', '/_astro/Base.css'])(
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
    ['/_astro/Base.Dxpvqxi0.css', 'public, max-age=31536000, immutable'],
    ['/_astro/a/b.js', 'public, max-age=31536000, immutable'],
  ])('gives %s exactly one Cache-Control', (path, expected) => {
    const values = headersFor(path).filter((h) => h.key === 'Cache-Control').map((h) => h.value);
    expect(values).toEqual([expected]);
  });
});
