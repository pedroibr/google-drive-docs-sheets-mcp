import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { getSlidesClient } from '../../../clients.js';
import {
  getSlideNotesInfo,
  getSlideOrThrow,
  parseTemplateMetadata,
} from '../../../googleSlidesApiHelpers.js';
import { SlidePageParameter } from '../common.js';
import { dataResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'readPresentationTemplateMetadata',
    description:
      'Reads template metadata from a slide speaker notes block using simple key-value lines such as template_category and template_name.',
    parameters: SlidePageParameter,
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(
        `Reading template metadata for slide ${args.pageObjectId} in presentation ${args.presentationId}`
      );

      try {
        const slide = await getSlideOrThrow(slides, args.presentationId, args.pageObjectId);
        const notesInfo = getSlideNotesInfo(slide);
        const templateMetadata = parseTemplateMetadata(notesInfo.notesText);

        return dataResult(
          {
            presentationId: args.presentationId,
            pageObjectId: args.pageObjectId,
            notesText: notesInfo.notesText,
            templateMetadata,
          },
          'Read template metadata successfully.'
        );
      } catch (error: any) {
        log.error(`Error reading template metadata: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(
          `Failed to read template metadata: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
