import { describe, expect, it } from 'vitest';
import { decide, hostKind } from '../src/lib/accessGate';

const prod = { NODE_ENV: 'production', SITE_PUBLIC_HOSTS: 'smkabir.com' };
const d = (host: string | null, pathname: string, env: Record<string, string | undefined> = prod) =>
  decide({ host, pathname, assertion: null, env });

describe('hostKind', () => {
  it.each(['smkabir.com', 'SMKABIR.COM', 'smkabir.com:443', 'smkabir.com.'])('%s is public', (h) =>
    expect(hostKind(h, prod)).toBe('public'),
  );
  it.each([null, '', 'cms.smkabir.com', 'evil.com', 'smkabir.com.evil.com', '10.0.0.5'])('%s is cms', (h) =>
    expect(hostKind(h, prod)).toBe('cms'),
  );
  it('defaults to smkabir.com when SITE_PUBLIC_HOSTS is unset', () =>
    expect(hostKind('smkabir.com', { NODE_ENV: 'production' })).toBe('public'));
});

describe('decide on the public host', () => {
  it('serves pages without an Access assertion', async () => expect(await d('smkabir.com', '/posts/x/')).toEqual({ action: 'pass' }));
  it.each(['/admin', '/admin/', '/ADMIN/login', '/api/mcp', '/Api/posts', '/preview/posts/x/'])('answers 404 for %s', async (p) =>
    expect(await d('smkabir.com', p)).toMatchObject({ action: 'deny', status: 404 }),
  );
  it.each(['/administrator/', '/apiary/', '/previews/'])('%s is an ordinary page path', async (p) =>
    expect(await d('smkabir.com', p)).toEqual({ action: 'pass' }),
  );
  it.each(['SMKABIR.COM:443', 'smkabir.com.'])('host variant %s is still public and still hides /admin', async (h) =>
    expect(await d(h, '/admin')).toMatchObject({ action: 'deny', status: 404 }),
  );
});

describe('decide on any other host', () => {
  it.each(['cms.smkabir.com', 'unknown.example', null])('host %s needs Access for every path', async (h) => {
    expect(await d(h, '/')).toMatchObject({ action: 'deny' });
    expect(await d(h, '/admin')).toMatchObject({ action: 'deny' });
  });
  it('health and ready answer on any host', async () => {
    expect(await d('smkabir.com', '/healthz')).toEqual({ action: 'health' });
    expect(await d(null, '/readyz')).toEqual({ action: 'pass' });
  });
  it('outside production everything passes', async () =>
    expect(await d('smkabir.com', '/admin', { NODE_ENV: 'development' })).toEqual({ action: 'pass' }));
});
