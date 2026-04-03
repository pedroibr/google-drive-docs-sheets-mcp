import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { getSlidesClient } from '../../../clients.js';
import { SlidePageParameter, PlaceholderReplacementsParameter } from '../common.js';
import { mutationResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'replaceSlidePlaceholders',
    description:
      'Replaces placeholder tokens on a single slide by scoping text replacement requests to that page only.',
    parameters: SlidePageParameter.merge(PlaceholderReplacementsParameter),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(
        `Replacing ${args.replacements.length} placeholder(s) on slide ${args.pageObjectId} in presentation ${args.presentationId}`
      );

      try {
        const response = await slides.presentations.batchUpdate({
          presentationId: args.presentationId,
          requestBody: {
            requests: args.replacements.map((replacement) => ({
              replaceAllText: {
                containsText: {
                  text: replacement.placeholder,
                  matchCase: true,
                },
                replaceText: replacement.value,
                pageObjectIds: [args.pageObjectId],
              },
            })),
          },
        });

        const appliedReplacements = args.replacements.map((replacement, index) => ({
          placeholder: replacement.placeholder,
          value: replacement.value,
          occurrencesChanged:
            response.data.replies?.[index]?.replaceAllText?.occurrencesChanged ?? 0,
        }));

        return mutationResult('Replaced slide placeholders successfully.', {
          presentationId: args.presentationId,
          pageObjectId: args.pageObjectId,
          appliedReplacements,
        });
      } catch (error: any) {
        log.error(`Error replacing slide placeholders: ${error.message || error}`);
        if (error.code === 404) {
          throw new UserError('Presentation or slide not found.');
        }
        if (error.code === 403) {
          throw new UserError('Permission denied. Make sure you have edit access to this presentation.');
        }
        throw new UserError(
          `Failed to replace slide placeholders: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
