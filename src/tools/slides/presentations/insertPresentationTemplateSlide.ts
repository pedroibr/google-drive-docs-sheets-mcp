import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getScriptClient, getSlidesClient } from '../../../clients.js';
import {
  assertAppsScriptSuccessResult,
  getAppsScriptIdFromEnv,
  runAppsScriptFunction,
} from '../../../appsScriptApiHelpers.js';
import { PlaceholderReplacementSchema } from '../common.js';
import { mutationResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'insertPresentationTemplateSlide',
    description:
      'Copies a specific template slide from one presentation into another, optionally inserting it at a specific index and replacing placeholders on the copied slide.',
    parameters: z.object({
      sourcePresentationId: z
        .string()
        .describe(
          'The source presentation ID containing the template slide — the long string between /d/ and /edit in a Google Slides URL.'
        ),
      sourceSlideId: z
        .string()
        .describe('The object ID of the source slide to copy from the template presentation.'),
      targetPresentationId: z
        .string()
        .describe(
          'The destination presentation ID where the copied slide should be inserted.'
        ),
      insertionIndex: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Optional zero-based index where the copied slide should be inserted.'),
      replacements: z
        .array(PlaceholderReplacementSchema)
        .optional()
        .describe(
          'Optional placeholder replacements to apply immediately on the copied slide.'
        ),
    }),
    execute: async (args, { log }) => {
      const appsScriptId = getAppsScriptIdFromEnv();
      if (!appsScriptId) {
        throw new UserError(
          'Apps Script integration is not configured. Set GOOGLE_APPS_SCRIPT_ID or APPS_SCRIPT_DEPLOYMENT_ID.'
        );
      }

      const scriptClient = await getScriptClient();
      log.info(
        `Copying slide ${args.sourceSlideId} from presentation ${args.sourcePresentationId} into ${args.targetPresentationId}`
      );

      try {
        const result = await runAppsScriptFunction(
          scriptClient,
          appsScriptId,
          'copySlideToPresentation',
          [
            args.sourcePresentationId,
            args.sourceSlideId,
            args.targetPresentationId,
            args.insertionIndex ?? null,
          ]
        );
        assertAppsScriptSuccessResult(result, 'Apps Script slide insertion failed.');

        const newSlideId = typeof result.newSlideId === 'string' ? result.newSlideId : null;
        if (!newSlideId) {
          throw new Error('Apps Script did not return a newSlideId.');
        }

        let appliedReplacements: Array<{
          placeholder: string;
          value: string;
          occurrencesChanged: number;
        }> = [];

        if (args.replacements?.length) {
          const slides = await getSlidesClient();
          const replacementsResponse = await slides.presentations.batchUpdate({
            presentationId: args.targetPresentationId,
            requestBody: {
              requests: args.replacements.map((replacement) => ({
                replaceAllText: {
                  containsText: {
                    text: replacement.placeholder,
                    matchCase: true,
                  },
                  replaceText: replacement.value,
                  pageObjectIds: [newSlideId],
                },
              })),
            },
          });

          appliedReplacements = args.replacements.map((replacement, index) => ({
            placeholder: replacement.placeholder,
            value: replacement.value,
            occurrencesChanged:
              replacementsResponse.data.replies?.[index]?.replaceAllText?.occurrencesChanged ?? 0,
          }));
        }

        return mutationResult('Inserted presentation template slide successfully.', {
          sourcePresentationId: args.sourcePresentationId,
          sourceSlideId: args.sourceSlideId,
          targetPresentationId: args.targetPresentationId,
          newSlideId,
          insertionIndex: args.insertionIndex ?? null,
          appliedReplacements,
        });
      } catch (error: any) {
        const message = error.message || 'Unknown error';
        log.error(`Error inserting presentation template slide: ${message}`);

        if (
          message.includes('Apps Script slide insertion failed: Slide template not found') ||
          message.includes('Slide template not found')
        ) {
          throw new UserError('Source template slide not found.');
        }
        if (
          message.includes('Apps Script slide insertion failed: Permission denied') ||
          message.includes('Apps Script execution failed: Exception: You do not have permission')
        ) {
          throw new UserError(
            'Permission denied. Make sure you can read the source presentation, edit the target presentation, and access the Apps Script project.'
          );
        }
        if (message.includes('Apps Script') || message.includes('newSlideId')) {
          throw new UserError(`Failed to insert template slide: ${message}`);
        }
        if (error.code === 404) {
          throw new UserError('Target presentation or copied slide not found.');
        }
        if (error.code === 403) {
          throw new UserError('Permission denied. Make sure you have edit access to the target presentation.');
        }
        throw new UserError(`Failed to insert template slide: ${message}`);
      }
    },
  });
}
