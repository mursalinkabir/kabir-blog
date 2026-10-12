#!/usr/bin/env node
// A stdio MCP server that forwards to the CMS's HTTP endpoint (/api/mcp), for clients that launch local servers as
// subprocesses and cannot send an Authorization header themselves (Claude Desktop; also fine for Claude Code).
//
//   MCP_URL   default http://localhost:3100/api/mcp
//   CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET
//             a Cloudflare Access service token. Set both when MCP_URL is the production CMS (https://cms.smkabir.com/
//             api/mcp), which sits behind Access; they are sent as the CF-Access-Client-* headers.
//   MCP_KEY   the agent's MCP key. If unset, AGENT_MCP_KEY is read from apps/cms/.dev-credentials (git-ignored,
//             mode 0600), so the key never has to be written into a client's config file.
//
// stdout carries only protocol messages; everything else goes to stderr. It exposes exactly the tools the CMS lists
// for this key and adds none of its own, so the CMS stays the one place the rules live.
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const log = (...a) => console.error('[kabir-blog mcp bridge]', ...a);

function loadKey() {
  if (process.env.MCP_KEY) return process.env.MCP_KEY;
  try {
    const file = readFileSync(new URL('../.dev-credentials', import.meta.url), 'utf8');
    const line = file.split('\n').find((l) => l.startsWith('AGENT_MCP_KEY='));
    if (line) return line.slice('AGENT_MCP_KEY='.length).trim();
  } catch {}
  return undefined;
}

const url = process.env.MCP_URL ?? 'http://localhost:3100/api/mcp';
const accessId = process.env.CF_ACCESS_CLIENT_ID;
const accessSecret = process.env.CF_ACCESS_CLIENT_SECRET;
if (Boolean(accessId) !== Boolean(accessSecret)) {
  log('set both CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET, or neither');
  process.exit(1);
}
const headers = {
  ...(accessId ? { 'CF-Access-Client-Id': accessId, 'CF-Access-Client-Secret': accessSecret } : {}),
};
const key = loadKey();
if (!key) {
  log('no key: set MCP_KEY, or run `pnpm cms:agent-key` so AGENT_MCP_KEY is in apps/cms/.dev-credentials');
  process.exit(1);
}

let upstream;
async function connect() {
  if (upstream) return upstream;
  const client = new Client({ name: 'kabir-blog-bridge', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { ...headers, Authorization: `Bearer ${key}` } } }),
  );
  upstream = client;
  return client;
}

const server = new Server({ name: 'kabir-blog', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => {
  try {
    return await (await connect()).listTools();
  } catch (error) {
    upstream = undefined;
    log(`cannot list tools from ${url}: ${error.message}`);
    throw new Error(`The CMS at ${url} is not reachable (${error.message}). Start it with: pnpm cms:dev`);
  }
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    return await (await connect()).callTool(request.params);
  } catch (error) {
    upstream = undefined; // reconnect on the next call (the CMS may have restarted)
    return {
      content: [{ type: 'text', text: `ERROR: the CMS at ${url} did not answer (${error.message}). Is it running?` }],
      isError: true,
    };
  }
});

await server.connect(new StdioServerTransport());
log(`ready, forwarding to ${url}`);
