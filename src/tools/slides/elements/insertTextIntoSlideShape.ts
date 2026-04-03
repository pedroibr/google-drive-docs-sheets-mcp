import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../../clients.js';
import {
  buildDeleteAllTextRequest,
  buildInsertTextRequest,
  findPageElementById,
  getAppendInsertionIndexForShape,
  getPresentationPageOrThrow,
} from '../../../googleSlidesApiHelpers.js';
import { SlideElementParameter } from '../common.js';
import { mutationResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'insertTextIntoSlideShape',
    description:
      'Inserts, appends, or replaces text inside a text-capable shape on a slide.',
    parameters: SlideElementParameter.extend({
      text: z.string().describe('Text to insert into the shape.'),
      insertionIndex: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Optional insertion index for mode="insert".'),
      mode: z
        .enum(['replace', 'append', 'insert'])
        .optional()
        .default('replace')
        .describe('How the text should be applied. Defaults to replace.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Updating text in shape ${args.objectId} on slide ${args.pageObjectId}`);

      try {
        const page = await getPresentationPageOrThrow(slides, args.presentationId, args.pageObjectId);
        const pageElement = findPageElementById(page, args.objectId);
        if (!pageElement?.shape) {
          throw new UserError(`Page element ${args.objectId} is not a text-capable shape.`);
        }

        const requests = [];
        if (args.mode === 'replace') {
          requests.push(buildDeleteAllTextRequest(args.objectId));
          if (args.text.length > 0) {
            requests.push(buildInsertTextRequest(args.objectId, args.text, 0));
          }
        } else if (args.mode === 'append') {
          requests.push(
            buildInsertTextRequest(
              args.objectId,
              args.text,
              getAppendInsertionIndexForShape(pageElement.shape)
            )
          );
        } else {
          requests.push(buildInsertTextRequest(args.objectId, args.text, args.insertionIndex ?? 0));
        }

        await slides.presentations.batchUpdate({
          presentationId: args.presentationId,
          requestBody: { requests },
        });

        return mutationResult('Updated slide shape text successfully.', {
          presentationId: args.presentationId,
          pageObjectId: args.pageObjectId,
          objectId: args.objectId,
          mode: args.mode,
          textLength: args.text.length,
          insertionIndex: args.mode === 'insert' ? args.insertionIndex ?? 0 : null,
        });
      } catch (error: any) {
        log.error(`Error updating slide shape text: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(
          `Failed to update slide shape text: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
