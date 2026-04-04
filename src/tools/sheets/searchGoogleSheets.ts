import type { FastMCP } from 'fastmcp';
import { registerSearchByMimeType } from '../drive/discoveryAliasHelpers.js';

export function register(server: FastMCP) {
  registerSearchByMimeType(server, {
    toolName: 'searchSpreadsheets',
    mimeType: 'application/vnd.google-apps.spreadsheet',
    singularLabel: 'spreadsheet',
    pluralLabel: 'spreadsheets',
    preferredListTool: 'listDriveFiles',
    preferredSearchTool: 'searchDriveFiles',
    preferredMimeAlias: 'sheets',
  });
}
