import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { UserError } from 'fastmcp';
import { sheets_v4 } from 'googleapis';
import { z } from 'zod';
import * as SheetsHelpers from '../../googleSheetsApiHelpers.js';

type Sheets = sheets_v4.Sheets;

export const PREVIEW_ROW_LIMIT = 50;
const LARGE_RESULT_CELL_LIMIT = 5000;

export const AnalysisScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type AnalysisScalar = z.infer<typeof AnalysisScalarSchema>;

export const FilterOperatorSchema = z.enum([
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'notIn',
  'isEmpty',
  'isNotEmpty',
]);
export type FilterOperator = z.infer<typeof FilterOperatorSchema>;

export const FilterSchema = z.object({
  column: z.string().min(1).describe('Column name to filter on.'),
  operator: FilterOperatorSchema.describe('Comparison operator to apply.'),
  value: AnalysisScalarSchema.optional().describe('Single comparison value when the operator needs one.'),
  values: z.array(AnalysisScalarSchema).optional().describe('Multiple comparison values for IN/NOT IN filters.'),
});
export type FilterDefinition = z.infer<typeof FilterSchema>;

export const OrderBySchema = z.object({
  column: z.string().min(1).describe('Column name or aggregation alias to sort by.'),
  direction: z.enum(['asc', 'desc']).optional().default('asc').describe('Sort direction.'),
});
export type OrderByDefinition = z.infer<typeof OrderBySchema>;

export const AggregationFunctionSchema = z.enum(['count', 'countNonEmpty', 'sum', 'avg', 'min', 'max']);
export type AggregationFunction = z.infer<typeof AggregationFunctionSchema>;

export const AggregationSchema = z.object({
  column: z.string().min(1).optional().describe('Column to aggregate. Required for every function except count.'),
  function: AggregationFunctionSchema.describe('Aggregation to compute.'),
  as: z.string().min(1).optional().describe('Optional output column name for the aggregation result.'),
});
export type AggregationDefinition = z.infer<typeof AggregationSchema>;

export const OutputTargetSchema = z.object({
  mode: z.enum(['newSheet', 'existingSheet']).optional().default('newSheet').describe('Where to materialize the output when requested.'),
  sheetName: z.string().min(1).optional().describe('Target sheet name. Required for existingSheet mode; optional custom title for newSheet mode.'),
  startCell: z.string().optional().default('A1').describe('Anchor cell for writing the result, such as "A1".'),
});
export type OutputTarget = z.infer<typeof OutputTargetSchema>;

export const PivotGroupSchema = z.object({
  column: z.string().min(1).describe('Source column name for this pivot grouping.'),
  label: z.string().min(1).optional().describe('Optional display label for this grouping.'),
  showTotals: z.boolean().optional().default(true).describe('Whether totals should be shown for this grouping.'),
  sortOrder: z.enum(['ASCENDING', 'DESCENDING']).optional().default('ASCENDING').describe('Sort order for the grouping.'),
});
export type PivotGroupDefinition = z.infer<typeof PivotGroupSchema>;

export const PivotValueSchema = z.object({
  column: z.string().min(1).describe('Source column name for the aggregated value.'),
  function: AggregationFunctionSchema.describe('Aggregation to compute for the value column.'),
  as: z.string().min(1).optional().describe('Optional display label for the value column.'),
});
export type PivotValueDefinition = z.infer<typeof PivotValueSchema>;

export type TabularRow = Record<string, AnalysisScalar>;

export interface LoadedDataset {
  spreadsheetId: string;
  sourceKind: 'range' | 'table';
  sourceRef: string;
  sheetName: string;
  sheetId: number;
  headerRowUsed: number;
  headers: string[];
  rows: TabularRow[];
  sourceGridRange: sheets_v4.Schema$GridRange;
  sourceColumnOffsets: Record<string, number>;
  hasFooterRow: boolean;
}

export interface QueryResultData {
  columns: string[];
  rows: TabularRow[];
}

export interface PivotLogicalResult {
  matrix: AnalysisScalar[][];
  rowHeaders: string[];
  columnHeaders: string[];
  rowCount: number;
  columnCount: number;
}

export interface ColumnProfile {
  column: string;
  kind: 'numeric' | 'categorical' | 'temporal' | 'text';
  cardinality: 'low' | 'medium' | 'high';
  nonEmptyCount: number;
  emptyCount: number;
  uniqueCount: number;
  numericRatio: number;
  temporalRatio: number;
}

export interface DatasetProfile {
  rowCount: number;
  columnCount: number;
  numericColumns: string[];
  categoricalColumns: string[];
  temporalColumns: string[];
  textColumns: string[];
  lowCardinalityColumns: string[];
  mediumCardinalityColumns: string[];
  highCardinalityColumns: string[];
  signals: string[];
  columnProfiles: ColumnProfile[];
}

export interface SuggestedAnalysis {
  title: string;
  summary: string;
  whyItMatters: string;
  complexity: 'basic' | 'intermediate' | 'advanced';
  recommendedTool: 'querySpreadsheet' | 'pivotSpreadsheet';
  analysisType: string;
  confidence: number;
  suggestedPayload?: Record<string, unknown>;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '').trim();
}

function buildSourceColumnOffsets(headers: string[]): Record<string, number> {
  const offsets: Record<string, number> = {};
  for (let i = 0; i < headers.length; i += 1) {
    offsets[headers[i]] = i;
  }
  return offsets;
}

function ensureHeaders(headers: string[], context: string) {
  const seen = new Set<string>();
  for (const header of headers) {
    if (!header) {
      throw new UserError(`${context} contains an empty header cell. Analysis tools require non-empty headers.`);
    }
    const key = header.toLowerCase();
    if (seen.has(key)) {
      throw new UserError(`${context} contains duplicate header "${header}". Headers must be unique.`);
    }
    seen.add(key);
  }
}

function resolveHeaderIndex(headers: string[], column: string): number {
  const exact = headers.indexOf(column);
  if (exact !== -1) return exact;

  const lowered = column.toLowerCase();
  const matches = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => header.toLowerCase() === lowered);
  if (matches.length === 1) return matches[0].index;
  if (matches.length > 1) {
    throw new UserError(`Column "${column}" is ambiguous. Use the exact header text.`);
  }
  throw new UserError(`Column "${column}" was not found in the selected dataset.`);
}

