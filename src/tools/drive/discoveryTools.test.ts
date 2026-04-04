import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../clients.js', () => ({
  getDriveClient: vi.fn(),
}));

import { getDriveClient } from '../../clients.js';
import { resolveDriveMimeTypeAlias } from '../../driveFileTypes.js';
import { register as registerListDocuments } from './listGoogleDocs.js';
import { register as registerSearchDocuments } from './searchGoogleDocs.js';
import { register as registerListDriveFiles } from './listDriveFiles.js';
import { register as registerSearchDriveFiles } from './searchDriveFiles.js';
import { register as registerListSpreadsheets } from '../sheets/listGoogleSheets.js';
import { register as registerSearchSpreadsheets } from '../sheets/searchGoogleSheets.js';
import { register as registerListPresentations } from '../slides/listGooglePresentations.js';
import { register as registerSearchPresentations } from '../slides/searchGooglePresentations.js';

const mockGetDriveClient = vi.mocked(getDriveClient);
const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };

function extractPayload(result: any) {
  const text = result.content[0].text as string;
  return JSON.parse(text.split('\n\n').slice(1).join('\n\n'));
}

function captureExecute(registerFn: (server: any) => void) {
  let execute!: (args: any, context: any) => Promise<any>;
  registerFn({
    addTool(config: any) {
      execute = config.execute;
    },
  });
  return execute;
}

function createMockDrive(files: Record<string, any>[] = []) {
  const list = vi.fn().mockResolvedValue({ data: { files } });
  mockGetDriveClient.mockResolvedValue({
    files: { list },
  } as any);
  return { list };
}

describe('resolveDriveMimeTypeAlias', () => {
  it.each([
    ['docs', 'application/vnd.google-apps.document'],
    ['sheet', 'application/vnd.google-apps.spreadsheet'],
    ['slides', 'application/vnd.google-apps.presentation'],
    ['folders', 'application/vnd.google-apps.folder'],
    ['pdfs', 'application/pdf'],
    ['image/png', 'image/png'],
  ])('maps %s correctly', (input, expected) => {
    expect(resolveDriveMimeTypeAlias(input)).toBe(expected);
  });
});

