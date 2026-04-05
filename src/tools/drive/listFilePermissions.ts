import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { getDriveClient } from '../../clients.js';
import { FileIdParameter } from '../../types.js';
import { dataResult } from '../../tooling.js';
import { DRIVE_PERMISSION_FIELDS, normalizeDrivePermission } from './permissionsCommon.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'listFilePermissions',
    description:
      'Lists access permissions for a Google Drive file or folder. Returns normalized permission objects for users, groups, and public links.',
    parameters: FileIdParameter,
    execute: async (args, { log }) => {
      const drive = await getDriveClient();
      log.info(`Listing permissions for file ${args.fileId}`);

      try {
        const response = await drive.permissions.list({
          fileId: args.fileId,
          fields: `permissions(${DRIVE_PERMISSION_FIELDS})`,
          supportsAllDrives: true,
        });

        const permissions = (response.data.permissions || []).map((permission) =>
          normalizeDrivePermission(permission)
        );

        return dataResult(
          {
            fileId: args.fileId,
            permissions,
            total: permissions.length,
          },
          `Listed ${permissions.length} permission(s) successfully.`
        );
      } catch (error: any) {
        log.error(`Error listing permissions for file ${args.fileId}: ${error.message || error}`);
        if (error.code === 404) throw new UserError('File or folder not found. Check the file ID.');
        if (error.code === 403) {
          throw new UserError(
            'Permission denied. Make sure you have access to inspect sharing on this file or folder.'
          );
        }
        throw new UserError(`Failed to list file permissions: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
