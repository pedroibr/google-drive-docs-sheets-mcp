import { describe, expect, it } from 'vitest';
import { SERVER_TOOLSETS } from './serverToolsets.js';

function captureToolNames(registerTools: (server: any) => void) {
  const names: string[] = [];
  registerTools({
    addTool(config: { name: string }) {
      names.push(config.name);
    },
  });
  return names;
}

describe('SERVER_TOOLSETS discovery composition', () => {
  it('docs toolset exposes document-specific discovery tools', () => {
    const toolNames = captureToolNames(SERVER_TOOLSETS.docs.registerTools);

    expect(toolNames).toContain('listDocuments');
    expect(toolNames).toContain('searchDocuments');
  });

  it('drive toolset keeps only generic discovery tools', () => {
    const toolNames = captureToolNames(SERVER_TOOLSETS.drive.registerTools);

    expect(toolNames).toContain('listDriveFiles');
    expect(toolNames).toContain('searchDriveFiles');
    expect(toolNames).toContain('listFilePermissions');
    expect(toolNames).toContain('createFilePermission');
    expect(toolNames).toContain('updateFilePermission');
    expect(toolNames).toContain('deleteFilePermission');
    expect(toolNames).not.toContain('listDocuments');
    expect(toolNames).not.toContain('searchDocuments');
    expect(toolNames).not.toContain('listSpreadsheets');
    expect(toolNames).not.toContain('searchSpreadsheets');
    expect(toolNames).not.toContain('listPresentations');
    expect(toolNames).not.toContain('searchPresentations');
  });

  it('workspace toolset exposes both generic and product-specific discovery tools', () => {
    const toolNames = captureToolNames(SERVER_TOOLSETS.workspace.registerTools);

    expect(toolNames).toContain('listDriveFiles');
    expect(toolNames).toContain('searchDriveFiles');
    expect(toolNames).toContain('listFilePermissions');
    expect(toolNames).toContain('createFilePermission');
    expect(toolNames).toContain('updateFilePermission');
    expect(toolNames).toContain('deleteFilePermission');
    expect(toolNames).toContain('listDocuments');
    expect(toolNames).toContain('searchDocuments');
    expect(toolNames).toContain('listSpreadsheets');
    expect(toolNames).toContain('searchSpreadsheets');
    expect(toolNames).toContain('listPresentations');
    expect(toolNames).toContain('searchPresentations');
  });

  it('sheets toolset exposes analytics tools only on sheets-capable servers', () => {
    const sheetsToolNames = captureToolNames(SERVER_TOOLSETS.sheets.registerTools);
    const workspaceToolNames = captureToolNames(SERVER_TOOLSETS.workspace.registerTools);
    const driveToolNames = captureToolNames(SERVER_TOOLSETS.drive.registerTools);
    const docsToolNames = captureToolNames(SERVER_TOOLSETS.docs.registerTools);

    expect(sheetsToolNames).toContain('querySpreadsheet');
    expect(sheetsToolNames).toContain('pivotSpreadsheet');
    expect(sheetsToolNames).toContain('drillDownPivotSpreadsheet');
    expect(sheetsToolNames).toContain('suggestSpreadsheetAnalyses');
    expect(sheetsToolNames).toContain('writeQueryResultToSheet');
    expect(sheetsToolNames).toContain('writePivotToSheet');

    expect(workspaceToolNames).toContain('querySpreadsheet');
    expect(workspaceToolNames).toContain('pivotSpreadsheet');
    expect(workspaceToolNames).toContain('drillDownPivotSpreadsheet');
    expect(workspaceToolNames).toContain('suggestSpreadsheetAnalyses');
    expect(workspaceToolNames).toContain('writeQueryResultToSheet');
    expect(workspaceToolNames).toContain('writePivotToSheet');

    expect(driveToolNames).not.toContain('querySpreadsheet');
    expect(driveToolNames).not.toContain('pivotSpreadsheet');
    expect(driveToolNames).not.toContain('drillDownPivotSpreadsheet');
    expect(driveToolNames).not.toContain('suggestSpreadsheetAnalyses');
    expect(driveToolNames).not.toContain('writeQueryResultToSheet');
    expect(driveToolNames).not.toContain('writePivotToSheet');
    expect(docsToolNames).not.toContain('querySpreadsheet');
    expect(docsToolNames).not.toContain('pivotSpreadsheet');
    expect(docsToolNames).not.toContain('drillDownPivotSpreadsheet');
    expect(docsToolNames).not.toContain('suggestSpreadsheetAnalyses');
    expect(docsToolNames).not.toContain('writeQueryResultToSheet');
    expect(docsToolNames).not.toContain('writePivotToSheet');
  });

  it('sheets note tools are available on sheets-capable servers', () => {
    const sheetsToolNames = captureToolNames(SERVER_TOOLSETS.sheets.registerTools);
    const workspaceToolNames = captureToolNames(SERVER_TOOLSETS.workspace.registerTools);
    const driveToolNames = captureToolNames(SERVER_TOOLSETS.drive.registerTools);

    expect(sheetsToolNames).toContain('readCellNotes');
    expect(sheetsToolNames).toContain('updateCellNotes');
    expect(workspaceToolNames).toContain('readCellNotes');
    expect(workspaceToolNames).toContain('updateCellNotes');
    expect(driveToolNames).not.toContain('readCellNotes');
    expect(driveToolNames).not.toContain('updateCellNotes');
  });
});
