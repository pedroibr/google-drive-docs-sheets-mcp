import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../../clients.js';
import { buildSlidesParagraphStyle, buildTextRange } from '../../../googleSlidesApiHelpers.js';
import { SlideElementParameter, SlidesParagraphStyleSchema } from '../common.js';
import { assertAtLeastOneDefined, mutationResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'updateSlideParagraphStyle',
    description:
      'Updates paragraph styling within a text-capable slide shape using Google Slides paragraph style properties.',
    parameters: SlideElementParameter.extend({
      startIndex: z.number().int().min(0).optional().describe('Optional start index for the paragraph range.'),
      endIndex: z.number().int().min(0).optional().describe('Optional end index for the paragraph range.'),
      style: SlidesParagraphStyleSchema.describe('Paragraph style options to apply.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Updating paragraph style for shape ${args.objectId} on slide ${args.pageObjectId}`);

      try {
        assertAtLeastOneDefined(
          args.style,
          ['alignment', 'direction', 'indentStart', 'indentEnd', 'indentFirstLine', 'lineSpacing', 'spaceAbove', 'spaceBelow'],
          'At least one paragraph style option must be provided.'
        );

        const requestInfo = buildSlidesParagraphStyle(args.style);
        await slides.presentations.batchUpdate({
          presentationId: args.presentationId,
          requestBody: {
            requests: [
              {
                updateParagraphStyle: {
                  objectId: args.objectId,
                  style: requestInfo.style,
                  fields: requestInfo.fields.join(','),
                  textRange: buildTextRange(args.startIndex, args.endIndex),
                },
              },
            ],
          },
        });

        return mutationResult('Updated slide paragraph style successfully.', {
          presentationId: args.presentationId,
          pageObjectId: args.pageObjectId,
          objectId: args.objectId,
          appliedFields: requestInfo.fields,
          range: {
            startIndex: args.startIndex ?? null,
            endIndex: args.endIndex ?? null,
          },
        });
      } catch (error: any) {
        log.error(`Error updating slide paragraph style: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(
          `Failed to update slide paragraph style: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