function toRecordRows(headers: string[], values: unknown[][]): TabularRow[] {
  return values.map((row) => {
    const record: TabularRow = {};
    headers.forEach((header, index) => {
      const raw = row[index];
      if (raw === undefined) {
        record[header] = null;
      } else if (raw === null || typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
        record[header] = raw;
      } else {
        record[header] = String(raw);
      }
    });
    return record;
  });
}

function parseNumeric(value: AnalysisScalar, column: string, fnName: AggregationFunction): number | null {
  if (value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') {
    throw new UserError(`Aggregation "${fnName}" requires numeric data in column "${column}".`);
  }
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  throw new UserError(`Aggregation "${fnName}" requires numeric data in column "${column}".`);
}

function normalizeString(value: AnalysisScalar): string {
  return String(value ?? '').trim().toLowerCase();
}

function isEmptyValue(value: AnalysisScalar): boolean {
  return value === null || value === '';
}

function compareScalars(a: AnalysisScalar, b: AnalysisScalar): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b));
}

function evaluateFilter(row: TabularRow, filter: FilterDefinition): boolean {
  const actual = row[filter.column] ?? null;
  switch (filter.operator) {
    case 'equals': {
      if (filter.value === undefined) throw new UserError(`Filter on "${filter.column}" requires a value.`);
      if (typeof actual === 'number' || typeof filter.value === 'number') {
        const left = parseNumeric(actual, filter.column, 'sum');
        const right = parseNumeric(filter.value, filter.column, 'sum');
        return left === right;
      }
      return normalizeString(actual) === normalizeString(filter.value);
    }
    case 'notEquals':
      return !evaluateFilter(row, { ...filter, operator: 'equals' });
    case 'contains': {
      if (filter.value === undefined) throw new UserError(`Filter on "${filter.column}" requires a value.`);
      return normalizeString(actual).includes(normalizeString(filter.value));
    }
    case 'notContains':
      return !evaluateFilter(row, { ...filter, operator: 'contains' });
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if (filter.value === undefined) throw new UserError(`Filter on "${filter.column}" requires a value.`);
      const left = parseNumeric(actual, filter.column, 'sum');
      const right = parseNumeric(filter.value, filter.column, 'sum');
      if (left === null || right === null) return false;
      if (filter.operator === 'gt') return left > right;
      if (filter.operator === 'gte') return left >= right;
      if (filter.operator === 'lt') return left < right;
      return left <= right;
    }
    case 'in':
    case 'notIn': {
      const values = filter.values ?? [];
      if (values.length === 0) throw new UserError(`Filter "${filter.operator}" on "${filter.column}" requires values.`);
      const matches = values.some((candidate) => {
        if (typeof actual === 'number' || typeof candidate === 'number') {
          const left = parseNumeric(actual, filter.column, 'sum');
          const right = parseNumeric(candidate, filter.column, 'sum');
          return left === right;
        }
        return normalizeString(actual) === normalizeString(candidate);
      });
      return filter.operator === 'in' ? matches : !matches;
    }
    case 'isEmpty':
      return isEmptyValue(actual);
    case 'isNotEmpty':
      return !isEmptyValue(actual);
  }
}

export function applyFilters(rows: TabularRow[], filters: FilterDefinition[] = []): TabularRow[] {
  if (filters.length === 0) return rows;
  return rows.filter((row) => filters.every((filter) => evaluateFilter(row, filter)));
}

export function sortRows(rows: TabularRow[], orderBy: OrderByDefinition[] = []): TabularRow[] {
  if (orderBy.length === 0) return rows;
  return [...rows].sort((left, right) => {
    for (const rule of orderBy) {
      const comparison = compareScalars(left[rule.column] ?? null, right[rule.column] ?? null);
      if (comparison !== 0) {
        return rule.direction === 'desc' ? -comparison : comparison;
      }
    }
    return 0;
  });
}

export function aggregationAlias(aggregation: AggregationDefinition): string {
  if (aggregation.as) return aggregation.as;
  if (aggregation.function === 'count') return 'count';
  if (!aggregation.column) {
    throw new UserError(`Aggregation "${aggregation.function}" requires a column.`);
  }
  return `${aggregation.function}_${aggregation.column}`;
}

function aggregateRows(rows: TabularRow[], aggregations: AggregationDefinition[]): TabularRow {
  const output: TabularRow = {};
  for (const aggregation of aggregations) {
    const alias = aggregationAlias(aggregation);
    switch (aggregation.function) {
      case 'count':
        output[alias] = rows.length;
        break;
      case 'countNonEmpty': {
        if (!aggregation.column) throw new UserError('countNonEmpty requires a column.');
        output[alias] = rows.filter((row) => !isEmptyValue(row[aggregation.column!] ?? null)).length;
        break;
      }
      case 'sum':
      case 'avg':
      case 'min':
      case 'max': {
        if (!aggregation.column) throw new UserError(`${aggregation.function} requires a column.`);
        const values = rows
          .map((row) => parseNumeric(row[aggregation.column!] ?? null, aggregation.column!, aggregation.function))
          .filter((value): value is number => value !== null);
        if (values.length === 0) {
          output[alias] = null;
          break;
        }
        if (aggregation.function === 'sum') output[alias] = values.reduce((sum, value) => sum + value, 0);
        if (aggregation.function === 'avg') output[alias] = values.reduce((sum, value) => sum + value, 0) / values.length;
        if (aggregation.function === 'min') output[alias] = Math.min(...values);
        if (aggregation.function === 'max') output[alias] = Math.max(...values);
        break;
      }
    }
  }
  return output;
}

