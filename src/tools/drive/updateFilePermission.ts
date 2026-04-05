import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDriveClient } from '../../clients.js';
import { FileIdParameter } from '../../types.js';
import { mutationResult } from '../../tooling.js';
import {
  DRIVE_PERMISSION_FIELDS,
  DrivePermissionRoleSchema,
  PermissionIdParameter,
  normalizeDrivePermission,
  validateUpdatePermissionArgs,
} from './permissionsCommon.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'updateFilePermission',
    description:
      'Updates an existing sharing permission on a Google Drive file or folder. Supports role changes and allowFileDiscovery for public-link permissions.',
    parameters: FileIdParameter.extend(PermissionIdParameter.shape).extend({
      role: DrivePermissionRoleSchema.optional().describe('Optional new access role.'),
      allowFileDiscovery: z
        .boolean()
        .optional()
        .describe('Only for permissions of type=anyone. Controls discoverability vs link-only sharing.'),
    }),
    execute: async (args, { log }) => {
      const drive = await getDriveClient();
      log.info(`Updating permission ${args.permissionId} on file ${args.fileId}`);

      try {
        const currentPermission = await drive.permissions.get({
          fileId: args.fileId,
          permissionId: args.permissionId,
          fields: 'id,type,role,allowFileDiscovery',
          supportsAllDrives: true,
        });

        validateUpdatePermissionArgs(args, currentPermission.data.type);

        const response = await drive.permissions.update({
          fileId: args.fileId,
          permissionId: args.permissionId,
          requestBody: {
            ...(args.role !== undefined ? { role: args.role } : {}),
            ...(args.allowFileDiscovery !== undefined
              ? { allowFileDiscovery: args.allowFileDiscovery }
              : {}),
          },
          fields: DRIVE_PERMISSION_FIELDS,
          supportsAllDrives: true,
        });

        return mutationResult('Updated file permission successfully.', {
          fileId: args.fileId,
          permissionId: args.permissionId,
          permission: normalizeDrivePermission(response.data),
        });
      } catch (error: any) {
        log.error(`Error updating permission for file ${args.fileId}: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        if (error.code === 404) {
          throw new UserError('File, folder, or permission not found. Check the provided IDs.');
        }
        if (error.code === 403) {
          throw new UserError(
            'Permission denied. Make sure you have permission to manage sharing for this file or folder.'
          );
        }
        throw new UserError(
          `Failed to update file permission: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
