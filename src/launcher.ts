#!/usr/bin/env node

import { runServer } from './runServer.js';
import { SERVER_TOOLSETS, type ToolsetId } from './serverToolsets.js';

function resolveToolsetFromEnv(): ToolsetId {
  const candidate = process.env.MCP_SERVER_VARIANT?.trim().toLowerCase() as ToolsetId | undefined;
  if (!candidate) return 'workspace';
  if (candidate in SERVER_TOOLSETS) return candidate;
  throw new Error(
    `Invalid MCP_SERVER_VARIANT "${process.env.MCP_SERVER_VARIANT}". Expected one of: ${Object.keys(SERVER_TOOLSETS).join(', ')}.`
  );
}

await runServer(resolveToolsetFromEnv());
