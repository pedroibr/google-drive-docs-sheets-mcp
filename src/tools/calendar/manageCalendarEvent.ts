import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getCalendarClient } from '../../clients.js';
import { assertAtLeastOneDefined, mutationResult } from '../../tooling.js';
import {
  buildCalendarTime,
  buildConferenceRequest,
  CalendarAttachmentSchema,
  CalendarAttendeeSchema,
  CalendarIdParameter,
  normalizeAttachments,
  normalizeAttendees,
  normalizeReminderOverrides,
  ReminderOverrideSchema,
} from './common.js';

const ManageCalendarEventParameters = CalendarIdParameter.extend({
  action: z.enum(['create', 'update', 'delete', 'rsvp']).describe('Calendar event action.'),
  eventId: z.string().optional().describe('Required for update, delete, and rsvp.'),
  summary: z.string().optional().describe('Event title. Required for create.'),
  startTime: z
    .string()
    .optional()
    .describe('Event start in RFC3339 format or as a date-only string like "2026-04-11".'),
  endTime: z
    .string()
    .optional()
    .describe('Event end in RFC3339 format or as a date-only string like "2026-04-11".'),
  timezone: z
    .string()
    .optional()
    .describe('Optional IANA timezone. Required when using date-only values or timestamps without offset.'),
  description: z.string().optional().describe('Optional event description.'),
  location: z.string().optional().describe('Optional event location.'),
  attendees: z
    .array(z.union([z.string().email(), CalendarAttendeeSchema]))
    .optional()
    .describe('Optional attendee email strings or detailed attendee objects.'),
  attachments: z
    .array(CalendarAttachmentSchema)
    .optional()
    .describe('Optional Google Drive attachments.'),
  addGoogleMeet: z.boolean().optional().describe('If true, request a Google Meet link.'),
  reminders: z
    .array(ReminderOverrideSchema)
    .optional()
    .describe('Optional custom reminder overrides.'),
  useDefaultReminders: z
    .boolean()
    .optional()
    .describe('Whether to use the calendar default reminders.'),
  transparency: z
    .enum(['opaque', 'transparent'])
    .optional()
    .describe('Whether the event marks the user busy or free.'),
  visibility: z
    .enum(['default', 'public', 'private', 'confidential'])
    .optional()
    .describe('Calendar event visibility.'),
  colorId: z.string().optional().describe('Optional event color ID.'),
  recurrence: z
    .array(z.string())
    .optional()
    .describe('Optional RFC5545 recurrence rules, e.g. ["RRULE:FREQ=WEEKLY;COUNT=10"].'),
  guestsCanModify: z.boolean().optional().describe('Whether guests can modify the event.'),
  guestsCanInviteOthers: z
    .boolean()
    .optional()
    .describe('Whether guests can invite others.'),
  guestsCanSeeOtherGuests: z
    .boolean()
    .optional()
    .describe('Whether guests can see the guest list.'),
  response: z
    .enum(['accepted', 'declined', 'tentative', 'needsAction'])
    .optional()
    .describe('RSVP response status when action="rsvp".'),
  rsvpComment: z.string().optional().describe('Optional RSVP comment.'),
  sendUpdates: z
    .enum(['all', 'externalOnly', 'none'])
    .optional()
    .default('all')
    .describe('Notification behavior for updates or RSVP.'),
});

