import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSheetsClient } from '../../clients.js';
import * as SheetsHelpers from '../../googleSheetsApiHelpers.js';
import { mutationResult } from '../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'updateCellNotes',
    description:
      'Sets or replaces the note on every cell in a spreadsheet range. The same note text is applied to each targeted cell.',
    parameters: z.object({
      spreadsheetId: z
        .string()
        .describe(
          'The spreadsheet ID — the long string between /d/ and /edit in a Google Sheets URL.'
        ),
      range: z
        .string()
        .describe(
          'A1 notation range to update notes in (e.g., "Sheet1!B2:B10" or "C3").'
        ),
      note: z.string().min(1).describe('The note text to set on every cell in the range.'),
    }),
    execute: async (args, { log }) => {
      const sheets = await getSheetsClient();
      log.info(`Updating cell notes for range "${args.range}" in spreadsheet ${args.spreadsheetId}`);

      try {
        await SheetsHelpers.updateCellNotes(sheets, args.spreadsheetId, args.range, args.note);

        return mutationResult('Updated cell notes successfully.', {
          spreadsheetId: args.spreadsheetId,
          range: args.range,
          note: args.note,
        });
      } catch (error: any) {
        log.error(
          `Error updating cell notes for spreadsheet ${args.spreadsheetId}: ${error.message || error}`
        );
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to update cell notes: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
