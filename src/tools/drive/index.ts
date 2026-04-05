import type { FastMCP } from 'fastmcp';
import { register as listDriveFiles } from './listDriveFiles.js';
import { register as searchDriveFiles } from './searchDriveFiles.js';
import { register as getDocumentInfo } from './getDocumentInfo.js';
import { register as createFolder } from './createFolder.js';
import { register as listFolderContents } from './listFolderContents.js';
import { register as getFolderInfo } from './getFolderInfo.js';
import { register as moveFile } from './moveFile.js';
import { register as copyFile } from './copyFile.js';
import { register as renameFile } from './renameFile.js';
import { register as deleteFile } from './deleteFile.js';
import { register as downloadFile } from './downloadFile.js';
import { register as listFilePermissions } from './listFilePermissions.js';
import { register as createFilePermission } from './createFilePermission.js';
import { register as updateFilePermission } from './updateFilePermission.js';
import { register as deleteFilePermission } from './deleteFilePermission.js';

export function registerDriveTools(server: FastMCP) {
  listDriveFiles(server);
  searchDriveFiles(server);
  getDocumentInfo(server);
  createFolder(server);
  listFolderContents(server);
  getFolderInfo(server);
  moveFile(server);
  copyFile(server);
  renameFile(server);
  deleteFile(server);
  downloadFile(server);
  listFilePermissions(server);
  createFilePermission(server);
  updateFilePermission(server);
  deleteFilePermission(server);
}
