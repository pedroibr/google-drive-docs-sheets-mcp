import type { FastMCP } from 'fastmcp';
import { registerDocsTools } from './tools/docs/index.js';
import { registerDriveTools } from './tools/drive/index.js';
import { registerSheetsTools } from './tools/sheets/index.js';
import { registerSlidesTools } from './tools/slides/index.js';
import { registerUtilsTools } from './tools/utils/index.js';

export type ToolsetId = 'workspace' | 'docs' | 'drive' | 'sheets' | 'slides';

export interface ServerToolsetConfig {
  id: ToolsetId;
  cliName: string;
  serverName: string;
  landingTitle: string;
  landingSubtitle: string;
  configKey: string;
  registerTools: (server: FastMCP) => void;
}

function registerDocsProductTools(server: FastMCP) {
  registerDocsTools(server);
  registerUtilsTools(server);
}

function registerWorkspaceTools(server: FastMCP) {
  registerDocsProductTools(server);
  registerDriveTools(server);
  registerSheetsTools(server);
  registerSlidesTools(server);
}

export const SERVER_TOOLSETS: Record<ToolsetId, ServerToolsetConfig> = {
  workspace: {
    id: 'workspace',
    cliName: 'google-docs-mcp',
    serverName: 'Google Workspace MCP Server',
    landingTitle: 'Google Workspace MCP Server',
    landingSubtitle: 'Model Context Protocol server for Google Docs, Drive, Sheets and Slides',
    configKey: 'google-workspace',
    registerTools: registerWorkspaceTools,
  },
  docs: {
    id: 'docs',
    cliName: 'google-docs-only-mcp',
    serverName: 'Google Docs MCP Server',
    landingTitle: 'Google Docs MCP Server',
    landingSubtitle: 'Model Context Protocol server for Google Docs document workflows',
    configKey: 'google-docs',
    registerTools: registerDocsProductTools,
  },
  drive: {
    id: 'drive',
    cliName: 'google-drive-mcp',
    serverName: 'Google Drive MCP Server',
    landingTitle: 'Google Drive MCP Server',
    landingSubtitle: 'Model Context Protocol server for Google Drive file and folder workflows',
    configKey: 'google-drive',
    registerTools: registerDriveTools,
  },
  sheets: {
    id: 'sheets',
    cliName: 'google-sheets-mcp',
    serverName: 'Google Sheets MCP Server',
    landingTitle: 'Google Sheets MCP Server',
    landingSubtitle: 'Model Context Protocol server for Google Sheets data workflows',
    configKey: 'google-sheets',
    registerTools: registerSheetsTools,
  },
  slides: {
    id: 'slides',
    cliName: 'google-slides-mcp',
    serverName: 'Google Slides MCP Server',
    landingTitle: 'Google Slides MCP Server',
    landingSubtitle: 'Model Context Protocol server for Google Slides presentation workflows',
    configKey: 'google-slides',
    registerTools: registerSlidesTools,
  },
};
