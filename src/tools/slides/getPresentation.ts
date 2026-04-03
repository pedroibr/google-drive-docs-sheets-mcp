import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../clients.js';
import { summarizePageSize, summarizePresentationSlides } from '../../googleSlidesApiHelpers.js';
import { dataResult } from '../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'getPresentation',
    description:
      'Retrieves a Google Slides presentation with metadata and a slide-by-slide summary, including extracted text from shapes.',
    parameters: z.object({
      presentationId: z
        .string()
        .describe(
          'The presentation ID — the long string between /d/ and /edit in a Google Slides URL.'
        ),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Reading presentation ${args.presentationId}`);

      try {
        const response = await slides.presentations.get({
          presentationId: args.presentationId,
        });

        const presentation = response.data;
        const summarizedSlides = summarizePresentationSlides(presentation.slides ?? []);

        return dataResult(
          {
            id: args.presentationId,
            title: presentation.title ?? null,
            url: `https://docs.google.com/presentation/d/${args.presentationId}/edit`,
            slideCount: summarizedSlides.length,
            pageSize: summarizePageSize(presentation.pageSize),
            slides: summarizedSlides,
          },
          'Read presentation successfully.'
        );
      } catch (error: any) {
        log.error(`Error reading presentation: ${error.message || error}`);
        if (error.code === 404) {
          throw new UserError(`Presentation not found (ID: ${args.presentationId}).`);
        }
        if (error.code === 403) {
          throw new UserError(
            `Permission denied for presentation (ID: ${args.presentationId}). Make sure you have access to Google Slides and this file.`
          );
        }
        throw new UserError(
          `Failed to read presentation: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
