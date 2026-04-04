import type { FastMCP } from 'fastmcp';
import { registerListByMimeType } from '../drive/discoveryAliasHelpers.js';

export function register(server: FastMCP) {
  registerListByMimeType(server, {
    toolName: 'listPresentations',
    mimeType: 'application/vnd.google-apps.presentation',
    singularLabel: 'presentation',
    pluralLabel: 'presentations',
    preferredListTool: 'listDriveFiles',
    preferredSearchTool: 'searchDriveFiles',
    preferredMimeAlias: 'slides',
  });
}
