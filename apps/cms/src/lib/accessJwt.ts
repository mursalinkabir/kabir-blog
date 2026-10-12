import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

/**
 * Cloudflare Access puts a signed JWT in the `Cf-Access-Jwt-Assertion` header of every request
 * it lets through. The CMS verifies it itself, so a route that bypasses Access (a mistaken
 * tunnel route, a port-forward) still cannot reach the admin or the API.
 */

export const ACCESS_HEADER = 'cf-access-jwt-assertion';

export type AccessConfig = {
  /** `<team>.cloudflareaccess.com` — the Zero Trust team domain. */
  teamDomain: string;
  /** The Access application's AUD tag. */
  audience: string;
};

export type AccessResult = { ok: true; identity: string } | { ok: false; status: 401 | 403 | 503; reason: string };

/** Reads the config from the environment. Returns null when either value is missing. */
export function accessConfigFromEnv(env: Record<string, string | undefined>): AccessConfig | null {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN?.trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  const audience = env.CF_ACCESS_AUD?.trim();
  if (!teamDomain || !audience) return null;
  return { teamDomain, audience };
}

export function issuerFor(config: AccessConfig): string {
  return `https://${config.teamDomain}`;
}

export function certsUrlFor(config: AccessConfig): URL {
  return new URL(`https://${config.teamDomain}/cdn-cgi/access/certs`);
}

const remoteKeys = new Map<string, JWTVerifyGetKey>();

/** One cached remote key set per team domain; jose refetches when it meets an unknown `kid`. */
export function remoteKeySet(config: AccessConfig): JWTVerifyGetKey {
  let keys = remoteKeys.get(config.teamDomain);
  if (!keys) {
    keys = createRemoteJWKSet(certsUrlFor(config), { cooldownDuration: 30_000, timeoutDuration: 5_000 });
    remoteKeys.set(config.teamDomain, keys);
  }
  return keys;
}

/**
 * Verifies the assertion: RS256 signature against the team's keys, issuer, audience and expiry.
 * `keys` is injectable so tests can use a local key set.
 */
export async function verifyAccessJwt(
  token: string | null | undefined,
  config: AccessConfig | null,
  keys?: JWTVerifyGetKey,
): Promise<AccessResult> {
  if (!config) return { ok: false, status: 503, reason: 'Cloudflare Access is not configured' };
  if (!token) return { ok: false, status: 401, reason: 'missing Access assertion' };
  try {
    const { payload } = await jwtVerify(token, keys ?? remoteKeySet(config), {
      issuer: issuerFor(config),
      audience: config.audience,
      algorithms: ['RS256'],
    });
    // Users carry `email`; service tokens carry `common_name` (the client id) instead.
    const identity =
      typeof payload.email === 'string'
        ? payload.email
        : typeof payload.common_name === 'string'
          ? payload.common_name
          : typeof payload.sub === 'string' && payload.sub
            ? payload.sub
            : '';
    if (!identity) return { ok: false, status: 403, reason: 'assertion has no identity' };
    return { ok: true, identity };
  } catch (error) {
    const code = (error as { code?: string }).code ?? 'ERR_JWT_INVALID';
    return { ok: false, status: 403, reason: code };
  }
}
