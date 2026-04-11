import type { FastMCP } from 'fastmcp';
import { register as listCalendars } from './listCalendars.js';
import { register as getCalendarEvents } from './getCalendarEvents.js';
import { register as manageCalendarEvent } from './manageCalendarEvent.js';
import { register as manageCalendarOutOfOffice } from './manageCalendarOutOfOffice.js';
import { register as manageCalendarFocusTime } from './manageCalendarFocusTime.js';
import { register as queryCalendarFreeBusy } from './queryCalendarFreeBusy.js';
import { register as createCalendar } from './createCalendar.js';

export function registerCalendarTools(server: FastMCP) {
  listCalendars(server);
  getCalendarEvents(server);
  manageCalendarEvent(server);
  manageCalendarOutOfOffice(server);
  manageCalendarFocusTime(server);
  queryCalendarFreeBusy(server);
  createCalendar(server);
}
