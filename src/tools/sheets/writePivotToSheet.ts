import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { getSheetsClient } from '../../clients.js';
import { mutationResult } from '../../tooling.js';
import {
  OutputTargetSchema,
  PivotAnalysisParametersSchema,
  buildPivotAnalysis,
  createNativePivotSheet,
  loadDataset,
} from './analytics.js';

const WritePivotToSheetParametersSchema = PivotAnalysisParametersSchema.extend({
  output: OutputTargetSchema.describe(
    'Required destination for saving the pivot into the spreadsheet.'
  ),
});

export function register(server: FastMCP) {
  server.addTool({
    name: 'writePivotToSheet',
    description:
      'Builds a spreadsheet pivot analysis and writes it into a new or existing sheet as a native pivot table. Use this only when the user explicitly asks to save pivot output into the spreadsheet.',
    parameters: WritePivotToSheetParametersSchema,
    execute: async (args, { log }) => {
      const sheets = await getSheetsClient();
      log.info(`Writing pivot to spreadsheet ${args.spreadsheetId}`);

      try {
        const dataset = await loadDataset(sheets, args.spreadsheetId, {
          range: args.range,
          tableIdentifier: args.tableIdentifier,
          headerRow: args.headerRow,
        });
        const logicalPivot = buildPivotAnalysis(dataset, args);
        const output = await createNativePivotSheet(
          sheets,
          dataset,
          args.rowGroups,
          args.columnGroups,
          args.values,
          args.filters,
          args.includeTotals,
          args.output
        );

        return mutationResult(`Created native pivot output at ${output.anchorCell}.`, {
          spreadsheetId: args.spreadsheetId,
          source: {
            kind: dataset.sourceKind,
            ref: dataset.sourceRef,
            sheetName: dataset.sheetName,
          },
          rowCount: logicalPivot.rowCount,
          columnCount: logicalPivot.columnCount,
          output,
        });
      } catch (error: any) {
        log.error(`Error writing pivot for spreadsheet ${args.spreadsheetId}: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to write pivot: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
