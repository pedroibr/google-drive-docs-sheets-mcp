# Gmail

Tools for Gmail mailbox workflows inside the MCP server. This domain follows the same public contract as the rest of the repo: flat schemas, runtime validation, and structured payload responses.

## Tools

| Tool                            | Description                                                          |
| ------------------------------- | -------------------------------------------------------------------- |
| `searchGmailMessages`           | Search Gmail messages using standard Gmail query syntax              |
| `getGmailMessageContent`        | Read one Gmail message with normalized headers, body, and attachments |
| `getGmailMessagesContentBatch`  | Read multiple Gmail messages in one call                             |
| `downloadGmailAttachment`       | Download a Gmail attachment to a local path                          |
| `sendGmailMessage`              | Send a Gmail message, including replies and attachments              |
| `draftGmailMessage`             | Create a Gmail draft, including replies and attachments              |
| `getGmailThreadContent`         | Read a full Gmail thread                                             |
| `getGmailThreadsContentBatch`   | Read multiple Gmail threads                                          |
| `listGmailLabels`               | List system and user labels                                          |
| `manageGmailLabel`              | Create, update, or delete a label                                    |
| `listGmailFilters`              | List configured Gmail filters                                        |
| `manageGmailFilter`             | Create or delete a Gmail filter                                      |
| `modifyGmailMessageLabels`      | Add or remove labels on a single message                             |
| `batchModifyGmailMessageLabels` | Add or remove labels on multiple messages                            |

## Notes

- Search queries use standard Gmail search operators such as `from:`, `label:`, `newer_than:`, and `has:attachment`.
- Existing users will need to re-run auth after upgrading because Gmail requires additional OAuth scopes.
- Attachment downloads follow the existing local-path model in this repo and must save within the current working directory.
