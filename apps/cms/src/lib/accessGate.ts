import { accessConfigFromEnv, verifyAccessJwt, ACCESS_HEADER, type AccessResult } from './accessJwt';
import type { JWTVerifyGetKey } from 'jose';

/** Liveness: answered by the proxy itself, so it says only that the process is up. */
export const HEALTH_PATH = '/healthz';
/** Readiness: a route handler (app/readyz) that checks Payload and the database. Not behind Access, like HEALTH_PATH. */
export const READY_PATH = '/readyz';

export type GateDecision = { action: 'pass' } | { action: 'health' } | { action: 'deny'; status: 401 | 403 | 503; reason: string };

export type GateInput = {
  pathname: string;
  assertion: string | null;
  env: Record<string, string | undefined>;
  keys?: JWTVerifyGetKey;
};

/**
 * Decides what the proxy does with a request.
 *
 * - Outside production the gate is open, so `pnpm dev` and the local agent checks work.
 * - In production it fails closed: a missing team domain or AUD denies everything but `/healthz`.
 */
export async function decide(input: GateInput): Promise<GateDecision> {
  if (input.pathname === HEALTH_PATH) return { action: 'health' };
  // The kubelet cannot present an Access assertion. The handler returns no data, only ok or not ok.
  if (input.pathname === READY_PATH) return { action: 'pass' };
  if (input.env.NODE_ENV !== 'production') return { action: 'pass' };
  const result: AccessResult = await verifyAccessJwt(input.assertion, accessConfigFromEnv(input.env), input.keys);
  if (result.ok) return { action: 'pass' };
  return { action: 'deny', status: result.status, reason: result.reason };
}

export { ACCESS_HEADER };
