import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getCalendarClientMock } = vi.hoisted(() => ({
  getCalendarClientMock: vi.fn(),
}));

vi.mock('../../clients.js', () => ({
  getCalendarClient: getCalendarClientMock,
}));

import { register as registerCreateCalendar } from './createCalendar.js';
import { register as registerManageCalendarEvent } from './manageCalendarEvent.js';
import { register as registerManageCalendarFocusTime } from './manageCalendarFocusTime.js';
import { register as registerQueryCalendarFreeBusy } from './queryCalendarFreeBusy.js';
import {
  buildCalendarTime,
  normalizeCalendarDateTime,
  normalizeCalendarEvent,
  normalizeFreeBusyResponse,
} from './common.js';

function captureTool(registerTool: (server: any) => void) {
  let config: any;
  registerTool({
    addTool(input: any) {
      config = input;
    },
  });
  return config;
}

function parseToolResult(text: string) {
  const parts = text.split('\n\n');
  return JSON.parse(parts[parts.length - 1]);
}

describe('calendar helpers', () => {
  it('normalizeCalendarDateTime requires timezone for date-only input', () => {
    expect(() => normalizeCalendarDateTime('2026-04-11', 'timeMin')).toThrow(
      'timeMin requires timezone when using a date-only value.'
    );
  });

  it('buildCalendarTime keeps date-only values as all-day dates when allowed', () => {
    expect(buildCalendarTime('2026-04-11', 'startTime', undefined, { allowDate: true })).toEqual({
      date: '2026-04-11',
    });
  });

  it('normalizeCalendarEvent includes conference, attendees, and focus time properties in detailed mode', () => {
    const normalized = normalizeCalendarEvent(
      {
        id: 'evt-1',
        eventType: 'focusTime',
        summary: 'Focus block',
        htmlLink: 'https://calendar.google.com/event?eid=abc',
        focusTimeProperties: {
          autoDeclineMode: 'declineAllConflictingInvitations',
          declineMessage: 'Heads down',
          chatStatus: 'doNotDisturb',
        },
        attendees: [{ email: 'user@example.com', self: true, responseStatus: 'accepted' }],
        conferenceData: {
          conferenceId: 'meet-123',
          entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' }],
        },
        start: { dateTime: '2026-04-11T13:00:00Z' },
        end: { dateTime: '2026-04-11T14:00:00Z' },
      } as any,
      true
    );

    expect(normalized.eventType).toBe('focusTime');
    expect(normalized.focusTimeProperties?.chatStatus).toBe('doNotDisturb');
    expect(normalized.attendees?.[0]).toMatchObject({
      email: 'user@example.com',
      responseStatus: 'accepted',
    });
    expect(normalized.conferenceData?.conferenceId).toBe('meet-123');
  });

  it('normalizeFreeBusyResponse preserves busy windows per calendar', () => {
    expect(
      normalizeFreeBusyResponse({
        timeMin: '2026-04-11T10:00:00Z',
        timeMax: '2026-04-11T18:00:00Z',
        calendars: {
          primary: {
            busy: [{ start: '2026-04-11T12:00:00Z', end: '2026-04-11T13:00:00Z' }],
          },
        },
      } as any)
    ).toEqual({
      timeMin: '2026-04-11T10:00:00Z',
      timeMax: '2026-04-11T18:00:00Z',
      calendars: [
        {
          calendarId: 'primary',
          errors: [],
          busy: [{ start: '2026-04-11T12:00:00Z', end: '2026-04-11T13:00:00Z' }],
        },
      ],
    });
  });
});

