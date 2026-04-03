import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../../clients.js';
import { getPresentationOrThrow, summarizePresentationSlides } from '../../../googleSlidesApiHelpers.js';
import { PresentationIdParameter } from '../common.js';
import { dataResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'getPresentationSlides',
    description:
      'Lists the slides in a presentation with optional speaker notes and placeholder discovery, without returning the full presentation payload.',
    parameters: PresentationIdParameter.extend({
      includeNotes: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include speaker notes and parsed template metadata for each slide.'),
      includePlaceholders: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include discovered placeholder tokens for each slide.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Listing slides for presentation ${args.presentationId}`);

      try {
        const presentation = await getPresentationOrThrow(slides, args.presentationId);
        const summarizedSlides = summarizePresentationSlides(presentation.slides ?? [], {
          includeNotes: args.includeNotes,
          includePlaceholders: args.includePlaceholders,
        });

        return dataResult(
          {
            presentationId: args.presentationId,
            title: presentation.title ?? null,
            slideCount: summarizedSlides.length,
            slides: summarizedSlides,
          },
          `Listed ${summarizedSlides.length} slide(s) successfully.`
        );
      } catch (error: any) {
        log.error(`Error listing slides: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to list slides: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
