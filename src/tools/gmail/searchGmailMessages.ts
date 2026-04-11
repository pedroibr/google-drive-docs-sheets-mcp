import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getGmailClient } from '../../clients.js';
import { dataResult } from '../../tooling.js';
import { fetchMessageMetadataList, generateGmailWebUrl, MAX_SEARCH_RESULTS } from './common.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'searchGmailMessages',
    description:
      'Searches Gmail messages using standard Gmail query syntax and returns normalized message metadata with message IDs, thread IDs, labels, snippets, and Gmail web URLs.',
    parameters: z.object({
      query: z
        .string()
        .min(1)
        .describe('Gmail search query, for example "from:alice newer_than:7d has:attachment".'),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(MAX_SEARCH_RESULTS)
        .optional()
        .default(10)
        .describe(`Maximum number of messages to return (1-${MAX_SEARCH_RESULTS}).`),
      pageToken: z
        .string()
        .optional()
        .describe('Pagination token from a previous searchGmailMessages response.'),
    }),
    execute: async (args, { log }) => {
      const gmail = await getGmailClient();
      log.info(`Searching Gmail messages query="${args.query}" maxResults=${args.maxResults}`);

      try {
        const response = await gmail.users.messages.list({
          userId: 'me',
          q: args.query,
          maxResults: args.maxResults,
          pageToken: args.pageToken,
        });

        const messageIds = (response.data.messages ?? []).map((message) => message.id).filter(Boolean);
        const messages = await fetchMessageMetadataList(gmail, messageIds as string[]);

        const normalized = messages.map((message) => ({
          messageId: message.id ?? null,
          threadId: message.threadId ?? null,
          snippet: message.snippet ?? null,
          labelIds: message.labelIds ?? [],
          subject:
            message.payload?.headers?.find((header) => header.name?.toLowerCase() === 'subject')
              ?.value ?? null,
          from:
            message.payload?.headers?.find((header) => header.name?.toLowerCase() === 'from')
              ?.value ?? null,
          to:
            message.payload?.headers?.find((header) => header.name?.toLowerCase() === 'to')
              ?.value ?? null,
          date:
            message.payload?.headers?.find((header) => header.name?.toLowerCase() === 'date')
              ?.value ?? null,
          url: generateGmailWebUrl(message.id),
        }));

        return dataResult(
          {
            query: args.query,
            messages: normalized,
            totalReturned: normalized.length,
            nextPageToken: response.data.nextPageToken ?? null,
            resultSizeEstimate: response.data.resultSizeEstimate ?? normalized.length,
          },
          `Found ${normalized.length} Gmail message(s).`
        );
      } catch (error: any) {
        log.error(`Error searching Gmail messages: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        if (error.code === 403) {
          throw new UserError(
            'Permission denied. Make sure Gmail access has been granted to the application.'
          );
        }
        throw new UserError(`Failed to search Gmail messages: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
