import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { getDocsClient } from '../../../clients.js';
import {
  ApplyParagraphStyleToolParameters,
  NotImplementedError,
} from '../../../types.js';
import * as GDocsHelpers from '../../../googleDocsApiHelpers.js';
import { assertAtLeastOneDefined, assertRangeOrder, mutationResult } from '../../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'applyParagraphStyle',
    description:
      'Applies paragraph-level formatting (alignment, spacing, heading styles) to paragraphs identified by a character range or by searching for text. Use namedStyleType to set heading levels (HEADING_1 through HEADING_6).',
    parameters: ApplyParagraphStyleToolParameters,
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      let startIndex: number | undefined;
      let endIndex: number | undefined;

      log.info(
        `Applying paragraph style to document ${args.documentId}${args.tabId ? ` (tab: ${args.tabId})` : ''}`
      );
      log.info(`Target type: ${args.targetType}`);

      try {
        assertAtLeastOneDefined(
          args.style,
          [
            'alignment',
            'indentStart',
            'indentEnd',
            'spaceAbove',
            'spaceBelow',
            'namedStyleType',
            'keepWithNext',
          ],
          'At least one paragraph style option must be provided.'
        );

        // STEP 1: Determine the target paragraph's range based on the targeting method
        if (args.targetType === 'text') {
          if (!args.textToFind) {
            throw new UserError('textToFind is required when targetType="text".');
          }
          // Find the text first
          log.info(
            `Finding text "${args.textToFind}" (instance ${args.matchInstance || 1})${args.tabId ? ` in tab ${args.tabId}` : ''}`
          );
          const textRange = await GDocsHelpers.findTextRange(
            docs,
            args.documentId,
            args.textToFind,
            args.matchInstance || 1,
            args.tabId
          );

          if (!textRange) {
            throw new UserError(
              `Could not find "${args.textToFind}" in the document${args.tabId ? ` (tab: ${args.tabId})` : ''}.`
            );
          }

          log.info(
            `Found text at range ${textRange.startIndex}-${textRange.endIndex}, now locating containing paragraph`
          );

          // Then find the paragraph containing this text
          const paragraphRange = await GDocsHelpers.getParagraphRange(
            docs,
            args.documentId,
            textRange.startIndex,
            args.tabId
          );

          if (!paragraphRange) {
            throw new UserError(`Found the text but could not determine the paragraph boundaries.`);
          }

          startIndex = paragraphRange.startIndex;
          endIndex = paragraphRange.endIndex;
          log.info(`Text is contained within paragraph at range ${startIndex}-${endIndex}`);
        } else if (args.targetType === 'paragraphIndex') {
          if (args.indexWithinParagraph === undefined) {
            throw new UserError(
              'indexWithinParagraph is required when targetType="paragraphIndex".'
            );
          }
          // Find paragraph containing the specified index
          log.info(
            `Finding paragraph containing index ${args.indexWithinParagraph}${args.tabId ? ` in tab ${args.tabId}` : ''}`
          );
          const paragraphRange = await GDocsHelpers.getParagraphRange(
            docs,
            args.documentId,
            args.indexWithinParagraph,
            args.tabId
          );

          if (!paragraphRange) {
            throw new UserError(
              `Could not find paragraph containing index ${args.indexWithinParagraph}${args.tabId ? ` in tab ${args.tabId}` : ''}.`
            );
          }

          startIndex = paragraphRange.startIndex;
          endIndex = paragraphRange.endIndex;
          log.info(`Located paragraph at range ${startIndex}-${endIndex}`);
        } else {
          if (args.startIndex === undefined || args.endIndex === undefined) {
            throw new UserError(
              'startIndex and endIndex are required when targetType="range".'
            );
          }
          // Use directly provided range
          startIndex = args.startIndex;
          endIndex = args.endIndex;
          log.info(`Using provided paragraph range ${startIndex}-${endIndex}`);
        }

        // Verify that we have a valid range
        if (startIndex === undefined || endIndex === undefined) {
          throw new UserError(
            'Could not determine target paragraph range from the provided information.'
          );
        }

        assertRangeOrder(
          startIndex,
          endIndex,
          `Invalid paragraph range: end index (${endIndex}) must be greater than start index (${startIndex}).`
        );

        // STEP 2: Build and apply the paragraph style request
        log.info(`Building paragraph style request for range ${startIndex}-${endIndex}`);
        const requestInfo = GDocsHelpers.buildUpdateParagraphStyleRequest(
          startIndex,
          endIndex,
          args.style,
          args.tabId
        );

        if (!requestInfo) {
          throw new UserError('No valid paragraph styling options were provided.');
        }

        log.info(`Applying styles: ${requestInfo.fields.join(', ')}`);
        await GDocsHelpers.executeBatchUpdate(docs, args.documentId, [requestInfo.request]);

        return mutationResult('Applied paragraph style successfully.', {
          documentId: args.documentId,
          tabId: args.tabId ?? null,
          targetType: args.targetType,
          range: { startIndex, endIndex },
          appliedFields: requestInfo.fields,
        });
      } catch (error: any) {
        // Detailed error logging
        log.error(`Error applying paragraph style in doc ${args.documentId}:`);
        log.error(error.stack || error.message || error);

        if (error instanceof UserError) throw error;
        if (error instanceof NotImplementedError) throw error;

        // Provide a more helpful error message
        throw new UserError(`Failed to apply paragraph style: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
