import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../../clients.js';
import {
  buildTransformForMove,
  findPageElementById,
  getPresentationPageOrThrow,
  summarizeTransform,
} from '../../../googleSlidesApiHelpers.js';
import { SlideElementParameter, DimensionUnitSchema } from '../common.js';
import { mutationResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'moveSlideElement',
    description:
      'Moves a page element to an absolute position while preserving its current scale and shear.',
    parameters: SlideElementParameter.extend({
      x: z.number().describe('New absolute X position for the page element.'),
      y: z.number().describe('New absolute Y position for the page element.'),
      unit: DimensionUnitSchema,
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Moving element ${args.objectId} on slide ${args.pageObjectId}`);

      try {
        const page = await getPresentationPageOrThrow(slides, args.presentationId, args.pageObjectId);
        const pageElement = findPageElementById(page, args.objectId);
        if (!pageElement) {
          throw new UserError(`Page element ${args.objectId} not found on slide ${args.pageObjectId}.`);
        }

        const transform = buildTransformForMove(pageElement, args.x, args.y, args.unit);
        await slides.presentations.batchUpdate({
          presentationId: args.presentationId,
          requestBody: {
            requests: [
              {
                updatePageElementTransform: {
                  objectId: args.objectId,
                  applyMode: 'ABSOLUTE',
                  transform,
                },
              },
            ],
          },
        });

        return mutationResult('Moved slide element successfully.', {
          presentationId: args.presentationId,
          pageObjectId: args.pageObjectId,
          objectId: args.objectId,
          transform: summarizeTransform(transform),
        });
      } catch (error: any) {
        log.error(`Error moving slide element: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to move slide element: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
