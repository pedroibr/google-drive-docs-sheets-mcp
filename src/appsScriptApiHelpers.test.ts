import { afterEach, describe, expect, it } from 'vitest';
import {
  assertAppsScriptSuccessResult,
  getAppsScriptIdFromEnv,
  runAppsScriptFunction,
} from './appsScriptApiHelpers.js';

const originalGoogleAppsScriptId = process.env.GOOGLE_APPS_SCRIPT_ID;
const originalLegacyAppsScriptId = process.env.APPS_SCRIPT_DEPLOYMENT_ID;

afterEach(() => {
  if (originalGoogleAppsScriptId === undefined) {
    delete process.env.GOOGLE_APPS_SCRIPT_ID;
  } else {
    process.env.GOOGLE_APPS_SCRIPT_ID = originalGoogleAppsScriptId;
  }

  if (originalLegacyAppsScriptId === undefined) {
    delete process.env.APPS_SCRIPT_DEPLOYMENT_ID;
  } else {
    process.env.APPS_SCRIPT_DEPLOYMENT_ID = originalLegacyAppsScriptId;
  }
});

describe('appsScriptApiHelpers', () => {
  it('prefers GOOGLE_APPS_SCRIPT_ID over the legacy fallback', () => {
    process.env.GOOGLE_APPS_SCRIPT_ID = 'new-script-id';
    process.env.APPS_SCRIPT_DEPLOYMENT_ID = 'legacy-script-id';

    expect(getAppsScriptIdFromEnv()).toBe('new-script-id');
  });

  it('falls back to APPS_SCRIPT_DEPLOYMENT_ID when GOOGLE_APPS_SCRIPT_ID is absent', () => {
    delete process.env.GOOGLE_APPS_SCRIPT_ID;
    process.env.APPS_SCRIPT_DEPLOYMENT_ID = 'legacy-script-id';

    expect(getAppsScriptIdFromEnv()).toBe('legacy-script-id');
  });

  it('returns the Apps Script result payload on success', async () => {
    const scriptsRun = async () => ({
      data: {
        response: {
          result: {
            success: true,
            message: 'ok',
          },
        },
      },
    });

    await expect(
      runAppsScriptFunction({ scripts: { run: scriptsRun } }, 'script-id', 'fnName', ['a'])
    ).resolves.toEqual({
      success: true,
      message: 'ok',
    });
  });

  it('surfaces execution errors with the script-provided message', async () => {
    const scriptsRun = async () => ({
      data: {
        error: {
          details: [
            {
              errorMessage: 'Exception: Something broke',
            },
          ],
        },
      },
    });

    await expect(
      runAppsScriptFunction({ scripts: { run: scriptsRun } }, 'script-id', 'fnName')
    ).rejects.toThrow('Apps Script execution failed: Exception: Something broke');
  });

  it('rejects malformed success payloads', () => {
    expect(() => assertAppsScriptSuccessResult(null)).toThrow(
      'Apps Script returned an invalid response.'
    );
    expect(() => assertAppsScriptSuccessResult({ success: false, message: 'Nope' })).toThrow(
      'Nope'
    );
  });
});
