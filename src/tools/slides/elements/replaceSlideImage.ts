import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../../clients.js';
import { SlideElementParameter } from '../common.js';
import { mutationResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'replaceSlideImage',
    description:
      'Replaces an existing image element on a slide using its object ID and a new image URL.',
    parameters: SlideElementParameter.extend({
      imageUrl: z
        .string()
        .url()
        .describe('Public image URL to use as the replacement source.'),
      replaceMethod: z
        .enum(['CENTER_INSIDE', 'CENTER_CROP'])
        .optional()
        .default('CENTER_INSIDE')
        .describe('How the replacement image should fit inside the existing image bounds.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Replacing image ${args.objectId} on slide ${args.pageObjectId}`);

      try {
        await slides.presentations.batchUpdate({
          presentationId: args.presentationId,
          requestBody: {
            requests: [
              {
                replaceImage: {
                  imageObjectId: args.objectId,
                  imageReplaceMethod: args.replaceMethod,
                  url: args.imageUrl,
                },
              },
            ],
          },
        });

        return mutationResult('Replaced slide image successfully.', {
          presentationId: args.presentationId,
          pageObjectId: args.pageObjectId,
          objectId: args.objectId,
          imageUrl: args.imageUrl,
          replaceMethod: args.replaceMethod,
        });
      } catch (error: any) {
        log.error(`Error replacing slide image: ${error.message || error}`);
        if (error.code === 404) {
          throw new UserError('Presentation, slide, or image element not found.');
        }
        if (error.code === 403) {
          throw new UserError('Permission denied. Make sure you have edit access to this presentation.');
        }
        throw new UserError(`Failed to replace slide image: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
