/**
 * Every MCP tool an AI agent works with, served at /api/mcp by @payloadcms/plugin-mcp (see payload.config.ts).
 * One file per area; each tool is registered by name, and a key can switch single tools off in the admin.
 */
import { docTools } from './docs';
import { globalTools } from './globals';
import { guideTool } from './guide';
import { postTools } from './posts';
import { taxonomyTools } from './taxonomy';

export const agentTools = [guideTool, ...postTools, ...docTools, ...taxonomyTools, ...globalTools];
