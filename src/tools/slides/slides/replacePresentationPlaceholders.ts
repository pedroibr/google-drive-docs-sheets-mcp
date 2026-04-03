import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { getSlidesClient } from '../../../clients.js';
import { PresentationIdParameter, PlaceholderReplacementsParameter } from '../common.js';
import { mutationResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'replacePresentationPlaceholders',
    description:
      'Replaces placeholder tokens across the entire presentation using Google Slides replaceAllText requests.',
    parameters: PresentationIdParameter.merge(PlaceholderReplacementsParameter),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(
        `Replacing ${args.replacements.length} placeholder(s) in presentation ${args.presentationId}`
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

        return mutationResult('Replaced presentation placeholders successfully.', {
          presentationId: args.presentationId,
          appliedReplacements,
        });
      } catch (error: any) {
        log.error(`Error replacing presentation placeholders: ${error.message || error}`);
        if (error.code === 404) {
          throw new UserError('Presentation not found.');
        }
        if (error.code === 403) {
          throw new UserError('Permission denied. Make sure you have edit access to this presentation.');
        }
        throw new UserError(
          `Failed to replace presentation placeholders: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
