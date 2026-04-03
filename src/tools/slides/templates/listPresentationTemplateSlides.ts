import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../../clients.js';
import { getPresentationOrThrow, summarizePresentationSlides } from '../../../googleSlidesApiHelpers.js';
import { PresentationIdParameter } from '../common.js';
import { dataResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'listPresentationTemplateSlides',
    description:
      'Lists the slides in a template presentation with parsed speaker-note metadata and discovered placeholders.',
    parameters: PresentationIdParameter,
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Listing template slides for presentation ${args.presentationId}`);

      try {
        const presentation = await getPresentationOrThrow(slides, args.presentationId);
        const summarizedSlides = summarizePresentationSlides(presentation.slides ?? [], {
          includeNotes: true,
          includePlaceholders: true,
        });

        return dataResult(
          {
            presentationId: args.presentationId,
            title: presentation.title ?? null,
            slides: summarizedSlides,
            total: summarizedSlides.length,
          },
          `Listed ${summarizedSlides.length} template slide(s) successfully.`
        );
      } catch (error: any) {
        log.error(`Error listing template slides: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(
          `Failed to list template slides: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
