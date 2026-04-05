import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSheetsClient } from '../../clients.js';
import * as SheetsHelpers from '../../googleSheetsApiHelpers.js';
import { dataResult } from '../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'readCellNotes',
    description:
      'Reads cell notes from a spreadsheet range. Returns only the cells that contain a non-empty note, with optional formatted values for context.',
    parameters: z.object({
      spreadsheetId: z
        .string()
        .describe(
          'The spreadsheet ID — the long string between /d/ and /edit in a Google Sheets URL.'
        ),
      range: z
        .string()
        .describe(
          'A1 notation range to read notes from (e.g., "Sheet1!A1:D20" or "B2:C10").'
        ),
    }),
    execute: async (args, { log }) => {
      const sheets = await getSheetsClient();
      log.info(`Reading cell notes for range "${args.range}" in spreadsheet ${args.spreadsheetId}`);

      try {
        const response = await SheetsHelpers.readCellNotes(sheets, args.spreadsheetId, args.range);

        return dataResult(
          {
            spreadsheetId: args.spreadsheetId,
            range: args.range,
            sheetName: response.sheetName,
            cells: response.cells,
            noteCount: response.cells.length,
          },
          response.cells.length > 0
            ? `Read ${response.cells.length} cell note(s) successfully.`
            : 'No cell notes found.'
        );
      } catch (error: any) {
        log.error(
          `Error reading cell notes for spreadsheet ${args.spreadsheetId}: ${error.message || error}`
        );
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to read cell notes: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