export function runQuery(
  inputRows: TabularRow[],
  filters: FilterDefinition[] = [],
  orderBy: OrderByDefinition[] = [],
  select: string[] | undefined,
  groupBy: string[] = [],
  aggregations: AggregationDefinition[] = [],
  limit?: number
): QueryResultData {
  const filteredRows = applyFilters(inputRows, filters);

  if (aggregations.length === 0 && groupBy.length === 0) {
    const sortedRows = sortRows(filteredRows, orderBy);
    const limitedRows = typeof limit === 'number' ? sortedRows.slice(0, limit) : sortedRows;
    const columns = select && select.length > 0 ? select : Object.keys(limitedRows[0] || inputRows[0] || {});
    const projectedRows = limitedRows.map((row) =>
      Object.fromEntries(columns.map((column) => [column, row[column] ?? null]))
    );
    return { columns, rows: projectedRows };
  }

  if (aggregations.length === 0) {
    throw new UserError('groupBy requires at least one aggregation.');
  }

  const grouped = new Map<string, { groupValues: AnalysisScalar[]; rows: TabularRow[] }>();
  for (const row of filteredRows) {
    const groupValues = groupBy.map((column) => row[column] ?? null);
    const key = JSON.stringify(groupValues);
    const entry = grouped.get(key) ?? { groupValues, rows: [] };
    entry.rows.push(row);
    grouped.set(key, entry);
  }

  const aggregatedRows = [...grouped.values()].map(({ groupValues, rows }) => {
    const base = Object.fromEntries(groupBy.map((column, index) => [column, groupValues[index] ?? null]));
    return {
      ...base,
      ...aggregateRows(rows, aggregations),
    };
  });

  const sortedRows = sortRows(aggregatedRows, orderBy);
  const limitedRows = typeof limit === 'number' ? sortedRows.slice(0, limit) : sortedRows;
  const allColumns = [...groupBy, ...aggregations.map(aggregationAlias)];
  const columns = select && select.length > 0 ? select : allColumns;
  const projectedRows = limitedRows.map((row) =>
    Object.fromEntries(columns.map((column) => [column, row[column] ?? null]))
  );
  return { columns, rows: projectedRows };
}

function buildBucketKey(values: AnalysisScalar[]): string {
  return JSON.stringify(values);
}

function stringifyBucketValues(values: AnalysisScalar[]): string {
  return values.map((value) => (value === null ? '(blank)' : String(value))).join(' | ');
}

function aggregateCellRows(rows: TabularRow[], values: PivotValueDefinition[]): TabularRow {
  return aggregateRows(
    rows,
    values.map((value) => ({
      column: value.column,
      function: value.function,
      as: value.as ?? `${value.function}_${value.column}`,
    }))
  );
}

export function buildPivotLogicalResult(
  inputRows: TabularRow[],
  filters: FilterDefinition[],
  rowGroups: PivotGroupDefinition[],
  columnGroups: PivotGroupDefinition[],
  values: PivotValueDefinition[],
  includeTotals: boolean
): PivotLogicalResult {
  const rows = applyFilters(inputRows, filters);
  const rowBuckets = new Map<string, AnalysisScalar[]>();
  const columnBuckets = new Map<string, AnalysisScalar[]>();
  const cellRows = new Map<string, TabularRow[]>();

  for (const row of rows) {
    const rowValues = rowGroups.map((group) => row[group.column] ?? null);
    const columnValues = columnGroups.map((group) => row[group.column] ?? null);
    const rowKey = buildBucketKey(rowValues);
    const columnKey = buildBucketKey(columnValues);

    if (!rowBuckets.has(rowKey)) rowBuckets.set(rowKey, rowValues);
    if (!columnBuckets.has(columnKey)) columnBuckets.set(columnKey, columnValues);

    const combinedKey = `${rowKey}::${columnKey}`;
    const bucket = cellRows.get(combinedKey) ?? [];
    bucket.push(row);
    cellRows.set(combinedKey, bucket);
  }

  if (columnGroups.length === 0 && !columnBuckets.has('[]')) {
    columnBuckets.set('[]', []);
  }

  const orderedRowBuckets = [...rowBuckets.values()];
  const orderedColumnBuckets = [...columnBuckets.values()];
  const valueLabels = values.map((value) => value.as ?? `${value.function}_${value.column}`);

  const headerRow = [
    ...rowGroups.map((group) => group.label ?? group.column),
    ...orderedColumnBuckets.flatMap((bucket) => {
      const bucketLabel = bucket.length === 0 ? '' : stringifyBucketValues(bucket);
      return valueLabels.map((label) => (bucketLabel ? `${bucketLabel} | ${label}` : label));
    }),
    ...(includeTotals && columnGroups.length > 0 ? valueLabels.map((label) => `Total | ${label}`) : []),
  ];

  const matrixRows: AnalysisScalar[][] = orderedRowBuckets.map((rowBucket) => {
    const rowKey = buildBucketKey(rowBucket);
    const rowValues: AnalysisScalar[] = [...rowBucket];

    for (const columnBucket of orderedColumnBuckets) {
      const columnKey = buildBucketKey(columnBucket);
      const aggregates = aggregateCellRows(cellRows.get(`${rowKey}::${columnKey}`) ?? [], values);
      valueLabels.forEach((label) => rowValues.push(aggregates[label] ?? null));
    }

    if (includeTotals && columnGroups.length > 0) {
      const matchingRows = rows.filter((row) =>
        rowGroups.every((group, index) => (row[group.column] ?? null) === rowBucket[index])
      );
      const totalAggs = aggregateCellRows(matchingRows, values);
      valueLabels.forEach((label) => rowValues.push(totalAggs[label] ?? null));
    }

    return rowValues;
  });

  if (includeTotals) {
    const totalRow: AnalysisScalar[] = rowGroups.map((group, index) => {
      if (index === 0) return 'Grand Total';
      return '';
    });

    for (const columnBucket of orderedColumnBuckets) {
      const matchingRows =
        columnBucket.length === 0
          ? rows
          : rows.filter((row) =>
              columnGroups.every((group, index) => (row[group.column] ?? null) === columnBucket[index])
            );
      const totalAggs = aggregateCellRows(matchingRows, values);
      valueLabels.forEach((label) => totalRow.push(totalAggs[label] ?? null));
    }

    if (includeTotals && columnGroups.length > 0) {
      const grandTotals = aggregateCellRows(rows, values);
      valueLabels.forEach((label) => totalRow.push(grandTotals[label] ?? null));
    }

    matrixRows.push(totalRow);
  }

  return {
    matrix: [headerRow, ...matrixRows],
    rowHeaders: rowGroups.map((group) => group.label ?? group.column),
    columnHeaders: headerRow,
    rowCount: matrixRows.length,
    columnCount: headerRow.length,
  };
}

export function runPivotDrillDown(
  inputRows: TabularRow[],
  filters: FilterDefinition[],
  rowGroups: PivotGroupDefinition[],
  columnGroups: PivotGroupDefinition[],
  targetRowGroupValues: AnalysisScalar[],
  targetColumnGroupValues?: AnalysisScalar[]
): TabularRow[] {
  if (targetRowGroupValues.length !== rowGroups.length) {
    throw new UserError('targetRowGroupValues must include one value for each row group.');
  }
  if (targetColumnGroupValues && targetColumnGroupValues.length !== columnGroups.length) {
    throw new UserError('targetColumnGroupValues must include one value for each column group.');
  }

  return applyFilters(inputRows, filters).filter((row) => {
    const matchesRowGroups = rowGroups.every(
      (group, index) => (row[group.column] ?? null) === targetRowGroupValues[index]
    );
    if (!matchesRowGroups) return false;
    if (!targetColumnGroupValues) return true;
    return columnGroups.every(
      (group, index) => (row[group.column] ?? null) === targetColumnGroupValues[index]
    );
  });
}

