import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { getDocsClient } from '../../../clients.js';
import {
  ApplyTextStyleToolParameters,
  NotImplementedError,
} from '../../../types.js';
import * as GDocsHelpers from '../../../googleDocsApiHelpers.js';
import { assertAtLeastOneDefined, assertRangeOrder, mutationResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'applyTextStyle',
    description:
      'Applies character-level formatting (bold, italic, color, font, etc.) to text identified by a character range or by searching for a text string. This is the primary tool for styling text in a document.',
    parameters: ApplyTextStyleToolParameters,
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      let startIndex = args.startIndex;
      let endIndex = args.endIndex;

      log.info(
        `Applying text style in doc ${args.documentId}${args.tabId ? ` (tab: ${args.tabId})` : ''}. targetType=${args.targetType}`
      );

      try {
        assertAtLeastOneDefined(
          args.style,
          [
            'bold',
            'italic',
            'underline',
            'strikethrough',
            'fontSize',
            'fontFamily',
            'foregroundColor',
            'backgroundColor',
            'linkUrl',
          ],
          'At least one text style option must be provided.'
        );

        // Determine target range
        if (args.targetType === 'text') {
          if (!args.textToFind) {
            throw new UserError('textToFind is required when targetType="text".');
          }
          const range = await GDocsHelpers.findTextRange(
            docs,
            args.documentId,
            args.textToFind,
            args.matchInstance,
            args.tabId
          );
          if (!range) {
            throw new UserError(
              `Could not find instance ${args.matchInstance} of text "${args.textToFind}"${args.tabId ? ` in tab ${args.tabId}` : ''}.`
            );
          }
          startIndex = range.startIndex;
          endIndex = range.endIndex;
          log.info(
            `Found text "${args.textToFind}" (instance ${args.matchInstance}) at range ${startIndex}-${endIndex}`
          );
        } else {
          if (startIndex === undefined || endIndex === undefined) {
            throw new UserError(
              'startIndex and endIndex are required when targetType="range".'
            );
          }
          assertRangeOrder(
            startIndex,
            endIndex,
            'End index must be greater than start index for styling.'
          );
        }

        if (startIndex === undefined || endIndex === undefined) {
          throw new UserError('Target range could not be determined.');
        }

        // Build the request
        const requestInfo = GDocsHelpers.buildUpdateTextStyleRequest(
          startIndex,
          endIndex,
          args.style,
          args.tabId
        );
        if (!requestInfo) {
          throw new UserError('No valid text styling options were provided.');
        }

        await GDocsHelpers.executeBatchUpdate(docs, args.documentId, [requestInfo.request]);
        return mutationResult('Applied text style successfully.', {
          documentId: args.documentId,
          tabId: args.tabId ?? null,
          targetType: args.targetType,
          range: { startIndex, endIndex },
          appliedFields: requestInfo.fields,
        });
      } catch (error: any) {
        log.error(`Error applying text style in doc ${args.documentId}: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        if (error instanceof NotImplementedError) throw error; // Should not happen here
        throw new UserError(`Failed to apply text style: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
