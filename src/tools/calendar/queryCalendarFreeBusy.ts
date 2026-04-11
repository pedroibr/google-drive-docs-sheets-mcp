import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getCalendarClient } from '../../clients.js';
import { dataResult } from '../../tooling.js';
import {
  CalendarTimeRangeSchema,
  normalizeCalendarDateTime,
  normalizeFreeBusyResponse,
} from './common.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'queryCalendarFreeBusy',
    description:
      'Returns busy windows for one or more Google Calendars in a requested interval.',
    parameters: CalendarTimeRangeSchema.extend({
      timeMin: z.string().describe('Start of the interval in RFC3339 or YYYY-MM-DD format.'),
      timeMax: z.string().describe('End of the interval in RFC3339 or YYYY-MM-DD format.'),
      calendarIds: z
        .array(z.string())
        .optional()
        .describe('Optional list of calendar IDs. Defaults to ["primary"].'),
      groupExpansionMax: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Optional maximum group expansion.'),
      calendarExpansionMax: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Optional maximum calendar expansion.'),
    }),
    execute: async (args, { log }) => {
      const calendar = await getCalendarClient();
      log.info('Querying Calendar free/busy');

      try {
        const timeMin = normalizeCalendarDateTime(args.timeMin, 'timeMin', args.timezone)!;
        const timeMax = normalizeCalendarDateTime(args.timeMax, 'timeMax', args.timezone)!;

        const response = await calendar.freebusy.query({
          requestBody: {
            timeMin,
            timeMax,
            items: (args.calendarIds ?? ['primary']).map((id) => ({ id })),
            groupExpansionMax: args.groupExpansionMax,
            calendarExpansionMax: args.calendarExpansionMax,
          },
        });

        return dataResult(
          normalizeFreeBusyResponse(response.data),
          'Queried calendar free/busy successfully.'
        );
      } catch (error: any) {
        log.error(`Error querying free/busy: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(
          `Failed to query calendar free/busy: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
