import { UserError } from 'fastmcp';
import type { calendar_v3 } from 'googleapis';
import { z } from 'zod';

export const MAX_EVENT_RESULTS = 100;

export const CalendarIdParameter = z.object({
  calendarId: z
    .string()
    .optional()
    .default('primary')
    .describe(
      'Calendar ID to operate on. Defaults to "primary". Use listCalendars to discover other calendar IDs.'
    ),
});

export const CalendarTimeRangeSchema = z.object({
  timeMin: z
    .string()
    .optional()
    .describe(
      'Start of the time range in RFC3339 format or as a date-only string like "2026-04-11".'
    ),
  timeMax: z
    .string()
    .optional()
    .describe(
      'End of the time range in RFC3339 format or as a date-only string like "2026-04-12".'
    ),
  timezone: z
    .string()
    .optional()
    .describe(
      'Optional IANA timezone, for example "America/Sao_Paulo". Required when using date-only values or date-times without an explicit offset.'
    ),
});

export const ReminderOverrideSchema = z.object({
  method: z.enum(['email', 'popup']).describe('Reminder delivery method.'),
  minutes: z.number().int().min(0).describe('Minutes before the event start.'),
});

export const CalendarAttachmentSchema = z.object({
  fileUrl: z
    .string()
    .url()
    .describe('Google Drive file URL to attach to the calendar event.'),
  title: z.string().optional().describe('Optional attachment title.'),
  mimeType: z.string().optional().describe('Optional attachment MIME type.'),
  iconLink: z.string().url().optional().describe('Optional attachment icon URL.'),
  fileId: z.string().optional().describe('Optional Google Drive file ID, when known.'),
});

export const CalendarAttendeeSchema = z.object({
  email: z.string().email().describe('Attendee email address.'),
  optional: z.boolean().optional().describe('Whether the attendee is optional.'),
  displayName: z.string().optional().describe('Optional attendee display name.'),
  responseStatus: z
    .enum(['needsAction', 'declined', 'tentative', 'accepted'])
    .optional()
    .describe('Optional attendee response status.'),
  comment: z.string().optional().describe('Optional attendee comment.'),
});

export function assertValidTimeZone(timeZone: string): void {
  try {
    Intl.DateTimeFormat(undefined, { timeZone }).resolvedOptions();
  } catch {
    throw new UserError(`Invalid timezone "${timeZone}". Expected a valid IANA timezone.`);
  }
}

function hasExplicitOffset(value: string): boolean {
  return value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value);
}

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toUtcIsoAtLocalMidnight(dateOnly: string, timeZone: string, dayOffset = 0): string {
  assertValidTimeZone(timeZone);
  const [yearString, monthString, dayString] = dateOnly.split('-');
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString) + dayOffset;
  const utcDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  return utcDate.toISOString().replace('.000Z', 'Z');
}

export function normalizeCalendarDateTime(
  value: string | undefined,
  label: string,
  timeZone?: string,
  options: { dateOnlyToNextDay?: boolean; defaultToNow?: boolean } = {}
): string | undefined {
  if (!value) {
    if (options.defaultToNow) {
      return new Date().toISOString().replace('.000Z', 'Z');
    }
    return undefined;
  }

  if (isDateOnly(value)) {
    if (!timeZone) {
      throw new UserError(`${label} requires timezone when using a date-only value.`);
    }
    return toUtcIsoAtLocalMidnight(value, timeZone, options.dateOnlyToNextDay ? 1 : 0);
  }

  if (!hasExplicitOffset(value)) {
    if (!timeZone) {
      throw new UserError(
        `${label} requires timezone when using a date-time without an explicit UTC offset.`
      );
    }
    const candidate = new Date(`${value}${value.includes('T') ? '' : 'T00:00:00'}Z`);
    if (Number.isNaN(candidate.getTime())) {
      throw new UserError(`${label} must be a valid RFC3339 date-time or YYYY-MM-DD date.`);
    }
    return candidate.toISOString().replace('.000Z', 'Z');
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new UserError(`${label} must be a valid RFC3339 date-time or YYYY-MM-DD date.`);
  }
  return parsed.toISOString().replace('.000Z', 'Z');
}

export function buildCalendarTime(
  value: string,
  label: string,
  timeZone?: string,
  options: { dateOnlyToNextDay?: boolean; allowDate?: boolean } = {}
) {
  if (isDateOnly(value) && options.allowDate) {
    return { date: value };
  }

  const normalized = normalizeCalendarDateTime(value, label, timeZone, {
    dateOnlyToNextDay: options.dateOnlyToNextDay,
  });

  return {
    dateTime: normalized!,
    ...(timeZone ? { timeZone } : {}),
  };
}

export function normalizeCalendarListEntry(entry: calendar_v3.Schema$CalendarListEntry) {
  return {
    id: entry.id ?? null,
    summary: entry.summary ?? null,
    description: entry.description ?? null,
    primary: entry.primary ?? false,
    timeZone: entry.timeZone ?? null,
    accessRole: entry.accessRole ?? null,
    backgroundColor: entry.backgroundColor ?? null,
    foregroundColor: entry.foregroundColor ?? null,
    hidden: entry.hidden ?? false,
    selected: entry.selected ?? false,
  };
}

export function normalizeCalendarAttachment(attachment: calendar_v3.Schema$EventAttachment) {
  return {
    fileId: attachment.fileId ?? null,
    fileUrl: attachment.fileUrl ?? null,
    title: attachment.title ?? null,
    mimeType: attachment.mimeType ?? null,
    iconLink: attachment.iconLink ?? null,
  };
}

