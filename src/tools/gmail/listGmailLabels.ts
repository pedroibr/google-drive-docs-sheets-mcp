import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { getGmailClient } from '../../clients.js';
import { dataResult } from '../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'listGmailLabels',
    description:
      'Lists Gmail labels, including both system labels and user-created labels, with visibility and message counters when available.',
    parameters: undefined,
    execute: async (_args, { log }) => {
      const gmail = await getGmailClient();
      log.info('Listing Gmail labels');

      try {
        const response = await gmail.users.labels.list({ userId: 'me' });
        const labels = (response.data.labels ?? []).map((label) => ({
          id: label.id ?? null,
          name: label.name ?? null,
          type: label.type ?? null,
          labelListVisibility: label.labelListVisibility ?? null,
          messageListVisibility: label.messageListVisibility ?? null,
          messagesTotal: label.messagesTotal ?? null,
          messagesUnread: label.messagesUnread ?? null,
          threadsTotal: label.threadsTotal ?? null,
          threadsUnread: label.threadsUnread ?? null,
        }));

        return dataResult(
          {
            labels,
            total: labels.length,
          },
          `Listed ${labels.length} Gmail label(s) successfully.`
        );
      } catch (error: any) {
        log.error(`Error listing Gmail labels: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to list Gmail labels: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
