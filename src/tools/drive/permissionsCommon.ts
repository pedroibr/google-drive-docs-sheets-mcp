import { UserError } from 'fastmcp';
import { drive_v3 } from 'googleapis';
import { z } from 'zod';
import { assertAtLeastOneDefined } from '../../tooling.js';

export const DrivePermissionTypeSchema = z.enum(['user', 'group', 'anyone']);
export const DrivePermissionRoleSchema = z.enum(['reader', 'commenter', 'writer']);

export const PermissionIdParameter = z.object({
  permissionId: z
    .string()
    .describe('The permission ID to update or delete. Use listFilePermissions to discover it.'),
});

export const DRIVE_PERMISSION_FIELDS =
  'id,type,role,emailAddress,displayName,domain,allowFileDiscovery,deleted,expirationTime';

export type NormalizedDrivePermission = {
  id: string | null;
  type: string | null;
  role: string | null;
  emailAddress: string | null;
  displayName: string | null;
  domain: string | null;
  allowFileDiscovery: boolean | null;
  deleted: boolean;
  expirationTime: string | null;
};

export function normalizeDrivePermission(
  permission: drive_v3.Schema$Permission | null | undefined
): NormalizedDrivePermission {
  return {
    id: permission?.id ?? null,
    type: permission?.type ?? null,
    role: permission?.role ?? null,
    emailAddress: permission?.emailAddress ?? null,
    displayName: permission?.displayName ?? null,
    domain: permission?.domain ?? null,
    allowFileDiscovery: permission?.allowFileDiscovery ?? null,
    deleted: permission?.deleted ?? false,
    expirationTime: permission?.expirationTime ?? null,
  };
}

function isSupportedPermissionType(type: string | null | undefined): type is z.infer<
  typeof DrivePermissionTypeSchema
> {
  return type === 'user' || type === 'group' || type === 'anyone';
}

export function assertSupportedPermissionType(
  type: string | null | undefined,
  context = 'Permission'
): asserts type is z.infer<typeof DrivePermissionTypeSchema> {
  if (!isSupportedPermissionType(type)) {
    throw new UserError(
      `${context} has unsupported type "${type ?? 'unknown'}". Supported types are user, group, and anyone.`
    );
  }
}

export function validateCreatePermissionArgs(args: {
  type: z.infer<typeof DrivePermissionTypeSchema>;
  emailAddress?: string;
  allowFileDiscovery?: boolean;
  sendNotificationEmail?: boolean;
  emailMessage?: string;
}) {
  if ((args.type === 'user' || args.type === 'group') && !args.emailAddress) {
    throw new UserError('emailAddress is required when type is user or group.');
  }

  if (args.type === 'anyone' && args.emailAddress) {
    throw new UserError('emailAddress is not allowed when type is anyone.');
  }

  if (args.type !== 'anyone' && args.allowFileDiscovery !== undefined) {
    throw new UserError('allowFileDiscovery is only supported when type is anyone.');
  }

  if (args.type === 'anyone' && args.sendNotificationEmail !== undefined) {
    throw new UserError('sendNotificationEmail is only supported when type is user or group.');
  }

  if (args.type === 'anyone' && args.emailMessage) {
    throw new UserError('emailMessage is only supported when type is user or group.');
  }

  if (args.emailMessage && args.sendNotificationEmail !== true) {
    throw new UserError('emailMessage requires sendNotificationEmail=true.');
  }
}

export function validateUpdatePermissionArgs(
  args: {
    role?: z.infer<typeof DrivePermissionRoleSchema>;
    allowFileDiscovery?: boolean;
  },
  currentType: string | null | undefined
) {
  assertAtLeastOneDefined(
    args,
    ['role', 'allowFileDiscovery'],
    'At least one update field must be provided.'
  );

  assertSupportedPermissionType(currentType);

  if (currentType !== 'anyone' && args.allowFileDiscovery !== undefined) {
    throw new UserError('allowFileDiscovery can only be updated on permissions of type anyone.');
  }
}
