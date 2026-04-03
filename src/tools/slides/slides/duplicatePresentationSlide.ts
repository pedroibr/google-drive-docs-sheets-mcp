import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../../clients.js';
import { PresentationIdParameter } from '../common.js';
import { mutationResult } from '../../../tooling.js';

const ObjectIdMappingSchema = z.object({
  sourceObjectId: z.string().min(1).describe('Existing source object ID from the slide being duplicated.'),
  newObjectId: z.string().min(1).describe('Desired object ID for the duplicated object.'),
});

export function register(server: FastMCP) {
  server.addTool({
    name: 'duplicatePresentationSlide',
    description:
      'Duplicates a slide, optionally assigning deterministic IDs and moving the duplicate to a specific insertion index.',
    parameters: PresentationIdParameter.extend({
      pageObjectId: z
        .string()
        .describe('The slide/page object ID to duplicate.'),
      newPageObjectId: z
        .string()
        .optional()
        .describe('Optional object ID to assign to the duplicated slide.'),
      insertionIndex: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Optional index to move the duplicated slide to after duplication.'),
      objectIdMappings: z
        .array(ObjectIdMappingSchema)
        .optional()
        .describe('Optional deterministic ID mappings for duplicated child objects.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Duplicating slide ${args.pageObjectId} in presentation ${args.presentationId}`);

      try {
        const objectIds = Object.fromEntries(
          (args.objectIdMappings ?? []).map((mapping) => [mapping.sourceObjectId, mapping.newObjectId])
        );
        if (args.newPageObjectId) {
          objectIds[args.pageObjectId] = args.newPageObjectId;
        }

        const response = await slides.presentations.batchUpdate({
          presentationId: args.presentationId,
          requestBody: {
            requests: [
              {
                duplicateObject: {
                  objectId: args.pageObjectId,
                  ...(Object.keys(objectIds).length > 0 ? { objectIds } : {}),
                },
              },
            ],
          },
        });

        const newPageObjectId =
          response.data.replies?.[0]?.duplicateObject?.objectId ?? args.newPageObjectId ?? null;

        if (newPageObjectId && args.insertionIndex !== undefined) {
          await slides.presentations.batchUpdate({
            presentationId: args.presentationId,
            requestBody: {
              requests: [
                {
                  updateSlidesPosition: {
                    slideObjectIds: [newPageObjectId],
                    insertionIndex: args.insertionIndex,
                  },
                },
              ],
            },
          });
        }

        return mutationResult('Duplicated presentation slide successfully.', {
          presentationId: args.presentationId,
          sourcePageObjectId: args.pageObjectId,
          newPageObjectId,
          insertionIndex: args.insertionIndex ?? null,
          objectIdMappingsApplied: Object.keys(objectIds).length,
        });
      } catch (error: any) {
        log.error(`Error duplicating slide: ${error.message || error}`);
        if (error.code === 404) {
          throw new UserError('Presentation or source slide not found.');
        }
        if (error.code === 403) {
          throw new UserError('Permission denied. Make sure you have edit access to this presentation.');
        }
        throw new UserError(`Failed to duplicate slide: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
