import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { getSlidesClient } from '../../../clients.js';
import { SlidePageParameter } from '../common.js';
import { mutationResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'deletePresentationSlide',
    description: 'Deletes a single slide from a Google Slides presentation.',
    parameters: SlidePageParameter,
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Deleting slide ${args.pageObjectId} from presentation ${args.presentationId}`);

      try {
        await slides.presentations.batchUpdate({
          presentationId: args.presentationId,
          requestBody: {
            requests: [
              {
                deleteObject: {
                  objectId: args.pageObjectId,
                },
              },
            ],
          },
        });

        return mutationResult('Deleted presentation slide successfully.', {
          presentationId: args.presentationId,
          pageObjectId: args.pageObjectId,
        });
      } catch (error: any) {
        log.error(`Error deleting slide: ${error.message || error}`);
        if (error.code === 404) {
          throw new UserError(
            `Presentation or slide not found (presentationId: ${args.presentationId}, pageObjectId: ${args.pageObjectId}).`
          );
        }
        if (error.code === 403) {
          throw new UserError('Permission denied. Make sure you have edit access to this presentation.');
        }
        throw new UserError(`Failed to delete slide: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
