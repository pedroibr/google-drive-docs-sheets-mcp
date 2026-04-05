import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSheetsClient } from '../../clients.js';
import { dataResult } from '../../tooling.js';
import {
  QueryAnalysisParametersSchema,
  finalizeRowResult,
  buildQueryAnalysis,
  loadDataset,
} from './analytics.js';

const QuerySpreadsheetParametersSchema = QueryAnalysisParametersSchema.extend({
  output: z
    .unknown()
    .optional()
    .describe(
      'Deprecated. querySpreadsheet is read-only and returns results in chat. Use writeQueryResultToSheet to save results into the spreadsheet.'
    ),
});

export function register(server: FastMCP) {
  server.addTool({
    name: 'querySpreadsheet',
    description:
      'Queries spreadsheet data with filters, sorting, grouping, and aggregations. This tool is read-only and always returns results in chat; it never writes to the spreadsheet.',
    parameters: QuerySpreadsheetParametersSchema,
    execute: async (args, { log }) => {
      if (args.output !== undefined) {
        throw new UserError(
          'querySpreadsheet is now read-only and no longer accepts output. Use writeQueryResultToSheet to save query results into the spreadsheet.'
        );
      }

      const sheets = await getSheetsClient();
      log.info(`Querying spreadsheet ${args.spreadsheetId}`);

      try {
        const dataset = await loadDataset(sheets, args.spreadsheetId, {
          range: args.range,
          tableIdentifier: args.tableIdentifier,
          headerRow: args.headerRow,
        });
        const result = buildQueryAnalysis(dataset, args);

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

        return dataResult(response, `Query returned ${result.rows.length} row(s).`);
      } catch (error: any) {
        log.error(`Error querying spreadsheet ${args.spreadsheetId}: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to query spreadsheet: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
