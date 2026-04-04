import type { FastMCP } from 'fastmcp';
import { registerListByMimeType } from './discoveryAliasHelpers.js';

export function register(server: FastMCP) {
  registerListByMimeType(server, {
    toolName: 'listDocuments',
    mimeType: 'application/vnd.google-apps.document',
    singularLabel: 'document',
    pluralLabel: 'documents',
    preferredListTool: 'listDriveFiles',
    preferredSearchTool: 'searchDriveFiles',
    preferredMimeAlias: 'docs',
  });
}
