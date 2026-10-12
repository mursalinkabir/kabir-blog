#!/usr/bin/env node
// Registers the stdio bridge with Claude Desktop (merging into its config, with a backup) and prints the Claude Code
// command. Neither config receives the key: the bridge reads it from apps/cms/.dev-credentials.
//
//   node scripts/install-claude-clients.mjs            add / update the "kabir-blog" server in Claude Desktop
//   node scripts/install-claude-clients.mjs --remove   take it out again
//
// Quit and reopen Claude Desktop afterwards (it reads its config at start).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'kabir-blog';
// The stable `node` on PATH (for Homebrew a symlink that survives upgrades), not the versioned Cellar path that
// process.execPath resolves to. A GUI app does not inherit the shell's PATH, so the path is written out in full.
const nodeBin = (() => {
  try {
    return execFileSync('/bin/sh', ['-c', 'command -v node'], { encoding: 'utf8' }).trim() || process.execPath;
  } catch {
    return process.execPath;
  }
})();
const bridge = fileURLToPath(new URL('./mcp-stdio-bridge.mjs', import.meta.url));
const configPath = join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
if (process.platform !== 'darwin') {
  console.log(`Claude Desktop config on this platform: see the Claude Desktop docs. Server entry to add under "mcpServers":`);
}

const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
config.mcpServers ??= {};

if (process.argv.includes('--remove')) {
  delete config.mcpServers[NAME];
} else {
  config.mcpServers[NAME] = { command: nodeBin, args: [bridge], env: { MCP_URL: 'http://localhost:3100/api/mcp' } };
}

if (existsSync(configPath)) copyFileSync(configPath, `${configPath}.bak-${Date.now()}`);
const tmp = `${configPath}.tmp`;
writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n');
renameSync(tmp, configPath);

console.log(process.argv.includes('--remove') ? `removed "${NAME}" from ${configPath}` : `added "${NAME}" to ${configPath}`);
console.log('Other servers in that file were left as they were; a timestamped backup sits next to it.');
console.log('\nClaude Code (run once, from any directory):');
console.log(`  claude mcp add --scope user ${NAME} -- ${nodeBin} ${bridge}`);
