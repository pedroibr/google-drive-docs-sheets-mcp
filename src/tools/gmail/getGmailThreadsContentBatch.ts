import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getGmailClient } from '../../clients.js';
import { dataResult } from '../../tooling.js';
import {
  fetchRawMessageContent,
  GmailBodyFormatSchema,
  IdListSchema,
  normalizeThread,
} from './common.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'getGmailThreadsContentBatch',
    description:
      'Reads multiple Gmail threads in one call. Supports up to 25 threads and returns normalized thread payloads.',
    parameters: z.object({
      threadIds: IdListSchema.describe('List of Gmail thread IDs to read.'),
      bodyFormat: GmailBodyFormatSchema,
    }),
    execute: async (args, { log }) => {
      const gmail = await getGmailClient();
      log.info(`Reading ${args.threadIds.length} Gmail threads format=${args.bodyFormat}`);

      try {
        const threads = [];
        for (const threadId of args.threadIds) {
          const response = await gmail.users.threads.get({
            userId: 'me',
            id: threadId,
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

          threads.push(normalizeThread(response.data, args.bodyFormat, rawMessageMap));
        }

        return dataResult(
          {
            threads,
            total: threads.length,
          },
          `Read ${threads.length} Gmail thread(s) successfully.`
        );
      } catch (error: any) {
        log.error(`Error reading Gmail threads batch: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(
          `Failed to read Gmail threads batch: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
