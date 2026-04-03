import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../../clients.js';
import { PresentationIdParameter } from '../common.js';
import { mutationResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'deletePresentationSlides',
    description: 'Deletes multiple slides from a Google Slides presentation in a single batch update.',
    parameters: PresentationIdParameter.extend({
      pageObjectIds: z
        .array(z.string().min(1))
        .min(1)
        .describe('The slide/page object IDs to delete from the presentation.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Deleting ${args.pageObjectIds.length} slide(s) from presentation ${args.presentationId}`);

      try {
        await slides.presentations.batchUpdate({
          presentationId: args.presentationId,
          requestBody: {
            requests: args.pageObjectIds.map((pageObjectId) => ({
              deleteObject: { objectId: pageObjectId },
            })),
          },
        });

        return mutationResult('Deleted presentation slides successfully.', {
          presentationId: args.presentationId,
          pageObjectIds: args.pageObjectIds,
          deletedCount: args.pageObjectIds.length,
        });
      } catch (error: any) {
        log.error(`Error deleting slides: ${error.message || error}`);
        if (error.code === 404) {
          throw new UserError('Presentation or one of the target slides was not found.');
        }
        if (error.code === 403) {
          throw new UserError('Permission denied. Make sure you have edit access to this presentation.');
        }
        throw new UserError(`Failed to delete slides: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
