import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getCalendarClient } from '../../clients.js';
import { assertExactlyOneDefined, dataResult } from '../../tooling.js';
import {
  CalendarIdParameter,
  CalendarTimeRangeSchema,
  MAX_EVENT_RESULTS,
  normalizeCalendarDateTime,
  normalizeCalendarEvent,
} from './common.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'getCalendarEvents',
    description:
      'Retrieves Google Calendar events. Use eventId to fetch a single event, or provide timeMin/timeMax to list events in a range.',
    parameters: CalendarIdParameter.extend(
      CalendarTimeRangeSchema.shape
    ).extend({
      eventId: z.string().optional().describe('Optional event ID for a single-event lookup.'),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(MAX_EVENT_RESULTS)
        .optional()
        .default(25)
        .describe(`Maximum number of events to return for range queries (1-${MAX_EVENT_RESULTS}).`),
      query: z
        .string()
        .optional()
        .describe('Optional keyword search across summary, description, and location.'),
      detailed: z
        .boolean()
        .optional()
        .default(false)
        .describe('If true, include attendees, reminders, and extended event details.'),
      includeAttachments: z
        .boolean()
        .optional()
        .default(false)
        .describe('If true, include event attachment metadata in detailed results.'),
    }),
    execute: async (args, { log }) => {
      const calendar = await getCalendarClient();
      log.info(
        `Fetching calendar events calendarId=${args.calendarId} eventId=${args.eventId ?? 'range'}`
      );

      try {
        if (args.eventId) {
          const response = await calendar.events.get({
            calendarId: args.calendarId,
            eventId: args.eventId,
          });

          let event = normalizeCalendarEvent(response.data, args.detailed);
          if (!args.includeAttachments && args.detailed) {
            event = { ...event, attachments: undefined as any };
          }

          return dataResult(
            {
              event,
            },
            'Fetched calendar event successfully.'
          );
        }

        if (!args.timeMin && !args.timeMax) {
          throw new UserError(
            'Provide either eventId, or at least one of timeMin/timeMax for a range query.'
          );
        }

        const timeMin = normalizeCalendarDateTime(args.timeMin, 'timeMin', args.timezone, {
          defaultToNow: true,
        });
        const timeMax = normalizeCalendarDateTime(args.timeMax, 'timeMax', args.timezone);

        const response = await calendar.events.list({
          calendarId: args.calendarId,
          timeMin,
          timeMax,
          maxResults: args.maxResults,
          singleEvents: true,
          orderBy: 'startTime',
          q: args.query,
        });

        const events = (response.data.items ?? []).map((item) => {
          const event = normalizeCalendarEvent(item, args.detailed);
          if (!args.includeAttachments && args.detailed) {
            return { ...event, attachments: undefined as any };
          }
          return event;
        });

        return dataResult(
          {
            calendarId: args.calendarId,
            timeMin,
            timeMax: timeMax ?? null,
            query: args.query ?? null,
            events,
            total: events.length,
            nextSyncToken: response.data.nextSyncToken ?? null,
          },
          `Fetched ${events.length} calendar event(s) successfully.`
        );
      } catch (error: any) {
        log.error(`Error fetching calendar events: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to fetch calendar events: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
