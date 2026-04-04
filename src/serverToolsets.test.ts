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
    expect(toolNames).toContain('listDocuments');
    expect(toolNames).toContain('searchDocuments');
    expect(toolNames).toContain('listSpreadsheets');
    expect(toolNames).toContain('searchSpreadsheets');
    expect(toolNames).toContain('listPresentations');
    expect(toolNames).toContain('searchPresentations');
  });
});
