import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getGmailClient } from '../../clients.js';
import { dataResult } from '../../tooling.js';
import {
  fetchRawMessageContent,
  GmailBodyFormatSchema,
  IdListSchema,
  normalizeMessage,
} from './common.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'getGmailMessagesContentBatch',
    description:
      'Reads multiple Gmail messages in one call. Supports up to 25 messages and returns normalized message payloads.',
    parameters: z.object({
      messageIds: IdListSchema.describe('List of Gmail message IDs to read.'),
      bodyFormat: GmailBodyFormatSchema,
    }),
    execute: async (args, { log }) => {
      const gmail = await getGmailClient();
      log.info(`Reading ${args.messageIds.length} Gmail messages format=${args.bodyFormat}`);

      try {
        const messages = await Promise.all(
          args.messageIds.map(async (messageId) => {
            const response = await gmail.users.messages.get({
              userId: 'me',
              id: messageId,
              format: 'full',
            });
            const rawContent =
              args.bodyFormat === 'raw' ? await fetchRawMessageContent(gmail, messageId) : null;
            return normalizeMessage(response.data, args.bodyFormat, rawContent);
          })
        );

        return dataResult(
          {
            messages,
            total: messages.length,
          },
          `Read ${messages.length} Gmail message(s) successfully.`
        );
      } catch (error: any) {
        log.error(`Error reading Gmail messages batch: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(
          `Failed to read Gmail messages batch: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
