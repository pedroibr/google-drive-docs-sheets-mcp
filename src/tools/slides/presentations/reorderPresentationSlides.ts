import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../../clients.js';
import { PresentationIdParameter } from '../common.js';
import { mutationResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'reorderPresentationSlides',
    description:
      'Moves one or more slides to a new insertion index within a Google Slides presentation.',
    parameters: PresentationIdParameter.extend({
      pageObjectIds: z
        .array(z.string().min(1))
        .min(1)
        .describe('Slide/page object IDs to move, in current presentation order.'),
      insertionIndex: z
        .number()
        .int()
        .min(0)
        .describe('Zero-based slide index where the moved slides should be inserted.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(
        `Reordering ${args.pageObjectIds.length} slide(s) in presentation ${args.presentationId} to index ${args.insertionIndex}`
      );

      try {
        await slides.presentations.batchUpdate({
          presentationId: args.presentationId,
          requestBody: {
            requests: [
              {
                updateSlidesPosition: {
                  slideObjectIds: args.pageObjectIds,
                  insertionIndex: args.insertionIndex,
                },
              },
            ],
          },
        });

        return mutationResult('Reordered presentation slides successfully.', {
          presentationId: args.presentationId,
          pageObjectIds: args.pageObjectIds,
          insertionIndex: args.insertionIndex,
        });
      } catch (error: any) {
        log.error(`Error reordering slides: ${error.message || error}`);
        if (error.code === 404) {
          throw new UserError('Presentation or one of the target slides was not found.');
        }
        if (error.code === 403) {
          throw new UserError('Permission denied. Make sure you have edit access to this presentation.');
        }
        throw new UserError(`Failed to reorder slides: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
