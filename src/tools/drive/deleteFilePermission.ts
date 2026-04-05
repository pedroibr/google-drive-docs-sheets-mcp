import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { getDriveClient } from '../../clients.js';
import { FileIdParameter } from '../../types.js';
import { mutationResult } from '../../tooling.js';
import { PermissionIdParameter } from './permissionsCommon.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'deleteFilePermission',
    description:
      'Deletes an existing sharing permission from a Google Drive file or folder, revoking that access.',
    parameters: FileIdParameter.extend(PermissionIdParameter.shape),
    execute: async (args, { log }) => {
      const drive = await getDriveClient();
      log.info(`Deleting permission ${args.permissionId} from file ${args.fileId}`);

      try {
        await drive.permissions.delete({
          fileId: args.fileId,
          permissionId: args.permissionId,
          supportsAllDrives: true,
        });

        return mutationResult('Deleted file permission successfully.', {
          fileId: args.fileId,
          permissionId: args.permissionId,
        });
      } catch (error: any) {
        log.error(`Error deleting permission for file ${args.fileId}: ${error.message || error}`);
        if (error.code === 404) {
          throw new UserError('File, folder, or permission not found. Check the provided IDs.');
        }
        if (error.code === 403) {
          throw new UserError(
            'Permission denied. Make sure you have permission to manage sharing for this file or folder.'
          );
        }
        throw new UserError(
          `Failed to delete file permission: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
