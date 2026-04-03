import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../clients.js', () => ({
  getDriveClient: vi.fn(),
  getSlidesClient: vi.fn(),
}));

import { getDriveClient, getSlidesClient } from '../../clients.js';
import { register as registerCreatePresentation } from './createPresentation.js';
import { register as registerGetPresentation } from './getPresentation.js';
import { register as registerBatchUpdatePresentation } from './batchUpdatePresentation.js';
import { register as registerGetPresentationPage } from './getPresentationPage.js';
import { register as registerGetPresentationPageThumbnail } from './getPresentationPageThumbnail.js';

const mockGetDriveClient = vi.mocked(getDriveClient);
const mockGetSlidesClient = vi.mocked(getSlidesClient);
const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };

type ToolConfig = {
  name: string;
  parameters: { parse: (args: unknown) => any };
  execute: (args: any, context: any) => Promise<any>;
};

let tools: Record<string, ToolConfig>;

function parsePayload(result: any) {
  const text = result.content[0].text as string;
  return JSON.parse(text.split('\n\n').slice(1).join('\n\n'));
}

async function invokeTool(name: string, args: Record<string, unknown>) {
  const tool = tools[name];
  const parsedArgs = tool.parameters.parse(args);
  return tool.execute(parsedArgs, { log: mockLog });
}

function createFakeServer() {
  tools = {};
  return {
    addTool(config: ToolConfig) {
      tools[config.name] = config;
    },
  };
}

