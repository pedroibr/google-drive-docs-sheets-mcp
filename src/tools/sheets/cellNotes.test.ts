import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSheetsClientMock } = vi.hoisted(() => ({
  getSheetsClientMock: vi.fn(),
}));

vi.mock('../../clients.js', () => ({
  getSheetsClient: getSheetsClientMock,
}));

import { register as registerReadCellNotes } from './readCellNotes.js';
import { register as registerUpdateCellNotes } from './updateCellNotes.js';

function captureToolConfig(registerTool: (server: any) => void) {
  let config: any;
  registerTool({
    addTool(input: any) {
      config = input;
    },
  });
  return config;
}

function parseToolResult(text: string) {
  const parts = text.split('\n\n');
  return JSON.parse(parts[parts.length - 1]);
}

describe('cell note tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('readCellNotes filters out cells without notes and preserves formatted values', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        sheets: [
          {
            properties: { title: 'Sheet1' },
            data: [
              {
                startRow: 1,
                startColumn: 2,
                rowData: [
                  {
                    values: [
                      { note: 'First note', formattedValue: 'Alpha' },
                      { formattedValue: 'No note here' },
                    ],
                  },
                  {
                    values: [{ note: 'Second note' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    getSheetsClientMock.mockResolvedValue({
      spreadsheets: { get },
    });

    const tool = captureToolConfig(registerReadCellNotes);
    const parsed = tool.parameters.parse({
      spreadsheetId: 'spreadsheet-1',
      range: 'Sheet1!C2:D3',
    });

    const result = await tool.execute(parsed, { log: { info() {}, error() {} } });
    const payload = parseToolResult(result.content[0].text);

    expect(get).toHaveBeenCalledWith({
      spreadsheetId: 'spreadsheet-1',
      ranges: ['Sheet1!C2:D3'],
      includeGridData: true,
      fields:
        'sheets.properties.title,sheets.data.rowData.values.note,sheets.data.rowData.values.formattedValue,sheets.data.startRow,sheets.data.startColumn',
    });
    expect(payload).toEqual({
      spreadsheetId: 'spreadsheet-1',
      range: 'Sheet1!C2:D3',
      sheetName: 'Sheet1',
      cells: [
        { cell: 'C2', note: 'First note', formattedValue: 'Alpha' },
        { cell: 'C3', note: 'Second note', formattedValue: null },
      ],
      noteCount: 2,
    });
  });

  it('updateCellNotes uses repeatCell with the note field mask', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        sheets: [{ properties: { title: 'Sheet1', sheetId: 123 } }],
      },
    });
    const batchUpdate = vi.fn().mockResolvedValue({ data: { replies: [{}] } });
    getSheetsClientMock.mockResolvedValue({
      spreadsheets: { get, batchUpdate },
    });

    const tool = captureToolConfig(registerUpdateCellNotes);
    const parsed = tool.parameters.parse({
      spreadsheetId: 'spreadsheet-1',
      range: 'Sheet1!B2:C3',
      note: 'Review with finance',
    });

    const result = await tool.execute(parsed, { log: { info() {}, error() {} } });
    const payload = parseToolResult(result.content[0].text);

    expect(batchUpdate).toHaveBeenCalledWith({
      spreadsheetId: 'spreadsheet-1',
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: 123,
                startRowIndex: 1,
                endRowIndex: 3,
                startColumnIndex: 1,
                endColumnIndex: 3,
              },
              cell: {
                note: 'Review with finance',
              },
              fields: 'note',
            },
          },
        ],
      },
    });
    expect(payload).toEqual({
      success: true,
      message: 'Updated cell notes successfully.',
      spreadsheetId: 'spreadsheet-1',
      range: 'Sheet1!B2:C3',
      note: 'Review with finance',
    });
  });

  it('updateCellNotes requires a non-empty note', () => {
    const tool = captureToolConfig(registerUpdateCellNotes);

    expect(() =>
      tool.parameters.parse({
        spreadsheetId: 'spreadsheet-1',
        range: 'Sheet1!B2',
        note: '',
      })
    ).toThrow();
  });
});
