import { describe, expect, it } from 'vitest';
import { register as registerSuggestSpreadsheetAnalyses } from './suggestSpreadsheetAnalyses.js';

function captureToolConfig(registerTool: (server: any) => void) {
  let config: any;
  registerTool({
    addTool(input: any) {
      config = input;
    },
  });
  return config;
}

describe('suggestSpreadsheetAnalyses tool contract', () => {
  it('defaults to human suggestions without payloads', () => {
    const tool = captureToolConfig(registerSuggestSpreadsheetAnalyses);
    const parsed = tool.parameters.parse({
      spreadsheetId: 'spreadsheet-1',
      range: 'Sales!A1:F50',
    });

    expect(parsed.analysisIntent).toBe('');
    expect(parsed.maxSuggestions).toBe(5);
    expect(parsed.includeSuggestedPayloads).toBe(false);
  });

  it('allows requesting more than five suggestions explicitly', () => {
    const tool = captureToolConfig(registerSuggestSpreadsheetAnalyses);
    const parsed = tool.parameters.parse({
      spreadsheetId: 'spreadsheet-1',
      range: 'Sales!A1:F50',
      maxSuggestions: 8,
    });

    expect(parsed.maxSuggestions).toBe(8);
  });
});
