import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../../clients.js';
import {
  getSlideNotesInfo,
  getSlideOrThrow,
  parseTemplateMetadata,
  updateTemplateMetadataText,
} from '../../../googleSlidesApiHelpers.js';
import { SlidePageParameter, TemplateMetadataParameter } from '../common.js';
import { mutationResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'updatePresentationTemplateMetadata',
    description:
      'Updates template metadata stored in slide speaker notes using key-value lines such as template_category, template_name, and version.',
    parameters: SlidePageParameter.merge(TemplateMetadataParameter).extend({
      replaceExisting: z
        .boolean()
        .optional()
        .default(false)
        .describe('If true, rewrites the managed metadata block instead of merging keys in place.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(
        `Updating template metadata for slide ${args.pageObjectId} in presentation ${args.presentationId}`
      );

      try {
        if (
          args.templateCategory === undefined &&
          args.templateName === undefined &&
          args.version === undefined
        ) {
          throw new UserError('At least one metadata field must be provided.');
        }

        const sourceSlide = await getSlideOrThrow(slides, args.presentationId, args.pageObjectId);
        const notesInfo = getSlideNotesInfo(sourceSlide);

        if (!notesInfo.speakerNotesObjectId) {
          throw new UserError(
            `Slide ${args.pageObjectId} does not expose a speaker notes object ID.`
          );
        }

        const currentNotesText = notesInfo.notesText;

        const nextNotesText = updateTemplateMetadataText(
          currentNotesText,
          {
            template_category: args.templateCategory,
            template_name: args.templateName,
            version: args.version,
          },
          args.replaceExisting
        );

        await slides.presentations.batchUpdate({
          presentationId: args.presentationId,
          requestBody: {
            requests: [
              {
                deleteText: {
                  objectId: notesInfo.speakerNotesObjectId,
                  textRange: { type: 'ALL' },
                },
              },
              ...(nextNotesText.length > 0
                ? [
                    {
                      insertText: {
                        objectId: notesInfo.speakerNotesObjectId,
                        insertionIndex: 0,
                        text: nextNotesText,
                      },
                    },
                  ]
                : []),
            ],
          },
        });

        return mutationResult('Updated template metadata successfully.', {
          presentationId: args.presentationId,
          pageObjectId: args.pageObjectId,
          notesPageObjectId: notesInfo.notesPageObjectId,
          speakerNotesObjectId: notesInfo.speakerNotesObjectId,
          notesText: nextNotesText,
          templateMetadata: parseTemplateMetadata(nextNotesText),
          replaceExisting: args.replaceExisting,
        });
      } catch (error: any) {
        log.error(`Error updating template metadata: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(
          `Failed to update template metadata: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