export function register(server: FastMCP) {
  server.addTool({
    name: 'manageCalendarEvent',
    description:
      'Creates, updates, deletes, or RSVPs to a regular Google Calendar event using a single action-based tool.',
    parameters: ManageCalendarEventParameters,
    execute: async (args, { log }) => {
      const calendar = await getCalendarClient();
      log.info(`Managing calendar event action=${args.action} calendarId=${args.calendarId}`);

      try {
        if (args.action === 'create') {
          if (!args.summary || !args.startTime || !args.endTime) {
            throw new UserError(
              'summary, startTime, and endTime are required when action="create".'
            );
          }

          const response = await calendar.events.insert({
            calendarId: args.calendarId,
            sendUpdates: args.sendUpdates,
            conferenceDataVersion: args.addGoogleMeet ? 1 : 0,
            requestBody: {
              summary: args.summary,
              description: args.description,
              location: args.location,
              start: buildCalendarTime(args.startTime, 'startTime', args.timezone, {
                allowDate: true,
              }),
              end: buildCalendarTime(args.endTime, 'endTime', args.timezone, {
                allowDate: true,
              }),
              attendees: normalizeAttendees(args.attendees),
              attachments: normalizeAttachments(args.attachments),
              reminders: normalizeReminderOverrides(args.reminders, args.useDefaultReminders),
              transparency: args.transparency,
              visibility: args.visibility,
              colorId: args.colorId,
              recurrence: args.recurrence,
              guestsCanModify: args.guestsCanModify,
              guestsCanInviteOthers: args.guestsCanInviteOthers,
              guestsCanSeeOtherGuests: args.guestsCanSeeOtherGuests,
              conferenceData: buildConferenceRequest(args.addGoogleMeet),
            },
          });

          return mutationResult('Created calendar event successfully.', {
            action: args.action,
            eventId: response.data.id ?? null,
            htmlLink: response.data.htmlLink ?? null,
            conferenceData: response.data.conferenceData ?? null,
          });
        }

        if (!args.eventId) {
          throw new UserError('eventId is required for update, delete, and rsvp actions.');
        }

        if (args.action === 'delete') {
          await calendar.events.delete({
            calendarId: args.calendarId,
            eventId: args.eventId,
            sendUpdates: args.sendUpdates,
          });
          return mutationResult('Deleted calendar event successfully.', {
            action: args.action,
            eventId: args.eventId,
          });
        }

        if (args.action === 'rsvp') {
          if (!args.response) {
            throw new UserError('response is required when action="rsvp".');
          }

          const existing = await calendar.events.get({
            calendarId: args.calendarId,
            eventId: args.eventId,
          });

          const attendees = (existing.data.attendees ?? []).map((attendee) =>
            attendee.self
              ? {
                  ...attendee,
                  responseStatus: args.response,
                  comment: args.rsvpComment ?? attendee.comment,
                }
              : attendee
          );

          const response = await calendar.events.patch({
            calendarId: args.calendarId,
            eventId: args.eventId,
            sendUpdates: args.sendUpdates,
            requestBody: {
              attendees,
            },
          });

          return mutationResult('Updated calendar RSVP successfully.', {
            action: args.action,
            eventId: args.eventId,
            htmlLink: response.data.htmlLink ?? null,
            responseStatus: args.response,
          });
        }

        assertAtLeastOneDefined(
          args,
          [
            'summary',
            'startTime',
            'endTime',
            'timezone',
            'description',
            'location',
            'attendees',
            'attachments',
            'addGoogleMeet',
            'reminders',
            'useDefaultReminders',
            'transparency',
            'visibility',
            'colorId',
            'recurrence',
            'guestsCanModify',
            'guestsCanInviteOthers',
            'guestsCanSeeOtherGuests',
          ],
          'Provide at least one field to update when action="update".'
        );

        const patchBody: Record<string, unknown> = {
          summary: args.summary,
          description: args.description,
          location: args.location,
          attendees: normalizeAttendees(args.attendees),
          attachments: normalizeAttachments(args.attachments),
          reminders: normalizeReminderOverrides(args.reminders, args.useDefaultReminders),
          transparency: args.transparency,
          visibility: args.visibility,
          colorId: args.colorId,
          recurrence: args.recurrence,
          guestsCanModify: args.guestsCanModify,
          guestsCanInviteOthers: args.guestsCanInviteOthers,
          guestsCanSeeOtherGuests: args.guestsCanSeeOtherGuests,
        };

        if (args.startTime !== undefined) {
          patchBody.start = buildCalendarTime(args.startTime, 'startTime', args.timezone, {
            allowDate: true,
          });
        }
        if (args.endTime !== undefined) {
          patchBody.end = buildCalendarTime(args.endTime, 'endTime', args.timezone, {
            allowDate: true,
          });
        }
        if (args.addGoogleMeet !== undefined) {
          patchBody.conferenceData = buildConferenceRequest(args.addGoogleMeet);
        }

        const response = await calendar.events.patch({
          calendarId: args.calendarId,
          eventId: args.eventId,
          sendUpdates: args.sendUpdates,
          conferenceDataVersion: args.addGoogleMeet ? 1 : 0,
          requestBody: patchBody as any,
        });

        return mutationResult('Updated calendar event successfully.', {
          action: args.action,
          eventId: response.data.id ?? args.eventId,
          htmlLink: response.data.htmlLink ?? null,
          conferenceData: response.data.conferenceData ?? null,
        });
      } catch (error: any) {
        log.error(`Error managing calendar event: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to manage calendar event: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