describe('calendar tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('manageCalendarEvent creates a regular event with attendees, reminders, attachments, and Meet', async () => {
    const insert = vi.fn().mockResolvedValue({
      data: {
        id: 'evt-1',
        htmlLink: 'https://calendar.google.com/event?eid=evt-1',
        conferenceData: { conferenceId: 'meet-123' },
      },
    });

    getCalendarClientMock.mockResolvedValue({
      events: { insert },
    });

    const tool = captureTool(registerManageCalendarEvent);
    const parsed = tool.parameters.parse({
      action: 'create',
      summary: 'Planning',
      startTime: '2026-04-11T10:00:00Z',
      endTime: '2026-04-11T11:00:00Z',
      attendees: ['alice@example.com'],
      reminders: [{ method: 'popup', minutes: 30 }],
      attachments: [{ fileUrl: 'https://drive.google.com/file/d/123/view', fileId: '123' }],
      addGoogleMeet: true,
    });
    const result = await tool.execute(parsed, { log: { info() {}, error() {} } });
    const payload = parseToolResult(result.content[0].text);

    expect(insert).toHaveBeenCalledWith({
      calendarId: 'primary',
      sendUpdates: 'all',
      conferenceDataVersion: 1,
      requestBody: expect.objectContaining({
        summary: 'Planning',
        attendees: [{ email: 'alice@example.com' }],
        attachments: [
          {
            fileId: '123',
            fileUrl: 'https://drive.google.com/file/d/123/view',
            title: undefined,
            mimeType: undefined,
            iconLink: undefined,
          },
        ],
        reminders: {
          useDefault: false,
          overrides: [{ method: 'popup', minutes: 30 }],
        },
        conferenceData: expect.any(Object),
      }),
    });
    expect(payload).toMatchObject({
      success: true,
      eventId: 'evt-1',
      htmlLink: 'https://calendar.google.com/event?eid=evt-1',
    });
  });

  it('manageCalendarFocusTime requires update fields for update action', async () => {
    getCalendarClientMock.mockResolvedValue({
      events: { get: vi.fn(), patch: vi.fn() },
    });

    const tool = captureTool(registerManageCalendarFocusTime);
    const parsed = tool.parameters.parse({
      action: 'update',
      eventId: 'focus-1',
    });

    await expect(tool.execute(parsed, { log: { info() {}, error() {} } })).rejects.toThrow(
      'Provide at least one field to update when action="update".'
    );
  });

  it('queryCalendarFreeBusy shapes the freebusy request and normalizes the response', async () => {
    const query = vi.fn().mockResolvedValue({
      data: {
        timeMin: '2026-04-11T10:00:00Z',
        timeMax: '2026-04-11T18:00:00Z',
        calendars: {
          primary: {
            busy: [{ start: '2026-04-11T12:00:00Z', end: '2026-04-11T13:00:00Z' }],
          },
        },
      },
    });

    getCalendarClientMock.mockResolvedValue({
      freebusy: { query },
    });

    const tool = captureTool(registerQueryCalendarFreeBusy);
    const parsed = tool.parameters.parse({
      timeMin: '2026-04-11T10:00:00Z',
      timeMax: '2026-04-11T18:00:00Z',
      calendarIds: ['primary'],
    });
    const result = await tool.execute(parsed, { log: { info() {}, error() {} } });
    const payload = parseToolResult(result.content[0].text);

    expect(query).toHaveBeenCalledWith({
      requestBody: {
        timeMin: '2026-04-11T10:00:00Z',
        timeMax: '2026-04-11T18:00:00Z',
        items: [{ id: 'primary' }],
        groupExpansionMax: undefined,
        calendarExpansionMax: undefined,
      },
    });
    expect(payload.calendars[0].calendarId).toBe('primary');
    expect(payload.calendars[0].busy).toHaveLength(1);
  });

  it('createCalendar validates timezone and returns created calendar metadata', async () => {
    const insert = vi.fn().mockResolvedValue({
      data: { id: 'cal-1', summary: 'Ops Calendar', timeZone: 'America/Sao_Paulo' },
    });

    getCalendarClientMock.mockResolvedValue({
      calendars: { insert },
    });

    const tool = captureTool(registerCreateCalendar);
    const parsed = tool.parameters.parse({
      summary: 'Ops Calendar',
      timeZone: 'America/Sao_Paulo',
    });
    const result = await tool.execute(parsed, { log: { info() {}, error() {} } });
    const payload = parseToolResult(result.content[0].text);

    expect(insert).toHaveBeenCalledWith({
      requestBody: {
        summary: 'Ops Calendar',
        description: undefined,
        timeZone: 'America/Sao_Paulo',
      },
    });
    expect(payload.calendarId).toBe('cal-1');
  });
});
