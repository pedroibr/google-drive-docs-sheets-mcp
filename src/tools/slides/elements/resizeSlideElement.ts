import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../../clients.js';
import {
  buildTransformForResize,
  findPageElementById,
  getPresentationPageOrThrow,
  summarizeTransform,
} from '../../../googleSlidesApiHelpers.js';
import { SlideElementParameter, DimensionUnitSchema } from '../common.js';
import { mutationResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'resizeSlideElement',
    description:
      'Resizes a page element by computing a new absolute transform from its current intrinsic size.',
    parameters: SlideElementParameter.extend({
      width: z.number().positive().describe('Target visual width for the element.'),
      height: z.number().positive().describe('Target visual height for the element.'),
      unit: DimensionUnitSchema,
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Resizing element ${args.objectId} on slide ${args.pageObjectId}`);

      try {
        const page = await getPresentationPageOrThrow(slides, args.presentationId, args.pageObjectId);
        const pageElement = findPageElementById(page, args.objectId);
        if (!pageElement) {
          throw new UserError(`Page element ${args.objectId} not found on slide ${args.pageObjectId}.`);
        }

        const transform = buildTransformForResize(pageElement, args.width, args.height, args.unit);
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

        return mutationResult('Resized slide element successfully.', {
          presentationId: args.presentationId,
          pageObjectId: args.pageObjectId,
          objectId: args.objectId,
          transform: summarizeTransform(transform),
          targetSize: {
            width: args.width,
            height: args.height,
            unit: args.unit,
          },
        });
      } catch (error: any) {
        log.error(`Error resizing slide element: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to resize slide element: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