function csvEscape(value: AnalysisScalar): string {
  const text = value === null ? '' : String(value);
  if (text.includes('"') || text.includes(',') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeCsvTemp(prefix: string, matrix: AnalysisScalar[][]): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'google-sheets-mcp-'));
  const filePath = path.join(tempDir, `${prefix}.csv`);
  const csv = matrix.map((row) => row.map(csvEscape).join(',')).join('\n');
  fs.writeFileSync(filePath, csv, 'utf8');
  return filePath;
}

function makePreview<T>(rows: T[], previewLimit = PREVIEW_ROW_LIMIT) {
  return {
    rows: rows.slice(0, previewLimit),
    truncated: rows.length > previewLimit,
    previewRowCount: Math.min(rows.length, previewLimit),
  };
}

export function finalizeRowResult(
  prefix: string,
  columns: string[],
  rows: TabularRow[]
): {
  columns: string[];
  rows: TabularRow[];
  rowCount: number;
  truncated: boolean;
  previewRowCount: number;
  csvPath?: string;
} {
  const preview = makePreview(rows);
  const matrix = [columns, ...rows.map((row) => columns.map((column) => row[column] ?? null))];
  const isLarge = rows.length > PREVIEW_ROW_LIMIT || matrix.length * Math.max(columns.length, 1) > LARGE_RESULT_CELL_LIMIT;
  return {
    columns,
    rows: isLarge ? preview.rows : rows,
    rowCount: rows.length,
    truncated: isLarge ? preview.truncated : false,
    previewRowCount: isLarge ? preview.previewRowCount : rows.length,
    ...(isLarge ? { csvPath: writeCsvTemp(prefix, matrix) } : {}),
  };
}

export function finalizeMatrixResult(
  prefix: string,
  matrix: AnalysisScalar[][]
): {
  matrix: AnalysisScalar[][];
  rowCount: number;
  columnCount: number;
  truncated: boolean;
  previewRowCount: number;
  csvPath?: string;
} {
  const rowCount = Math.max(matrix.length - 1, 0);
  const columnCount = matrix[0]?.length ?? 0;
  const isLarge = rowCount > PREVIEW_ROW_LIMIT || matrix.length * Math.max(columnCount, 1) > LARGE_RESULT_CELL_LIMIT;
  const previewMatrix = isLarge ? [matrix[0], ...matrix.slice(1, PREVIEW_ROW_LIMIT + 1)] : matrix;
  return {
    matrix: previewMatrix,
    rowCount,
    columnCount,
    truncated: isLarge,
    previewRowCount: isLarge ? Math.min(rowCount, PREVIEW_ROW_LIMIT) : rowCount,
    ...(isLarge ? { csvPath: writeCsvTemp(prefix, matrix) } : {}),
  };
}

