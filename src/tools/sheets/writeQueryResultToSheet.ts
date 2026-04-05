import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { getSheetsClient } from '../../clients.js';
import { mutationResult } from '../../tooling.js';
import {
  OutputTargetSchema,
  QueryAnalysisParametersSchema,
  buildQueryAnalysis,
  loadDataset,
  queryResultToMatrix,
  writeMatrixOutput,
} from './analytics.js';

const WriteQueryResultToSheetParametersSchema = QueryAnalysisParametersSchema.extend({
  output: OutputTargetSchema.describe(
    'Required destination for saving the query result into the spreadsheet.'
  ),
});

export function register(server: FastMCP) {
  server.addTool({
    name: 'writeQueryResultToSheet',
    description:
      'Runs a spreadsheet query analysis and writes the resulting table into a new or existing sheet. Use this only when the user explicitly asks to save query results into the spreadsheet.',
    parameters: WriteQueryResultToSheetParametersSchema,
    execute: async (args, { log }) => {
      const sheets = await getSheetsClient();
      log.info(`Writing query result to spreadsheet ${args.spreadsheetId}`);

      try {
        const dataset = await loadDataset(sheets, args.spreadsheetId, {
          range: args.range,
          tableIdentifier: args.tableIdentifier,
          headerRow: args.headerRow,
        });
        const result = buildQueryAnalysis(dataset, args);
        const output = await writeMatrixOutput(
          sheets,
          args.spreadsheetId,
          queryResultToMatrix(result),
          args.output,
          'Query Results'
        );

        return mutationResult(`Wrote ${result.rows.length} query row(s) into ${output.range}.`, {
          spreadsheetId: args.spreadsheetId,
          source: {
            kind: dataset.sourceKind,
            ref: dataset.sourceRef,
            sheetName: dataset.sheetName,
          },
          rowCount: result.rows.length,
          columnCount: result.columns.length,
          output,
        });
      } catch (error: any) {
        log.error(`Error writing query result for spreadsheet ${args.spreadsheetId}: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to write query result: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
