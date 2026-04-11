import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getGmailClientMock } = vi.hoisted(() => ({
  getGmailClientMock: vi.fn(),
}));

vi.mock('../../clients.js', () => ({
  getGmailClient: getGmailClientMock,
}));

import { register as registerDownloadGmailAttachment } from './downloadGmailAttachment.js';
import { register as registerGetGmailMessageContent } from './getGmailMessageContent.js';
import { register as registerManageGmailFilter } from './manageGmailFilter.js';
import { register as registerSendGmailMessage } from './sendGmailMessage.js';
import {
  buildRawMimeMessage,
  extractMessageBodies,
  resolveAttachmentSavePath,
} from './common.js';

function captureTool(registerTool: (server: any) => void) {
  let config: any;
  registerTool({
    addTool(input: any) {
      config = input;
    },
  });
  return config;
}

function parseToolResult(text: string) {
  const parts = text.split('\n\n');
  return JSON.parse(parts[parts.length - 1]);
}

describe('gmail helpers', () => {
  it('extractMessageBodies reads nested text/html bodies and attachment metadata', () => {
    const extracted = extractMessageBodies({
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            {
              mimeType: 'text/plain',
              body: { data: Buffer.from('Hello text', 'utf8').toString('base64url') },
            },
            {
              mimeType: 'text/html',
              body: { data: Buffer.from('<p>Hello <strong>html</strong></p>', 'utf8').toString('base64url') },
            },
          ],
        },
        {
          filename: 'report.pdf',
          mimeType: 'application/pdf',
          partId: '2',
          body: { attachmentId: 'att-1', size: 1234 },
        },
      ],
    } as any);

    expect(extracted.textBody).toBe('Hello text');
    expect(extracted.htmlBody).toContain('<strong>html</strong>');
    expect(extracted.attachments).toEqual([
      {
        attachmentId: 'att-1',
        filename: 'report.pdf',
        mimeType: 'application/pdf',
        size: 1234,
        partId: '2',
        inline: false,
        contentId: null,
      },
    ]);
  });

  it('buildRawMimeMessage creates multipart MIME payloads with attachments', async () => {
    const built = await buildRawMimeMessage({
      to: 'user@example.com',
      subject: 'Quarterly report',
      body: '<strong>Hello</strong>',
      bodyFormat: 'html',
      attachments: [
        {
          filename: 'note.txt',
          content: Buffer.from('hello attachment', 'utf8').toString('base64'),
          mimeType: 'text/plain',
        },
      ],
    });

    const decoded = Buffer.from(built.rawMessage, 'base64url').toString('utf8');

    expect(built.attachmentCount).toBe(1);
    expect(decoded).toContain('Content-Type: multipart/mixed');
    expect(decoded).toContain('Subject: Quarterly report');
    expect(decoded).toContain('Content-Disposition: attachment; filename="note.txt"');
  });

  it('resolveAttachmentSavePath rejects paths outside the cwd', () => {
    expect(() =>
      resolveAttachmentSavePath('../outside.txt', {
        attachmentId: 'att-1',
        filename: 'report.txt',
        mimeType: 'text/plain',
        size: 10,
        partId: '1',
        inline: false,
        contentId: null,
      })
    ).toThrow('File path must be within the working directory.');
  });
});

