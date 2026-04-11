import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getCalendarClient } from '../../clients.js';
import { mutationResult } from '../../tooling.js';
import { assertValidTimeZone } from './common.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'createCalendar',
    description:
      'Creates a secondary Google Calendar with a summary, and optional description and timezone.',
    parameters: z.object({
      summary: z.string().min(1).describe('Calendar display name.'),
      description: z.string().optional().describe('Optional calendar description.'),
      timeZone: z
        .string()
        .optional()
        .describe('Optional IANA timezone, for example "America/Sao_Paulo".'),
    }),
    execute: async (args, { log }) => {
      const calendar = await getCalendarClient();
      log.info(`Creating calendar summary="${args.summary}"`);

      try {
        if (args.timeZone) assertValidTimeZone(args.timeZone);

        const response = await calendar.calendars.insert({
          requestBody: {
            summary: args.summary,
            description: args.description,
            timeZone: args.timeZone,
          },
        });

        return mutationResult('Created calendar successfully.', {
          calendarId: response.data.id ?? null,
          summary: response.data.summary ?? args.summary,
          timeZone: response.data.timeZone ?? args.timeZone ?? null,
        });
      } catch (error: any) {
        log.error(`Error creating calendar: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to create calendar: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
