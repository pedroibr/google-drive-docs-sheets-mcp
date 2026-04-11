# Calendar

Tools for Google Calendar scheduling workflows inside the MCP server. This domain follows the same public contract as the rest of the repo: camelCase tool names, flat schemas, runtime validation, and structured payload responses.

## Tools

| Tool                        | Description                                                         |
| --------------------------- | ------------------------------------------------------------------- |
| `listCalendars`             | List accessible calendars                                           |
| `getCalendarEvents`         | Read a single event or query events in a time range                 |
| `manageCalendarEvent`       | Create, update, delete, or RSVP to regular calendar events          |
| `manageCalendarOutOfOffice` | Create, list, update, or delete Out of Office events                |
| `manageCalendarFocusTime`   | Create, list, update, or delete Focus Time events                   |
| `queryCalendarFreeBusy`     | Query busy windows for one or more calendars                        |
| `createCalendar`            | Create a secondary calendar                                         |

## Notes

- Existing users will need to re-run auth after upgrading because Calendar adds new OAuth scopes.
- Remote deployments that use a Web OAuth client must include the extra callback URI for `/calendar/oauth/callback`.
- Date-only input requires a timezone for event types that rely on `dateTime` payloads, such as Focus Time and Out of Office.
