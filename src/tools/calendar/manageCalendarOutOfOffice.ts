import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getCalendarClient } from '../../clients.js';
import { assertAtLeastOneDefined, mutationResult, dataResult } from '../../tooling.js';
import {
  buildCalendarTime,
  CalendarIdParameter,
  CalendarTimeRangeSchema,
  MAX_EVENT_RESULTS,
  normalizeCalendarDateTime,
  normalizeCalendarEvent,
} from './common.js';

const OutOfOfficePropertiesSchema = z.object({
  autoDeclineMode: z
    .enum([
      'declineAllConflictingInvitations',
      'declineOnlyNewConflictingInvitations',
      'declineNone',
    ])
    .optional()
    .describe('How Google Calendar should auto-decline conflicting invitations.'),
  declineMessage: z.string().optional().describe('Optional decline message.'),
});

export function register(server: FastMCP) {
  server.addTool({
    name: 'manageCalendarOutOfOffice',
    description:
      'Creates, lists, updates, or deletes Out of Office events on Google Calendar.',
    parameters: CalendarIdParameter.extend(CalendarTimeRangeSchema.shape).extend({
      action: z.enum(['create', 'list', 'update', 'delete']).describe('Out of Office action.'),
      eventId: z.string().optional().describe('Required for update and delete.'),
      startTime: z
        .string()
        .optional()
        .describe('Start time in RFC3339 format or as a date-only string like "2026-04-11".'),
      endTime: z
        .string()
        .optional()
        .describe('End time in RFC3339 format or as a date-only string like "2026-04-12".'),
      summary: z.string().optional().describe('Optional display title. Defaults to "Out of Office".'),
      recurrence: z.array(z.string()).optional().describe('Optional recurrence rules.'),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(MAX_EVENT_RESULTS)
        .optional()
        .default(10)
        .describe(`Maximum results to return when action="list" (1-${MAX_EVENT_RESULTS}).`),
      autoDeclineMode: OutOfOfficePropertiesSchema.shape.autoDeclineMode,
      declineMessage: OutOfOfficePropertiesSchema.shape.declineMessage,
    }),
    execute: async (args, { log }) => {
      const calendar = await getCalendarClient();
      log.info(`Managing Out of Office event action=${args.action} calendarId=${args.calendarId}`);

      try {
        if (args.action === 'list') {
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
            eventTypes: ['outOfOffice'],
          });

          const events = (response.data.items ?? []).map((event) =>
            normalizeCalendarEvent(event, true)
          );

          return dataResult(
            {
              calendarId: args.calendarId,
              timeMin,
              timeMax: timeMax ?? null,
              events,
              total: events.length,
            },
            `Fetched ${events.length} Out of Office event(s) successfully.`
          );
        }

        if (args.action === 'create') {
          if (!args.startTime || !args.endTime) {
            throw new UserError('startTime and endTime are required when action="create".');
          }

          const response = await calendar.events.insert({
            calendarId: args.calendarId,
            requestBody: {
              eventType: 'outOfOffice',
              summary: args.summary ?? 'Out of Office',
              start: buildCalendarTime(args.startTime, 'startTime', args.timezone),
              end: buildCalendarTime(args.endTime, 'endTime', args.timezone, {
                dateOnlyToNextDay: /^\d{4}-\d{2}-\d{2}$/.test(args.endTime),
              }),
              recurrence: args.recurrence,
              outOfOfficeProperties: {
                autoDeclineMode:
                  args.autoDeclineMode ?? 'declineAllConflictingInvitations',
                declineMessage: args.declineMessage ?? '',
              },
              transparency: 'opaque',
            },
          });

          return mutationResult('Created Out of Office event successfully.', {
            action: args.action,
            eventId: response.data.id ?? null,
            htmlLink: response.data.htmlLink ?? null,
          });
        }

        if (!args.eventId) {
          throw new UserError('eventId is required for update and delete actions.');
        }

        if (args.action === 'delete') {
          await calendar.events.delete({
            calendarId: args.calendarId,
            eventId: args.eventId,
          });
          return mutationResult('Deleted Out of Office event successfully.', {
            action: args.action,
            eventId: args.eventId,
          });
        }

        assertAtLeastOneDefined(
          args,
          ['startTime', 'endTime', 'summary', 'recurrence', 'autoDeclineMode', 'declineMessage'],
          'Provide at least one field to update when action="update".'
        );

        const existing = await calendar.events.get({
          calendarId: args.calendarId,
          eventId: args.eventId,
        });

        if (existing.data.eventType !== 'outOfOffice') {
          throw new UserError(
            `Event ${args.eventId} is not an Out of Office event. Use manageCalendarEvent for regular events.`
          );
        }

        const response = await calendar.events.patch({
          calendarId: args.calendarId,
          eventId: args.eventId,
          requestBody: {
            ...(args.summary !== undefined ? { summary: args.summary } : {}),
            ...(args.startTime !== undefined
              ? { start: buildCalendarTime(args.startTime, 'startTime', args.timezone) }
              : {}),
            ...(args.endTime !== undefined
              ? {
                  end: buildCalendarTime(args.endTime, 'endTime', args.timezone, {
                    dateOnlyToNextDay: /^\d{4}-\d{2}-\d{2}$/.test(args.endTime),
                  }),
                }
              : {}),
            ...(args.recurrence !== undefined ? { recurrence: args.recurrence } : {}),
            outOfOfficeProperties: {
              autoDeclineMode:
                args.autoDeclineMode ??
                existing.data.outOfOfficeProperties?.autoDeclineMode ??
                'declineAllConflictingInvitations',
              declineMessage:
                args.declineMessage ??
                existing.data.outOfOfficeProperties?.declineMessage ??
                '',
            },
          },
        });

        return mutationResult('Updated Out of Office event successfully.', {
          action: args.action,
          eventId: response.data.id ?? args.eventId,
          htmlLink: response.data.htmlLink ?? null,
        });
      } catch (error: any) {
        log.error(`Error managing Out of Office event: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(
          `Failed to manage Out of Office event: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
