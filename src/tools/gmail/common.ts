import fs from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { UserError } from 'fastmcp';
import type { gmail_v1 } from 'googleapis';
import { z } from 'zod';

export type GmailBodyFormat = 'text' | 'html' | 'raw';
export type GmailComposeBodyFormat = 'plain' | 'html';

export const GMAIL_BATCH_LIMIT = 25;
export const MAX_SEARCH_RESULTS = 100;
export const MAX_ATTACHMENT_TEXT_EXTRACT_BYTES = 50_000;

export const IdListSchema = z
  .array(z.string().min(1))
  .min(1)
  .max(GMAIL_BATCH_LIMIT)
  .describe(`List of Gmail IDs. Maximum ${GMAIL_BATCH_LIMIT} entries per call.`);

export const GmailBodyFormatSchema = z
  .enum(['text', 'html', 'raw'])
  .optional()
  .default('text')
  .describe(
    "Message body format: 'text' for plain text, 'html' for HTML when available, or 'raw' for the full decoded MIME source."
  );

export const GmailComposeBodyFormatSchema = z
  .enum(['plain', 'html'])
  .optional()
  .default('plain')
  .describe("Outgoing message body format. Use 'plain' for text or 'html' for HTML.");

export const AttachmentInputSchema = z.object({
  path: z
    .string()
    .optional()
    .describe('Optional absolute or relative local file path to attach.'),
  content: z
    .string()
    .optional()
    .describe('Optional standard base64-encoded attachment content.'),
  filename: z
    .string()
    .optional()
    .describe('Optional attachment filename. Required when content is provided directly.'),
  mimeType: z.string().optional().describe('Optional MIME type override for the attachment.'),
});

export interface NormalizedAttachment {
  attachmentId: string | null;
  filename: string | null;
  mimeType: string | null;
  size: number | null;
  partId: string | null;
  inline: boolean;
  contentId: string | null;
}

export interface NormalizedMessage {
  messageId: string | null;
  threadId: string | null;
  snippet: string | null;
  labelIds: string[];
  internalDate: string | null;
  historyId: string | null;
  sizeEstimate: number | null;
  subject: string | null;
  from: string | null;
  to: string | null;
  cc: string | null;
  bcc: string | null;
  date: string | null;
  messageHeaderId: string | null;
  replyTo: string | null;
  bodyFormat: GmailBodyFormat;
  body: string | null;
  attachments: NormalizedAttachment[];
  url: string | null;
}

function decodeBase64Url(input?: string | null): Buffer {
  if (!input) return Buffer.alloc(0);
  return Buffer.from(input, 'base64url');
}

function decodeBodyData(input?: string | null): string | null {
  if (!input) return null;
  const decoded = decodeBase64Url(input).toString('utf8');
  return decoded.length > 0 ? decoded : null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<li>/gi, '- ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

function getHeaderValue(
  headers: gmail_v1.Schema$MessagePartHeader[] | null | undefined,
  name: string
): string | null {
  const header = headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase());
  return header?.value ?? null;
}

function walkParts(
  payload: gmail_v1.Schema$MessagePart | undefined,
  visitor: (part: gmail_v1.Schema$MessagePart) => void
): void {
  if (!payload) return;
  visitor(payload);
  for (const part of payload.parts ?? []) {
    walkParts(part, visitor);
  }
}

export function extractAttachments(
  payload: gmail_v1.Schema$MessagePart | undefined
): NormalizedAttachment[] {
  const attachments: NormalizedAttachment[] = [];

  walkParts(payload, (part) => {
    const attachmentId = part.body?.attachmentId ?? null;
    const filename = part.filename?.trim() || null;
    if (!attachmentId && !filename) return;

    attachments.push({
      attachmentId,
      filename,
      mimeType: part.mimeType ?? null,
      size: part.body?.size ?? null,
      partId: part.partId ?? null,
      inline: part.headers?.some((header) => header.name?.toLowerCase() === 'content-id') ?? false,
      contentId: getHeaderValue(part.headers, 'Content-ID'),
    });
  });

  return attachments;
}

export function extractMessageBodies(payload: gmail_v1.Schema$MessagePart | undefined): {
  textBody: string | null;
  htmlBody: string | null;
  attachments: NormalizedAttachment[];
} {
  const textBodies: string[] = [];
  const htmlBodies: string[] = [];

  walkParts(payload, (part) => {
    const bodyData = decodeBodyData(part.body?.data);
    if (!bodyData) return;
    if (part.mimeType === 'text/plain') {
      textBodies.push(bodyData);
      return;
    }
    if (part.mimeType === 'text/html') {
      htmlBodies.push(bodyData);
    }
  });

  return {
    textBody: textBodies.length > 0 ? textBodies.join('\n\n').trim() : null,
    htmlBody: htmlBodies.length > 0 ? htmlBodies.join('\n\n').trim() : null,
    attachments: extractAttachments(payload),
  };
}

