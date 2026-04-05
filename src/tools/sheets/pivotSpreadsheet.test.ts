import { describe, expect, it } from 'vitest';
import { register as registerPivotSpreadsheet } from './pivotSpreadsheet.js';

function captureToolConfig(registerTool: (server: any) => void) {
  let config: any;
  registerTool({
    addTool(input: any) {
      config = input;
    },
  });
  return config;
}

describe('pivotSpreadsheet tool contract', () => {
  it('requires at least one row group and one value definition', () => {
    const tool = captureToolConfig(registerPivotSpreadsheet);
    const parsed = tool.parameters.parse({
      spreadsheetId: 'spreadsheet-1',
      range: 'Sales!A1:E10',
      rowGroups: [{ column: 'Product' }],
      values: [{ column: 'Revenue', function: 'sum', as: 'total_revenue' }],
    });

    expect(parsed.rowGroups).toEqual([{ column: 'Product', showTotals: true, sortOrder: 'ASCENDING' }]);
    expect(parsed.values).toEqual([{ column: 'Revenue', function: 'sum', as: 'total_revenue' }]);
  });

  it('rejects legacy output requests and points callers to the write tool', async () => {
    const tool = captureToolConfig(registerPivotSpreadsheet);
    const parsed = tool.parameters.parse({
      spreadsheetId: 'spreadsheet-1',
      range: 'Sales!A1:E10',
      rowGroups: [{ column: 'Product' }],
      values: [{ column: 'Revenue', function: 'sum' }],
      output: { mode: 'newSheet' },
    });

    await expect(tool.execute(parsed, { log: { info() {}, error() {} } })).rejects.toThrow(
      'pivotSpreadsheet is now read-only and no longer accepts output. Use writePivotToSheet to save a pivot into the spreadsheet.'
    );
  });
});
