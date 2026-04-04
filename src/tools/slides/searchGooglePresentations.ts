import type { FastMCP } from 'fastmcp';
import { registerSearchByMimeType } from '../drive/discoveryAliasHelpers.js';

export function register(server: FastMCP) {
  registerSearchByMimeType(server, {
    toolName: 'searchPresentations',
    mimeType: 'application/vnd.google-apps.presentation',
    singularLabel: 'presentation',
    pluralLabel: 'presentations',
    preferredListTool: 'listDriveFiles',
    preferredSearchTool: 'searchDriveFiles',
    preferredMimeAlias: 'slides',
  });
}