describe('gmail tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getGmailMessageContent normalizes message bodies and attachments', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          id: 'msg-1',
          threadId: 'thread-1',
          labelIds: ['INBOX'],
          snippet: 'Preview',
          payload: {
            headers: [
              { name: 'Subject', value: 'Hello' },
              { name: 'From', value: 'alice@example.com' },
              { name: 'To', value: 'bob@example.com' },
              { name: 'Date', value: 'Fri, 11 Apr 2026 10:00:00 +0000' },
            ],
            parts: [
              {
                mimeType: 'text/plain',
                body: { data: Buffer.from('Plain body', 'utf8').toString('base64url') },
              },
              {
                filename: 'invoice.pdf',
                mimeType: 'application/pdf',
                partId: '2',
                body: { attachmentId: 'att-1', size: 42 },
              },
            ],
          },
        },
      });

    getGmailClientMock.mockResolvedValue({
      users: {
        messages: {
          get,
        },
      },
    });

    const tool = captureTool(registerGetGmailMessageContent);
    const parsed = tool.parameters.parse({ messageId: 'msg-1', bodyFormat: 'text' });
    const result = await tool.execute(parsed, { log: { info() {}, error() {} } });
    const payload = parseToolResult(result.content[0].text);

    expect(payload.message.subject).toBe('Hello');
    expect(payload.message.body).toBe('Plain body');
    expect(payload.message.attachments[0]).toMatchObject({
      attachmentId: 'att-1',
      filename: 'invoice.pdf',
    });
  });

  it('sendGmailMessage sends raw MIME payload with threadId passthrough', async () => {
    const send = vi.fn().mockResolvedValue({
      data: { id: 'msg-sent', threadId: 'thread-9', labelIds: ['SENT'] },
    });

    getGmailClientMock.mockResolvedValue({
      users: {
        messages: {
          send,
        },
      },
    });

    const tool = captureTool(registerSendGmailMessage);
    const parsed = tool.parameters.parse({
      to: 'user@example.com',
      subject: 'Hello',
      body: 'Body',
      threadId: 'thread-9',
    });
    const result = await tool.execute(parsed, { log: { info() {}, error() {} } });
    const payload = parseToolResult(result.content[0].text);

    expect(send).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: {
        raw: expect.any(String),
        threadId: 'thread-9',
      },
    });
    expect(payload).toMatchObject({
      success: true,
      messageId: 'msg-sent',
      threadId: 'thread-9',
      attachmentCount: 0,
    });
  });

  it('manageGmailFilter creates a flat filter request body', async () => {
    const create = vi.fn().mockResolvedValue({
      data: { id: 'filter-1' },
    });

    getGmailClientMock.mockResolvedValue({
      users: {
        settings: {
          filters: {
            create,
          },
        },
      },
    });

    const tool = captureTool(registerManageGmailFilter);
    const parsed = tool.parameters.parse({
      action: 'create',
      from: 'alerts@example.com',
      query: 'has:attachment',
      addLabelIds: ['Label_1'],
      removeLabelIds: ['INBOX'],
    });
    const result = await tool.execute(parsed, { log: { info() {}, error() {} } });
    const payload = parseToolResult(result.content[0].text);

    expect(create).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: {
        criteria: {
          from: 'alerts@example.com',
          to: undefined,
          subject: undefined,
          query: 'has:attachment',
          negatedQuery: undefined,
          hasAttachment: undefined,
          excludeChats: undefined,
          size: undefined,
          sizeComparison: undefined,
        },
        action: {
          forward: undefined,
          addLabelIds: ['Label_1'],
          removeLabelIds: ['INBOX'],
        },
      },
    });
    expect(payload.filter.id).toBe('filter-1');
  });

  it('downloadGmailAttachment rejects save paths outside the cwd', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        id: 'msg-1',
        payload: {
          parts: [
            {
              filename: 'invoice.pdf',
              mimeType: 'application/pdf',
              partId: '2',
              body: { attachmentId: 'att-1', size: 42 },
            },
          ],
        },
      },
    });

    const attachmentsGet = vi.fn().mockResolvedValue({
      data: { data: Buffer.from('pdf bytes', 'utf8').toString('base64url') },
    });

    getGmailClientMock.mockResolvedValue({
      users: {
        messages: {
          get,
          attachments: {
            get: attachmentsGet,
          },
        },
      },
    });

    const tool = captureTool(registerDownloadGmailAttachment);
    const parsed = tool.parameters.parse({
      messageId: 'msg-1',
      attachmentId: 'att-1',
      savePath: '../outside.txt',
    });

    await expect(tool.execute(parsed, { log: { info() {}, error() {} } })).rejects.toThrow(
      'File path must be within the working directory.'
    );
  });
});