function outputSheetTitle(prefix: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix} ${stamp}`.slice(0, 100);
}

export async function writeMatrixOutput(
  sheets: Sheets,
  spreadsheetId: string,
  matrix: AnalysisScalar[][],
  output: OutputTarget,
  prefix: string
): Promise<{ sheetName: string; sheetId: number; range: string }> {
  let sheetName = output.sheetName ?? outputSheetTitle(prefix);
  let sheetId: number;

  if (output.mode === 'newSheet') {
    const response = await SheetsHelpers.addSheet(sheets, spreadsheetId, sheetName);
    const addedSheet = response.replies?.[0]?.addSheet?.properties;
    if (!addedSheet?.sheetId || !addedSheet.title) {
      throw new UserError('Failed to create output sheet.');
    }
    sheetId = addedSheet.sheetId;
    sheetName = addedSheet.title;
  } else {
    if (!output.sheetName) {
      throw new UserError('output.sheetName is required when mode is "existingSheet".');
    }
    sheetName = output.sheetName;
    sheetId = await SheetsHelpers.resolveSheetId(sheets, spreadsheetId, sheetName);
  }

  await SheetsHelpers.writeRange(
    sheets,
    spreadsheetId,
    `${sheetName}!${output.startCell}`,
    matrix,
    'USER_ENTERED'
  );

  return {
    sheetName,
    sheetId,
    range: `${sheetName}!${output.startCell}`,
  };
}

function isSupportedNativePivotFilter(filter: FilterDefinition): boolean {
  return ['equals', 'contains', 'gt', 'gte', 'lt', 'lte', 'in', 'isEmpty', 'isNotEmpty'].includes(filter.operator);
}

function buildPivotFilterCriteria(filter: FilterDefinition): sheets_v4.Schema$PivotFilterCriteria {
  switch (filter.operator) {
    case 'equals':
      if (filter.value === undefined) throw new UserError(`Filter on "${filter.column}" requires a value.`);
      if (typeof filter.value === 'number') {
        return {
          condition: {
            type: 'NUMBER_EQ',
            values: [{ userEnteredValue: String(filter.value) }],
          },
        };
      }
      return {
        visibleByDefault: false,
        visibleValues: [String(filter.value)],
      };
    case 'contains':
      if (filter.value === undefined) throw new UserError(`Filter on "${filter.column}" requires a value.`);
      return {
        condition: {
          type: 'TEXT_CONTAINS',
          values: [{ userEnteredValue: String(filter.value) }],
        },
      };
    case 'gt':
      return {
        condition: {
          type: 'NUMBER_GREATER',
          values: [{ userEnteredValue: String(filter.value) }],
        },
      };
    case 'gte':
      return {
        condition: {
          type: 'NUMBER_GREATER_THAN_EQ',
          values: [{ userEnteredValue: String(filter.value) }],
        },
      };
    case 'lt':
      return {
        condition: {
          type: 'NUMBER_LESS',
          values: [{ userEnteredValue: String(filter.value) }],
        },
      };
    case 'lte':
      return {
        condition: {
          type: 'NUMBER_LESS_THAN_EQ',
          values: [{ userEnteredValue: String(filter.value) }],
        },
      };
    case 'in':
      return {
        visibleByDefault: false,
        visibleValues: (filter.values ?? []).map((value) => String(value)),
      };
    case 'isEmpty':
      return {
        condition: {
          type: 'BLANK',
        },
      };
    case 'isNotEmpty':
      return {
        condition: {
          type: 'NOT_BLANK',
        },
      };
    default:
      throw new UserError(
        `Filter operator "${filter.operator}" is not supported when creating a native pivot table.`
      );
  }
}

function nativePivotSummarizeFunction(value: PivotValueDefinition): string {
  switch (value.function) {
    case 'sum':
      return 'SUM';
    case 'avg':
      return 'AVERAGE';
    case 'min':
      return 'MIN';
    case 'max':
      return 'MAX';
    case 'count':
    case 'countNonEmpty':
      return 'COUNTA';
  }
}

export async function createNativePivotSheet(
  sheets: Sheets,
  dataset: LoadedDataset,
  rowGroups: PivotGroupDefinition[],
  columnGroups: PivotGroupDefinition[],
  values: PivotValueDefinition[],
  filters: FilterDefinition[],
  includeTotals: boolean,
  output: OutputTarget
): Promise<{ sheetName: string; sheetId: number; anchorCell: string }> {
  for (const filter of filters) {
    if (!isSupportedNativePivotFilter(filter)) {
      throw new UserError(
        `Filter operator "${filter.operator}" is not supported for native pivot creation. Use logical pivot output only or simplify the filters.`
      );
    }
  }

  let sheetName = output.sheetName ?? outputSheetTitle('Pivot');
  let sheetId: number;
  if (output.mode === 'newSheet') {
    const response = await SheetsHelpers.addSheet(sheets, dataset.spreadsheetId, sheetName);
    const addedSheet = response.replies?.[0]?.addSheet?.properties;
    if (!addedSheet?.sheetId || !addedSheet.title) {
      throw new UserError('Failed to create pivot output sheet.');
    }
    sheetId = addedSheet.sheetId;
    sheetName = addedSheet.title;
  } else {
    if (!output.sheetName) {
      throw new UserError('output.sheetName is required when mode is "existingSheet".');
    }
    sheetName = output.sheetName;
    sheetId = await SheetsHelpers.resolveSheetId(sheets, dataset.spreadsheetId, sheetName);
  }

  const { row, col } = SheetsHelpers.a1ToRowCol(output.startCell);
  const pivotTable: sheets_v4.Schema$PivotTable = {
    source: dataset.sourceGridRange,
    rows: rowGroups.map((group) => ({
      sourceColumnOffset: dataset.sourceColumnOffsets[group.column],
      label: group.label ?? group.column,
      showTotals: group.showTotals ?? includeTotals,
      sortOrder: group.sortOrder ?? 'ASCENDING',
    })),
    columns: columnGroups.map((group) => ({
      sourceColumnOffset: dataset.sourceColumnOffsets[group.column],
      label: group.label ?? group.column,
      showTotals: group.showTotals ?? includeTotals,
      sortOrder: group.sortOrder ?? 'ASCENDING',
    })),
    values: values.map((value) => ({
      sourceColumnOffset: dataset.sourceColumnOffsets[value.column],
      summarizeFunction: nativePivotSummarizeFunction(value),
      name: value.as ?? `${value.function}_${value.column}`,
    })),
    valueLayout: 'HORIZONTAL',
  };

  if (filters.length > 0) {
    pivotTable.filterSpecs = filters.map((filter) => ({
      columnOffsetIndex: dataset.sourceColumnOffsets[filter.column],
      filterCriteria: buildPivotFilterCriteria(filter),
    }));
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: dataset.spreadsheetId,
    requestBody: {
      requests: [
        {
          updateCells: {
            start: {
              sheetId,
              rowIndex: row,
              columnIndex: col,
            },
            rows: [
              {
                values: [
                  {
                    pivotTable,
                  },
                ],
              },
            ],
            fields: 'pivotTable',
          },
        },
      ],
    },
  });

  return {
    sheetName,
    sheetId,
    anchorCell: `${sheetName}!${output.startCell}`,
  };
}

export async function loadDataset(
  sheets: Sheets,
  spreadsheetId: string,
  source: {
    range?: string;
    tableIdentifier?: string;
    headerRow?: number;
  }
): Promise<LoadedDataset> {
  const useRange = Boolean(source.range);
  const useTable = Boolean(source.tableIdentifier);
  if (useRange === useTable) {
    throw new UserError('Provide exactly one of range or tableIdentifier.');
  }

  if (source.range) {
    const { sheetName: parsedSheetName, a1Range } = SheetsHelpers.parseRange(source.range);
    const metadata = await SheetsHelpers.getSpreadsheetMetadata(sheets, spreadsheetId);
    const actualSheetName =
      parsedSheetName ?? metadata.sheets?.[0]?.properties?.title ?? null;
    if (!actualSheetName) throw new UserError('Spreadsheet has no sheets.');
    const sheetId = await SheetsHelpers.resolveSheetId(sheets, spreadsheetId, actualSheetName);
    const valueRange = await SheetsHelpers.readRange(
      sheets,
      spreadsheetId,
      `${actualSheetName}!${a1Range}`,
      'UNFORMATTED_VALUE'
    );
    const values = valueRange.values ?? [];
    const headerRow = source.headerRow ?? 1;
    if (headerRow < 1 || headerRow > values.length) {
      throw new UserError('headerRow must refer to an existing row within the selected range.');
    }
    const headers = (values[headerRow - 1] ?? []).map(normalizeHeader);
    ensureHeaders(headers, 'The selected range');
    const dataRows = values.slice(headerRow).map((row) => row as unknown[]);
    const sourceGridRange = SheetsHelpers.parseA1ToGridRange(a1Range, sheetId);
    const analysisGridRange: sheets_v4.Schema$GridRange = {
      ...sourceGridRange,
      startRowIndex: (sourceGridRange.startRowIndex ?? 0) + (headerRow - 1),
    };

    return {
      spreadsheetId,
      sourceKind: 'range',
      sourceRef: `${actualSheetName}!${a1Range}`,
      sheetName: actualSheetName,
      sheetId,
      headerRowUsed: headerRow,
      headers,
      rows: toRecordRows(headers, dataRows),
      sourceGridRange: analysisGridRange,
      sourceColumnOffsets: buildSourceColumnOffsets(headers),
      hasFooterRow: false,
    };
  }

  const { table, sheetName, sheetId } = await SheetsHelpers.resolveTableIdentifier(
    sheets,
    spreadsheetId,
    source.tableIdentifier!
  );
  if (!table.range) {
    throw new UserError('The selected table does not expose a readable range.');
  }
  const range = `${sheetName}!${SheetsHelpers.rowColToA1(
    table.range.startRowIndex || 0,
    table.range.startColumnIndex || 0
  )}:${SheetsHelpers.rowColToA1(
    (table.range.endRowIndex || 1) - 1,
    (table.range.endColumnIndex || 1) - 1
  )}`;
  const valueRange = await SheetsHelpers.readRange(sheets, spreadsheetId, range, 'UNFORMATTED_VALUE');
  const values = valueRange.values ?? [];
  const hasFooterRow = Boolean(table.rowsProperties?.footerColorStyle);
  const headers = (table.columnProperties ?? []).map((column) => normalizeHeader(column.columnName));
  const resolvedHeaders = headers.length > 0 ? headers : (values[0] ?? []).map(normalizeHeader);
  ensureHeaders(resolvedHeaders, `Table "${table.name ?? source.tableIdentifier}"`);
  const dataEnd = hasFooterRow ? Math.max(values.length - 1, 1) : values.length;
  const dataRows = values.slice(1, dataEnd).map((row) => row as unknown[]);

  return {
    spreadsheetId,
    sourceKind: 'table',
    sourceRef: table.name ?? source.tableIdentifier!,
    sheetName,
    sheetId,
    headerRowUsed: 1,
    headers: resolvedHeaders,
    rows: toRecordRows(resolvedHeaders, dataRows),
    sourceGridRange: {
      ...table.range,
      endRowIndex: hasFooterRow ? (table.range.endRowIndex ?? 0) - 1 : table.range.endRowIndex,
    },
    sourceColumnOffsets: buildSourceColumnOffsets(resolvedHeaders),
    hasFooterRow,
  };
}

function looseNumeric(value: AnalysisScalar): number | null {
  if (value === null || value === '' || typeof value === 'boolean') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function looksTemporalString(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*$/i.test(normalized)) return true;
  if (/^\d{4}[-/]\d{1,2}([-/]\d{1,2})?$/.test(normalized)) return true;
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(normalized)) return true;
  if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s-]+\d{2,4}$/i.test(normalized)) {
    return true;
  }
  return !Number.isNaN(Date.parse(normalized));
}

function temporalHeaderHint(column: string): boolean {
  return /(date|day|week|month|quarter|year|time|period)/i.test(column);
}

function metricHeaderHint(column: string): boolean {
  return /(amount|revenue|sales|total|price|cost|value|qty|quantity|volume|score|profit)/i.test(column);
}

function entityHeaderHint(column: string, intent: string): boolean {
  const normalizedColumn = column.toLowerCase();
  if (!intent) return false;
  const rawTokens = intent
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 3);
  const expandedTokens = new Set(rawTokens);
  if (rawTokens.some((token) => /(vend|seller|sales|rep|represent)/.test(token))) {
    ['seller', 'sellers', 'sales', 'rep', 'reps', 'representative', 'representatives', 'vendedor', 'vendedores'].forEach((token) =>
      expandedTokens.add(token)
    );
  }
  return [...expandedTokens].some((token) => normalizedColumn.includes(token));
}

function buildSourceArgs(dataset: LoadedDataset): Record<string, unknown> {
  if (dataset.sourceKind === 'range') {
    return {
      range: dataset.sourceRef,
      headerRow: dataset.headerRowUsed,
    };
  }
  return {
    tableIdentifier: dataset.sourceRef,
  };
}

function chooseCardinality(uniqueCount: number, nonEmptyCount: number): 'low' | 'medium' | 'high' {
  const lowThreshold = Math.min(12, Math.max(3, Math.ceil(nonEmptyCount * 0.2)));
  const mediumThreshold = Math.min(50, Math.max(8, Math.ceil(nonEmptyCount * 0.6)));
  if (uniqueCount <= lowThreshold) return 'low';
  if (uniqueCount <= mediumThreshold) return 'medium';
  return 'high';
}

export function profileDataset(headers: string[], rows: TabularRow[]): DatasetProfile {
  const profiles: ColumnProfile[] = headers.map((column) => {
    const values = rows.map((row) => row[column] ?? null);
    const nonEmptyValues = values.filter((value) => !isEmptyValue(value));
    const numericCount = nonEmptyValues.filter((value) => looseNumeric(value) !== null).length;
    const temporalCount = nonEmptyValues.filter((value) => typeof value === 'string' && looksTemporalString(value)).length;
    const uniqueCount = new Set(nonEmptyValues.map((value) => String(value))).size;
    const nonEmptyCount = nonEmptyValues.length;
    const numericRatio = nonEmptyCount === 0 ? 0 : numericCount / nonEmptyCount;
    const temporalRatio = nonEmptyCount === 0 ? 0 : temporalCount / nonEmptyCount;
    const headerLooksTemporal = temporalHeaderHint(column);
    const cardinality = chooseCardinality(uniqueCount, Math.max(nonEmptyCount, 1));

    let kind: ColumnProfile['kind'];
    if (headerLooksTemporal && (temporalRatio >= 0.25 || numericRatio >= 0.8 || nonEmptyCount > 0)) {
      kind = 'temporal';
    } else if (temporalRatio >= 0.6) {
      kind = 'temporal';
    } else if (numericRatio >= 0.8) {
      kind = 'numeric';
    } else {
      kind = cardinality === 'high' ? 'text' : 'categorical';
    }

    return {
      column,
      kind,
      cardinality,
      nonEmptyCount,
      emptyCount: rows.length - nonEmptyCount,
      uniqueCount,
      numericRatio,
      temporalRatio,
    };
  });

  const numericColumns = profiles.filter((profile) => profile.kind === 'numeric').map((profile) => profile.column);
  const categoricalColumns = profiles.filter((profile) => profile.kind === 'categorical').map((profile) => profile.column);
  const temporalColumns = profiles.filter((profile) => profile.kind === 'temporal').map((profile) => profile.column);
  const textColumns = profiles.filter((profile) => profile.kind === 'text').map((profile) => profile.column);

  const signals: string[] = [];
  if (numericColumns.length > 0) signals.push('metric columns detected');
  if (temporalColumns.length > 0) signals.push('time dimension detected');
  if (categoricalColumns.length >= 2 && numericColumns.length > 0) signals.push('dataset supports crossed pivot analysis');
  if (profiles.some((profile) => profile.emptyCount > 0)) signals.push('missing values detected in one or more columns');
  if (numericColumns.length === 0) signals.push('no numeric metrics detected; count and distribution analyses are a better fit');

  return {
    rowCount: rows.length,
    columnCount: headers.length,
    numericColumns,
    categoricalColumns,
    temporalColumns,
    textColumns,
    lowCardinalityColumns: profiles.filter((profile) => profile.cardinality === 'low').map((profile) => profile.column),
    mediumCardinalityColumns: profiles.filter((profile) => profile.cardinality === 'medium').map((profile) => profile.column),
    highCardinalityColumns: profiles.filter((profile) => profile.cardinality === 'high').map((profile) => profile.column),
    signals,
    columnProfiles: profiles,
  };
}

interface SuggestAnalysisOptions {
  analysisIntent?: string;
  maxSuggestions?: number;
  includeSuggestedPayloads?: boolean;
}

interface AnalysisCandidate extends SuggestedAnalysis {
  priority: number;
  relatedColumns: string[];
}

function choosePrimaryMetric(profile: DatasetProfile, intent: string): string | undefined {
  const ranked = [...profile.columnProfiles]
    .filter((item) => item.kind === 'numeric')
    .sort((left, right) => {
      const leftScore = Number(metricHeaderHint(left.column)) + Number(entityHeaderHint(left.column, intent));
      const rightScore = Number(metricHeaderHint(right.column)) + Number(entityHeaderHint(right.column, intent));
      return rightScore - leftScore || right.nonEmptyCount - left.nonEmptyCount;
    });
  return ranked[0]?.column;
}

function choosePreferredDimension(
  profile: DatasetProfile,
  intent: string,
  exclude: string[] = [],
  cardinalities?: Array<'low' | 'medium' | 'high'>
): string | undefined {
  const allowed = new Set(cardinalities ?? ['low', 'medium', 'high']);
  const ranked = [...profile.columnProfiles]
    .filter(
      (item) =>
        (item.kind === 'categorical' || item.kind === 'text') &&
        allowed.has(item.cardinality) &&
        !exclude.includes(item.column)
    )
    .sort((left, right) => {
      const leftIntent = Number(entityHeaderHint(left.column, intent));
      const rightIntent = Number(entityHeaderHint(right.column, intent));
      if (leftIntent !== rightIntent) return rightIntent - leftIntent;
      const leftTextPenalty = left.kind === 'text' ? 1 : 0;
      const rightTextPenalty = right.kind === 'text' ? 1 : 0;
      if (leftTextPenalty !== rightTextPenalty) return leftTextPenalty - rightTextPenalty;
      return left.uniqueCount - right.uniqueCount;
    });
  return ranked[0]?.column;
}

function scoreIntent(candidate: AnalysisCandidate, intent: string): number {
  if (!intent.trim()) return candidate.priority;
  const tokens = intent
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 3);
  if (tokens.length === 0) return candidate.priority;
  const haystack = [candidate.title, candidate.summary, candidate.whyItMatters, ...candidate.relatedColumns]
    .join(' ')
    .toLowerCase();
  const matches = tokens.filter((token) => haystack.includes(token)).length;
  const relatedColumnBoost = candidate.relatedColumns.some((column) => entityHeaderHint(column, intent)) ? 25 : 0;
  return candidate.priority - matches * 10 - relatedColumnBoost;
}

function finalizeCandidates(
  candidates: AnalysisCandidate[],
  intent: string,
  includeSuggestedPayloads: boolean,
  maxSuggestions: number
): SuggestedAnalysis[] {
  return [...candidates]
    .sort((left, right) => scoreIntent(left, intent) - scoreIntent(right, intent))
    .slice(0, maxSuggestions)
    .map(({ priority: _priority, relatedColumns: _relatedColumns, suggestedPayload, ...candidate }) => {
      if (!includeSuggestedPayloads) return candidate;
      return {
        ...candidate,
        ...(suggestedPayload ? { suggestedPayload } : {}),
      };
    });
}

export function suggestSpreadsheetAnalyses(
  dataset: LoadedDataset,
  options: SuggestAnalysisOptions = {}
): { datasetProfile: DatasetProfile; suggestions: SuggestedAnalysis[] } {
  const analysisIntent = options.analysisIntent ?? '';
  const includeSuggestedPayloads = options.includeSuggestedPayloads ?? false;
  const maxSuggestions = Math.min(options.maxSuggestions ?? 5, 5);
  const datasetProfile = profileDataset(dataset.headers, dataset.rows);
  const sourceArgs = buildSourceArgs(dataset);
  const primaryMetric = choosePrimaryMetric(datasetProfile, analysisIntent);
  const primaryDimension = choosePreferredDimension(datasetProfile, analysisIntent, [], ['low', 'medium']);
  const secondaryDimension = choosePreferredDimension(
    datasetProfile,
    analysisIntent,
    primaryDimension ? [primaryDimension] : [],
    ['low', 'medium']
  );
  const rankingDimension = choosePreferredDimension(datasetProfile, analysisIntent, [], ['medium', 'high']);
  const timeDimension = datasetProfile.temporalColumns[0];
  const mostMissingColumn = [...datasetProfile.columnProfiles].sort((left, right) => right.emptyCount - left.emptyCount)[0];

  const candidates: AnalysisCandidate[] = [];

  if (primaryMetric) {
    candidates.push({
      title: `Resumo geral de ${primaryMetric}`,
      summary: `Veja total, média, mínimo e máximo de ${primaryMetric} para entender a escala dos dados.`,
      whyItMatters: 'Isso cria uma linha de base antes de segmentar a análise por categorias, tempo ou rankings.',
      complexity: 'basic',
      recommendedTool: 'querySpreadsheet',
      analysisType: 'metric_summary',
      confidence: 0.95,
      priority: 10,
      relatedColumns: [primaryMetric],
      suggestedPayload: {
        spreadsheetId: dataset.spreadsheetId,
        ...sourceArgs,
        aggregations: [
          { column: primaryMetric, function: 'sum', as: `total_${primaryMetric}` },
          { column: primaryMetric, function: 'avg', as: `avg_${primaryMetric}` },
          { column: primaryMetric, function: 'min', as: `min_${primaryMetric}` },
          { column: primaryMetric, function: 'max', as: `max_${primaryMetric}` },
        ],
      },
    });
  }

  if (primaryMetric && primaryDimension) {
    candidates.push({
      title: `${primaryMetric} por ${primaryDimension}`,
      summary: `Agrupe ${primaryMetric} por ${primaryDimension} para ver quem ou o que mais contribui.`,
      whyItMatters: 'Essa costuma ser a primeira quebra realmente acionável para identificar concentração, gaps e outliers.',
      complexity: 'intermediate',
      recommendedTool: 'querySpreadsheet',
      analysisType: 'category_breakdown',
      confidence: 0.93,
      priority: 20,
      relatedColumns: [primaryMetric, primaryDimension],
      suggestedPayload: {
        spreadsheetId: dataset.spreadsheetId,
        ...sourceArgs,
        groupBy: [primaryDimension],
        aggregations: [
          { column: primaryMetric, function: 'sum', as: `total_${primaryMetric}` },
          { function: 'count', as: 'row_count' },
        ],
        orderBy: [{ column: `total_${primaryMetric}`, direction: 'desc' }],
        limit: 15,
      },
    });
  }

  if (primaryMetric && timeDimension) {
    candidates.push({
      title: `Tendência de ${primaryMetric} ao longo de ${timeDimension}`,
      summary: `Acompanhe a evolução de ${primaryMetric} por ${timeDimension} para identificar sazonalidade e mudanças de ritmo.`,
      whyItMatters: 'Ajuda a responder se os resultados estão melhorando, piorando ou concentrados em períodos específicos.',
      complexity: 'intermediate',
      recommendedTool: 'querySpreadsheet',
      analysisType: 'time_trend',
      confidence: 0.9,
      priority: 30,
      relatedColumns: [primaryMetric, timeDimension],
      suggestedPayload: {
        spreadsheetId: dataset.spreadsheetId,
        ...sourceArgs,
        groupBy: [timeDimension],
        aggregations: [{ column: primaryMetric, function: 'sum', as: `total_${primaryMetric}` }],
        orderBy: [{ column: timeDimension, direction: 'asc' }],
      },
    });
  }

  if (primaryMetric && rankingDimension) {
    candidates.push({
      title: `Ranking de ${rankingDimension} por ${primaryMetric}`,
      summary: `Monte um top N de ${rankingDimension} para destacar os maiores contribuintes ou os piores desempenhos.`,
      whyItMatters: 'Rankings são úteis para priorização rápida quando há muitas entidades, clientes, vendedores ou produtos.',
      complexity: 'intermediate',
      recommendedTool: 'querySpreadsheet',
      analysisType: 'top_n_ranking',
      confidence: 0.88,
      priority: 40,
      relatedColumns: [primaryMetric, rankingDimension],
      suggestedPayload: {
        spreadsheetId: dataset.spreadsheetId,
        ...sourceArgs,
        groupBy: [rankingDimension],
        aggregations: [{ column: primaryMetric, function: 'sum', as: `total_${primaryMetric}` }],
        orderBy: [{ column: `total_${primaryMetric}`, direction: 'desc' }],
        limit: 10,
      },
    });
  }

  if (primaryMetric && primaryDimension && secondaryDimension) {
    candidates.push({
      title: `Cruzamento de ${primaryDimension} x ${secondaryDimension}`,
      summary: `Crie uma visão cruzada entre ${primaryDimension} e ${secondaryDimension} usando ${primaryMetric} como métrica principal.`,
      whyItMatters: 'Isso revela combinações fortes ou fracas que passam despercebidas em agrupamentos simples.',
      complexity: 'advanced',
      recommendedTool: 'pivotSpreadsheet',
      analysisType: 'cross_pivot',
      confidence: 0.9,
      priority: 50,
      relatedColumns: [primaryMetric, primaryDimension, secondaryDimension],
      suggestedPayload: {
        spreadsheetId: dataset.spreadsheetId,
        ...sourceArgs,
        rowGroups: [{ column: primaryDimension }],
        columnGroups: [{ column: secondaryDimension }],
        values: [{ column: primaryMetric, function: 'sum', as: `total_${primaryMetric}` }],
      },
    });
  }

  if (!primaryMetric && primaryDimension) {
    candidates.push({
      title: `Distribuição de registros por ${primaryDimension}`,
      summary: `Conte quantos registros existem em cada valor de ${primaryDimension} para entender a composição do dataset.`,
      whyItMatters: 'Quando não há uma métrica numérica clara, a distribuição por categoria é a melhor forma de começar.',
      complexity: 'basic',
      recommendedTool: 'querySpreadsheet',
      analysisType: 'category_distribution',
      confidence: 0.92,
      priority: 15,
      relatedColumns: [primaryDimension],
      suggestedPayload: {
        spreadsheetId: dataset.spreadsheetId,
        ...sourceArgs,
        groupBy: [primaryDimension],
        aggregations: [{ function: 'count', as: 'row_count' }],
        orderBy: [{ column: 'row_count', direction: 'desc' }],
      },
    });
  }

  if (mostMissingColumn && mostMissingColumn.emptyCount > 0) {
    candidates.push({
      title: `Completude de ${mostMissingColumn.column}`,
      summary: `Meça quantos registros têm ${mostMissingColumn.column} preenchido versus vazio.`,
      whyItMatters: 'Antes de aprofundar a análise, vale verificar se a coluna-chave está suficientemente completa para sustentar conclusões.',
      complexity: 'basic',
      recommendedTool: 'querySpreadsheet',
      analysisType: 'data_completeness',
      confidence: 0.8,
      priority: 12,
      relatedColumns: [mostMissingColumn.column],
      suggestedPayload: {
        spreadsheetId: dataset.spreadsheetId,
        ...sourceArgs,
        aggregations: [
          { function: 'count', as: 'row_count' },
          { column: mostMissingColumn.column, function: 'countNonEmpty', as: `filled_${mostMissingColumn.column}` },
        ],
      },
    });
  }

  if (candidates.length === 0) {
    candidates.push({
      title: 'Exploração inicial da estrutura',
      summary: 'Comece listando contagens e observando quais colunas parecem dimensões-chave para segmentar os registros.',
      whyItMatters: 'Quando o dataset ainda não revela uma métrica óbvia, a melhor abertura é entender a composição e a granularidade dos dados.',
      complexity: 'basic',
      recommendedTool: 'querySpreadsheet',
      analysisType: 'initial_structure_review',
      confidence: 0.6,
      priority: 10,
      relatedColumns: dataset.headers,
      suggestedPayload: {
        spreadsheetId: dataset.spreadsheetId,
        ...sourceArgs,
        limit: 20,
      },
    });
  }

  return {
    datasetProfile,
    suggestions: finalizeCandidates(candidates, analysisIntent, includeSuggestedPayloads, maxSuggestions),
  };
}
