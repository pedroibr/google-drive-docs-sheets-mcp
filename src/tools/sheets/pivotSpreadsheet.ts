import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSheetsClient } from '../../clients.js';
import { dataResult } from '../../tooling.js';
import {
  FilterSchema,
  OutputTargetSchema,
  PivotGroupSchema,
  PivotValueSchema,
  buildPivotLogicalResult,
  createNativePivotSheet,
  finalizeMatrixResult,
  loadDataset,
} from './analytics.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'pivotSpreadsheet',
    description:
      'Builds a logical pivot table from spreadsheet data with filters, row groups, column groups, and value aggregations. By default it only returns the logical pivot. Pass output to also create a native pivot table in the spreadsheet.',
    parameters: z.object({
      spreadsheetId: z
        .string()
        .describe(
          'The spreadsheet ID — the long string between /d/ and /edit in a Google Sheets URL.'
        ),
      range: z
        .string()
        .optional()
        .describe('A1 notation range to pivot, such as "Sales!A1:F500".'),
      tableIdentifier: z
        .string()
        .optional()
        .describe('Named table identifier to pivot instead of a raw range.'),
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
        .describe('Filters applied before pivot grouping and aggregation.'),
      rowGroups: z
        .array(PivotGroupSchema)
        .min(1)
        .describe('One or more row group definitions for the pivot.'),
      columnGroups: z
        .array(PivotGroupSchema)
        .optional()
        .default([])
        .describe('Optional column group definitions for a crossed pivot.'),
      values: z
        .array(PivotValueSchema)
        .min(1)
        .describe('Aggregated value definitions for the pivot.'),
      includeTotals: z
        .boolean()
        .optional()
        .default(true)
        .describe('Whether to include total rows and total value columns in the logical pivot.'),
      output: OutputTargetSchema.optional().describe(
        'Optional native pivot destination. If omitted, the tool does not modify the spreadsheet.'
      ),
    }),
    execute: async (args, { log }) => {
      const sheets = await getSheetsClient();
      log.info(`Building pivot for spreadsheet ${args.spreadsheetId}`);

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
        for (const value of args.values) {
          if (!headers.has(value.column)) {
            throw new UserError(`Pivot value column "${value.column}" was not found in the dataset.`);
          }
        }

        const logicalPivot = buildPivotLogicalResult(
          dataset.rows,
          args.filters,
          args.rowGroups,
          args.columnGroups,
          args.values,
          args.includeTotals
        );
        const finalized = finalizeMatrixResult('pivot-results', logicalPivot.matrix);
        const response: Record<string, unknown> = {
          spreadsheetId: args.spreadsheetId,
          source: {
            kind: dataset.sourceKind,
            ref: dataset.sourceRef,
            sheetName: dataset.sheetName,
          },
          matrix: finalized.matrix,
          rowHeaders: logicalPivot.rowHeaders,
          columnHeaders: logicalPivot.columnHeaders,
          rowCount: finalized.rowCount,
          columnCount: finalized.columnCount,
          truncated: finalized.truncated,
          previewRowCount: finalized.previewRowCount,
          nativePivotCreated: false,
        };

        if (finalized.csvPath) {
          response.csvPath = finalized.csvPath;
        }

        if (args.output) {
          response.output = await createNativePivotSheet(
            sheets,
            dataset,
            args.rowGroups,
            args.columnGroups,
            args.values,
            args.filters,
            args.includeTotals,
            args.output
          );
          response.nativePivotCreated = true;
        }

        return dataResult(response, `Pivot built with ${logicalPivot.rowCount} row(s).`);
      } catch (error: any) {
        log.error(`Error building pivot for spreadsheet ${args.spreadsheetId}: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to build pivot: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
