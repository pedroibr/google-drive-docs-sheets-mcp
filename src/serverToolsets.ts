import type { FastMCP } from 'fastmcp';
import { registerCalendarTools } from './tools/calendar/index.js';
import { registerDocsTools } from './tools/docs/index.js';
import { registerDriveTools } from './tools/drive/index.js';
import { registerGmailTools } from './tools/gmail/index.js';
import { registerSheetsTools } from './tools/sheets/index.js';
import { registerSlidesTools } from './tools/slides/index.js';
import { registerUtilsTools } from './tools/utils/index.js';

export type ToolsetId =
  | 'workspace'
  | 'calendar'
  | 'docs'
  | 'drive'
  | 'gmail'
  | 'sheets'
  | 'slides';

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
  registerCalendarTools(server);
  registerDocsProductTools(server);
  registerDriveTools(server);
  registerGmailTools(server);
  registerSheetsTools(server);
  registerSlidesTools(server);
}

export const SERVER_TOOLSETS: Record<ToolsetId, ServerToolsetConfig> = {
  workspace: {
    id: 'workspace',
    cliName: 'google-docs-mcp',
    serverName: 'Google Workspace MCP Server',
    landingTitle: 'Google Workspace MCP Server',
    landingSubtitle:
      'Model Context Protocol server for Google Calendar, Docs, Drive, Gmail, Sheets and Slides',
    configKey: 'google-workspace',
    registerTools: registerWorkspaceTools,
  },
  calendar: {
    id: 'calendar',
    cliName: 'google-calendar-mcp',
    serverName: 'Google Calendar MCP Server',
    landingTitle: 'Google Calendar MCP Server',
    landingSubtitle: 'Model Context Protocol server for Google Calendar scheduling workflows',
    configKey: 'google-calendar',
    registerTools: registerCalendarTools,
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
  gmail: {
    id: 'gmail',
    cliName: 'google-gmail-mcp',
    serverName: 'Google Gmail MCP Server',
    landingTitle: 'Google Gmail MCP Server',
    landingSubtitle: 'Model Context Protocol server for Google Gmail mailbox workflows',
    configKey: 'google-gmail',
    registerTools: registerGmailTools,
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
