# Drive

Tools for managing files and folders in Google Drive, including canonical discovery flows for recent files, targeted searches, and file/folder lifecycle operations.

Drive tools now return structured metadata objects instead of JSON-stringified blobs.

## Preferred discovery tools

Use these first for human requests like "recent docs", "recent sheets", or "recent PDFs":

| Tool               | Description                                                                 |
| ------------------ | --------------------------------------------------------------------------- |
| `listDriveFiles`   | Preferred list/browse tool for all Drive file types; defaults to most recently edited first |
| `searchDriveFiles` | Preferred search tool when the user provides a term; defaults to most recently edited first |

The `mimeType` field accepts human-friendly aliases such as `docs`, `sheets`, `slides`, `folders`, `pdfs`, and also full MIME types.

## File and folder operations

| Tool                         | Description                                                                |
| ---------------------------- | -------------------------------------------------------------------------- |
| `getDocumentInfo`            | Gets metadata about a document (owner, sharing, modification history)      |
| `createDocument`             | Creates a new empty Google Document                                        |
| `createDocumentFromTemplate` | Creates a new document by copying a template with placeholder replacements |
| `createFolder`               | Creates a new folder in Google Drive                                       |
| `listFolderContents`         | Lists files and subfolders within a Drive folder                           |
| `getFolderInfo`              | Gets metadata about a Drive folder                                         |
| `moveFile`                   | Moves a file or folder to a different Drive folder                         |
| `copyFile`                   | Creates a copy of a file or document                                       |
| `renameFile`                 | Renames a file or folder                                                   |
| `deleteFile`                 | Moves a file or folder to the trash, or permanently deletes it             |
| `downloadFile`               | Downloads or exports a Drive file to a local path                          |
| `listFilePermissions`        | Lists the sharing permissions on a file or folder                          |
| `createFilePermission`       | Grants access to a user, group, or public link on a file or folder         |
| `updateFilePermission`       | Updates an existing permission role or public-link discovery setting       |
| `deleteFilePermission`       | Revokes an existing permission from a file or folder                       |

Examples:
- `List permissions for file 1AbCdEfGhIjKlMnOp`
- `Create an anyone reader permission for file 1AbCdEfGhIjKlMnOp with allowFileDiscovery=false`
