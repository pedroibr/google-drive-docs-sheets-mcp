import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../../clients.js';
import { PresentationIdParameter } from '../common.js';
import { mutationResult } from '../../../tooling.js';

const PlaceholderIdMappingSchema = z.object({
  objectId: z.string().min(1).describe('Object ID to assign to the placeholder created on the new slide.'),
  layoutPlaceholderObjectId: z
    .string()
    .optional()
    .describe('Optional layout placeholder object ID to map from.'),
  placeholderType: z
    .string()
    .optional()
    .describe('Optional layout placeholder type when not using layoutPlaceholderObjectId.'),
  placeholderIndex: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Optional layout placeholder index when using placeholderType.'),
});

export function register(server: FastMCP) {
  server.addTool({
    name: 'createSlideFromLayout',
    description:
      'Creates a new slide from a specific layout reference in the current presentation master.',
    parameters: PresentationIdParameter.extend({
      insertionIndex: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Optional zero-based index where the slide should be inserted.'),
      objectId: z
        .string()
        .optional()
        .describe('Optional object ID to assign to the created slide.'),
      layoutId: z
        .string()
        .optional()
        .describe('Optional layout object ID from the presentation.'),
      predefinedLayout: z
        .string()
        .optional()
        .describe('Optional predefined layout name, such as TITLE, TITLE_AND_BODY, or BLANK.'),
      placeholderIdMappings: z
        .array(PlaceholderIdMappingSchema)
        .optional()
        .describe('Optional placeholder ID mappings when creating from a layout.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Creating slide from layout in presentation ${args.presentationId}`);

      try {
        if (args.layoutId && args.predefinedLayout) {
          throw new UserError('Provide either layoutId or predefinedLayout, not both.');
        }
        if (!args.layoutId && !args.predefinedLayout && args.placeholderIdMappings?.length) {
          throw new UserError(
            'placeholderIdMappings can only be used when layoutId or predefinedLayout is provided.'
          );
        }

        const createSlideRequest: Record<string, unknown> = {
          ...(args.insertionIndex !== undefined ? { insertionIndex: args.insertionIndex } : {}),
          ...(args.objectId ? { objectId: args.objectId } : {}),
        };

        if (args.layoutId || args.predefinedLayout) {
          createSlideRequest.slideLayoutReference = {
            ...(args.layoutId ? { layoutId: args.layoutId } : {}),
            ...(args.predefinedLayout ? { predefinedLayout: args.predefinedLayout } : {}),
          };
        }

        if (args.placeholderIdMappings?.length) {
          createSlideRequest.placeholderIdMappings = args.placeholderIdMappings.map((mapping) => {
            if (!mapping.layoutPlaceholderObjectId && !mapping.placeholderType) {
              throw new UserError(
                'Each placeholderIdMappings entry requires layoutPlaceholderObjectId or placeholderType.'
              );
            }

            return {
              objectId: mapping.objectId,
              ...(mapping.layoutPlaceholderObjectId
                ? { layoutPlaceholderObjectId: mapping.layoutPlaceholderObjectId }
                : {
                    layoutPlaceholder: {
                      type: mapping.placeholderType,
                      ...(mapping.placeholderIndex !== undefined
                        ? { index: mapping.placeholderIndex }
                        : {}),
                    },
                  }),
            };
          });
        }

        const response = await slides.presentations.batchUpdate({
          presentationId: args.presentationId,
          requestBody: {
            requests: [
              {
                createSlide: createSlideRequest as any,
              },
            ],
          },
        });

        const createdSlideId = response.data.replies?.[0]?.createSlide?.objectId ?? args.objectId ?? null;

        return mutationResult('Created slide from layout successfully.', {
          presentationId: args.presentationId,
          pageObjectId: createdSlideId,
          insertionIndex: args.insertionIndex ?? null,
          layoutId: args.layoutId ?? null,
          predefinedLayout: args.predefinedLayout ?? null,
        });
      } catch (error: any) {
        log.error(`Error creating slide from layout: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        if (error.code === 404) {
          throw new UserError('Presentation or layout not found.');
        }
        if (error.code === 403) {
          throw new UserError('Permission denied. Make sure you have edit access to this presentation.');
        }
        throw new UserError(
          `Failed to create slide from layout: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
