// The bridge must send the Cloudflare Access service-token headers AND the MCP key, and refuse half a token.
// Uses a throwaway local server that records the request headers; no real CMS or Cloudflare involved.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bridge = fileURLToPath(new URL('./mcp-stdio-bridge.mjs', import.meta.url));
const seen = [];
const server = createServer((req, res) => {
  seen.push(req.headers);
  res.statusCode = 401; // enough: the bridge only has to send its headers
  res.end('{}');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/api/mcp`;

const run = (env) =>
  new Promise((resolve) => {
    const p = spawn(process.execPath, [bridge], { env: { PATH: process.env.PATH, MCP_URL: url, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } },
      }) + '\n',
    );
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
    setTimeout(() => {
      p.kill();
      resolve({ err, code: p.exitCode });
    }, 2500);
  });

let pass = 0;
let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        ${detail}`);
  }
};

await run({ MCP_KEY: 'k'.repeat(64), CF_ACCESS_CLIENT_ID: 'abc.access', CF_ACCESS_CLIENT_SECRET: 'sekrit' });
const h = seen.at(-1) ?? {};
ok('sends the MCP key as a bearer token', h.authorization === `Bearer ${'k'.repeat(64)}`, JSON.stringify(Object.keys(h)));
ok('sends the Access service token headers', h['cf-access-client-id'] === 'abc.access' && h['cf-access-client-secret'] === 'sekrit');

seen.length = 0;
await run({ MCP_KEY: 'k'.repeat(64) });
ok('sends no Access headers when none are configured (local CMS)', !('cf-access-client-id' in (seen.at(-1) ?? {})));

const half = await run({ MCP_KEY: 'k', CF_ACCESS_CLIENT_ID: 'only-the-id' });
ok('refuses half a service token', /both CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET/.test(half.err), half.err);

server.close();
console.log(`\nbridge header checks: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
