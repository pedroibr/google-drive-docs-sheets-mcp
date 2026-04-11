import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { getGmailClient } from '../../clients.js';
import { dataResult } from '../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'listGmailFilters',
    description:
      'Lists configured Gmail filters with normalized criteria and actions, including label changes, forwarding, and query conditions.',
    parameters: undefined,
    execute: async (_args, { log }) => {
      const gmail = await getGmailClient();
      log.info('Listing Gmail filters');

      try {
        const response = await gmail.users.settings.filters.list({ userId: 'me' });
        const filters = (response.data.filter ?? []).map((filter) => ({
          id: filter.id ?? null,
          criteria: {
            from: filter.criteria?.from ?? null,
            to: filter.criteria?.to ?? null,
            subject: filter.criteria?.subject ?? null,
            query: filter.criteria?.query ?? null,
            negatedQuery: filter.criteria?.negatedQuery ?? null,
            hasAttachment: filter.criteria?.hasAttachment ?? false,
            excludeChats: filter.criteria?.excludeChats ?? false,
            size: filter.criteria?.size ?? null,
            sizeComparison: filter.criteria?.sizeComparison ?? null,
          },
          action: {
            addLabelIds: filter.action?.addLabelIds ?? [],
            removeLabelIds: filter.action?.removeLabelIds ?? [],
            forward: filter.action?.forward ?? null,
          },
        }));

        return dataResult(
          {
            filters,
            total: filters.length,
          },
          `Listed ${filters.length} Gmail filter(s) successfully.`
        );
      } catch (error: any) {
        log.error(`Error listing Gmail filters: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to list Gmail filters: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
