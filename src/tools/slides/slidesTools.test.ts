import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../clients.js', () => ({
  getDriveClient: vi.fn(),
  getScriptClient: vi.fn(),
  getSlidesClient: vi.fn(),
}));

import { getDriveClient, getScriptClient, getSlidesClient } from '../../clients.js';
import { register as registerCreatePresentation } from './createPresentation.js';
import { register as registerGetPresentation } from './getPresentation.js';
import { register as registerBatchUpdatePresentation } from './batchUpdatePresentation.js';
import { register as registerGetPresentationPage } from './getPresentationPage.js';
import { register as registerGetPresentationPageThumbnail } from './getPresentationPageThumbnail.js';
import { register as registerReadSlideNotes } from './templates/readSlideNotes.js';
import { register as registerUpdatePresentationTemplateMetadata } from './templates/updatePresentationTemplateMetadata.js';
import { register as registerCopyPresentation } from './presentations/copyPresentation.js';
import { register as registerGetPresentationSlides } from './presentations/getPresentationSlides.js';
import { register as registerInsertPresentationTemplateSlide } from './presentations/insertPresentationTemplateSlide.js';
import { register as registerDuplicatePresentationSlide } from './slides/duplicatePresentationSlide.js';
import { register as registerReplaceSlidePlaceholders } from './slides/replaceSlidePlaceholders.js';
import { register as registerListSlideElements } from './slides/listSlideElements.js';
import { register as registerInsertTextIntoSlideShape } from './elements/insertTextIntoSlideShape.js';

