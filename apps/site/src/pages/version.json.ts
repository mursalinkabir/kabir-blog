// CI sets BUILD_ID (<sha>-<run_id>); the content pods and the verify step compare against it.
// An unset id in CI would let a release verify itself, so that case fails the build.
const buildId = process.env.BUILD_ID;
if (!buildId && process.env.CI) throw new Error('BUILD_ID must be set in CI (version.json is what the verify step polls).');

export const GET = () =>
  new Response(JSON.stringify({ build_id: buildId ?? `dev-${Date.now()}`, builtAt: new Date().toISOString() }) + '\n', {
    headers: { 'Content-Type': 'application/json' },
  });
