import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDriveClient } from '../../clients.js';
import { escapeDriveQuery } from '../../driveQueryUtils.js';
import { dataResult } from '../../tooling.js';

type DiscoveryAliasOptions = {
  toolName: string;
  mimeType: string;
  singularLabel: string;
  pluralLabel: string;
  preferredListTool: string;
  preferredSearchTool: string;
  preferredMimeAlias: string;
};

function listDescription(options: DiscoveryAliasOptions): string {
  return (
    `Lists ${options.pluralLabel} in your Drive. ` +
    `This is a product-focused discovery wrapper over ${options.preferredListTool} with mimeType "${options.preferredMimeAlias}". ` +
    `By default it returns the most recently edited ${options.pluralLabel} first.`
  );
}

function searchDescription(options: DiscoveryAliasOptions): string {
  return (
    `Searches ${options.pluralLabel} by name, content, or both. ` +
    `This is a product-focused discovery wrapper over ${options.preferredSearchTool} with mimeType "${options.preferredMimeAlias}". ` +
    `Results are sorted by the most recently edited ${options.pluralLabel} first by default.`
  );
}

const listParameters = z.object({
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(10)
    .describe('Maximum number of results to return (1-100).'),
  query: z.string().optional().describe('Optional search term to filter by name or content.'),
  orderBy: z
    .enum(['name', 'modifiedTime', 'createdTime'])
    .optional()
    .default('modifiedTime')
    .describe('Field to sort results by.'),
  sortDirection: z
    .enum(['asc', 'desc'])
    .optional()
    .default('desc')
    .describe('Sort direction: "asc" for oldest first, "desc" for newest first (default).'),
  modifiedAfter: z
    .string()
    .optional()
    .describe('Only return results modified after this date (ISO 8601 format, e.g. "2024-01-01").'),
});

const searchParameters = z.object({
  query: z.string().min(1).describe('Search term to find in file names or content.'),
  searchIn: z
    .enum(['name', 'content', 'both'])
    .optional()
    .default('both')
    .describe('Where to search: file names, content, or both.'),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(10)
    .describe('Maximum number of results to return (1-100).'),
  orderBy: z
    .enum(['name', 'modifiedTime', 'createdTime'])
    .optional()
    .default('modifiedTime')
    .describe('Field to sort results by.'),
  sortDirection: z
    .enum(['asc', 'desc'])
    .optional()
    .default('desc')
    .describe('Sort direction: "asc" for oldest first, "desc" for newest first (default).'),
  modifiedAfter: z
    .string()
    .optional()
    .describe('Only return results modified after this date (ISO 8601 format, e.g. "2024-01-01").'),
});

export function registerListByMimeType(server: FastMCP, options: DiscoveryAliasOptions) {
  server.addTool({
    name: options.toolName,
    description: listDescription(options),
    parameters: listParameters,
    execute: async (args, { log }) => {
      const drive = await getDriveClient();
      log.info(
        `Listing ${options.pluralLabel}. Query: ${args.query || 'none'}, Max: ${args.maxResults}, Order: ${args.orderBy} ${args.sortDirection}`
      );

      try {
        let queryString = `mimeType='${options.mimeType}' and trashed=false`;
        if (args.query) {
          queryString += ` and (name contains '${escapeDriveQuery(args.query)}' or fullText contains '${escapeDriveQuery(args.query)}')`;
        }
        if (args.modifiedAfter) {
          const cutoffDate = new Date(args.modifiedAfter).toISOString();
          queryString += ` and modifiedTime > '${escapeDriveQuery(cutoffDate)}'`;
        }

        const orderByParam = args.sortDirection === 'desc' ? `${args.orderBy} desc` : args.orderBy;
        const response = await drive.files.list({
          q: queryString,
          pageSize: args.maxResults,
          orderBy: orderByParam,
          fields:
            'files(id,name,modifiedTime,createdTime,size,webViewLink,owners(displayName,emailAddress))',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });

        const files = response.data.files || [];
        const results = files.map((file) => ({
          id: file.id,
          name: file.name,
          modifiedTime: file.modifiedTime,
          owner: file.owners?.[0]?.displayName || null,
          url: file.webViewLink,
        }));

        return dataResult(
          {
            [options.pluralLabel]: results,
            total: results.length,
            mimeType: options.mimeType,
            filters: {
              query: args.query ?? null,
              orderBy: args.orderBy,
              sortDirection: args.sortDirection,
              modifiedAfter: args.modifiedAfter ?? null,
            },
          },
          `Listed ${results.length} ${options.pluralLabel} successfully.`
        );
      } catch (error: any) {
        log.error(`Error listing ${options.pluralLabel}: ${error.message || error}`);
        if (error.code === 403) {
          throw new UserError(
            'Permission denied. Make sure you have granted Google Drive access to the application.'
          );
        }
        throw new UserError(`Failed to list ${options.pluralLabel}: ${error.message || 'Unknown error'}`);
      }
    },
  });
}

export function registerSearchByMimeType(server: FastMCP, options: DiscoveryAliasOptions) {
  server.addTool({
    name: options.toolName,
    description: searchDescription(options),
    parameters: searchParameters,
    execute: async (args, { log }) => {
      const drive = await getDriveClient();
      log.info(
        `Searching ${options.pluralLabel} for: "${args.query}" in ${args.searchIn}, Order: ${args.orderBy} ${args.sortDirection}`
      );

      try {
        let queryString = `mimeType='${options.mimeType}' and trashed=false`;
        if (args.searchIn === 'name') {
          queryString += ` and name contains '${escapeDriveQuery(args.query)}'`;
        } else if (args.searchIn === 'content') {
          queryString += ` and fullText contains '${escapeDriveQuery(args.query)}'`;
        } else {
          queryString += ` and (name contains '${escapeDriveQuery(args.query)}' or fullText contains '${escapeDriveQuery(args.query)}')`;
        }
        if (args.modifiedAfter) {
          const cutoff = new Date(args.modifiedAfter).toISOString();
          queryString += ` and modifiedTime > '${escapeDriveQuery(cutoff)}'`;
        }

        const orderByParam = args.sortDirection === 'desc' ? `${args.orderBy} desc` : args.orderBy;
        const response = await drive.files.list({
          q: queryString,
          pageSize: args.maxResults,
          orderBy: orderByParam,
          fields: 'files(id,name,modifiedTime,createdTime,webViewLink,owners(displayName),parents)',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });

        const files = response.data.files || [];
        const results = files.map((file) => ({
          id: file.id,
          name: file.name,
          modifiedTime: file.modifiedTime,
          owner: file.owners?.[0]?.displayName || null,
          url: file.webViewLink,
        }));

        return dataResult(
          {
            [options.pluralLabel]: results,
            total: results.length,
            mimeType: options.mimeType,
            filters: {
              query: args.query,
              searchIn: args.searchIn,
              orderBy: args.orderBy,
              sortDirection: args.sortDirection,
              modifiedAfter: args.modifiedAfter ?? null,
            },
          },
          `Found ${results.length} matching ${options.pluralLabel}.`
        );
      } catch (error: any) {
        log.error(`Error searching ${options.pluralLabel}: ${error.message || error}`);
        if (error.code === 403) {
          throw new UserError(
            'Permission denied. Make sure you have granted Google Drive access to the application.'
          );
        }
        throw new UserError(`Failed to search ${options.pluralLabel}: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
