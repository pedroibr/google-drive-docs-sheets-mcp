import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { drive_v3 } from 'googleapis';
import { getDriveClient } from '../../../clients.js';
import { mutationResult } from '../../../tooling.js';

const PRESENTATION_MIME_TYPE = 'application/vnd.google-apps.presentation';

export function register(server: FastMCP) {
  server.addTool({
    name: 'copyPresentation',
    description:
      'Creates a copy of an existing Google Slides presentation, optionally renaming it and placing it in a target folder.',
    parameters: z.object({
      sourcePresentationId: z
        .string()
        .describe(
          'The source presentation ID — the long string between /d/ and /edit in a Google Slides URL.'
        ),
      title: z
        .string()
        .optional()
        .describe('Optional title for the copied presentation. Defaults to "Copy of [original]".'),
      parentFolderId: z
        .string()
        .optional()
        .describe('Optional Drive folder ID to place the copied presentation into.'),
    }),
    execute: async (args, { log }) => {
      const drive = await getDriveClient();
      log.info(`Copying presentation ${args.sourcePresentationId}`);

      try {
        const sourceFile = await drive.files.get({
          fileId: args.sourcePresentationId,
          fields: 'name,mimeType,parents',
          supportsAllDrives: true,
        });

        if (sourceFile.data.mimeType !== PRESENTATION_MIME_TYPE) {
          throw new UserError(
            `File ${args.sourcePresentationId} is not a Google Slides presentation.`
          );
        }

        const copyMetadata: drive_v3.Schema$File = {
          name: args.title || `Copy of ${sourceFile.data.name}`,
        };

        if (args.parentFolderId) {
          copyMetadata.parents = [args.parentFolderId];
        } else if (sourceFile.data.parents) {
          copyMetadata.parents = sourceFile.data.parents;
        }

        const response = await drive.files.copy({
          fileId: args.sourcePresentationId,
          requestBody: copyMetadata,
          fields: 'id,name,webViewLink',
          supportsAllDrives: true,
        });

        return mutationResult('Copied presentation successfully.', {
          presentationId: response.data.id,
          name: response.data.name,
          url: response.data.webViewLink,
          sourcePresentationId: args.sourcePresentationId,
          parentFolderId: args.parentFolderId ?? sourceFile.data.parents?.[0] ?? null,
        });
      } catch (error: any) {
        log.error(`Error copying presentation: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        if (error.code === 404) {
          throw new UserError('Source presentation or destination folder not found.');
        }
        if (error.code === 403) {
          throw new UserError(
            'Permission denied. Make sure you can read the source presentation and write to the destination.'
          );
        }
        throw new UserError(`Failed to copy presentation: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
