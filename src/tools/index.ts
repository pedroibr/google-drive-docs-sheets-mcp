// src/tools/index.ts
import type { FastMCP } from 'fastmcp';
import { registerCalendarTools } from './calendar/index.js';
import { registerDocsTools } from './docs/index.js';
import { registerDriveTools } from './drive/index.js';
import { registerGmailTools } from './gmail/index.js';
import { registerSheetsTools } from './sheets/index.js';
import { registerSlidesTools } from './slides/index.js';
import { registerUtilsTools } from './utils/index.js';

export function registerAllTools(server: FastMCP) {
  registerCalendarTools(server);
  registerDocsTools(server);
  registerDriveTools(server);
  registerGmailTools(server);
  registerSheetsTools(server);
  registerSlidesTools(server);
  registerUtilsTools(server);
}
