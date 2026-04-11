import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getGmailClient } from '../../clients.js';
import { mutationResult } from '../../tooling.js';
import { IdListSchema } from './common.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'batchModifyGmailMessageLabels',
    description:
      'Adds or removes labels on multiple Gmail messages in one call. Supports up to 25 messages per request.',
    parameters: z.object({
      messageIds: IdListSchema.describe('List of Gmail message IDs to modify.'),
      addLabelIds: z.array(z.string()).optional().describe('Optional label IDs to add.'),
      removeLabelIds: z.array(z.string()).optional().describe('Optional label IDs to remove.'),
    }),
    execute: async (args, { log }) => {
      const gmail = await getGmailClient();
      log.info(`Batch modifying Gmail message labels for ${args.messageIds.length} messages`);

      try {
        if (!args.addLabelIds?.length && !args.removeLabelIds?.length) {
          throw new UserError('At least one of addLabelIds or removeLabelIds must be provided.');
        }

        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids: args.messageIds,
            addLabelIds: args.addLabelIds,
            removeLabelIds: args.removeLabelIds,
          },
        });

        return mutationResult('Batch modified Gmail message labels successfully.', {
          messageIds: args.messageIds,
          addLabelIds: args.addLabelIds ?? [],
          removeLabelIds: args.removeLabelIds ?? [],
          modifiedCount: args.messageIds.length,
        });
      } catch (error: any) {
        log.error(`Error batch modifying Gmail message labels: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(
          `Failed to batch modify Gmail message labels: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
