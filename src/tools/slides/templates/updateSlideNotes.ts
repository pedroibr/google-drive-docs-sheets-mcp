import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../../clients.js';
import {
  buildDeleteAllTextRequest,
  buildInsertTextRequest,
  getAppendInsertionIndexForShape,
  getSlideNotesInfo,
  getSlideOrThrow,
} from '../../../googleSlidesApiHelpers.js';
import { SlidePageParameter } from '../common.js';
import { mutationResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'updateSlideNotes',
    description:
      'Replaces or appends speaker notes for a slide. Uses the slide speaker-notes shape on the notes page.',
    parameters: SlidePageParameter.extend({
      notesText: z.string().describe('The notes text to write.'),
      mode: z
        .enum(['replace', 'append'])
        .optional()
        .default('replace')
        .describe('Whether to replace the current notes or append to them. Defaults to replace.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(
        `Updating notes for slide ${args.pageObjectId} in presentation ${args.presentationId}. mode=${args.mode}`
      );

      try {
        const slide = await getSlideOrThrow(slides, args.presentationId, args.pageObjectId);
        const notesInfo = getSlideNotesInfo(slide);

        if (!notesInfo.speakerNotesObjectId) {
          throw new UserError(
            `Slide ${args.pageObjectId} does not expose a speaker notes object ID.`
          );
        }

        const requests = [];
        let finalNotesText = args.notesText;

        if (args.mode === 'replace') {
          requests.push(buildDeleteAllTextRequest(notesInfo.speakerNotesObjectId));
          if (args.notesText.length > 0) {
            requests.push(buildInsertTextRequest(notesInfo.speakerNotesObjectId, args.notesText, 0));
          }
        } else {
          const prefix =
            notesInfo.notesText.length > 0 && args.notesText.length > 0 && !args.notesText.startsWith('\n')
              ? '\n'
              : '';
          const appendText = `${prefix}${args.notesText}`;
          finalNotesText = `${notesInfo.notesText}${appendText}`;
          if (appendText.length > 0) {
            requests.push(
              buildInsertTextRequest(
                notesInfo.speakerNotesObjectId,
                appendText,
                getAppendInsertionIndexForShape(notesInfo.notesShape?.shape)
              )
            );
          }
        }

        if (requests.length > 0) {
          await slides.presentations.batchUpdate({
            presentationId: args.presentationId,
            requestBody: { requests },
          });
        }

        return mutationResult('Updated slide notes successfully.', {
          presentationId: args.presentationId,
          pageObjectId: args.pageObjectId,
          notesPageObjectId: notesInfo.notesPageObjectId,
          speakerNotesObjectId: notesInfo.speakerNotesObjectId,
          mode: args.mode,
          notesText: finalNotesText,
        });
      } catch (error: any) {
        log.error(`Error updating slide notes: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to update slide notes: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
