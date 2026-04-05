import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildPivotAnalysisMock,
  createNativePivotSheetMock,
  getSheetsClientMock,
  loadDatasetMock,
} = vi.hoisted(() => ({
  buildPivotAnalysisMock: vi.fn(),
  createNativePivotSheetMock: vi.fn(),
  getSheetsClientMock: vi.fn(),
  loadDatasetMock: vi.fn(),
}));

vi.mock('../../clients.js', () => ({
  getSheetsClient: getSheetsClientMock,
}));

vi.mock('./analytics.js', async () => {
  const actual = await vi.importActual<typeof import('./analytics.js')>('./analytics.js');
  return {
    ...actual,
    buildPivotAnalysis: buildPivotAnalysisMock,
    createNativePivotSheet: createNativePivotSheetMock,
    loadDataset: loadDatasetMock,
  };
});

import { register as registerWritePivotToSheet } from './writePivotToSheet.js';

function captureToolConfig(registerTool: (server: any) => void) {
  let config: any;
  registerTool({
    addTool(input: any) {
      config = input;
    },
  });
  return config;
}

describe('writePivotToSheet tool contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSheetsClientMock.mockResolvedValue({ fake: 'sheets-client' });
    loadDatasetMock.mockResolvedValue({
      spreadsheetId: 'spreadsheet-1',
      sourceKind: 'range',
      sourceRef: 'Sales!A1:E10',
      sheetName: 'Sales',
    });
    buildPivotAnalysisMock.mockReturnValue({
      matrix: [['Product', 'Revenue'], ['A', 250]],
      rowCount: 1,
      columnCount: 2,
    });
    createNativePivotSheetMock.mockResolvedValue({
      sheetName: 'Pivot Results',
      sheetId: 456,
      anchorCell: 'Pivot Results!A1',
    });
  });

  it('requires an explicit output destination', () => {
    const tool = captureToolConfig(registerWritePivotToSheet);

    expect(() =>
      tool.parameters.parse({
        spreadsheetId: 'spreadsheet-1',
        range: 'Sales!A1:E10',
        rowGroups: [{ column: 'Product' }],
        values: [{ column: 'Revenue', function: 'sum' }],
      })
    ).toThrow();
  });

  it('writes the computed pivot to the requested sheet output', async () => {
    const tool = captureToolConfig(registerWritePivotToSheet);
    const parsed = tool.parameters.parse({
      spreadsheetId: 'spreadsheet-1',
      range: 'Sales!A1:E10',
      rowGroups: [{ column: 'Product' }],
      values: [{ column: 'Revenue', function: 'sum' }],
      output: { mode: 'newSheet', startCell: 'A1' },
    });

    const result = await tool.execute(parsed, { log: { info() {}, error() {} } });
    const text = result.content[0].text;

    expect(createNativePivotSheetMock).toHaveBeenCalledWith(
      { fake: 'sheets-client' },
      {
        spreadsheetId: 'spreadsheet-1',
        sourceKind: 'range',
        sourceRef: 'Sales!A1:E10',
        sheetName: 'Sales',
      },
      [{ column: 'Product', showTotals: true, sortOrder: 'ASCENDING' }],
      [],
      [{ column: 'Revenue', function: 'sum' }],
      [],
      true,
      { mode: 'newSheet', startCell: 'A1' }
    );
    expect(text).toContain('Created native pivot output at Pivot Results!A1.');
  });
});
