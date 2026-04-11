import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getGmailClient } from '../../clients.js';
import { dataResult } from '../../tooling.js';
import { fetchRawMessageContent, GmailBodyFormatSchema, normalizeMessage } from './common.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'getGmailMessageContent',
    description:
      'Reads a Gmail message and returns normalized headers, body content, label IDs, attachment metadata, and a Gmail web URL.',
    parameters: z.object({
      messageId: z.string().min(1).describe('Gmail message ID to read.'),
      bodyFormat: GmailBodyFormatSchema,
    }),
    execute: async (args, { log }) => {
      const gmail = await getGmailClient();
      log.info(`Reading Gmail message ${args.messageId} format=${args.bodyFormat}`);

      try {
        const response = await gmail.users.messages.get({
          userId: 'me',
          id: args.messageId,
          format: 'full',
        });

        const rawContent =
          args.bodyFormat === 'raw' ? await fetchRawMessageContent(gmail, args.messageId) : null;

        return dataResult(
          {
            message: normalizeMessage(response.data, args.bodyFormat, rawContent),
          },
          'Read Gmail message successfully.'
        );
      } catch (error: any) {
        log.error(`Error reading Gmail message ${args.messageId}: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        if (error.code === 404) throw new UserError(`Gmail message not found: ${args.messageId}.`);
        if (error.code === 403) {
          throw new UserError(
            'Permission denied. Make sure Gmail access has been granted to the application.'
          );
        }
        throw new UserError(`Failed to read Gmail message: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
