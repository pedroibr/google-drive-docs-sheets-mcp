import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getGmailClient } from '../../clients.js';
import { mutationResult } from '../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'modifyGmailMessageLabels',
    description:
      'Adds or removes label IDs on a single Gmail message. Use removeLabelIds=["INBOX"] to archive and addLabelIds=["TRASH"] to trash.',
    parameters: z.object({
      messageId: z.string().min(1).describe('Gmail message ID to modify.'),
      addLabelIds: z.array(z.string()).optional().describe('Optional label IDs to add.'),
      removeLabelIds: z.array(z.string()).optional().describe('Optional label IDs to remove.'),
    }),
    execute: async (args, { log }) => {
      const gmail = await getGmailClient();
      log.info(`Modifying Gmail message labels for ${args.messageId}`);

      try {
        if (!args.addLabelIds?.length && !args.removeLabelIds?.length) {
          throw new UserError('At least one of addLabelIds or removeLabelIds must be provided.');
        }

        const response = await gmail.users.messages.modify({
          userId: 'me',
          id: args.messageId,
          requestBody: {
            addLabelIds: args.addLabelIds,
            removeLabelIds: args.removeLabelIds,
          },
        });

        return mutationResult('Modified Gmail message labels successfully.', {
          messageId: args.messageId,
          labelIds: response.data.labelIds ?? [],
          threadId: response.data.threadId ?? null,
        });
      } catch (error: any) {
        log.error(`Error modifying Gmail message labels: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(
          `Failed to modify Gmail message labels: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
