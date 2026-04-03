import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../../clients.js';
import { buildPageElementProperties } from '../../../googleSlidesApiHelpers.js';
import { SlidePageParameter, DimensionUnitSchema } from '../common.js';
import { mutationResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'createSlideTable',
    description:
      'Creates a table on a slide at explicit coordinates and size.',
    parameters: SlidePageParameter.extend({
      rows: z.number().int().min(1).describe('Number of rows in the table.'),
      columns: z.number().int().min(1).describe('Number of columns in the table.'),
      x: z.number().describe('Left position of the table.'),
      y: z.number().describe('Top position of the table.'),
      width: z.number().positive().describe('Width of the table.'),
      height: z.number().positive().describe('Height of the table.'),
      unit: DimensionUnitSchema,
      objectId: z.string().optional().describe('Optional object ID for the table.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Creating table on slide ${args.pageObjectId} in presentation ${args.presentationId}`);

      try {
        const response = await slides.presentations.batchUpdate({
          presentationId: args.presentationId,
          requestBody: {
            requests: [
              {
                createTable: {
                  objectId: args.objectId,
                  rows: args.rows,
                  columns: args.columns,
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

        return mutationResult('Created slide table successfully.', {
          presentationId: args.presentationId,
          pageObjectId: args.pageObjectId,
          objectId: response.data.replies?.[0]?.createTable?.objectId ?? args.objectId ?? null,
          rows: args.rows,
          columns: args.columns,
          bounds: {
            x: args.x,
            y: args.y,
            width: args.width,
            height: args.height,
            unit: args.unit,
          },
        });
      } catch (error: any) {
        log.error(`Error creating slide table: ${error.message || error}`);
        if (error.code === 404) {
          throw new UserError('Presentation or target slide not found.');
        }
        if (error.code === 403) {
          throw new UserError('Permission denied. Make sure you have edit access to this presentation.');
        }
        throw new UserError(`Failed to create slide table: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