export async function fetchRawMessageContent(
  gmail: gmail_v1.Gmail,
  messageId: string
): Promise<string | null> {
  const response = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'raw',
  });
  return decodeBodyData(response.data.raw);
}

export function generateGmailWebUrl(itemId: string | null | undefined): string | null {
  if (!itemId) return null;
  return `https://mail.google.com/mail/u/0/#all/${itemId}`;
}

export function normalizeMessage(
  message: gmail_v1.Schema$Message,
  bodyFormat: GmailBodyFormat,
  rawContent?: string | null
): NormalizedMessage {
  const payload = message.payload;
  const headers = payload?.headers;
  const extracted = extractMessageBodies(payload);

  let body: string | null = null;
  if (bodyFormat === 'raw') {
    body = rawContent ?? null;
  } else if (bodyFormat === 'html') {
    body = extracted.htmlBody ?? extracted.textBody;
  } else {
    body = extracted.textBody ?? (extracted.htmlBody ? htmlToText(extracted.htmlBody) : null);
  }

  return {
    messageId: message.id ?? null,
    threadId: message.threadId ?? null,
    snippet: message.snippet ?? null,
    labelIds: message.labelIds ?? [],
    internalDate: message.internalDate ?? null,
    historyId: message.historyId ?? null,
    sizeEstimate: message.sizeEstimate ?? null,
    subject: getHeaderValue(headers, 'Subject'),
    from: getHeaderValue(headers, 'From'),
    to: getHeaderValue(headers, 'To'),
    cc: getHeaderValue(headers, 'Cc'),
    bcc: getHeaderValue(headers, 'Bcc'),
    date: getHeaderValue(headers, 'Date'),
    messageHeaderId: getHeaderValue(headers, 'Message-ID'),
    replyTo: getHeaderValue(headers, 'Reply-To'),
    bodyFormat,
    body,
    attachments: extracted.attachments,
    url: generateGmailWebUrl(message.id),
  };
}

export function normalizeThread(
  thread: gmail_v1.Schema$Thread,
  bodyFormat: GmailBodyFormat,
  rawMessageMap: Record<string, string | null> = {}
) {
  const messages = (thread.messages ?? []).map((message) =>
    normalizeMessage(message, bodyFormat, rawMessageMap[message.id ?? ''] ?? null)
  );

  return {
    threadId: thread.id ?? null,
    historyId: thread.historyId ?? null,
    messageCount: messages.length,
    messages,
    url: generateGmailWebUrl(thread.id),
  };
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'attachment';
}

function ensureWithinCwd(filePath: string): string {
  const cwd = path.resolve(process.cwd());
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
    throw new UserError('File path must be within the working directory.');
  }
  return resolved;
}

function extensionFromMimeType(mimeType: string | null | undefined): string {
  switch (mimeType) {
    case 'text/plain':
      return '.txt';
    case 'text/html':
      return '.html';
    case 'application/pdf':
      return '.pdf';
    case 'image/png':
      return '.png';
    case 'image/jpeg':
      return '.jpg';
    case 'application/json':
      return '.json';
    default:
      return '';
  }
}

export function resolveAttachmentSavePath(
  savePath: string | undefined,
  attachment: NormalizedAttachment
): string {
  if (savePath) return ensureWithinCwd(savePath);

  const baseName =
    attachment.filename?.trim() ||
    `gmail-attachment-${attachment.attachmentId ?? attachment.partId ?? 'download'}`;
  const ext = path.extname(baseName) || extensionFromMimeType(attachment.mimeType);
  const filename = path.extname(baseName) ? baseName : `${baseName}${ext}`;
  return ensureWithinCwd(path.join(process.cwd(), sanitizeFilename(filename)));
}

export function saveAttachmentToDisk(params: {
  base64urlData: string;
  savePath: string;
  mimeType: string | null;
  extractText?: boolean;
}) {
  const buffer = decodeBase64Url(params.base64urlData);
  fs.mkdirSync(path.dirname(params.savePath), { recursive: true });
  fs.writeFileSync(params.savePath, buffer);

  let textContent: string | null = null;
  if (
    params.extractText !== false &&
    (params.mimeType?.startsWith('text/') || params.mimeType === 'application/json')
  ) {
    textContent = buffer.toString('utf8').slice(0, MAX_ATTACHMENT_TEXT_EXTRACT_BYTES);
  }

  return {
    sizeBytes: buffer.length,
    textContent,
  };
}

function encodeHeaderValue(value: string): string {
  return value.replace(/\r?\n/g, ' ').trim();
}

