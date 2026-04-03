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
    name: 'readSlideNotes',
    description:
      'Reads the speaker notes for a slide and returns the notes page IDs plus parsed template metadata when present.',
    parameters: SlidePageParameter,
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Reading notes for slide ${args.pageObjectId} in presentation ${args.presentationId}`);

      try {
        const slide = await getSlideOrThrow(slides, args.presentationId, args.pageObjectId);
        const notesInfo = getSlideNotesInfo(slide);

        return dataResult(
          {
            presentationId: args.presentationId,
            pageObjectId: args.pageObjectId,
            notesPageObjectId: notesInfo.notesPageObjectId,
            speakerNotesObjectId: notesInfo.speakerNotesObjectId,
            notesText: notesInfo.notesText,
            templateMetadata: parseTemplateMetadata(notesInfo.notesText),
          },
          'Read slide notes successfully.'
        );
      } catch (error: any) {
        log.error(`Error reading slide notes: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to read slide notes: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
