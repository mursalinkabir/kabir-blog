import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render, renderEmbeds, TARGET, EMBED_TARGET, SOURCE } from '../../server/scripts/render-headers.mjs';

describe('nginx security headers', () => {
  it('the committed snippet is exactly what security-headers.json renders to (no drift)', () => {
    const rendered = render(JSON.parse(readFileSync(SOURCE, 'utf8')));
    expect(readFileSync(TARGET, 'utf8')).toBe(rendered);
  });

  it('emits every header with `always`, so error pages carry them too', () => {
    const out: string = render({ 'X-Test': 'a', 'Content-Security-Policy': "default-src 'self'" });
    const lines = out.split('\n').filter((l) => l.startsWith('add_header'));
    expect(lines).toHaveLength(2);
    for (const l of lines) expect(l.endsWith('always;')).toBe(true);
  });

  it('cannot be used to inject nginx config or response splitting', () => {
    expect(() => render({ 'X-A': 'v\r\nSet-Cookie: x=1' })).toThrow(/line break/);
    expect(() => render({ 'Bad Name': 'v' })).toThrow(/bad header name/);
    const quoted: string = render({ 'X-A': 'say "hi" $host \\' });
    expect(quoted).toContain('add_header X-A "say \\"hi\\" \\$host \\\\" always;');
  });

  it('skips underscore keys such as _comment', () => {
    expect(render({ _comment: 'note', 'X-A': '1' })).not.toContain('_comment');
  });
});

describe('embed headers (author HTML with inline script)', () => {
  const json = JSON.parse(readFileSync(SOURCE, 'utf8'));
  const csp: string = json.embeds['Content-Security-Policy'];

  it('the committed embed snippet matches security-headers.json', () => {
    expect(readFileSync(EMBED_TARGET, 'utf8')).toBe(renderEmbeds(json));
  });

  it('keeps the three guarantees that make inline script safe on the site origin', () => {
    expect(csp).toMatch(/(^|;)\s*sandbox allow-scripts(;|$)/); // opaque origin even when opened directly
    expect(csp).not.toContain('allow-same-origin');
    expect(csp).toContain("connect-src 'none'"); // nothing can be sent anywhere
    expect(csp).toContain("default-src 'none'"); // and no remote scripts, styles, fonts or frames
  });

  it('is the only place inline script is allowed: the page policy stays strict', () => {
    const page: string = json['Content-Security-Policy'];
    expect(page).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(page).toContain("frame-src 'self'");
    expect(page).toContain("frame-ancestors 'none'");
  });

  it('refuses to render a policy that lost a guarantee', () => {
    const weaken = (csp: string) => ({ embeds: { 'Content-Security-Policy': csp } });
    expect(() => renderEmbeds(weaken("default-src 'none'; connect-src 'none'"))).toThrow(/sandbox/);
    expect(() => renderEmbeds(weaken("sandbox allow-scripts allow-same-origin; connect-src 'none'"))).toThrow(/same-origin/);
    expect(() => renderEmbeds(weaken('sandbox allow-scripts; connect-src *'))).toThrow(/connect-src/);
    expect(() => renderEmbeds({})).toThrow(/no `embeds`/);
  });

  it('does not leak the nested set into the page headers', () => {
    expect(render(json)).not.toContain('X-Robots-Tag');
    expect(render(json)).not.toContain('embeds');
  });
});
