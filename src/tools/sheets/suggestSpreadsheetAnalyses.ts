import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSheetsClient } from '../../clients.js';
import { dataResult } from '../../tooling.js';
import { loadDataset, suggestSpreadsheetAnalyses } from './analytics.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'suggestSpreadsheetAnalyses',
    description:
      'Inspects a spreadsheet range or named table and suggests useful analyses, ordered from simpler to more advanced. By default it returns up to 5 human-readable suggestions for chat-first execution; payloads are opt-in, analysis-only, and do not write to the spreadsheet.',
    parameters: z.object({
      spreadsheetId: z
        .string()
        .describe(
          'The spreadsheet ID — the long string between /d/ and /edit in a Google Sheets URL.'
        ),
      range: z
        .string()
        .optional()
        .describe('A1 notation range to inspect, such as "Sales!A1:F500".'),
      tableIdentifier: z
        .string()
        .optional()
        .describe('Named table identifier to inspect instead of a raw range.'),
      headerRow: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1)
        .describe('Header row within the selected range. Ignored when using tableIdentifier.'),
      analysisIntent: z
        .string()
        .optional()
        .default('')
        .describe(
          'Optional natural-language focus, such as "analises para vendedores" or "performance by region".'
        ),
      maxSuggestions: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .default(5)
        .describe('Maximum number of suggestions to return. Default 5, maximum 10 when explicitly requested.'),
      includeSuggestedPayloads: z
        .boolean()
        .optional()
        .default(false)
        .describe('When true, also include analysis-only payloads for querySpreadsheet or pivotSpreadsheet. Saving results into the spreadsheet requires the dedicated write tools.'),
    }),
    execute: async (args, { log }) => {
      const sheets = await getSheetsClient();
      log.info(`Suggesting analyses for spreadsheet ${args.spreadsheetId}`);

      try {
        const dataset = await loadDataset(sheets, args.spreadsheetId, {
          range: args.range,
          tableIdentifier: args.tableIdentifier,
          headerRow: args.headerRow,
        });
        const { datasetProfile, suggestions } = suggestSpreadsheetAnalyses(dataset, {
          analysisIntent: args.analysisIntent,
          maxSuggestions: args.maxSuggestions,
          includeSuggestedPayloads: args.includeSuggestedPayloads,
        });

        return dataResult(
          {
            spreadsheetId: args.spreadsheetId,
            source: {
              kind: dataset.sourceKind,
              ref: dataset.sourceRef,
              sheetName: dataset.sheetName,
            },
            usageGuidance:
              'Run suggested analyses in chat first. Only use writeQueryResultToSheet or writePivotToSheet when the user explicitly asks to save output into the spreadsheet.',
            datasetProfile: {
              rowCount: datasetProfile.rowCount,
              columnCount: datasetProfile.columnCount,
              numericColumns: datasetProfile.numericColumns,
              categoricalColumns: datasetProfile.categoricalColumns,
              temporalColumns: datasetProfile.temporalColumns,
              textColumns: datasetProfile.textColumns,
              lowCardinalityColumns: datasetProfile.lowCardinalityColumns,
              mediumCardinalityColumns: datasetProfile.mediumCardinalityColumns,
              highCardinalityColumns: datasetProfile.highCardinalityColumns,
              signals: datasetProfile.signals,
            },
            suggestions,
          },
          `Generated ${suggestions.length} suggested analysis option(s).`
        );
      } catch (error: any) {
        log.error(`Error suggesting analyses for spreadsheet ${args.spreadsheetId}: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to suggest spreadsheet analyses: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
