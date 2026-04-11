import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { getCalendarClient } from '../../clients.js';
import { dataResult } from '../../tooling.js';
import { normalizeCalendarListEntry } from './common.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'listCalendars',
    description:
      'Lists Google Calendars accessible to the authenticated user, including primary status, timezone, access role, and color metadata.',
    parameters: undefined,
    execute: async (_args, { log }) => {
      const calendar = await getCalendarClient();
      log.info('Listing accessible Google Calendars');

      try {
        const response = await calendar.calendarList.list();
        const calendars = (response.data.items ?? []).map(normalizeCalendarListEntry);

        return dataResult(
          {
            calendars,
            total: calendars.length,
          },
          `Listed ${calendars.length} calendar(s) successfully.`
        );
      } catch (error: any) {
        log.error(`Error listing calendars: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to list calendars: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
