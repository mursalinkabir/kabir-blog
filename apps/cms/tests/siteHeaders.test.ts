import { describe, expect, it } from 'vitest';
import { embedHeaders, pageHeaders } from '../src/site/headers';

const NONCE = 'abc123==';

describe('pageHeaders', () => {
  const csp = pageHeaders({ nonce: NONCE, env: {} })['Content-Security-Policy']!;
  it('allows scripts only from self, the nonce and the listed hosts', () => {
    expect(csp).toContain(`script-src 'self' 'nonce-${NONCE}'`);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-eval/);
    expect(csp).not.toContain('wasm-unsafe-eval');
    expect(csp).not.toContain('strict-dynamic');
  });
  it('allows unsafe-eval for scripts in development only', () => {
    expect(pageHeaders({ nonce: NONCE, env: { NODE_ENV: 'development' } })['Content-Security-Policy']).toMatch(
      /script-src[^;]*unsafe-eval/,
    );
  });
  it('is not cached by a shared cache', () =>
    expect(pageHeaders({ nonce: NONCE, env: {} })['Cache-Control']).toBe('public, max-age=0, must-revalidate'));
  it('preview is private, noindex and frameable by the same origin only', () => {
    const pv = pageHeaders({ nonce: NONCE, env: {}, preview: true });
    expect(pv['Cache-Control']).toBe('private, no-store');
    expect(pv['X-Robots-Tag']).toBe('noindex');
    expect(pv['Content-Security-Policy']).toContain("frame-ancestors 'self'");
  });
  it('adds the media origin to img-src only for a valid https URL', () => {
    const img = (v: string) =>
      /img-src[^;]*/.exec(pageHeaders({ nonce: NONCE, env: { MEDIA_PUBLIC_URL: v } })['Content-Security-Policy']!)![0];
    expect(img('https://media.example/x')).toContain('https://media.example');
    const base = img('');
    expect(img('javascript:1')).toBe(base);
    expect(img('"; script-src *')).toBe(base);
    expect(img('http://media.example')).toBe(base);
  });
  it('the embed policy has no connect-src other than none and no same-origin', () => {
    const e = embedHeaders()['Content-Security-Policy']!;
    expect(e).toContain("connect-src 'none'");
    expect(e).toContain('sandbox allow-scripts');
    expect(e).not.toContain('allow-same-origin');
  });
});
