import { describe, expect, it } from 'vitest';
import {
  buildPivotLogicalResult,
  finalizeRowResult,
  suggestSpreadsheetAnalyses,
  runPivotDrillDown,
  runQuery,
  type LoadedDataset,
  type TabularRow,
} from './analytics.js';

const sampleRows: TabularRow[] = [
  { Region: 'South', Product: 'A', Month: 'Jan', Revenue: 100, Rep: 'Ana' },
  { Region: 'South', Product: 'A', Month: 'Feb', Revenue: 150, Rep: 'Beto' },
  { Region: 'South', Product: 'B', Month: 'Jan', Revenue: 80, Rep: 'Ana' },
  { Region: 'North', Product: 'A', Month: 'Jan', Revenue: 60, Rep: 'Caio' },
];

function buildDataset(rows: TabularRow[], headers = Object.keys(rows[0] ?? {})): LoadedDataset {
  return {
    spreadsheetId: 'spreadsheet-1',
    sourceKind: 'range',
    sourceRef: 'Sales!A1:Z999',
    sheetName: 'Sales',
    sheetId: 0,
    headerRowUsed: 1,
    headers,
    rows,
    sourceGridRange: {},
    sourceColumnOffsets: Object.fromEntries(headers.map((header, index) => [header, index])),
    hasFooterRow: false,
  };
}

describe('sheets analytics helpers', () => {
  it('runs grouped queries with filters, aggregations, and alias sorting', () => {
    const result = runQuery(
      sampleRows,
      [{ column: 'Region', operator: 'equals', value: 'South' }],
      [{ column: 'total_revenue', direction: 'desc' }],
      undefined,
      ['Product'],
      [{ column: 'Revenue', function: 'sum', as: 'total_revenue' }]
    );

    expect(result.columns).toEqual(['Product', 'total_revenue']);
    expect(result.rows).toEqual([
      { Product: 'A', total_revenue: 250 },
      { Product: 'B', total_revenue: 80 },
    ]);
  });

  it('builds crossed logical pivots without writing to the spreadsheet', () => {
    const pivot = buildPivotLogicalResult(
      sampleRows,
      [{ column: 'Region', operator: 'equals', value: 'South' }],
      [{ column: 'Product' }],
      [{ column: 'Month' }],
      [{ column: 'Revenue', function: 'sum', as: 'Revenue Total' }],
      true
    );

    expect(pivot.matrix[0]).toEqual([
      'Product',
      'Jan | Revenue Total',
      'Feb | Revenue Total',
      'Total | Revenue Total',
    ]);
    expect(pivot.matrix[1]).toEqual(['A', 100, 150, 250]);
    expect(pivot.matrix[2]).toEqual(['B', 80, null, 80]);
    expect(pivot.matrix[3]).toEqual(['Grand Total', 180, 150, 330]);
  });

  it('drills down pivot buckets by group values', () => {
    const rows = runPivotDrillDown(
      sampleRows,
      [{ column: 'Region', operator: 'equals', value: 'South' }],
      [{ column: 'Product' }],
      [{ column: 'Month' }],
      ['A'],
      ['Feb']
    );

    expect(rows).toEqual([{ Region: 'South', Product: 'A', Month: 'Feb', Revenue: 150, Rep: 'Beto' }]);
  });

  it('exports large row results to CSV previews instead of returning every row inline', () => {
    const largeRows = Array.from({ length: 60 }, (_, index) => ({
      Item: `Row ${index + 1}`,
      Value: index + 1,
    }));

    const result = finalizeRowResult('analytics-preview', ['Item', 'Value'], largeRows);

    expect(result.rowCount).toBe(60);
    expect(result.truncated).toBe(true);
    expect(result.previewRowCount).toBe(50);
    expect(result.rows).toHaveLength(50);
    expect(result.csvPath).toBeDefined();
  });

  it('suggests metric, breakdown, trend, ranking, and pivot analyses for sales-style data', () => {
    const { datasetProfile, suggestions } = suggestSpreadsheetAnalyses(buildDataset(sampleRows));

    expect(datasetProfile.numericColumns).toContain('Revenue');
    expect(datasetProfile.temporalColumns).toContain('Month');
    expect(suggestions.length).toBeGreaterThanOrEqual(4);
    expect(suggestions.map((item) => item.analysisType)).toEqual(
      expect.arrayContaining(['metric_summary', 'category_breakdown', 'time_trend', 'cross_pivot'])
    );
    expect(suggestions.every((item) => item.suggestedPayload === undefined)).toBe(true);
  });

  it('reorders suggestions when analysisIntent points to a matching dimension', () => {
    const { suggestions } = suggestSpreadsheetAnalyses(buildDataset(sampleRows), {
      analysisIntent: 'analisar vendedores',
    });

    expect(suggestions[0]?.title).toContain('Rep');
  });

  it('generates multiple suggestions centered on an intent-matched branch dimension', () => {
    const branchRows: TabularRow[] = [
      { Branch: 'East', Product: 'A', Month: 'Jan', Revenue: 100, Cost: 60 },
      { Branch: 'East', Product: 'B', Month: 'Feb', Revenue: 120, Cost: 70 },
      { Branch: 'West', Product: 'A', Month: 'Jan', Revenue: 90, Cost: 55 },
      { Branch: 'West', Product: 'C', Month: 'Feb', Revenue: 140, Cost: 80 },
    ];

    const { suggestions } = suggestSpreadsheetAnalyses(buildDataset(branchRows), {
      analysisIntent: 'analises por branches',
      maxSuggestions: 6,
    });

    const branchFocused = suggestions.filter((item) => item.title.toLowerCase().includes('branch'));
    expect(branchFocused.length).toBeGreaterThanOrEqual(2);
    expect(branchFocused.some((item) => item.analysisType === 'intent_focus_breakdown')).toBe(true);
  });

  it('returns payloads only when explicitly requested', () => {
    const { suggestions } = suggestSpreadsheetAnalyses(buildDataset(sampleRows), {
      includeSuggestedPayloads: true,
      maxSuggestions: 2,
    });

    expect(suggestions).toHaveLength(2);
    expect(suggestions.every((item) => item.suggestedPayload)).toBe(true);
  });

  it('falls back to count and completeness suggestions when there is no numeric metric', () => {
    const rows: TabularRow[] = [
      { Seller: 'Ana', Region: 'South', Status: 'Won', Month: '2026-01' },
      { Seller: 'Beto', Region: 'South', Status: '', Month: '2026-01' },
      { Seller: 'Caio', Region: 'North', Status: 'Lost', Month: '2026-02' },
    ];

    const { datasetProfile, suggestions } = suggestSpreadsheetAnalyses(buildDataset(rows));

    expect(datasetProfile.numericColumns).toEqual([]);
    expect(suggestions.map((item) => item.analysisType)).toContain('category_distribution');
    expect(suggestions.map((item) => item.analysisType)).toContain('data_completeness');
    expect(suggestions.some((item) => item.recommendedTool === 'pivotSpreadsheet')).toBe(false);
  });
});
