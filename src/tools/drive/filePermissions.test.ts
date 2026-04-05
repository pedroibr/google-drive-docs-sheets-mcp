import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../clients.js', () => ({
  getDriveClient: vi.fn(),
}));

import { getDriveClient } from '../../clients.js';
import { register as registerCreateFilePermission } from './createFilePermission.js';
import { register as registerDeleteFilePermission } from './deleteFilePermission.js';
import { register as registerListFilePermissions } from './listFilePermissions.js';
import { DRIVE_PERMISSION_FIELDS } from './permissionsCommon.js';
import { register as registerUpdateFilePermission } from './updateFilePermission.js';

const mockGetDriveClient = vi.mocked(getDriveClient);
const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };

function extractPayload(result: any) {
  const text = result.content[0].text as string;
  return JSON.parse(text.split('\n\n').slice(1).join('\n\n'));
}

function captureToolConfig(registerFn: (server: any) => void) {
  let config: any;
  registerFn({
    addTool(input: any) {
      config = input;
    },
  });
  return config;
}

describe('Drive file permission tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listFilePermissions normalizes permissions and calls Drive with supportsAllDrives', async () => {
    const list = vi.fn().mockResolvedValue({
      data: {
        permissions: [
          {
            id: 'perm-1',
            type: 'user',
            role: 'writer',
            emailAddress: 'alex@example.com',
            displayName: 'Alex',
          },
          {
            id: 'perm-2',
            type: 'anyone',
            role: 'reader',
            allowFileDiscovery: false,
          },
        ],
      },
    });
    mockGetDriveClient.mockResolvedValue({ permissions: { list } } as any);

    const tool = captureToolConfig(registerListFilePermissions);
    const parsed = tool.parameters.parse({ fileId: 'file-1' });
    const result = await tool.execute(parsed, { log: mockLog });
    const payload = extractPayload(result);

    expect(list).toHaveBeenCalledWith({
      fileId: 'file-1',
      fields: `permissions(${DRIVE_PERMISSION_FIELDS})`,
      supportsAllDrives: true,
    });
    expect(payload).toEqual({
      fileId: 'file-1',
      permissions: [
        {
          id: 'perm-1',
          type: 'user',
          role: 'writer',
          emailAddress: 'alex@example.com',
          displayName: 'Alex',
          domain: null,
          allowFileDiscovery: null,
          deleted: false,
          expirationTime: null,
        },
        {
          id: 'perm-2',
          type: 'anyone',
          role: 'reader',
          emailAddress: null,
          displayName: null,
          domain: null,
          allowFileDiscovery: false,
          deleted: false,
          expirationTime: null,
        },
      ],
      total: 2,
    });
  });

  it('createFilePermission passes notification options for user permissions', async () => {
    const create = vi.fn().mockResolvedValue({
      data: {
        id: 'perm-1',
        type: 'user',
        role: 'writer',
        emailAddress: 'alex@example.com',
        displayName: 'Alex',
      },
    });
    mockGetDriveClient.mockResolvedValue({ permissions: { create } } as any);

    const tool = captureToolConfig(registerCreateFilePermission);
    const parsed = tool.parameters.parse({
      fileId: 'file-1',
      type: 'user',
      role: 'writer',
      emailAddress: 'alex@example.com',
      sendNotificationEmail: true,
      emailMessage: 'Please review this file.',
    });
    const result = await tool.execute(parsed, { log: mockLog });
    const payload = extractPayload(result);

    expect(create).toHaveBeenCalledWith({
      fileId: 'file-1',
      requestBody: {
        type: 'user',
        role: 'writer',
        emailAddress: 'alex@example.com',
        allowFileDiscovery: undefined,
      },
      fields: DRIVE_PERMISSION_FIELDS,
      supportsAllDrives: true,
      sendNotificationEmail: true,
      emailMessage: 'Please review this file.',
    });
    expect(payload.permission.id).toBe('perm-1');
  });

  it('createFilePermission rejects invalid anyone combinations', async () => {
    const tool = captureToolConfig(registerCreateFilePermission);
    const parsed = tool.parameters.parse({
      fileId: 'file-1',
      type: 'anyone',
      role: 'reader',
      emailAddress: 'alex@example.com',
    });

    await expect(tool.execute(parsed, { log: mockLog })).rejects.toThrow(
      'emailAddress is not allowed when type is anyone.'
    );
  });

  it('updateFilePermission reads current permission type and patches allowed fields', async () => {
    const get = vi.fn().mockResolvedValue({
      data: { id: 'perm-2', type: 'anyone', role: 'reader', allowFileDiscovery: false },
    });
    const update = vi.fn().mockResolvedValue({
      data: {
        id: 'perm-2',
        type: 'anyone',
        role: 'commenter',
        allowFileDiscovery: true,
      },
    });
    mockGetDriveClient.mockResolvedValue({ permissions: { get, update } } as any);

    const tool = captureToolConfig(registerUpdateFilePermission);
    const parsed = tool.parameters.parse({
      fileId: 'file-1',
      permissionId: 'perm-2',
      role: 'commenter',
      allowFileDiscovery: true,
    });
    const result = await tool.execute(parsed, { log: mockLog });
    const payload = extractPayload(result);

    expect(get).toHaveBeenCalledWith({
      fileId: 'file-1',
      permissionId: 'perm-2',
      fields: 'id,type,role,allowFileDiscovery',
      supportsAllDrives: true,
    });
    expect(update).toHaveBeenCalledWith({
      fileId: 'file-1',
      permissionId: 'perm-2',
      requestBody: {
        role: 'commenter',
        allowFileDiscovery: true,
      },
      fields: DRIVE_PERMISSION_FIELDS,
      supportsAllDrives: true,
    });
    expect(payload.permission.allowFileDiscovery).toBe(true);
  });

  it('updateFilePermission rejects empty updates', async () => {
    const tool = captureToolConfig(registerUpdateFilePermission);
    const parsed = tool.parameters.parse({
      fileId: 'file-1',
      permissionId: 'perm-2',
    });

    mockGetDriveClient.mockResolvedValue({
      permissions: {
        get: vi.fn().mockResolvedValue({
          data: { id: 'perm-2', type: 'user', role: 'reader' },
        }),
      },
    } as any);

    await expect(tool.execute(parsed, { log: mockLog })).rejects.toThrow(
      'At least one update field must be provided.'
    );
  });

  it('deleteFilePermission calls Drive delete with supportsAllDrives', async () => {
    const del = vi.fn().mockResolvedValue({});
    mockGetDriveClient.mockResolvedValue({ permissions: { delete: del } } as any);

    const tool = captureToolConfig(registerDeleteFilePermission);
    const parsed = tool.parameters.parse({
      fileId: 'file-1',
      permissionId: 'perm-2',
    });
    const result = await tool.execute(parsed, { log: mockLog });
    const payload = extractPayload(result);

    expect(del).toHaveBeenCalledWith({
      fileId: 'file-1',
      permissionId: 'perm-2',
      supportsAllDrives: true,
    });
    expect(payload).toEqual({
      success: true,
      message: 'Deleted file permission successfully.',
      fileId: 'file-1',
      permissionId: 'perm-2',
    });
  });
});
