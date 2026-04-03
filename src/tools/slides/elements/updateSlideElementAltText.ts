import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../../clients.js';
import { SlideElementParameter } from '../common.js';
import { assertAtLeastOneDefined, mutationResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'updateSlideElementAltText',
    description:
      'Updates the accessibility alt text title and/or description for a page element.',
    parameters: SlideElementParameter.extend({
      title: z.string().optional().describe('Optional alt text title for the page element.'),
      description: z
        .string()
        .optional()
        .describe('Optional alt text description for the page element.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Updating alt text for element ${args.objectId} on slide ${args.pageObjectId}`);

      try {
        assertAtLeastOneDefined(
          args,
          ['title', 'description'],
          'At least one of title or description must be provided.'
        );

        await slides.presentations.batchUpdate({
          presentationId: args.presentationId,
          requestBody: {
            requests: [
              {
                updatePageElementAltText: {
                  objectId: args.objectId,
                  ...(args.title !== undefined ? { title: args.title } : {}),
                  ...(args.description !== undefined ? { description: args.description } : {}),
                },
              },
            ],
          },
        });

        return mutationResult('Updated slide element alt text successfully.', {
          presentationId: args.presentationId,
          pageObjectId: args.pageObjectId,
          objectId: args.objectId,
          title: args.title ?? null,
          description: args.description ?? null,
        });
      } catch (error: any) {
        log.error(`Error updating slide element alt text: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(
          `Failed to update slide element alt text: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
