import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getGmailClient } from '../../clients.js';
import { dataResult } from '../../tooling.js';
import {
  fetchRawMessageContent,
  GmailBodyFormatSchema,
  normalizeThread,
} from './common.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'getGmailThreadContent',
    description:
      'Reads a full Gmail thread and returns all messages with normalized headers, bodies, attachment metadata, and a Gmail web URL.',
    parameters: z.object({
      threadId: z.string().min(1).describe('Gmail thread ID to read.'),
      bodyFormat: GmailBodyFormatSchema,
    }),
    execute: async (args, { log }) => {
      const gmail = await getGmailClient();
      log.info(`Reading Gmail thread ${args.threadId} format=${args.bodyFormat}`);

      try {
        const response = await gmail.users.threads.get({
          userId: 'me',
          id: args.threadId,
          format: 'full',
        });

        const rawMessageMap: Record<string, string | null> = {};
        if (args.bodyFormat === 'raw') {
          for (const message of response.data.messages ?? []) {
            if (message.id) {
              rawMessageMap[message.id] = await fetchRawMessageContent(gmail, message.id);
            }
          }
        }

        return dataResult(
          {
            thread: normalizeThread(response.data, args.bodyFormat, rawMessageMap),
          },
          'Read Gmail thread successfully.'
        );
      } catch (error: any) {
        log.error(`Error reading Gmail thread ${args.threadId}: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        if (error.code === 404) throw new UserError(`Gmail thread not found: ${args.threadId}.`);
        throw new UserError(`Failed to read Gmail thread: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
