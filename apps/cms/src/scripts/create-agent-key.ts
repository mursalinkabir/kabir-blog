/**
 * Creates (or finds) the AI agent's user and issues an MCP key for it. Run once per agent:
 *
 *   pnpm --filter @smkabir/cms agent-key                       local: writes AGENT_MCP_KEY to .dev-credentials
 *   AGENT_EMAIL=agent@example.org AGENT_LABEL="Claude Code" pnpm --filter @smkabir/cms agent-key
 *
 * The key is shown ONCE. It is stored hashed (HMAC with PAYLOAD_SECRET), so it cannot be read back: issue a new one
 * and delete the old (MCP > API keys in the admin) to rotate. The user is created with the `agent` role, which is
 * what limits what the key can do (src/access, src/hooks/agentGuards.ts).
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPayload } from 'payload';
import config from '../payload.config';

const email = process.env.AGENT_EMAIL ?? 'agent@smkabir.test';
const label = process.env.AGENT_LABEL ?? 'AI agent';

try {
  const payload = await getPayload({ config });

  const found = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, overrideAccess: true });
  let user = found.docs[0];
  if (user && user.role !== 'agent') throw new Error(`${email} exists and is a ${user.role}, not an agent. Use another AGENT_EMAIL.`);
  if (!user) {
    user = await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: { email, name: label, role: 'agent', password: crypto.randomBytes(24).toString('base64url') } as never,
    });
    console.log(`created agent user ${email}`);
  }

  const key = crypto.randomBytes(32).toString('hex');
  await payload.create({
    collection: 'payload-mcp-api-keys',
    overrideAccess: true,
    // `user` cannot be set through the API on purpose (field access), so it is set here with overrideAccess.
    data: { user: user.id, label, description: 'Created by agent-key', enableAPIKey: true, apiKey: key } as never,
  });

  const host = new URL(process.env.DATABASE_URL ?? 'postgres://x@invalid').hostname;
  if (['localhost', '127.0.0.1'].includes(host)) {
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.dev-credentials');
    const old = await fs.readFile(file, 'utf8').catch(() => '');
    const kept = old.split('\n').filter((l) => l && !l.startsWith('AGENT_MCP_KEY='));
    await fs.writeFile(file, [...kept, `AGENT_MCP_KEY=${key}`].join('\n') + '\n', { mode: 0o600 });
    console.log('wrote AGENT_MCP_KEY to apps/cms/.dev-credentials');
  } else {
    console.log("MCP key (shown once, store it in your agent's secret store):");
    console.log(key);
  }
} catch (error) {
  console.error(error);
  process.exit(1); // payload's runner would otherwise exit 0
}
