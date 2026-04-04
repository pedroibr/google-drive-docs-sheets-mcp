import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSheetsClient } from '../../clients.js';
import { dataResult } from '../../tooling.js';
import {
  AggregationSchema,
  FilterSchema,
  OrderBySchema,
  OutputTargetSchema,
  aggregationAlias,
  finalizeRowResult,
  loadDataset,
  runQuery,
  writeMatrixOutput,
} from './analytics.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'querySpreadsheet',
    description:
      'Queries spreadsheet data with filters, sorting, grouping, aggregations, and optional materialized output. Use range or tableIdentifier as the source.',
    parameters: z.object({
      spreadsheetId: z
        .string()
        .describe(
          'The spreadsheet ID — the long string between /d/ and /edit in a Google Sheets URL.'
        ),
      range: z
        .string()
        .optional()
        .describe('A1 notation range to query, such as "Sales!A1:F500".'),
      tableIdentifier: z
        .string()
        .optional()
        .describe('Named table identifier to query instead of a raw range.'),
      headerRow: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1)
        .describe('Header row within the selected range. Ignored when using tableIdentifier.'),
      select: z
        .array(z.string().min(1))
        .optional()
        .describe('Optional subset of columns to return, using header names.'),
      filters: z
        .array(FilterSchema)
        .optional()
        .default([])
        .describe('Filter clauses applied before sorting, limiting, and aggregations.'),
      orderBy: z
        .array(OrderBySchema)
        .optional()
        .default([])
        .describe('Sort rules applied after filtering or aggregation.'),
      limit: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Optional maximum number of rows to return after all processing.'),
      groupBy: z
        .array(z.string().min(1))
        .optional()
        .default([])
        .describe('Columns to group by before aggregating.'),
      aggregations: z
        .array(AggregationSchema)
        .optional()
        .default([])
        .describe('Aggregate functions to compute for grouped output.'),
      output: OutputTargetSchema.optional().describe(
        'Optional materialized output destination. If omitted, the tool only returns the query result.'
      ),
    }),
    execute: async (args, { log }) => {
      const sheets = await getSheetsClient();
      log.info(`Querying spreadsheet ${args.spreadsheetId}`);

      try {
        const dataset = await loadDataset(sheets, args.spreadsheetId, {
          range: args.range,
          tableIdentifier: args.tableIdentifier,
          headerRow: args.headerRow,
        });
        const sourceColumns = new Set(dataset.headers);
        const queryOutputColumns =
          args.groupBy.length > 0 || args.aggregations.length > 0
            ? new Set([...args.groupBy, ...args.aggregations.map(aggregationAlias)])
            : sourceColumns;
        for (const column of args.select ?? []) {
          if (!queryOutputColumns.has(column)) {
            throw new UserError(`Selected column "${column}" was not found in the dataset.`);
          }
        }
        for (const column of args.groupBy) {
          if (!sourceColumns.has(column)) {
            throw new UserError(`groupBy column "${column}" was not found in the dataset.`);
          }
        }
        for (const filter of args.filters) {
          if (!sourceColumns.has(filter.column)) {
            throw new UserError(`Filter column "${filter.column}" was not found in the dataset.`);
          }
        }
        for (const aggregation of args.aggregations) {
          if (aggregation.column && !sourceColumns.has(aggregation.column)) {
            throw new UserError(`Aggregation column "${aggregation.column}" was not found in the dataset.`);
          }
        }
        for (const rule of args.orderBy) {
          if (!queryOutputColumns.has(rule.column)) {
            throw new UserError(`Sort column "${rule.column}" was not found in the query output.`);
          }
        }

        const result = runQuery(
          dataset.rows,
          args.filters,
          args.orderBy,
          args.select,
          args.groupBy,
          args.aggregations,
          args.limit
        );

        const finalized = finalizeRowResult('query-results', result.columns, result.rows);
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
          filtersApplied: args.filters.length,
          grouped: args.groupBy.length > 0,
          aggregated: args.aggregations.length > 0,
        };

        if (finalized.csvPath) {
          response.csvPath = finalized.csvPath;
        }

        if (args.output) {
          const matrix = [result.columns, ...result.rows.map((row) => result.columns.map((column) => row[column] ?? null))];
          response.output = await writeMatrixOutput(
            sheets,
            args.spreadsheetId,
            matrix,
            args.output,
            'Query Results'
          );
        }

        return dataResult(response, `Query returned ${result.rows.length} row(s).`);
      } catch (error: any) {
        log.error(`Error querying spreadsheet ${args.spreadsheetId}: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to query spreadsheet: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
