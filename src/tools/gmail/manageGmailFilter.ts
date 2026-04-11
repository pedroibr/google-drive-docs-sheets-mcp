import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getGmailClient } from '../../clients.js';
import { mutationResult } from '../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'manageGmailFilter',
    description:
      'Creates or deletes a Gmail filter. Filter creation uses flat criteria and action fields instead of nested JSON.',
    parameters: z.object({
      action: z.enum(['create', 'delete']).describe('Filter action to perform.'),
      filterId: z.string().optional().describe('Required when action="delete".'),
      from: z.string().optional().describe('Optional filter criterion for sender address.'),
      to: z.string().optional().describe('Optional filter criterion for recipient address.'),
      subject: z.string().optional().describe('Optional filter criterion for subject text.'),
      query: z
        .string()
        .optional()
        .describe('Optional Gmail query criterion, for example "has:attachment".'),
      negatedQuery: z
        .string()
        .optional()
        .describe('Optional negated Gmail query criterion.'),
      hasAttachment: z.boolean().optional().describe('Optional criterion requiring attachments.'),
      excludeChats: z.boolean().optional().describe('Optional criterion excluding chats.'),
      size: z.number().int().positive().optional().describe('Optional message size in bytes.'),
      sizeComparison: z
        .enum(['larger', 'smaller'])
        .optional()
        .describe('Optional size comparison for the size filter.'),
      forward: z.string().optional().describe('Optional forwarding address action.'),
      addLabelIds: z.array(z.string()).optional().describe('Optional list of label IDs to add.'),
      removeLabelIds: z
        .array(z.string())
        .optional()
        .describe('Optional list of label IDs to remove.'),
    }),
    execute: async (args, { log }) => {
      const gmail = await getGmailClient();
      log.info(`Managing Gmail filter action=${args.action}`);

      try {
        if (args.action === 'delete') {
          if (!args.filterId) throw new UserError('filterId is required when action="delete".');
          await gmail.users.settings.filters.delete({
            userId: 'me',
            id: args.filterId,
          });
          return mutationResult('Deleted Gmail filter successfully.', {
            action: args.action,
            filterId: args.filterId,
          });
        }

        const criteria = {
          from: args.from,
          to: args.to,
          subject: args.subject,
          query: args.query,
          negatedQuery: args.negatedQuery,
          hasAttachment: args.hasAttachment,
          excludeChats: args.excludeChats,
          size: args.size,
          sizeComparison: args.sizeComparison,
        };
        const action = {
          forward: args.forward,
          addLabelIds: args.addLabelIds,
          removeLabelIds: args.removeLabelIds,
        };

        const hasCriteria = Object.values(criteria).some((value) => value !== undefined);
        const hasAction = Object.values(action).some(
          (value) =>
            value !== undefined && (!Array.isArray(value) || value.length > 0) && value !== null
        );

        if (!hasCriteria) {
          throw new UserError('At least one filter criterion must be provided when action="create".');
        }
        if (!hasAction) {
          throw new UserError('At least one filter action must be provided when action="create".');
        }

        const response = await gmail.users.settings.filters.create({
          userId: 'me',
          requestBody: {
            criteria,
            action,
          },
        });

        return mutationResult('Created Gmail filter successfully.', {
          action: args.action,
          filter: response.data,
        });
      } catch (error: any) {
        log.error(`Error managing Gmail filter: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to manage Gmail filter: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