function formatFromHeader(fromEmail: string | undefined, fromName: string | undefined): string | null {
  if (!fromEmail) return null;
  if (!fromName) return fromEmail;
  return `${encodeHeaderValue(fromName)} <${fromEmail}>`;
}

function chunkBase64(value: string): string {
  return value.replace(/.{1,76}/g, '$&\r\n').trimEnd();
}

function guessMimeTypeFromPath(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.txt':
      return 'text/plain';
    case '.html':
    case '.htm':
      return 'text/html';
    case '.json':
      return 'application/json';
    case '.pdf':
      return 'application/pdf';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.csv':
      return 'text/csv';
    default:
      return 'application/octet-stream';
  }
}

export async function prepareOutgoingAttachments(
  attachments: z.infer<typeof AttachmentInputSchema>[] | undefined
): Promise<Array<{ filename: string; mimeType: string; contentBase64: string }>> {
  const prepared: Array<{ filename: string; mimeType: string; contentBase64: string }> = [];

  for (const attachment of attachments ?? []) {
    const hasPath = !!attachment.path;
    const hasContent = !!attachment.content;
    if (hasPath === hasContent) {
      throw new UserError(
        'Each attachment must provide exactly one of path or content.'
      );
    }

    if (attachment.path) {
      const fileBuffer = await fs.promises.readFile(attachment.path);
      prepared.push({
        filename: attachment.filename ?? path.basename(attachment.path),
        mimeType: attachment.mimeType ?? guessMimeTypeFromPath(attachment.path),
        contentBase64: fileBuffer.toString('base64'),
      });
      continue;
    }

    if (!attachment.filename) {
      throw new UserError('filename is required when attachment content is provided directly.');
    }

    try {
      Buffer.from(attachment.content!, 'base64');
    } catch {
      throw new UserError(`Attachment "${attachment.filename}" does not contain valid base64.`);
    }

    prepared.push({
      filename: attachment.filename,
      mimeType: attachment.mimeType ?? 'application/octet-stream',
      contentBase64: attachment.content!,
    });
  }

  return prepared;
}

export async function buildRawMimeMessage(params: {
  to?: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  bodyFormat: GmailComposeBodyFormat;
  fromEmail?: string;
  fromName?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: z.infer<typeof AttachmentInputSchema>[];
}): Promise<{ rawMessage: string; attachmentCount: number }> {
  const headers = [
    `Subject: ${encodeHeaderValue(params.subject)}`,
    'MIME-Version: 1.0',
  ];

  if (params.to) headers.push(`To: ${encodeHeaderValue(params.to)}`);
  if (params.cc) headers.push(`Cc: ${encodeHeaderValue(params.cc)}`);
  if (params.bcc) headers.push(`Bcc: ${encodeHeaderValue(params.bcc)}`);

  const fromHeader = formatFromHeader(params.fromEmail, params.fromName);
  if (fromHeader) headers.push(`From: ${fromHeader}`);
  if (params.inReplyTo) headers.push(`In-Reply-To: ${encodeHeaderValue(params.inReplyTo)}`);
  if (params.references) headers.push(`References: ${encodeHeaderValue(params.references)}`);

  const preparedAttachments = await prepareOutgoingAttachments(params.attachments);
  const contentType =
    params.bodyFormat === 'html' ? 'text/html; charset="UTF-8"' : 'text/plain; charset="UTF-8"';

  let mime = '';

  if (preparedAttachments.length === 0) {
    mime = `${headers.join('\r\n')}\r\nContent-Type: ${contentType}\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${params.body}`;
  } else {
    const boundary = `gmail-mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    mime = `${headers.join('\r\n')}\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
    mime += `--${boundary}\r\nContent-Type: ${contentType}\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${params.body}\r\n`;

    for (const attachment of preparedAttachments) {
      const safeFilename = encodeHeaderValue(attachment.filename);
      mime += `--${boundary}\r\n`;
      mime += `Content-Type: ${attachment.mimeType}; name="${safeFilename}"\r\n`;
      mime += `Content-Disposition: attachment; filename="${safeFilename}"\r\n`;
      mime += 'Content-Transfer-Encoding: base64\r\n\r\n';
      mime += `${chunkBase64(attachment.contentBase64)}\r\n`;
    }

    mime += `--${boundary}--`;
  }

  return {
    rawMessage: Buffer.from(mime, 'utf8').toString('base64url'),
    attachmentCount: preparedAttachments.length,
  };
}

export async function fetchMessageMetadataList(
  gmail: gmail_v1.Gmail,
  messageIds: string[]
): Promise<gmail_v1.Schema$Message[]> {
  return Promise.all(
    messageIds.map(async (messageId) => {
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Cc', 'Bcc', 'Date', 'Subject', 'Message-ID', 'Reply-To'],
      });
      return response.data;
    })
  );
}
