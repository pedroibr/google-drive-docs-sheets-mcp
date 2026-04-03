import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { getSlidesClient } from '../../../clients.js';
import { SlideElementParameter } from '../common.js';
import { mutationResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'deleteSlideElement',
    description: 'Deletes a single page element from a slide.',
    parameters: SlideElementParameter,
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Deleting element ${args.objectId} from slide ${args.pageObjectId}`);

      try {
        await slides.presentations.batchUpdate({
          presentationId: args.presentationId,
          requestBody: {
            requests: [
              {
                deleteObject: {
                  objectId: args.objectId,
                },
              },
            ],
          },
        });

        return mutationResult('Deleted slide element successfully.', {
          presentationId: args.presentationId,
          pageObjectId: args.pageObjectId,
          objectId: args.objectId,
        });
      } catch (error: any) {
        log.error(`Error deleting slide element: ${error.message || error}`);
        if (error.code === 404) {
          throw new UserError('Presentation, slide, or element not found.');
        }
        if (error.code === 403) {
          throw new UserError('Permission denied. Make sure you have edit access to this presentation.');
        }
        throw new UserError(`Failed to delete slide element: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
