import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getCalendarClient } from '../../clients.js';
import { assertAtLeastOneDefined, dataResult, mutationResult } from '../../tooling.js';
import {
  buildCalendarTime,
  CalendarIdParameter,
  CalendarTimeRangeSchema,
  MAX_EVENT_RESULTS,
  normalizeCalendarDateTime,
  normalizeCalendarEvent,
} from './common.js';

const FocusTimeChatStatusSchema = z
  .enum(['doNotDisturb', 'available'])
  .optional()
  .describe('Google Chat status during Focus Time.');

const FocusTimeAutoDeclineSchema = z
  .enum([
    'declineAllConflictingInvitations',
    'declineOnlyNewConflictingInvitations',
    'declineNone',
  ])
  .optional()
  .describe('How Google Calendar should auto-decline conflicting invitations.');

export function register(server: FastMCP) {
  server.addTool({
    name: 'manageCalendarFocusTime',
    description:
      'Creates, lists, updates, or deletes Focus Time events on Google Calendar.',
    parameters: CalendarIdParameter.extend(CalendarTimeRangeSchema.shape).extend({
      action: z.enum(['create', 'list', 'update', 'delete']).describe('Focus Time action.'),
      eventId: z.string().optional().describe('Required for update and delete.'),
      startTime: z
        .string()
        .optional()
        .describe('Start time in RFC3339 format or as a date-only string like "2026-04-11".'),
      endTime: z
        .string()
        .optional()
        .describe('End time in RFC3339 format or as a date-only string like "2026-04-12".'),
      summary: z.string().optional().describe('Optional display title. Defaults to "Focus Time".'),
      recurrence: z.array(z.string()).optional().describe('Optional recurrence rules.'),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(MAX_EVENT_RESULTS)
        .optional()
        .default(10)
        .describe(`Maximum results to return when action="list" (1-${MAX_EVENT_RESULTS}).`),
      autoDeclineMode: FocusTimeAutoDeclineSchema,
      declineMessage: z.string().optional().describe('Optional decline message.'),
      chatStatus: FocusTimeChatStatusSchema,
    }),
    execute: async (args, { log }) => {
      const calendar = await getCalendarClient();
      log.info(`Managing Focus Time event action=${args.action} calendarId=${args.calendarId}`);

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
            eventTypes: ['focusTime'],
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
            `Fetched ${events.length} Focus Time event(s) successfully.`
          );
        }

        if (args.action === 'create') {
          if (!args.startTime || !args.endTime) {
            throw new UserError('startTime and endTime are required when action="create".');
          }

          const response = await calendar.events.insert({
            calendarId: args.calendarId,
            requestBody: {
              eventType: 'focusTime',
              summary: args.summary ?? 'Focus Time',
              start: buildCalendarTime(args.startTime, 'startTime', args.timezone),
              end: buildCalendarTime(args.endTime, 'endTime', args.timezone, {
                dateOnlyToNextDay: /^\d{4}-\d{2}-\d{2}$/.test(args.endTime),
              }),
              recurrence: args.recurrence,
              focusTimeProperties: {
                autoDeclineMode:
                  args.autoDeclineMode ?? 'declineAllConflictingInvitations',
                declineMessage: args.declineMessage ?? '',
                ...(args.chatStatus ? { chatStatus: args.chatStatus } : {}),
              },
              transparency: 'opaque',
            },
          });

          return mutationResult('Created Focus Time event successfully.', {
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
          return mutationResult('Deleted Focus Time event successfully.', {
            action: args.action,
            eventId: args.eventId,
          });
        }

        assertAtLeastOneDefined(
          args,
          ['startTime', 'endTime', 'summary', 'recurrence', 'autoDeclineMode', 'declineMessage', 'chatStatus'],
          'Provide at least one field to update when action="update".'
        );

        const existing = await calendar.events.get({
          calendarId: args.calendarId,
          eventId: args.eventId,
        });

        if (existing.data.eventType !== 'focusTime') {
          throw new UserError(
            `Event ${args.eventId} is not a Focus Time event. Use manageCalendarEvent for regular events.`
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
            focusTimeProperties: {
              autoDeclineMode:
                args.autoDeclineMode ??
                existing.data.focusTimeProperties?.autoDeclineMode ??
                'declineAllConflictingInvitations',
              declineMessage:
                args.declineMessage ??
                existing.data.focusTimeProperties?.declineMessage ??
                '',
              ...(args.chatStatus
                ? { chatStatus: args.chatStatus }
                : existing.data.focusTimeProperties?.chatStatus
                  ? { chatStatus: existing.data.focusTimeProperties.chatStatus }
                  : {}),
            },
          },
        });

        return mutationResult('Updated Focus Time event successfully.', {
          action: args.action,
          eventId: response.data.id ?? args.eventId,
          htmlLink: response.data.htmlLink ?? null,
        });
      } catch (error: any) {
        log.error(`Error managing Focus Time event: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(
          `Failed to manage Focus Time event: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