const mockGetDriveClient = vi.mocked(getDriveClient);
const mockGetScriptClient = vi.mocked(getScriptClient);
const mockGetSlidesClient = vi.mocked(getSlidesClient);
const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
const originalGoogleAppsScriptId = process.env.GOOGLE_APPS_SCRIPT_ID;
const originalLegacyAppsScriptId = process.env.APPS_SCRIPT_DEPLOYMENT_ID;

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
    registerReadSlideNotes(server as any);
    registerUpdatePresentationTemplateMetadata(server as any);
    registerCopyPresentation(server as any);
    registerGetPresentationSlides(server as any);
    registerInsertPresentationTemplateSlide(server as any);
    registerDuplicatePresentationSlide(server as any);
    registerReplaceSlidePlaceholders(server as any);
    registerListSlideElements(server as any);
    registerInsertTextIntoSlideShape(server as any);
    delete process.env.GOOGLE_APPS_SCRIPT_ID;
    delete process.env.APPS_SCRIPT_DEPLOYMENT_ID;
  });

  afterEach(() => {
    if (originalGoogleAppsScriptId === undefined) {
      delete process.env.GOOGLE_APPS_SCRIPT_ID;
    } else {
      process.env.GOOGLE_APPS_SCRIPT_ID = originalGoogleAppsScriptId;
    }

    if (originalLegacyAppsScriptId === undefined) {
      delete process.env.APPS_SCRIPT_DEPLOYMENT_ID;
    } else {
      process.env.APPS_SCRIPT_DEPLOYMENT_ID = originalLegacyAppsScriptId;
    }
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
          title: 'Hello team',
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
        { index: 1, operation: 'createSlide', objectId: 'slide-2', occurrencesChanged: null },
        { index: 2, operation: 'completed', objectId: null, occurrencesChanged: null },
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
          title: null,
          description: null,
          size: null,
          transform: null,
          elementType: 'shape',
          shapeType: 'TEXT_BOX',
          placeholderType: null,
          textContent: 'Agenda',
          placeholders: [],
        },
        {
          objectId: 'table-1',
          title: null,
          description: null,
          size: null,
          transform: null,
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

  it('readSlideNotes returns notes IDs and parsed metadata', async () => {
    mockGetSlidesClient.mockResolvedValue({
      presentations: {
        get: vi.fn().mockResolvedValue({
          data: {
            slides: [
              {
                objectId: 'slide-1',
                slideProperties: {
                  notesPage: {
                    objectId: 'notes-page-1',
                    notesProperties: {
                      speakerNotesObjectId: 'notes-shape-1',
                    },
                    pageElements: [
                      {
                        objectId: 'notes-shape-1',
                        shape: {
                          text: {
                            textElements: [
                              {
                                startIndex: 1,
                                textRun: {
                                  content:
                                    'template_category: content_1c\ntemplate_name: default-one-column\nversion: 2',
                                },
                              },
                            ],
                          },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        }),
      },
    } as any);

    const result = await invokeTool('readSlideNotes', {
      presentationId: 'pres-123',
      pageObjectId: 'slide-1',
    });

    expect(parsePayload(result)).toEqual({
      presentationId: 'pres-123',
      pageObjectId: 'slide-1',
      notesPageObjectId: 'notes-page-1',
      speakerNotesObjectId: 'notes-shape-1',
      notesText:
        'template_category: content_1c\ntemplate_name: default-one-column\nversion: 2',
      templateMetadata: {
        templateCategory: 'content_1c',
        templateName: 'default-one-column',
        version: '2',
        rawEntries: {
          template_category: 'content_1c',
          template_name: 'default-one-column',
          version: '2',
        },
      },
    });
  });

  it('updatePresentationTemplateMetadata rewrites managed note keys and preserves body text', async () => {
    const batchUpdate = vi.fn().mockResolvedValue({ data: {} });

    mockGetSlidesClient.mockResolvedValue({
      presentations: {
        get: vi.fn().mockResolvedValue({
          data: {
            slides: [
              {
                objectId: 'slide-1',
                slideProperties: {
                  notesPage: {
                    objectId: 'notes-page-1',
                    notesProperties: { speakerNotesObjectId: 'notes-shape-1' },
                    pageElements: [
                      {
                        objectId: 'notes-shape-1',
                        shape: {
                          text: {
                            textElements: [
                              {
                                startIndex: 1,
                                textRun: {
                                  content:
                                    'template_category: content_1c\ntemplate_name: old-name\nversion: 1\n\nBody note',
                                },
                              },
                            ],
                          },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        }),
        batchUpdate,
      },
    } as any);

    const result = await invokeTool('updatePresentationTemplateMetadata', {
      presentationId: 'pres-123',
      pageObjectId: 'slide-1',
      templateCategory: 'content_2c',
      templateName: 'new-name',
      replaceExisting: false,
    });

    expect(batchUpdate).toHaveBeenCalledWith({
      presentationId: 'pres-123',
      requestBody: {
        requests: [
          {
            deleteText: {
              objectId: 'notes-shape-1',
              textRange: { type: 'ALL' },
            },
          },
          {
            insertText: {
              objectId: 'notes-shape-1',
              insertionIndex: 0,
              text: 'template_category: content_2c\ntemplate_name: new-name\nversion: 1\n\nBody note',
            },
          },
        ],
      },
    });

    expect(parsePayload(result)).toEqual({
      success: true,
      message: 'Updated template metadata successfully.',
      presentationId: 'pres-123',
      pageObjectId: 'slide-1',
      notesPageObjectId: 'notes-page-1',
      speakerNotesObjectId: 'notes-shape-1',
      notesText: 'template_category: content_2c\ntemplate_name: new-name\nversion: 1\n\nBody note',
      templateMetadata: {
        templateCategory: 'content_2c',
        templateName: 'new-name',
        version: '1',
        rawEntries: {
          template_category: 'content_2c',
          template_name: 'new-name',
          version: '1',
        },
      },
      replaceExisting: false,
    });
  });

  it('copyPresentation validates slides mime type and returns copied deck payload', async () => {
    const filesGet = vi.fn().mockResolvedValue({
      data: {
        name: 'Template Deck',
        mimeType: 'application/vnd.google-apps.presentation',
        parents: ['folder-source'],
      },
    });
    const filesCopy = vi.fn().mockResolvedValue({
      data: {
        id: 'pres-copy-1',
        name: 'Client Deck',
        webViewLink: 'https://docs.google.com/presentation/d/pres-copy-1/edit',
      },
    });

    mockGetDriveClient.mockResolvedValue({
      files: {
        get: filesGet,
        copy: filesCopy,
      },
    } as any);

    const result = await invokeTool('copyPresentation', {
      sourcePresentationId: 'pres-template',
      title: 'Client Deck',
      parentFolderId: 'folder-dest',
    });

    expect(filesGet).toHaveBeenCalledWith({
      fileId: 'pres-template',
      fields: 'name,mimeType,parents',
      supportsAllDrives: true,
    });
    expect(filesCopy).toHaveBeenCalledWith({
      fileId: 'pres-template',
      requestBody: {
        name: 'Client Deck',
        parents: ['folder-dest'],
      },
      fields: 'id,name,webViewLink',
      supportsAllDrives: true,
    });
    expect(parsePayload(result)).toEqual({
      success: true,
      message: 'Copied presentation successfully.',
      presentationId: 'pres-copy-1',
      name: 'Client Deck',
      url: 'https://docs.google.com/presentation/d/pres-copy-1/edit',
      sourcePresentationId: 'pres-template',
      parentFolderId: 'folder-dest',
    });
  });

  it('getPresentationSlides includes notes and placeholders when requested', async () => {
    mockGetSlidesClient.mockResolvedValue({
      presentations: {
        get: vi.fn().mockResolvedValue({
          data: {
            title: 'Template Deck',
            slides: [
              {
                objectId: 'slide-1',
                pageType: 'SLIDE',
                pageElements: [
                  {
                    shape: {
                      placeholder: { type: 'TITLE' },
                      text: {
                        textElements: [{ startIndex: 1, textRun: { content: '[[title]]' } }],
                      },
                    },
                  },
                ],
                slideProperties: {
                  notesPage: {
                    notesProperties: { speakerNotesObjectId: 'notes-shape-1' },
                    pageElements: [
                      {
                        objectId: 'notes-shape-1',
                        shape: {
                          text: {
                            textElements: [
                              { startIndex: 1, textRun: { content: 'template_category: lesson_title' } },
                            ],
                          },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        }),
      },
    } as any);

    const result = await invokeTool('getPresentationSlides', {
      presentationId: 'pres-123',
      includeNotes: true,
      includePlaceholders: true,
    });

    expect(parsePayload(result)).toEqual({
      presentationId: 'pres-123',
      title: 'Template Deck',
      slideCount: 1,
      slides: [
        {
          slideNumber: 1,
          objectId: 'slide-1',
          pageType: 'SLIDE',
          title: '[[title]]',
          pageElementCount: 1,
          textContent: '[[title]]',
          notesText: 'template_category: lesson_title',
          templateCategory: 'lesson_title',
          templateName: null,
          version: null,
          placeholders: ['[[title]]'],
        },
      ],
    });
  });

  it('duplicatePresentationSlide can assign deterministic ids and reorder the duplicate', async () => {
    const batchUpdate = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          replies: [{ duplicateObject: { objectId: 'slide-copy-1' } }],
        },
      })
      .mockResolvedValueOnce({ data: { replies: [{}] } });

    mockGetSlidesClient.mockResolvedValue({
      presentations: {
        batchUpdate,
      },
    } as any);

    const result = await invokeTool('duplicatePresentationSlide', {
      presentationId: 'pres-123',
      pageObjectId: 'slide-1',
      newPageObjectId: 'slide-copy-1',
      insertionIndex: 3,
      objectIdMappings: [{ sourceObjectId: 'shape-1', newObjectId: 'shape-copy-1' }],
    });

    expect(batchUpdate).toHaveBeenNthCalledWith(1, {
      presentationId: 'pres-123',
      requestBody: {
        requests: [
          {
            duplicateObject: {
              objectId: 'slide-1',
              objectIds: {
                'slide-1': 'slide-copy-1',
                'shape-1': 'shape-copy-1',
              },
            },
          },
        ],
      },
    });
    expect(batchUpdate).toHaveBeenNthCalledWith(2, {
      presentationId: 'pres-123',
      requestBody: {
        requests: [
          {
            updateSlidesPosition: {
              slideObjectIds: ['slide-copy-1'],
              insertionIndex: 3,
            },
          },
        ],
      },
    });
    expect(parsePayload(result)).toEqual({
      success: true,
      message: 'Duplicated presentation slide successfully.',
      presentationId: 'pres-123',
      sourcePageObjectId: 'slide-1',
      newPageObjectId: 'slide-copy-1',
      insertionIndex: 3,
      objectIdMappingsApplied: 2,
    });
  });

  it('insertPresentationTemplateSlide copies a template slide into another presentation at a target index', async () => {
    process.env.GOOGLE_APPS_SCRIPT_ID = 'script-deployment-123';

    const scriptsRun = vi.fn().mockResolvedValue({
      data: {
        response: {
          result: {
            success: true,
            newSlideId: 'slide-copy-7',
            targetPresentationId: 'target-pres',
          },
        },
      },
    });

    mockGetScriptClient.mockResolvedValue({
      scripts: { run: scriptsRun },
    } as any);

    const result = await invokeTool('insertPresentationTemplateSlide', {
      sourcePresentationId: 'template-pres',
      sourceSlideId: 'template-slide-1',
      targetPresentationId: 'target-pres',
      insertionIndex: 2,
    });

    expect(scriptsRun).toHaveBeenCalledWith({
      scriptId: 'script-deployment-123',
      requestBody: {
        function: 'copySlideToPresentation',
        parameters: ['template-pres', 'template-slide-1', 'target-pres', 2],
      },
    });
    expect(parsePayload(result)).toEqual({
      success: true,
      message: 'Inserted presentation template slide successfully.',
      sourcePresentationId: 'template-pres',
      sourceSlideId: 'template-slide-1',
      targetPresentationId: 'target-pres',
      newSlideId: 'slide-copy-7',
      insertionIndex: 2,
      appliedReplacements: [],
    });
  });

  it('insertPresentationTemplateSlide appends when insertionIndex is omitted and scopes placeholder replacement to the copied slide', async () => {
    process.env.GOOGLE_APPS_SCRIPT_ID = 'script-deployment-123';

    const scriptsRun = vi.fn().mockResolvedValue({
      data: {
        response: {
          result: {
            success: true,
            newSlideId: 'slide-copy-9',
            targetPresentationId: 'target-pres',
          },
        },
      },
    });
    const batchUpdate = vi.fn().mockResolvedValue({
      data: {
        replies: [{ replaceAllText: { occurrencesChanged: 1 } }],
      },
    });

    mockGetScriptClient.mockResolvedValue({
      scripts: { run: scriptsRun },
    } as any);
    mockGetSlidesClient.mockResolvedValue({
      presentations: {
        batchUpdate,
      },
    } as any);

    const result = await invokeTool('insertPresentationTemplateSlide', {
      sourcePresentationId: 'template-pres',
      sourceSlideId: 'template-slide-1',
      targetPresentationId: 'target-pres',
      replacements: [{ placeholder: '[[title]]', value: 'Agenda' }],
    });

    expect(scriptsRun).toHaveBeenCalledWith({
      scriptId: 'script-deployment-123',
      requestBody: {
        function: 'copySlideToPresentation',
        parameters: ['template-pres', 'template-slide-1', 'target-pres', null],
      },
    });
    expect(batchUpdate).toHaveBeenCalledWith({
      presentationId: 'target-pres',
      requestBody: {
        requests: [
          {
            replaceAllText: {
              containsText: { text: '[[title]]', matchCase: true },
              replaceText: 'Agenda',
              pageObjectIds: ['slide-copy-9'],
            },
          },
        ],
      },
    });
    expect(parsePayload(result)).toEqual({
      success: true,
      message: 'Inserted presentation template slide successfully.',
      sourcePresentationId: 'template-pres',
      sourceSlideId: 'template-slide-1',
      targetPresentationId: 'target-pres',
      newSlideId: 'slide-copy-9',
      insertionIndex: null,
      appliedReplacements: [
        { placeholder: '[[title]]', value: 'Agenda', occurrencesChanged: 1 },
      ],
    });
  });

  it('insertPresentationTemplateSlide rejects missing Apps Script configuration', async () => {
    await expect(
      invokeTool('insertPresentationTemplateSlide', {
        sourcePresentationId: 'template-pres',
        sourceSlideId: 'template-slide-1',
        targetPresentationId: 'target-pres',
      })
    ).rejects.toThrow(
      'Apps Script integration is not configured. Set GOOGLE_APPS_SCRIPT_ID or APPS_SCRIPT_DEPLOYMENT_ID.'
    );
  });

  it('insertPresentationTemplateSlide maps Apps Script not found and permission errors to stable user errors', async () => {
    process.env.APPS_SCRIPT_DEPLOYMENT_ID = 'legacy-script-id';

    const scriptsRun = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          response: {
            result: {
              success: false,
              message: 'Slide template not found',
            },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          error: {
            details: [
              {
                errorMessage: 'Exception: You do not have permission to call openById',
              },
            ],
          },
        },
      });

    mockGetScriptClient.mockResolvedValue({
      scripts: { run: scriptsRun },
    } as any);

    await expect(
      invokeTool('insertPresentationTemplateSlide', {
        sourcePresentationId: 'template-pres',
        sourceSlideId: 'missing-slide',
        targetPresentationId: 'target-pres',
      })
    ).rejects.toThrow('Source template slide not found.');

    await expect(
      invokeTool('insertPresentationTemplateSlide', {
        sourcePresentationId: 'template-pres',
        sourceSlideId: 'template-slide-1',
        targetPresentationId: 'target-pres',
      })
    ).rejects.toThrow(
      'Permission denied. Make sure you can read the source presentation, edit the target presentation, and access the Apps Script project.'
    );
  });

  it('replaceSlidePlaceholders scopes replacements to the target slide', async () => {
    const batchUpdate = vi.fn().mockResolvedValue({
      data: {
        replies: [
          { replaceAllText: { occurrencesChanged: 1 } },
          { replaceAllText: { occurrencesChanged: 2 } },
        ],
      },
    });

    mockGetSlidesClient.mockResolvedValue({
      presentations: {
        batchUpdate,
      },
    } as any);

    const result = await invokeTool('replaceSlidePlaceholders', {
      presentationId: 'pres-123',
      pageObjectId: 'slide-2',
      replacements: [
        { placeholder: '[[title]]', value: 'Agenda' },
        { placeholder: '[[column_1]]', value: 'First bullet' },
      ],
    });

    expect(batchUpdate).toHaveBeenCalledWith({
      presentationId: 'pres-123',
      requestBody: {
        requests: [
          {
            replaceAllText: {
              containsText: { text: '[[title]]', matchCase: true },
              replaceText: 'Agenda',
              pageObjectIds: ['slide-2'],
            },
          },
          {
            replaceAllText: {
              containsText: { text: '[[column_1]]', matchCase: true },
              replaceText: 'First bullet',
              pageObjectIds: ['slide-2'],
            },
          },
        ],
      },
    });
    expect(parsePayload(result)).toEqual({
      success: true,
      message: 'Replaced slide placeholders successfully.',
      presentationId: 'pres-123',
      pageObjectId: 'slide-2',
      appliedReplacements: [
        { placeholder: '[[title]]', value: 'Agenda', occurrencesChanged: 1 },
        { placeholder: '[[column_1]]', value: 'First bullet', occurrencesChanged: 2 },
      ],
    });
  });

  it('listSlideElements returns stable summaries including alt text and transform info', async () => {
    mockGetSlidesClient.mockResolvedValue({
      presentations: {
        pages: {
          get: vi.fn().mockResolvedValue({
            data: {
              pageType: 'SLIDE',
              pageElements: [
                {
                  objectId: 'img-1',
                  title: 'hero-image',
                  description: 'cover visual',
                  size: {
                    width: { magnitude: 400, unit: 'PT' },
                    height: { magnitude: 200, unit: 'PT' },
                  },
                  transform: {
                    scaleX: 1,
                    scaleY: 1,
                    shearX: 0,
                    shearY: 0,
                    translateX: 20,
                    translateY: 40,
                    unit: 'PT',
                  },
                  image: {
                    contentUrl: 'https://example.com/image.png',
                    sourceUrl: 'https://example.com/source.png',
                  },
                },
              ],
            },
          }),
        },
      },
    } as any);

    const result = await invokeTool('listSlideElements', {
      presentationId: 'pres-123',
      pageObjectId: 'slide-1',
    });

    expect(parsePayload(result)).toEqual({
      presentationId: 'pres-123',
      pageObjectId: 'slide-1',
      pageType: 'SLIDE',
      pageElements: [
        {
          objectId: 'img-1',
          title: 'hero-image',
          description: 'cover visual',
          size: {
            width: { magnitude: 400, unit: 'PT' },
            height: { magnitude: 200, unit: 'PT' },
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            shearX: 0,
            shearY: 0,
            translateX: 20,
            translateY: 40,
            unit: 'PT',
          },
          elementType: 'image',
          contentUrl: 'https://example.com/image.png',
          sourceUrl: 'https://example.com/source.png',
        },
      ],
      total: 1,
    });
  });

  it('insertTextIntoSlideShape replaces text inside an existing shape', async () => {
    const batchUpdate = vi.fn().mockResolvedValue({ data: { replies: [{}] } });

    mockGetSlidesClient.mockResolvedValue({
      presentations: {
        pages: {
          get: vi.fn().mockResolvedValue({
            data: {
              pageElements: [
                {
                  objectId: 'shape-1',
                  shape: {
                    text: {
                      textElements: [
                        { startIndex: 0, endIndex: 1, textRun: { content: '\n' } },
                        { startIndex: 1, endIndex: 6, textRun: { content: 'Hello' } },
                      ],
                    },
                  },
                },
              ],
            },
          }),
        },
        batchUpdate,
      },
    } as any);

    const result = await invokeTool('insertTextIntoSlideShape', {
      presentationId: 'pres-123',
      pageObjectId: 'slide-1',
      objectId: 'shape-1',
      text: 'Updated text',
      mode: 'replace',
    });

    expect(batchUpdate).toHaveBeenCalledWith({
      presentationId: 'pres-123',
      requestBody: {
        requests: [
          {
            deleteText: {
              objectId: 'shape-1',
              textRange: { type: 'ALL' },
            },
          },
          {
            insertText: {
              objectId: 'shape-1',
              text: 'Updated text',
              insertionIndex: 0,
            },
          },
        ],
      },
    });
    expect(parsePayload(result)).toEqual({
      success: true,
      message: 'Updated slide shape text successfully.',
      presentationId: 'pres-123',
      pageObjectId: 'slide-1',
      objectId: 'shape-1',
      mode: 'replace',
      textLength: 12,
      insertionIndex: null,
    });
  });
});
