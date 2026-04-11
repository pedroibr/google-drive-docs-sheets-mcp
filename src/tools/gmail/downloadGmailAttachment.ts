import path from 'node:path';
import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getGmailClient } from '../../clients.js';
import { dataResult } from '../../tooling.js';
import {
  extractAttachments,
  normalizeMessage,
  resolveAttachmentSavePath,
  saveAttachmentToDisk,
} from './common.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'downloadGmailAttachment',
    description:
      'Downloads a Gmail attachment to a local file path inside the current working directory and returns the saved path plus attachment metadata.',
    parameters: z.object({
      messageId: z.string().min(1).describe('Gmail message ID containing the attachment.'),
      attachmentId: z.string().min(1).describe('Attachment ID from getGmailMessageContent.'),
      savePath: z
        .string()
        .optional()
        .describe(
          'Optional local path to save the attachment to. Must stay within the current working directory.'
        ),
      extractText: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true, include text content in the response for text-based attachments.'),
    }),
    execute: async (args, { log }) => {
      const gmail = await getGmailClient();
      log.info(`Downloading Gmail attachment ${args.attachmentId} from message ${args.messageId}`);

      try {
        const messageResponse = await gmail.users.messages.get({
          userId: 'me',
          id: args.messageId,
          format: 'full',
        });

        const attachments = extractAttachments(messageResponse.data.payload);
        const attachment = attachments.find((item) => item.attachmentId === args.attachmentId);
        if (!attachment) {
          throw new UserError(
            `Attachment ${args.attachmentId} was not found on Gmail message ${args.messageId}.`
          );
        }

        const attachmentResponse = await gmail.users.messages.attachments.get({
          userId: 'me',
          messageId: args.messageId,
          id: args.attachmentId,
        });

        const savePath = resolveAttachmentSavePath(args.savePath, attachment);
        const saved = saveAttachmentToDisk({
          base64urlData: attachmentResponse.data.data ?? '',
          savePath,
          mimeType: attachment.mimeType,
          extractText: args.extractText,
        });

        return dataResult(
          {
            messageId: args.messageId,
            attachmentId: args.attachmentId,
            filename: attachment.filename ?? path.basename(savePath),
            mimeType: attachment.mimeType,
            sizeBytes: saved.sizeBytes,
            savedTo: savePath,
            textContent: saved.textContent,
            messageUrl: normalizeMessage(messageResponse.data, 'text').url,
          },
          'Downloaded Gmail attachment successfully.'
        );
      } catch (error: any) {
        log.error(
          `Error downloading Gmail attachment ${args.attachmentId}: ${error.message || error}`
        );
        if (error instanceof UserError) throw error;
        if (error.code === 404) {
          throw new UserError('Gmail attachment not found. Check the messageId and attachmentId.');
        }
        throw new UserError(
          `Failed to download Gmail attachment: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
