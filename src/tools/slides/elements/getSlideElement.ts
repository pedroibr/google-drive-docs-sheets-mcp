import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { getSlidesClient } from '../../../clients.js';
import {
  findPageElementById,
  getPresentationPageOrThrow,
  summarizePageElement,
} from '../../../googleSlidesApiHelpers.js';
import { SlideElementParameter } from '../common.js';
import { dataResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'getSlideElement',
    description: 'Retrieves a single page element from a slide with a stable summarized payload.',
    parameters: SlideElementParameter,
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(
        `Reading page element ${args.objectId} from slide ${args.pageObjectId} in presentation ${args.presentationId}`
      );

      try {
        const page = await getPresentationPageOrThrow(slides, args.presentationId, args.pageObjectId);
        const pageElement = findPageElementById(page, args.objectId);
        if (!pageElement) {
          throw new UserError(
            `Page element not found (pageObjectId: ${args.pageObjectId}, objectId: ${args.objectId}).`
          );
        }

        return dataResult(
          {
            presentationId: args.presentationId,
            pageObjectId: args.pageObjectId,
            objectId: args.objectId,
            pageElement: summarizePageElement(pageElement),
          },
          'Read slide element successfully.'
        );
      } catch (error: any) {
        log.error(`Error reading slide element: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to read slide element: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
