import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { docs_v1 } from 'googleapis';
import { getDocsClient } from '../../clients.js';
import { DocumentIdParameter, TextStyleParameters } from '../../types.js';
import type { TextStyleArgs } from '../../types.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';
import {
  assertAtLeastOneDefined,
  assertRangeOrder,
  mutationResult,
} from '../../tooling.js';

const ModifyTextParameters = DocumentIdParameter.extend({
  targetType: z
    .enum(['range', 'text', 'insertion'])
    .optional()
    .default('range')
    .describe('How to identify where the modification should happen.'),
  startIndex: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Required when targetType="range". Start of range (inclusive, 1-based).'),
  endIndex: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Required when targetType="range". End of range (exclusive).'),
  textToFind: z
    .string()
    .optional()
    .describe('Required when targetType="text". Exact text string to locate.'),
  matchInstance: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .describe('When targetType="text", which matching instance to modify.'),
  insertionIndex: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Required when targetType="insertion". Index to insert at (1-based).'),
  text: z.string().optional().describe('New text to insert or replace with.'),
  style: TextStyleParameters.optional().describe('Text formatting to apply.'),
  tabId: z
    .string()
    .optional()
    .describe(
      'The ID of the specific tab to operate on. If not specified, operates on the first tab.'
    ),
});

export interface BuildModifyTextOpts {
  startIndex: number;
  endIndex?: number;
  text?: string;
  style?: TextStyleArgs;
  tabId?: string;
}

/**
 * Pure, sync function that builds the array of Google Docs API requests for a
 * modifyText operation. Indices must already be resolved (no text-search here).
 */
export function buildModifyTextRequests(opts: BuildModifyTextOpts): docs_v1.Schema$Request[] {
  const { startIndex, endIndex, text, style, tabId } = opts;
  const requests: docs_v1.Schema$Request[] = [];

  if (!text && !style) return requests;

  // 1. Delete existing content (only when replacing, not insert-only)
  if (endIndex !== undefined && text !== undefined) {
    const range: any = { startIndex, endIndex };
    if (tabId) range.tabId = tabId;
    requests.push({ deleteContentRange: { range } });
  }

  // 2. Insert new text
  if (text !== undefined) {
    const location: any = { index: startIndex };
    if (tabId) location.tabId = tabId;
    requests.push({ insertText: { location, text } });
  }

  // 3. Apply formatting
  if (style) {
    const formatStart = startIndex;
    const formatEnd =
      text !== undefined
        ? startIndex + text.length
        : endIndex !== undefined
          ? endIndex
          : startIndex;

    if (formatEnd > formatStart) {
      const requestInfo = GDocsHelpers.buildUpdateTextStyleRequest(
        formatStart,
        formatEnd,
        style,
        tabId
      );
      if (requestInfo) {
        requests.push(requestInfo.request);
      }
    }
  }

  return requests;
}

export function register(server: FastMCP) {
  server.addTool({
    name: 'modifyText',
    description:
      'Combines text replacement/insertion and formatting in one atomic operation. ' +
      'Can insert text at a position, replace a range or found text, apply formatting, ' +
      "or any combination. Use readGoogleDoc with format='json' to determine indices.",
    parameters: ModifyTextParameters,
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      log.info(
        `modifyText on doc ${args.documentId}: targetType=${args.targetType}` +
          `${args.text !== undefined ? `, text="${args.text.substring(0, 50)}"` : ''}` +
          `${args.style ? `, style=${JSON.stringify(args.style)}` : ''}` +
          `${args.tabId ? `, tab=${args.tabId}` : ''}`
      );

      try {
        if (args.text === undefined && args.style === undefined) {
          throw new UserError('At least one of text or style must be provided.');
        }

        if (args.style) {
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
        }

        // Verify tab exists if specified
        if (args.tabId) {
          const docInfo = await docs.documents.get({
            documentId: args.documentId,
            includeTabsContent: true,
            fields: 'tabs(tabProperties,documentTab)',
          });
          const targetTab = GDocsHelpers.findTabById(docInfo.data, args.tabId);
          if (!targetTab) {
            throw new UserError(`Tab with ID "${args.tabId}" not found in document.`);
          }
          if (!targetTab.documentTab) {
            throw new UserError(
              `Tab "${args.tabId}" does not have content (may not be a document tab).`
            );
          }
        }

        // Resolve target to numeric indices
        let startIndex: number;
        let endIndex: number | undefined;

        if (args.targetType === 'insertion') {
          if (args.insertionIndex === undefined) {
            throw new UserError('insertionIndex is required when targetType="insertion".');
          }
          if (args.text === undefined) {
            throw new UserError(
              'text is required when using targetType="insertion" (no existing range to format).'
            );
          }
          startIndex = args.insertionIndex;
          endIndex = undefined;
        } else if (args.targetType === 'text') {
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
              `Could not find instance ${args.matchInstance ?? 1} of text "${args.textToFind}"${args.tabId ? ` in tab ${args.tabId}` : ''}.`
            );
          }
          startIndex = range.startIndex;
          endIndex = range.endIndex;
          log.info(`Found text "${args.textToFind}" at range ${startIndex}-${endIndex}`);
        } else {
          if (args.startIndex === undefined || args.endIndex === undefined) {
            throw new UserError('startIndex and endIndex are required when targetType="range".');
          }
          assertRangeOrder(args.startIndex, args.endIndex);
          startIndex = args.startIndex;
          endIndex = args.endIndex;
        }

        // Clamp to minimum 1 (index 0 is the document section break)
        if (startIndex < 1) startIndex = 1;

        const requests = buildModifyTextRequests({
          startIndex,
          endIndex,
          text: args.text,
          style: args.style,
          tabId: args.tabId,
        });

        if (requests.length === 0) {
          throw new UserError('No operations to perform.');
        }

        await GDocsHelpers.executeBatchUpdate(docs, args.documentId, requests);

        // Build descriptive result
        const actions: string[] = [];
        if (endIndex !== undefined && args.text !== undefined) actions.push('replaced text');
        else if (args.text !== undefined) actions.push('inserted text');
        if (args.style) actions.push('applied formatting');

        return mutationResult('Modified text successfully.', {
          documentId: args.documentId,
          tabId: args.tabId ?? null,
          targetType: args.targetType,
          actions,
          affectedRange: {
            startIndex,
            endIndex: endIndex ?? startIndex + (args.text?.length ?? 0),
          },
          insertedTextLength: args.text?.length ?? 0,
        });
      } catch (error: any) {
        log.error(`Error in modifyText for doc ${args.documentId}: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to modify text: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
