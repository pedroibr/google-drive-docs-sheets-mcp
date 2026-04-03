import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../../clients.js';
import {
  extractPlaceholdersFromPageElements,
  getSlideOrThrow,
} from '../../../googleSlidesApiHelpers.js';
import { SlidePageParameter } from '../common.js';
import { dataResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'validateSlidePlaceholders',
    description:
      'Discovers placeholders in a slide and optionally compares them against an expected placeholder list.',
    parameters: SlidePageParameter.extend({
      expectedPlaceholders: z
        .array(z.string().min(1))
        .optional()
        .describe('Optional list of placeholder tokens expected on the slide.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(
        `Validating placeholders for slide ${args.pageObjectId} in presentation ${args.presentationId}`
      );

      try {
        const slide = await getSlideOrThrow(slides, args.presentationId, args.pageObjectId);
        const foundPlaceholders = extractPlaceholdersFromPageElements(slide.pageElements ?? []);
        const expectedPlaceholders = args.expectedPlaceholders ?? [];

        const missingPlaceholders = expectedPlaceholders.filter(
          (placeholder) => !foundPlaceholders.includes(placeholder)
        );
        const unexpectedPlaceholders = foundPlaceholders.filter(
          (placeholder) => !expectedPlaceholders.includes(placeholder)
        );

        return dataResult(
          {
            presentationId: args.presentationId,
            pageObjectId: args.pageObjectId,
            foundPlaceholders,
            expectedPlaceholders,
            missingPlaceholders,
            unexpectedPlaceholders: args.expectedPlaceholders ? unexpectedPlaceholders : [],
            isValid: args.expectedPlaceholders ? missingPlaceholders.length === 0 : true,
          },
          'Validated slide placeholders successfully.'
        );
      } catch (error: any) {
        log.error(`Error validating slide placeholders: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(
          `Failed to validate slide placeholders: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