describe('slides tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const server = createFakeServer();
    registerCreatePresentation(server as any);
    registerGetPresentation(server as any);
    registerBatchUpdatePresentation(server as any);
    registerGetPresentationPage(server as any);
    registerGetPresentationPageThumbnail(server as any);
  });

  it('createPresentation returns a stable payload and moves the file when parentFolderId is provided', async () => {
    const filesGet = vi.fn().mockResolvedValue({ data: { parents: ['root-parent'] } });
    const filesUpdate = vi.fn().mockResolvedValue({ data: { id: 'pres-123', parents: ['folder-1'] } });

    mockGetSlidesClient.mockResolvedValue({
      presentations: {
        create: vi.fn().mockResolvedValue({
          data: {
            presentationId: 'pres-123',
            title: 'Quarterly Review',
            slides: [{ objectId: 'slide-1' }],
          },
        }),
      },
    } as any);

    mockGetDriveClient.mockResolvedValue({
      files: {
        get: filesGet,
        update: filesUpdate,
      },
    } as any);

    const result = await invokeTool('createPresentation', {
      title: 'Quarterly Review',
      parentFolderId: 'folder-1',
    });

    expect(filesGet).toHaveBeenCalledWith({
      fileId: 'pres-123',
      fields: 'parents',
      supportsAllDrives: true,
    });
    expect(filesUpdate).toHaveBeenCalledWith({
      fileId: 'pres-123',
      addParents: 'folder-1',
      removeParents: 'root-parent',
      fields: 'id,parents',
      supportsAllDrives: true,
    });

    expect(parsePayload(result)).toEqual({
      success: true,
      message: 'Created presentation successfully.',
      id: 'pres-123',
      name: 'Quarterly Review',
      url: 'https://docs.google.com/presentation/d/pres-123/edit',
      slideCount: 1,
      parentFolderId: 'folder-1',
    });
  });

  it('getPresentation returns slide summaries with extracted text', async () => {
    mockGetSlidesClient.mockResolvedValue({
      presentations: {
        get: vi.fn().mockResolvedValue({
          data: {
            title: 'Team Update',
            pageSize: {
              width: { magnitude: 960, unit: 'PT' },
              height: { magnitude: 540, unit: 'PT' },
            },
            slides: [
              {
                objectId: 'slide-1',
                pageType: 'SLIDE',
                pageElements: [
                  {
                    shape: {
                      shapeType: 'TEXT_BOX',
                      text: {
                        textElements: [{ startIndex: 1, textRun: { content: 'Hello team' } }],
                      },
                    },
                  },
                ],
              },
            ],
          },
        }),
      },
    } as any);

    const result = await invokeTool('getPresentation', {
      presentationId: 'pres-123',
    });

    expect(parsePayload(result)).toEqual({
      id: 'pres-123',
      title: 'Team Update',
      url: 'https://docs.google.com/presentation/d/pres-123/edit',
      slideCount: 1,
      pageSize: {
        width: { magnitude: 960, unit: 'PT' },
        height: { magnitude: 540, unit: 'PT' },
      },
      slides: [
        {
          slideNumber: 1,
          objectId: 'slide-1',
          pageType: 'SLIDE',
          pageElementCount: 1,
          textContent: 'Hello team',
        },
      ],
    });
  });

  it('batchUpdatePresentation summarizes replies', async () => {
    mockGetSlidesClient.mockResolvedValue({
      presentations: {
        batchUpdate: vi.fn().mockResolvedValue({
          data: {
            replies: [{ createSlide: { objectId: 'slide-2' } }, {}],
          },
        }),
      },
    } as any);

    const result = await invokeTool('batchUpdatePresentation', {
      presentationId: 'pres-123',
      requests: [{ createSlide: { insertionIndex: 1 } }, { deleteObject: { objectId: 'x' } }],
    });

    expect(parsePayload(result)).toEqual({
      success: true,
      message: 'Updated presentation successfully.',
      presentationId: 'pres-123',
      url: 'https://docs.google.com/presentation/d/pres-123/edit',
      requestCount: 2,
      replyCount: 2,
      repliesSummary: [
        { index: 1, operation: 'createSlide', objectId: 'slide-2' },
        { index: 2, operation: 'completed', objectId: null },
      ],
    });
  });

  it('getPresentationPage returns page element summaries and extracted text', async () => {
    mockGetSlidesClient.mockResolvedValue({
      presentations: {
        pages: {
          get: vi.fn().mockResolvedValue({
            data: {
              pageType: 'SLIDE',
              pageElements: [
                {
                  objectId: 'shape-1',
                  shape: {
                    shapeType: 'TEXT_BOX',
                    text: {
                      textElements: [{ startIndex: 1, textRun: { content: 'Agenda' } }],
                    },
                  },
                },
                {
                  objectId: 'table-1',
                  table: { rows: 2, columns: 2 },
                },
              ],
            },
          }),
        },
      },
    } as any);

    const result = await invokeTool('getPresentationPage', {
      presentationId: 'pres-123',
      pageObjectId: 'slide-1',
    });

    expect(parsePayload(result)).toEqual({
      presentationId: 'pres-123',
      pageObjectId: 'slide-1',
      pageType: 'SLIDE',
      pageElementCount: 2,
      pageElements: [
        {
          objectId: 'shape-1',
          size: null,
          elementType: 'shape',
          shapeType: 'TEXT_BOX',
          textContent: 'Agenda',
        },
        {
          objectId: 'table-1',
          size: null,
          elementType: 'table',
          rows: 2,
          columns: 2,
        },
      ],
      textContent: 'Agenda',
    });
  });

  it('getPresentationPageThumbnail uses MEDIUM by default and accepts explicit sizes', async () => {
    const getThumbnail = vi
      .fn()
      .mockResolvedValueOnce({
        data: { contentUrl: 'https://example.com/thumb-medium.png', width: 800, height: 450 },
      })
      .mockResolvedValueOnce({
        data: { contentUrl: 'https://example.com/thumb-large.png', width: 1600, height: 900 },
      });

    mockGetSlidesClient.mockResolvedValue({
      presentations: {
        pages: { getThumbnail },
      },
    } as any);

    const defaultResult = await invokeTool('getPresentationPageThumbnail', {
      presentationId: 'pres-123',
      pageObjectId: 'slide-1',
    });
    const explicitResult = await invokeTool('getPresentationPageThumbnail', {
      presentationId: 'pres-123',
      pageObjectId: 'slide-1',
      thumbnailSize: 'LARGE',
    });

    expect(getThumbnail).toHaveBeenNthCalledWith(1, {
      presentationId: 'pres-123',
      pageObjectId: 'slide-1',
      'thumbnailProperties.mimeType': 'PNG',
      'thumbnailProperties.thumbnailSize': 'MEDIUM',
    });
    expect(getThumbnail).toHaveBeenNthCalledWith(2, {
      presentationId: 'pres-123',
      pageObjectId: 'slide-1',
      'thumbnailProperties.mimeType': 'PNG',
      'thumbnailProperties.thumbnailSize': 'LARGE',
    });

    expect(parsePayload(defaultResult)).toEqual({
      presentationId: 'pres-123',
      pageObjectId: 'slide-1',
      thumbnailSize: 'MEDIUM',
      thumbnailUrl: 'https://example.com/thumb-medium.png',
      width: 800,
      height: 450,
    });
    expect(parsePayload(explicitResult)).toEqual({
      presentationId: 'pres-123',
      pageObjectId: 'slide-1',
      thumbnailSize: 'LARGE',
      thumbnailUrl: 'https://example.com/thumb-large.png',
      width: 1600,
      height: 900,
    });
  });
});
