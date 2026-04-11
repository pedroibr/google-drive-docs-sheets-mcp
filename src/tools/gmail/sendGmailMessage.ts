import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getGmailClient } from '../../clients.js';
import { mutationResult } from '../../tooling.js';
import { AttachmentInputSchema, buildRawMimeMessage, GmailComposeBodyFormatSchema } from './common.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'sendGmailMessage',
    description:
      'Sends a Gmail message. Supports plain text or HTML bodies, replies via thread headers, optional sender alias fields, and optional attachments.',
    parameters: z.object({
      to: z.string().min(1).describe('Recipient email address or comma-separated recipient list.'),
      subject: z.string().min(1).describe('Email subject line.'),
      body: z.string().describe('Email body content.'),
      bodyFormat: GmailComposeBodyFormatSchema,
      cc: z.string().optional().describe('Optional CC email address or comma-separated list.'),
      bcc: z.string().optional().describe('Optional BCC email address or comma-separated list.'),
      fromName: z.string().optional().describe('Optional sender display name.'),
      fromEmail: z
        .string()
        .email()
        .optional()
        .describe('Optional Gmail Send As alias email address.'),
      threadId: z
        .string()
        .optional()
        .describe('Optional Gmail thread ID. Use when sending a reply in an existing thread.'),
      inReplyTo: z
        .string()
        .optional()
        .describe('Optional RFC Message-ID of the message being replied to.'),
      references: z
        .string()
        .optional()
        .describe('Optional RFC Message-ID chain for threading.'),
      attachments: z
        .array(AttachmentInputSchema)
        .optional()
        .describe('Optional list of attachments. Each item must provide exactly one of path or content.'),
    }),
    execute: async (args, { log }) => {
      const gmail = await getGmailClient();
      log.info(`Sending Gmail message subject="${args.subject}"`);

      try {
        const { rawMessage, attachmentCount } = await buildRawMimeMessage({
          to: args.to,
          cc: args.cc,
          bcc: args.bcc,
          subject: args.subject,
          body: args.body,
          bodyFormat: args.bodyFormat,
          fromEmail: args.fromEmail,
          fromName: args.fromName,
          inReplyTo: args.inReplyTo,
          references: args.references,
          attachments: args.attachments,
        });

        const response = await gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: rawMessage,
            threadId: args.threadId,
          },
        });

        return mutationResult('Sent Gmail message successfully.', {
          messageId: response.data.id ?? null,
          threadId: response.data.threadId ?? args.threadId ?? null,
          labelIds: response.data.labelIds ?? [],
          attachmentCount,
        });
      } catch (error: any) {
        log.error(`Error sending Gmail message: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to send Gmail message: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
