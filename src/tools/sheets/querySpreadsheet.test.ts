import { describe, expect, it } from 'vitest';
import { register as registerQuerySpreadsheet } from './querySpreadsheet.js';

function captureToolConfig(registerTool: (server: any) => void) {
  let config: any;
  registerTool({
    addTool(input: any) {
      config = input;
    },
  });
  return config;
}

describe('querySpreadsheet tool contract', () => {
  it('accepts aggregate aliases for select and orderBy columns', () => {
    const tool = captureToolConfig(registerQuerySpreadsheet);
    const parsed = tool.parameters.parse({
      spreadsheetId: 'spreadsheet-1',
      range: 'Sales!A1:E10',
      groupBy: ['Product'],
      aggregations: [{ column: 'Revenue', function: 'sum', as: 'total_revenue' }],
      select: ['Product', 'total_revenue'],
      orderBy: [{ column: 'total_revenue', direction: 'desc' }],
    });

    expect(parsed.select).toEqual(['Product', 'total_revenue']);
    expect(parsed.orderBy).toEqual([{ column: 'total_revenue', direction: 'desc' }]);
  });
});