export function normalizeCalendarAttendee(attendee: calendar_v3.Schema$EventAttendee) {
  return {
    email: attendee.email ?? null,
    displayName: attendee.displayName ?? null,
    optional: attendee.optional ?? false,
    organizer: attendee.organizer ?? false,
    resource: attendee.resource ?? false,
    self: attendee.self ?? false,
    responseStatus: attendee.responseStatus ?? null,
    comment: attendee.comment ?? null,
  };
}

export function normalizeCalendarEvent(event: calendar_v3.Schema$Event, detailed = false) {
  const base = {
    id: event.id ?? null,
    status: event.status ?? null,
    eventType: event.eventType ?? 'default',
    summary: event.summary ?? null,
    description: detailed ? event.description ?? null : undefined,
    location: detailed ? event.location ?? null : undefined,
    htmlLink: event.htmlLink ?? null,
    created: event.created ?? null,
    updated: event.updated ?? null,
    colorId: event.colorId ?? null,
    visibility: event.visibility ?? null,
    transparency: event.transparency ?? null,
    recurringEventId: event.recurringEventId ?? null,
    recurrence: event.recurrence ?? [],
    start: event.start ?? null,
    end: event.end ?? null,
    organizer: event.organizer
      ? {
          email: event.organizer.email ?? null,
          displayName: event.organizer.displayName ?? null,
          self: event.organizer.self ?? false,
        }
      : null,
    creator: event.creator
      ? {
          email: event.creator.email ?? null,
          displayName: event.creator.displayName ?? null,
          self: event.creator.self ?? false,
        }
      : null,
    conferenceData: event.conferenceData
      ? {
          conferenceId: event.conferenceData.conferenceId ?? null,
          entryPoints:
            event.conferenceData.entryPoints?.map((entryPoint) => ({
              entryPointType: entryPoint.entryPointType ?? null,
              uri: entryPoint.uri ?? null,
              label: entryPoint.label ?? null,
              meetingCode: entryPoint.meetingCode ?? null,
              passcode: entryPoint.passcode ?? null,
              pin: entryPoint.pin ?? null,
            })) ?? [],
        }
      : null,
  };

  if (!detailed) return base;

  return {
    ...base,
    attendees: event.attendees?.map(normalizeCalendarAttendee) ?? [],
    attachments: event.attachments?.map(normalizeCalendarAttachment) ?? [],
    reminders: event.reminders ?? null,
    guestsCanModify: event.guestsCanModify ?? null,
    guestsCanInviteOthers: event.guestsCanInviteOthers ?? null,
    guestsCanSeeOtherGuests: event.guestsCanSeeOtherGuests ?? null,
    outOfOfficeProperties: event.outOfOfficeProperties ?? null,
    focusTimeProperties: event.focusTimeProperties ?? null,
  };
}

export function normalizeFreeBusyResponse(response: calendar_v3.Schema$FreeBusyResponse) {
  const calendars = Object.entries(response.calendars ?? {}).map(([calendarId, data]) => ({
    calendarId,
    errors:
      data.errors?.map((error) => ({
        domain: error.domain ?? null,
        reason: error.reason ?? null,
      })) ?? [],
    busy:
      data.busy?.map((busy) => ({
        start: busy.start ?? null,
        end: busy.end ?? null,
      })) ?? [],
  }));

  return {
    timeMin: response.timeMin ?? null,
    timeMax: response.timeMax ?? null,
    calendars,
  };
}

export function normalizeAttendees(
  attendees?: Array<z.infer<typeof CalendarAttendeeSchema> | string>
): calendar_v3.Schema$EventAttendee[] | undefined {
  if (!attendees || attendees.length === 0) return undefined;

  return attendees.map((attendee) => {
    if (typeof attendee === 'string') return { email: attendee };
    return {
      email: attendee.email,
      optional: attendee.optional,
      displayName: attendee.displayName,
      responseStatus: attendee.responseStatus,
      comment: attendee.comment,
    };
  });
}

export function normalizeAttachments(
  attachments?: z.infer<typeof CalendarAttachmentSchema>[]
): calendar_v3.Schema$EventAttachment[] | undefined {
  if (!attachments || attachments.length === 0) return undefined;

  return attachments.map((attachment) => ({
    fileId: attachment.fileId,
    fileUrl: attachment.fileUrl,
    title: attachment.title,
    mimeType: attachment.mimeType,
    iconLink: attachment.iconLink,
  }));
}

export function normalizeReminderOverrides(
  reminders?: z.infer<typeof ReminderOverrideSchema>[],
  useDefaultReminders?: boolean
): { useDefault: boolean; overrides?: calendar_v3.Schema$EventReminder[] } | undefined {
  if (useDefaultReminders === undefined && (!reminders || reminders.length === 0)) return undefined;
  return {
    useDefault: useDefaultReminders ?? false,
    overrides: reminders?.map((reminder) => ({
      method: reminder.method,
      minutes: reminder.minutes,
    })),
  };
}

export function buildConferenceRequest(addGoogleMeet?: boolean) {
  if (!addGoogleMeet) return undefined;
  return {
    createRequest: {
      requestId: `meet-${Date.now().toString(36)}`,
      conferenceSolutionKey: { type: 'hangoutsMeet' },
    },
  };
}
