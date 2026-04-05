import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSheetsClient } from '../../clients.js';
import { dataResult } from '../../tooling.js';
import {
  AnalysisScalarSchema,
  FilterSchema,
  OrderBySchema,
  OutputTargetSchema,
  PivotGroupSchema,
  finalizeRowResult,
  loadDataset,
  runPivotDrillDown,
  sortRows,
  writeMatrixOutput,
} from './analytics.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'drillDownPivotSpreadsheet',
    description:
      'Returns the source rows behind a logical pivot bucket. Target the bucket by row group values and optional column group values, not by a cell address.',
    parameters: z.object({
      spreadsheetId: z
        .string()
        .describe(
          'The spreadsheet ID — the long string between /d/ and /edit in a Google Sheets URL.'
        ),
      range: z
        .string()
        .optional()
        .describe('A1 notation range to analyze, such as "Sales!A1:F500".'),
      tableIdentifier: z
        .string()
        .optional()
        .describe('Named table identifier to analyze instead of a raw range.'),
      headerRow: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1)
        .describe('Header row within the selected range. Ignored when using tableIdentifier.'),
      filters: z
        .array(FilterSchema)
        .optional()
        .default([])
        .describe('Filters applied before matching the target pivot bucket.'),
      rowGroups: z
        .array(PivotGroupSchema)
        .min(1)
        .describe('The row group definition used by the pivot.'),
      columnGroups: z
        .array(PivotGroupSchema)
        .optional()
        .default([])
        .describe('Optional column group definition used by the pivot.'),
      targetRowGroupValues: z
        .array(AnalysisScalarSchema)
        .describe('One value for each row group, in the same order as rowGroups.'),
      targetColumnGroupValues: z
        .array(AnalysisScalarSchema)
        .optional()
        .describe('Optional values for each column group, in the same order as columnGroups.'),
      orderBy: z
        .array(OrderBySchema)
        .optional()
        .default([])
        .describe('Optional sort rules for the returned source rows.'),
      limit: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Optional maximum number of detail rows to return.'),
      output: OutputTargetSchema.optional().describe(
        'Optional destination for writing the drill-down result as plain cells.'
      ),
    }),
    execute: async (args, { log }) => {
      const sheets = await getSheetsClient();
      log.info(`Drilling down pivot rows for spreadsheet ${args.spreadsheetId}`);

      try {
        const dataset = await loadDataset(sheets, args.spreadsheetId, {
          range: args.range,
          tableIdentifier: args.tableIdentifier,
          headerRow: args.headerRow,
        });
        const headers = new Set(dataset.headers);
        for (const filter of args.filters) {
          if (!headers.has(filter.column)) {
            throw new UserError(`Filter column "${filter.column}" was not found in the dataset.`);
          }
        }
        for (const group of [...args.rowGroups, ...args.columnGroups]) {
          if (!headers.has(group.column)) {
            throw new UserError(`Pivot group column "${group.column}" was not found in the dataset.`);
          }
        }
        for (const rule of args.orderBy) {
          if (!headers.has(rule.column)) {
            throw new UserError(`Sort column "${rule.column}" was not found in the dataset.`);
          }
        }

        let rows = runPivotDrillDown(
          dataset.rows,
          args.filters,
          args.rowGroups,
          args.columnGroups,
          args.targetRowGroupValues,
          args.targetColumnGroupValues
        );
        rows = sortRows(rows, args.orderBy);
        if (typeof args.limit === 'number') {
          rows = rows.slice(0, args.limit);
        }

        const finalized = finalizeRowResult('pivot-drilldown', dataset.headers, rows);
        const response: Record<string, unknown> = {
          spreadsheetId: args.spreadsheetId,
          source: {
            kind: dataset.sourceKind,
            ref: dataset.sourceRef,
            sheetName: dataset.sheetName,
          },
          columns: finalized.columns,
          rows: finalized.rows,
          rowCount: finalized.rowCount,
          truncated: finalized.truncated,
          previewRowCount: finalized.previewRowCount,
          targetRowGroupValues: args.targetRowGroupValues,
          targetColumnGroupValues: args.targetColumnGroupValues ?? [],
        };

        if (finalized.csvPath) {
          response.csvPath = finalized.csvPath;
        }

        if (args.output) {
          const matrix = [dataset.headers, ...rows.map((row) => dataset.headers.map((column) => row[column] ?? null))];
          response.output = await writeMatrixOutput(
            sheets,
            args.spreadsheetId,
            matrix,
            args.output,
            'Pivot Drill Down'
          );
        }

        return dataResult(response, `Drill-down returned ${rows.length} row(s).`);
      } catch (error: any) {
        log.error(`Error drilling down pivot for spreadsheet ${args.spreadsheetId}: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to drill down pivot: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
