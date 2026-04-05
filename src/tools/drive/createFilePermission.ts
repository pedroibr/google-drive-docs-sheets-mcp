import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDriveClient } from '../../clients.js';
import { FileIdParameter } from '../../types.js';
import { mutationResult } from '../../tooling.js';
import {
  DRIVE_PERMISSION_FIELDS,
  DrivePermissionRoleSchema,
  DrivePermissionTypeSchema,
  normalizeDrivePermission,
  validateCreatePermissionArgs,
} from './permissionsCommon.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'createFilePermission',
    description:
      'Creates a sharing permission on a Google Drive file or folder. Supports sharing with a user, group, or public link via type=anyone.',
    parameters: FileIdParameter.extend({
      type: DrivePermissionTypeSchema.describe('Permission target type: user, group, or anyone.'),
      role: DrivePermissionRoleSchema.describe('Access role to grant.'),
      emailAddress: z
        .string()
        .email()
        .optional()
        .describe('Required for type=user or type=group. Not allowed for type=anyone.'),
      allowFileDiscovery: z
        .boolean()
        .optional()
        .describe('Only for type=anyone. True makes the file discoverable; false keeps it link-only.'),
      sendNotificationEmail: z
        .boolean()
        .optional()
        .default(false)
        .describe('Only for type=user or type=group. If true, sends a sharing notification email.'),
      emailMessage: z
        .string()
        .optional()
        .describe('Optional notification message. Requires sendNotificationEmail=true.'),
    }),
    execute: async (args, { log }) => {
      const drive = await getDriveClient();
      log.info(`Creating permission on file ${args.fileId} type=${args.type} role=${args.role}`);

      try {
        validateCreatePermissionArgs(args);

        const response = await drive.permissions.create({
          fileId: args.fileId,
          requestBody: {
            type: args.type,
            role: args.role,
            emailAddress: args.emailAddress,
            allowFileDiscovery: args.allowFileDiscovery,
          },
          fields: DRIVE_PERMISSION_FIELDS,
          supportsAllDrives: true,
          ...(args.type !== 'anyone' ? { sendNotificationEmail: args.sendNotificationEmail } : {}),
          ...(args.type !== 'anyone' && args.emailMessage
            ? { emailMessage: args.emailMessage }
            : {}),
        });

        return mutationResult('Created file permission successfully.', {
          fileId: args.fileId,
          permission: normalizeDrivePermission(response.data),
        });
      } catch (error: any) {
        log.error(`Error creating permission for file ${args.fileId}: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        if (error.code === 404) throw new UserError('File or folder not found. Check the file ID.');
        if (error.code === 403) {
          throw new UserError(
            'Permission denied. Make sure you have permission to share this file or folder.'
          );
        }
        throw new UserError(
          `Failed to create file permission: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
