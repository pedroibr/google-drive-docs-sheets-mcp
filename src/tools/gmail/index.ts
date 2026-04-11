import type { FastMCP } from 'fastmcp';
import { register as searchGmailMessages } from './searchGmailMessages.js';
import { register as getGmailMessageContent } from './getGmailMessageContent.js';
import { register as getGmailMessagesContentBatch } from './getGmailMessagesContentBatch.js';
import { register as downloadGmailAttachment } from './downloadGmailAttachment.js';
import { register as sendGmailMessage } from './sendGmailMessage.js';
import { register as draftGmailMessage } from './draftGmailMessage.js';
import { register as getGmailThreadContent } from './getGmailThreadContent.js';
import { register as getGmailThreadsContentBatch } from './getGmailThreadsContentBatch.js';
import { register as listGmailLabels } from './listGmailLabels.js';
import { register as manageGmailLabel } from './manageGmailLabel.js';
import { register as listGmailFilters } from './listGmailFilters.js';
import { register as manageGmailFilter } from './manageGmailFilter.js';
import { register as modifyGmailMessageLabels } from './modifyGmailMessageLabels.js';
import { register as batchModifyGmailMessageLabels } from './batchModifyGmailMessageLabels.js';

export function registerGmailTools(server: FastMCP) {
  searchGmailMessages(server);
  getGmailMessageContent(server);
  getGmailMessagesContentBatch(server);
  downloadGmailAttachment(server);
  sendGmailMessage(server);
  draftGmailMessage(server);
  getGmailThreadContent(server);
  getGmailThreadsContentBatch(server);
  listGmailLabels(server);
  manageGmailLabel(server);
  listGmailFilters(server);
  manageGmailFilter(server);
  modifyGmailMessageLabels(server);
  batchModifyGmailMessageLabels(server);
}
