import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { getSlidesClient } from '../../../clients.js';
import {
  extractNotesTextFromSlide,
  extractPlaceholdersFromPageElements,
  extractSlideTitle,
  extractTextFromPageElements,
  getSlideOrThrow,
  parseTemplateMetadata,
  summarizePageElements,
} from '../../../googleSlidesApiHelpers.js';
import { SlidePageParameter } from '../common.js';
import { dataResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'getPresentationTemplateSlide',
    description:
      'Reads a specific slide in a template presentation, including page elements, placeholders, and parsed speaker-note metadata.',
    parameters: SlidePageParameter,
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Reading template slide ${args.pageObjectId} from presentation ${args.presentationId}`);

      try {
        const slide = await getSlideOrThrow(slides, args.presentationId, args.pageObjectId);
        const notesText = extractNotesTextFromSlide(slide);
        const templateMetadata = parseTemplateMetadata(notesText);
        const pageElements = slide.pageElements ?? [];

        return dataResult(
          {
            presentationId: args.presentationId,
            pageObjectId: args.pageObjectId,
            pageType: slide.pageType ?? null,
            title: extractSlideTitle(pageElements),
            textContent: extractTextFromPageElements(pageElements) || null,
            placeholders: extractPlaceholdersFromPageElements(pageElements),
            notesText,
            templateMetadata,
            pageElements: summarizePageElements(pageElements),
          },
          'Read template slide successfully.'
        );
      } catch (error: any) {
        log.error(`Error reading template slide: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(
          `Failed to read template slide: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
