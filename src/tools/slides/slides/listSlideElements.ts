import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { getSlidesClient } from '../../../clients.js';
import { getPresentationPageOrThrow, summarizePageElements } from '../../../googleSlidesApiHelpers.js';
import { SlidePageParameter } from '../common.js';
import { dataResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'listSlideElements',
    description:
      'Lists the page elements on a slide with stable summaries including text, transforms, sizes, and alt text.',
    parameters: SlidePageParameter,
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Listing page elements for slide ${args.pageObjectId} in presentation ${args.presentationId}`);

      try {
        const page = await getPresentationPageOrThrow(slides, args.presentationId, args.pageObjectId);
        const pageElements = page.pageElements ?? [];

        return dataResult(
          {
            presentationId: args.presentationId,
            pageObjectId: args.pageObjectId,
            pageType: page.pageType ?? null,
            pageElements: summarizePageElements(pageElements),
            total: pageElements.length,
          },
          `Listed ${pageElements.length} slide element(s) successfully.`
        );
      } catch (error: any) {
        log.error(`Error listing slide elements: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to list slide elements: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
