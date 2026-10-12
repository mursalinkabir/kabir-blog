import { beforeAll, describe, expect, it } from 'vitest';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type JWTVerifyGetKey } from 'jose';
import { accessConfigFromEnv, verifyAccessJwt, type AccessConfig } from '../src/lib/accessJwt';
import { decide } from '../src/lib/accessGate';

const config: AccessConfig = { teamDomain: 'example-team.cloudflareaccess.com', audience: 'aud-tag-123' };

let keys: JWTVerifyGetKey;
let sign: (claims?: Record<string, unknown>, opts?: { iss?: string; aud?: string; exp?: string | number; alg?: string }) => Promise<string>;
let foreignSign: () => Promise<string>;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  keys = createLocalJWKSet({ keys: [jwk] });
  sign = (claims = { email: 'editor@example.com' }, opts = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(opts.iss ?? `https://${config.teamDomain}`)
      .setAudience(opts.aud ?? config.audience)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '5m')
      .sign(privateKey);
  const other = await generateKeyPair('RS256');
  foreignSign = () =>
    new SignJWT({ email: 'editor@example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(`https://${config.teamDomain}`)
      .setAudience(config.audience)
      .setExpirationTime('5m')
      .sign(other.privateKey);
});

describe('accessConfigFromEnv', () => {
  it('needs both values', () => {
    expect(accessConfigFromEnv({})).toBeNull();
    expect(accessConfigFromEnv({ CF_ACCESS_TEAM_DOMAIN: 'a.cloudflareaccess.com' })).toBeNull();
    expect(accessConfigFromEnv({ CF_ACCESS_AUD: 'x' })).toBeNull();
  });
  it('accepts the team domain with a scheme or trailing slash', () => {
    expect(accessConfigFromEnv({ CF_ACCESS_TEAM_DOMAIN: 'https://a.cloudflareaccess.com/', CF_ACCESS_AUD: 'x' })).toEqual({
      teamDomain: 'a.cloudflareaccess.com',
      audience: 'x',
    });
  });
});

describe('verifyAccessJwt', () => {
  it('accepts a user assertion and returns the email', async () => {
    expect(await verifyAccessJwt(await sign(), config, keys)).toEqual({ ok: true, identity: 'editor@example.com' });
  });
  it('accepts a service-token assertion (common_name)', async () => {
    const token = await sign({ common_name: 'abc.access' });
    expect(await verifyAccessJwt(token, config, keys)).toEqual({ ok: true, identity: 'abc.access' });
  });
  it('is not configured → 503', async () => {
    expect(await verifyAccessJwt(await sign(), null, keys)).toMatchObject({ ok: false, status: 503 });
  });
  it('missing token → 401', async () => {
    expect(await verifyAccessJwt(null, config, keys)).toMatchObject({ ok: false, status: 401 });
    expect(await verifyAccessJwt('', config, keys)).toMatchObject({ ok: false, status: 401 });
  });
  it('rejects the wrong audience', async () => {
    expect(await verifyAccessJwt(await sign(undefined, { aud: 'other-app' }), config, keys)).toMatchObject({
      ok: false,
      status: 403,
    });
  });
  it('rejects the wrong issuer', async () => {
    const token = await sign(undefined, { iss: 'https://evil.cloudflareaccess.com' });
    expect(await verifyAccessJwt(token, config, keys)).toMatchObject({ ok: false, status: 403 });
  });
  it('rejects an expired token', async () => {
    const token = await sign(undefined, { exp: Math.floor(Date.now() / 1000) - 120 });
    expect(await verifyAccessJwt(token, config, keys)).toMatchObject({ ok: false, status: 403, reason: 'ERR_JWT_EXPIRED' });
  });
  it('rejects a token signed by another key', async () => {
    expect(await verifyAccessJwt(await foreignSign(), config, keys)).toMatchObject({ ok: false, status: 403 });
  });
  it('rejects garbage and alg=none', async () => {
    expect(await verifyAccessJwt('not-a-jwt', config, keys)).toMatchObject({ ok: false, status: 403 });
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(
      JSON.stringify({ iss: `https://${config.teamDomain}`, aud: config.audience, email: 'a@b.c' }),
    ).toString('base64url')}.`;
    expect(await verifyAccessJwt(none, config, keys)).toMatchObject({ ok: false, status: 403 });
  });
  it('rejects a token with no identity claim', async () => {
    expect(await verifyAccessJwt(await sign({}), config, keys)).toMatchObject({ ok: false, status: 403 });
  });
});

describe('decide (the proxy policy)', () => {
  const prod = { NODE_ENV: 'production', CF_ACCESS_TEAM_DOMAIN: config.teamDomain, CF_ACCESS_AUD: config.audience };

  it('answers /healthz without an assertion, in any mode', async () => {
    expect(await decide({ pathname: '/healthz', assertion: null, env: prod })).toEqual({ action: 'health' });
    expect(await decide({ pathname: '/healthz', assertion: null, env: {} })).toEqual({ action: 'health' });
  });
  it('lets the readiness probe through without an assertion', async () => {
    expect(await decide({ pathname: '/readyz', assertion: null, env: prod, keys })).toEqual({ action: 'pass' });
  });
  it('is open outside production', async () => {
    expect(await decide({ pathname: '/admin', assertion: null, env: { NODE_ENV: 'development' } })).toEqual({ action: 'pass' });
  });
  it('denies in production without an assertion', async () => {
    expect(await decide({ pathname: '/admin', assertion: null, env: prod, keys })).toMatchObject({ action: 'deny', status: 401 });
    expect(await decide({ pathname: '/api/mcp', assertion: null, env: prod, keys })).toMatchObject({ action: 'deny', status: 401 });
  });
  it('fails closed in production when Access is not configured', async () => {
    const env = { NODE_ENV: 'production' };
    expect(await decide({ pathname: '/admin', assertion: await sign(), env, keys })).toMatchObject({ action: 'deny', status: 503 });
  });
  it('passes a valid assertion in production', async () => {
    expect(await decide({ pathname: '/admin', assertion: await sign(), env: prod, keys })).toEqual({ action: 'pass' });
  });
});
