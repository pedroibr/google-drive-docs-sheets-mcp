import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSheetsClient } from '../../clients.js';
import { dataResult } from '../../tooling.js';
import {
  PivotAnalysisParametersSchema,
  buildPivotAnalysis,
  finalizeMatrixResult,
  loadDataset,
} from './analytics.js';

const PivotSpreadsheetParametersSchema = PivotAnalysisParametersSchema.extend({
  output: z
    .unknown()
    .optional()
    .describe(
      'Deprecated. pivotSpreadsheet is read-only and returns logical pivot results in chat. Use writePivotToSheet to save a pivot into the spreadsheet.'
    ),
});

export function register(server: FastMCP) {
  server.addTool({
    name: 'pivotSpreadsheet',
    description:
      'Builds a logical pivot table from spreadsheet data with filters, row groups, column groups, and value aggregations. This tool is read-only and always returns the logical pivot in chat; it never writes to the spreadsheet.',
    parameters: PivotSpreadsheetParametersSchema,
    execute: async (args, { log }) => {
      if (args.output !== undefined) {
        throw new UserError(
          'pivotSpreadsheet is now read-only and no longer accepts output. Use writePivotToSheet to save a pivot into the spreadsheet.'
        );
      }

      const sheets = await getSheetsClient();
      log.info(`Building pivot for spreadsheet ${args.spreadsheetId}`);

      try {
        const dataset = await loadDataset(sheets, args.spreadsheetId, {
          range: args.range,
          tableIdentifier: args.tableIdentifier,
          headerRow: args.headerRow,
        });
        const logicalPivot = buildPivotAnalysis(dataset, args);
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

        return dataResult(response, `Pivot built with ${logicalPivot.rowCount} row(s).`);
      } catch (error: any) {
        log.error(`Error building pivot for spreadsheet ${args.spreadsheetId}: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to build pivot: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
