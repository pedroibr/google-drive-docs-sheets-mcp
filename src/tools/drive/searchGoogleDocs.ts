import type { FastMCP } from 'fastmcp';
import { registerSearchByMimeType } from './discoveryAliasHelpers.js';

export function register(server: FastMCP) {
  registerSearchByMimeType(server, {
    toolName: 'searchDocuments',
    mimeType: 'application/vnd.google-apps.document',
    singularLabel: 'document',
    pluralLabel: 'documents',
    preferredListTool: 'listDriveFiles',
    preferredSearchTool: 'searchDriveFiles',
    preferredMimeAlias: 'docs',
  });
}
