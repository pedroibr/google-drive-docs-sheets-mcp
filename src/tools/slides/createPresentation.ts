import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDriveClient, getSlidesClient } from '../../clients.js';
import { mutationResult } from '../../tooling.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'createPresentation',
    description:
      'Creates a new Google Slides presentation. Optionally moves it to a specific Drive folder after creation.',
    parameters: z.object({
      title: z.string().min(1).describe('Title for the new presentation.'),
      parentFolderId: z
        .string()
        .optional()
        .describe(
          'Optional Drive folder ID to move the presentation into after creation. If omitted, the presentation stays in Drive root/My Drive.'
        ),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      const drive = await getDriveClient();
      log.info(`Creating new presentation "${args.title}"`);

      try {
        const response = await slides.presentations.create({
          requestBody: {
            title: args.title,
          },
        });

        const presentationId = response.data.presentationId;
        if (!presentationId) {
          throw new UserError('Failed to create presentation - no ID returned.');
        }

        if (args.parentFolderId) {
          const fileInfo = await drive.files.get({
            fileId: presentationId,
            fields: 'parents',
            supportsAllDrives: true,
          });

          const currentParents = fileInfo.data.parents || [];

          await drive.files.update({
            fileId: presentationId,
            addParents: args.parentFolderId,
            ...(currentParents.length > 0 ? { removeParents: currentParents.join(',') } : {}),
            fields: 'id,parents',
            supportsAllDrives: true,
          });
        }

        return mutationResult('Created presentation successfully.', {
          id: presentationId,
          name: response.data.title ?? args.title,
          url: `https://docs.google.com/presentation/d/${presentationId}/edit`,
          slideCount: response.data.slides?.length ?? 0,
          parentFolderId: args.parentFolderId ?? null,
        });
      } catch (error: any) {
        log.error(`Error creating presentation: ${error.message || error}`);
        if (error.code === 404) {
          throw new UserError('Parent folder not found. Check the folder ID.');
        }
        if (error.code === 403) {
          throw new UserError(
            'Permission denied. Make sure you have access to Google Slides and write access to the destination folder.'
          );
        }
        throw new UserError(
          `Failed to create presentation: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
