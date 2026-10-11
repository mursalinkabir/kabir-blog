import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render, TARGET, SOURCE } from '../../server/scripts/render-headers.mjs';

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
