import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../clients.js';
import {
  extractTextFromPageElements,
  summarizePageElements,
} from '../../googleSlidesApiHelpers.js';
import { dataResult } from '../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'getPresentationPage',
    description:
      'Retrieves a specific page/slide from a Google Slides presentation, including a summarized element list and extracted shape text.',
    parameters: z.object({
      presentationId: z
        .string()
        .describe(
          'The presentation ID — the long string between /d/ and /edit in a Google Slides URL.'
        ),
      pageObjectId: z
        .string()
        .describe('The object ID of the target page/slide inside the presentation.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Reading page ${args.pageObjectId} from presentation ${args.presentationId}`);

      try {
        const response = await slides.presentations.pages.get({
          presentationId: args.presentationId,
          pageObjectId: args.pageObjectId,
        });

        const pageElements = response.data.pageElements ?? [];

        return dataResult(
          {
            presentationId: args.presentationId,
            pageObjectId: args.pageObjectId,
            pageType: response.data.pageType ?? null,
            pageElementCount: pageElements.length,
            pageElements: summarizePageElements(pageElements),
            textContent: extractTextFromPageElements(pageElements) || null,
          },
          'Read presentation page successfully.'
        );
      } catch (error: any) {
        log.error(`Error reading presentation page: ${error.message || error}`);
        if (error.code === 404) {
          throw new UserError(
            `Presentation or page not found (presentationId: ${args.presentationId}, pageObjectId: ${args.pageObjectId}).`
          );
        }
        if (error.code === 403) {
          throw new UserError(
            `Permission denied for presentation page (presentationId: ${args.presentationId}, pageObjectId: ${args.pageObjectId}).`
          );
        }
        throw new UserError(
          `Failed to read presentation page: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
