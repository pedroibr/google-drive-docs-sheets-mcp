import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../../clients.js';
import { buildInsertTextRequest, buildPageElementProperties } from '../../../googleSlidesApiHelpers.js';
import { SlidePageParameter, DimensionUnitSchema } from '../common.js';
import { mutationResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'createSlideTextBox',
    description:
      'Creates a text box (or other text-capable shape type) on a slide at explicit coordinates and size.',
    parameters: SlidePageParameter.extend({
      text: z.string().optional().describe('Optional initial text to insert into the created shape.'),
      x: z.number().describe('Left position of the text box.'),
      y: z.number().describe('Top position of the text box.'),
      width: z.number().positive().describe('Width of the text box.'),
      height: z.number().positive().describe('Height of the text box.'),
      unit: DimensionUnitSchema,
      objectId: z.string().optional().describe('Optional object ID for the created text box.'),
      shapeType: z
        .string()
        .optional()
        .default('TEXT_BOX')
        .describe('Shape type to create. Defaults to TEXT_BOX.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Creating text box on slide ${args.pageObjectId} in presentation ${args.presentationId}`);

      try {
        const response = await slides.presentations.batchUpdate({
          presentationId: args.presentationId,
          requestBody: {
            requests: [
              {
                createShape: {
                  objectId: args.objectId,
                  shapeType: args.shapeType,
                  elementProperties: buildPageElementProperties(
                    args.pageObjectId,
                    args.x,
                    args.y,
                    args.width,
                    args.height,
                    args.unit
                  ),
                },
              },
            ],
          },
        });

        const objectId = response.data.replies?.[0]?.createShape?.objectId ?? args.objectId ?? null;

        if (objectId && args.text) {
          await slides.presentations.batchUpdate({
            presentationId: args.presentationId,
            requestBody: {
              requests: [buildInsertTextRequest(objectId, args.text, 0)],
            },
          });
        }

        return mutationResult('Created slide text box successfully.', {
          presentationId: args.presentationId,
          pageObjectId: args.pageObjectId,
          objectId,
          shapeType: args.shapeType,
          bounds: {
            x: args.x,
            y: args.y,
            width: args.width,
            height: args.height,
            unit: args.unit,
          },
        });
      } catch (error: any) {
        log.error(`Error creating slide text box: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to create slide text box: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
