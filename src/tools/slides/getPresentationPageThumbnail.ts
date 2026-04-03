import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../clients.js';
import { dataResult } from '../../tooling.js';

const ThumbnailSizeSchema = z.enum(['SMALL', 'MEDIUM', 'LARGE']);

export function register(server: FastMCP) {
  server.addTool({
    name: 'getPresentationPageThumbnail',
    description:
      'Generates a PNG thumbnail URL for a specific slide/page inside a Google Slides presentation.',
    parameters: z.object({
      presentationId: z
        .string()
        .describe(
          'The presentation ID — the long string between /d/ and /edit in a Google Slides URL.'
        ),
      pageObjectId: z
        .string()
        .describe('The object ID of the target page/slide inside the presentation.'),
      thumbnailSize: ThumbnailSizeSchema.optional()
        .default('MEDIUM')
        .describe('Thumbnail size to request. Defaults to MEDIUM.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(
        `Generating ${args.thumbnailSize} thumbnail for page ${args.pageObjectId} in presentation ${args.presentationId}`
      );

      try {
        const response = await slides.presentations.pages.getThumbnail({
          presentationId: args.presentationId,
          pageObjectId: args.pageObjectId,
          'thumbnailProperties.mimeType': 'PNG',
          'thumbnailProperties.thumbnailSize': args.thumbnailSize,
        });

        return dataResult(
          {
            presentationId: args.presentationId,
            pageObjectId: args.pageObjectId,
            thumbnailSize: args.thumbnailSize,
            thumbnailUrl: response.data.contentUrl ?? null,
            width: response.data.width ?? null,
            height: response.data.height ?? null,
          },
          'Generated presentation page thumbnail successfully.'
        );
      } catch (error: any) {
        log.error(`Error generating presentation thumbnail: ${error.message || error}`);
        if (error.code === 404) {
          throw new UserError(
            `Presentation or page not found (presentationId: ${args.presentationId}, pageObjectId: ${args.pageObjectId}).`
          );
        }
        if (error.code === 403) {
          throw new UserError(
            `Permission denied for presentation thumbnail (presentationId: ${args.presentationId}, pageObjectId: ${args.pageObjectId}).`
          );
        }
        throw new UserError(
          `Failed to generate presentation thumbnail: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
