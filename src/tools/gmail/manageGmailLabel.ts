import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getGmailClient } from '../../clients.js';
import { mutationResult } from '../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'manageGmailLabel',
    description:
      'Creates, updates, or deletes a Gmail label. For update/delete, provide labelId. For create, provide name.',
    parameters: z.object({
      action: z.enum(['create', 'update', 'delete']).describe('Label action to perform.'),
      labelId: z.string().optional().describe('Required for update and delete.'),
      name: z.string().optional().describe('Required for create. Optional for update.'),
      labelListVisibility: z
        .enum(['labelShow', 'labelHide', 'labelShowIfUnread'])
        .optional()
        .default('labelShow')
        .describe('Visibility of the label in the Gmail label list.'),
      messageListVisibility: z
        .enum(['show', 'hide'])
        .optional()
        .default('show')
        .describe('Visibility of the label in the Gmail message list.'),
    }),
    execute: async (args, { log }) => {
      const gmail = await getGmailClient();
      log.info(`Managing Gmail label action=${args.action}`);

      try {
        if (args.action === 'create') {
          if (!args.name) throw new UserError('name is required when action="create".');
          const response = await gmail.users.labels.create({
            userId: 'me',
            requestBody: {
              name: args.name,
              labelListVisibility: args.labelListVisibility,
              messageListVisibility: args.messageListVisibility,
            },
          });
          return mutationResult('Created Gmail label successfully.', {
            action: args.action,
            label: response.data,
          });
        }

        if (!args.labelId) {
          throw new UserError('labelId is required when action is update or delete.');
        }

        if (args.action === 'update') {
          const current = await gmail.users.labels.get({ userId: 'me', id: args.labelId });
          const response = await gmail.users.labels.update({
            userId: 'me',
            id: args.labelId,
            requestBody: {
              id: args.labelId,
              name: args.name ?? current.data.name,
              labelListVisibility: args.labelListVisibility,
              messageListVisibility: args.messageListVisibility,
            },
          });
          return mutationResult('Updated Gmail label successfully.', {
            action: args.action,
            label: response.data,
          });
        }

        await gmail.users.labels.delete({ userId: 'me', id: args.labelId });
        return mutationResult('Deleted Gmail label successfully.', {
          action: args.action,
          labelId: args.labelId,
        });
      } catch (error: any) {
        log.error(`Error managing Gmail label: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to manage Gmail label: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
