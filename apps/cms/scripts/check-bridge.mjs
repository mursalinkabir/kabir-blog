// The stdio bridge Claude Desktop and Claude Code launch: it must expose the CMS's tools unchanged and pass errors on.
// Needs the local CMS running and apps/cms/.dev-credentials (pnpm cms:agent-key).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

const bridge = fileURLToPath(new URL('./mcp-stdio-bridge.mjs', import.meta.url));
const client = new Client({ name: 'bridge-check', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [bridge], stderr: 'pipe' }));

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

const names = (await client.listTools()).tools.map((t) => t.name).sort();
ok(
  'the bridge exposes the nine CMS tools and nothing else',
  names.length === 9 && names.includes('publish_post') && names.includes('site_guide'),
  names.join(','),
);
const guide = await client.callTool({ name: 'site_guide', arguments: {} });
ok(
  'a tool call reaches the CMS and returns its answer',
  /auto-publishing is (ON|OFF)/.test(guide.content[0].text),
  guide.content[0].text.slice(0, 120),
);
let rejected = false;
try {
  const r = await client.callTool({
    name: 'create_draft',
    arguments: { language: 'en', title: 'x', description: 'y', slug: 'Bad Slug', category: 'tech', markdown: 'x' },
  });
  rejected = r.isError === true || /ERROR|Invalid/.test(r.content?.[0]?.text ?? '');
} catch {
  rejected = true;
}
ok('the CMS rejects invalid input and the bridge reports it', rejected);

await client.close();
console.log(`\nbridge checks: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