describe('discovery tools public contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listDriveFiles defaults to recent-first discovery and resolves type aliases', async () => {
    const execute = captureExecute(registerListDriveFiles);
    const { list } = createMockDrive([
      { id: '1', name: 'Roadmap', mimeType: 'application/vnd.google-apps.document' },
    ]);

    const result = await execute(
      { mimeType: 'docs', maxResults: 10, orderBy: 'modifiedTime', sortDirection: 'desc' },
      { log: mockLog }
    );
    const payload = extractPayload(result);

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "trashed=false and mimeType='application/vnd.google-apps.document'",
        pageSize: 10,
        orderBy: 'modifiedTime desc',
      })
    );
    expect(payload.filters).toEqual(
      expect.objectContaining({
        mimeType: 'docs',
        orderBy: 'modifiedTime',
        sortDirection: 'desc',
      })
    );
  });

  it('searchDriveFiles defaults to recent-first search and resolves type aliases', async () => {
    const execute = captureExecute(registerSearchDriveFiles);
    const { list } = createMockDrive([]);

    await execute(
      {
        query: 'finance',
        mimeType: 'sheets',
        searchIn: 'both',
        maxResults: 10,
        orderBy: 'modifiedTime',
        sortDirection: 'desc',
      },
      { log: mockLog }
    );

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        q: expect.stringContaining("mimeType='application/vnd.google-apps.spreadsheet'"),
        pageSize: 10,
        orderBy: 'modifiedTime desc',
      })
    );
  });

  it('listDocuments matches the canonical recent-first defaults', async () => {
    const execute = captureExecute(registerListDocuments);
    const { list } = createMockDrive([]);

    const result = await execute(
      { maxResults: 10, orderBy: 'modifiedTime', sortDirection: 'desc' },
      { log: mockLog }
    );
    const payload = extractPayload(result);

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "mimeType='application/vnd.google-apps.document' and trashed=false",
        pageSize: 10,
        orderBy: 'modifiedTime desc',
      })
    );
    expect(payload.filters).toEqual(
      expect.objectContaining({
        orderBy: 'modifiedTime',
        sortDirection: 'desc',
      })
    );
  });

  it('searchDocuments matches the canonical defaults and normalizes modifiedAfter', async () => {
    const execute = captureExecute(registerSearchDocuments);
    const { list } = createMockDrive([]);

    const result = await execute(
      {
        query: 'roadmap',
        searchIn: 'both',
        maxResults: 10,
        orderBy: 'modifiedTime',
        sortDirection: 'desc',
        modifiedAfter: '2024-01-01',
      },
      { log: mockLog }
    );
    const payload = extractPayload(result);

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        q: expect.stringContaining("modifiedTime > '2024-01-01T00:00:00.000Z'"),
        pageSize: 10,
        orderBy: 'modifiedTime desc',
      })
    );
    expect(payload.filters).toEqual(
      expect.objectContaining({
        orderBy: 'modifiedTime',
        sortDirection: 'desc',
      })
    );
  });

  it('listSpreadsheets matches the canonical defaults and escapes search terms', async () => {
    const execute = captureExecute(registerListSpreadsheets);
    const { list } = createMockDrive([]);

    const result = await execute(
      {
        query: "Q1's forecast",
        maxResults: 10,
        orderBy: 'modifiedTime',
        sortDirection: 'desc',
        modifiedAfter: '2024-01-01',
      },
      { log: mockLog }
    );
    const payload = extractPayload(result);

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        q: expect.stringContaining("name contains 'Q1\\'s forecast'"),
        pageSize: 10,
        orderBy: 'modifiedTime desc',
      })
    );
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        q: expect.stringContaining("modifiedTime > '2024-01-01T00:00:00.000Z'"),
      })
    );
    expect(payload.filters).toEqual(
      expect.objectContaining({
        orderBy: 'modifiedTime',
        sortDirection: 'desc',
      })
    );
  });

  it('searchSpreadsheets is available as a product-scoped wrapper', async () => {
    const execute = captureExecute(registerSearchSpreadsheets);
    const { list } = createMockDrive([]);

    const result = await execute(
      {
        query: 'budget',
        searchIn: 'both',
        maxResults: 10,
        orderBy: 'modifiedTime',
        sortDirection: 'desc',
      },
      { log: mockLog }
    );
    const payload = extractPayload(result);

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        q: expect.stringContaining("mimeType='application/vnd.google-apps.spreadsheet'"),
        orderBy: 'modifiedTime desc',
      })
    );
    expect(payload.mimeType).toBe('application/vnd.google-apps.spreadsheet');
  });

  it('listPresentations is available as a product-scoped wrapper', async () => {
    const execute = captureExecute(registerListPresentations);
    const { list } = createMockDrive([]);

    const result = await execute(
      { maxResults: 10, orderBy: 'modifiedTime', sortDirection: 'desc' },
      { log: mockLog }
    );
    const payload = extractPayload(result);

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "mimeType='application/vnd.google-apps.presentation' and trashed=false",
        orderBy: 'modifiedTime desc',
      })
    );
    expect(payload.mimeType).toBe('application/vnd.google-apps.presentation');
  });

  it('searchPresentations is available as a product-scoped wrapper', async () => {
    const execute = captureExecute(registerSearchPresentations);
    const { list } = createMockDrive([]);

    const result = await execute(
      {
        query: 'quarterly',
        searchIn: 'both',
        maxResults: 10,
        orderBy: 'modifiedTime',
        sortDirection: 'desc',
      },
      { log: mockLog }
    );
    const payload = extractPayload(result);

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        q: expect.stringContaining("mimeType='application/vnd.google-apps.presentation'"),
        orderBy: 'modifiedTime desc',
      })
    );
    expect(payload.mimeType).toBe('application/vnd.google-apps.presentation');
  });
});
