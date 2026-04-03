import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../../clients.js';
import { buildSlidesTextStyle, buildTextRange } from '../../../googleSlidesApiHelpers.js';
import { SlideElementParameter, SlidesTextStyleSchema } from '../common.js';
import { mutationResult, assertAtLeastOneDefined } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'updateSlideTextStyle',
    description:
      'Updates text styling within a text-capable slide shape using Google Slides text style properties.',
    parameters: SlideElementParameter.extend({
      startIndex: z.number().int().min(0).optional().describe('Optional start index for the text range.'),
      endIndex: z.number().int().min(0).optional().describe('Optional end index for the text range.'),
      style: SlidesTextStyleSchema.describe('Text style options to apply.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Updating text style for shape ${args.objectId} on slide ${args.pageObjectId}`);

      try {
        assertAtLeastOneDefined(
          args.style,
          [
            'bold',
            'italic',
            'underline',
            'strikethrough',
            'smallCaps',
            'fontSize',
            'fontFamily',
            'foregroundColor',
            'backgroundColor',
            'linkUrl',
          ],
          'At least one text style option must be provided.'
        );

        const requestInfo = buildSlidesTextStyle(args.style);
        await slides.presentations.batchUpdate({
          presentationId: args.presentationId,
          requestBody: {
            requests: [
              {
                updateTextStyle: {
                  objectId: args.objectId,
                  style: requestInfo.style,
                  fields: requestInfo.fields.join(','),
                  textRange: buildTextRange(args.startIndex, args.endIndex),
                },
              },
            ],
          },
        });

        return mutationResult('Updated slide text style successfully.', {
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
        log.error(`Error updating slide text style: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to update slide text style: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
