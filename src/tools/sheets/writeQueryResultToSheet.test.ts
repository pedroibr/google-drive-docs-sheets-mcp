import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildQueryAnalysisMock,
  getSheetsClientMock,
  loadDatasetMock,
  writeMatrixOutputMock,
} = vi.hoisted(() => ({
  buildQueryAnalysisMock: vi.fn(),
  getSheetsClientMock: vi.fn(),
  loadDatasetMock: vi.fn(),
  writeMatrixOutputMock: vi.fn(),
}));

vi.mock('../../clients.js', () => ({
  getSheetsClient: getSheetsClientMock,
}));

vi.mock('./analytics.js', async () => {
  const actual = await vi.importActual<typeof import('./analytics.js')>('./analytics.js');
  return {
    ...actual,
    buildQueryAnalysis: buildQueryAnalysisMock,
    loadDataset: loadDatasetMock,
    writeMatrixOutput: writeMatrixOutputMock,
  };
});

import { register as registerWriteQueryResultToSheet } from './writeQueryResultToSheet.js';

function captureToolConfig(registerTool: (server: any) => void) {
  let config: any;
  registerTool({
    addTool(input: any) {
      config = input;
    },
  });
  return config;
}

describe('writeQueryResultToSheet tool contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSheetsClientMock.mockResolvedValue({ fake: 'sheets-client' });
    loadDatasetMock.mockResolvedValue({
      spreadsheetId: 'spreadsheet-1',
      sourceKind: 'range',
      sourceRef: 'Sales!A1:E10',
      sheetName: 'Sales',
    });
    buildQueryAnalysisMock.mockReturnValue({
      columns: ['Product', 'total_revenue'],
      rows: [{ Product: 'A', total_revenue: 250 }],
    });
    writeMatrixOutputMock.mockResolvedValue({
      sheetName: 'Query Results',
      sheetId: 123,
      range: 'Query Results!A1',
    });
  });

  it('requires an explicit output destination', () => {
    const tool = captureToolConfig(registerWriteQueryResultToSheet);

    expect(() =>
      tool.parameters.parse({
        spreadsheetId: 'spreadsheet-1',
        range: 'Sales!A1:E10',
        groupBy: ['Product'],
        aggregations: [{ column: 'Revenue', function: 'sum' }],
      })
    ).toThrow();
  });

  it('writes the computed query result to the requested sheet output', async () => {
    const tool = captureToolConfig(registerWriteQueryResultToSheet);
    const parsed = tool.parameters.parse({
      spreadsheetId: 'spreadsheet-1',
      range: 'Sales!A1:E10',
      groupBy: ['Product'],
      aggregations: [{ column: 'Revenue', function: 'sum', as: 'total_revenue' }],
      output: { mode: 'newSheet', startCell: 'A1' },
    });

    const result = await tool.execute(parsed, { log: { info() {}, error() {} } });
    const text = result.content[0].text;

    expect(writeMatrixOutputMock).toHaveBeenCalledWith(
      { fake: 'sheets-client' },
      'spreadsheet-1',
      [['Product', 'total_revenue'], ['A', 250]],
      { mode: 'newSheet', startCell: 'A1' },
      'Query Results'
    );
    expect(text).toContain('Wrote 1 query row(s) into Query Results!A1.');
  });
});
