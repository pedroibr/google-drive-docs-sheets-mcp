import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../clients.js';
import { summarizeBatchUpdateReplies } from '../../googleSlidesApiHelpers.js';
import { mutationResult } from '../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'batchUpdatePresentation',
    description:
      'Applies raw Google Slides batch update requests to a presentation. Use native Slides API request objects in the requests array.',
    parameters: z.object({
      presentationId: z
        .string()
        .describe(
          'The presentation ID — the long string between /d/ and /edit in a Google Slides URL.'
        ),
      requests: z
        .array(z.record(z.string(), z.unknown()))
        .min(1)
        .describe(
          'Array of raw Google Slides batchUpdate request objects, such as createSlide, createShape, replaceAllText, or updateTextStyle.'
        ),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(
        `Applying ${args.requests.length} batch update request(s) to presentation ${args.presentationId}`
      );

      try {
        const response = await slides.presentations.batchUpdate({
          presentationId: args.presentationId,
          requestBody: {
            requests: args.requests as any[],
          },
        });

        const replies = response.data.replies ?? [];

        return mutationResult('Updated presentation successfully.', {
          presentationId: args.presentationId,
          url: `https://docs.google.com/presentation/d/${args.presentationId}/edit`,
          requestCount: args.requests.length,
          replyCount: replies.length,
          repliesSummary: summarizeBatchUpdateReplies(replies),
        });
      } catch (error: any) {
        log.error(`Error updating presentation: ${error.message || error}`);
        if (error.code === 404) {
          throw new UserError(`Presentation not found (ID: ${args.presentationId}).`);
        }
        if (error.code === 403) {
          throw new UserError(
            `Permission denied for presentation (ID: ${args.presentationId}). Make sure you have edit access.`
          );
        }
        throw new UserError(
          `Failed to update presentation: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
