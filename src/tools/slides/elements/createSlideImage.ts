import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../../clients.js';
import { buildPageElementProperties } from '../../../googleSlidesApiHelpers.js';
import { SlidePageParameter, DimensionUnitSchema } from '../common.js';
import { mutationResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'createSlideImage',
    description:
      'Creates a new image element on a slide at explicit coordinates and size.',
    parameters: SlidePageParameter.extend({
      imageUrl: z
        .string()
        .url()
        .describe('Public image URL to insert.'),
      x: z.number().describe('Left position of the image.'),
      y: z.number().describe('Top position of the image.'),
      width: z.number().positive().describe('Width of the image.'),
      height: z.number().positive().describe('Height of the image.'),
      unit: DimensionUnitSchema,
      objectId: z.string().optional().describe('Optional object ID for the inserted image.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Creating image on slide ${args.pageObjectId} in presentation ${args.presentationId}`);

      try {
        const response = await slides.presentations.batchUpdate({
          presentationId: args.presentationId,
          requestBody: {
            requests: [
              {
                createImage: {
                  objectId: args.objectId,
                  url: args.imageUrl,
                  elementProperties: buildPageElementProperties(
                    args.pageObjectId,
                    args.x,
                    args.y,
                    args.width,
                    args.height,
                    args.unit
                  ),
                },
              },
            ],
          },
        });

        return mutationResult('Created slide image successfully.', {
          presentationId: args.presentationId,
          pageObjectId: args.pageObjectId,
          objectId: response.data.replies?.[0]?.createImage?.objectId ?? args.objectId ?? null,
          imageUrl: args.imageUrl,
          bounds: {
            x: args.x,
            y: args.y,
            width: args.width,
            height: args.height,
            unit: args.unit,
          },
        });
      } catch (error: any) {
        log.error(`Error creating slide image: ${error.message || error}`);
        if (error.code === 404) {
          throw new UserError('Presentation or target slide not found.');
        }
        if (error.code === 403) {
          throw new UserError('Permission denied. Make sure you have edit access to this presentation.');
        }
        throw new UserError(`Failed to create slide image: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
