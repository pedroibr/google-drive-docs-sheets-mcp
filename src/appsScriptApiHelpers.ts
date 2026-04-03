type ScriptExecutionErrorDetail = {
  errorMessage?: string;
  scriptStackTraceElements?: Array<{
    function?: string;
    lineNumber?: number;
  }>;
};

export function getAppsScriptIdFromEnv(): string | null {
  return process.env.GOOGLE_APPS_SCRIPT_ID || process.env.APPS_SCRIPT_DEPLOYMENT_ID || null;
}

function formatAppsScriptExecutionError(error: any): string {
  const details = error?.details as ScriptExecutionErrorDetail[] | undefined;
  const primaryDetail = details?.[0];
  const stackTrace = primaryDetail?.scriptStackTraceElements?.[0];
  const location =
    stackTrace?.function || stackTrace?.lineNumber
      ? ` (${stackTrace?.function || 'anonymous'}:${stackTrace?.lineNumber ?? '?'})`
      : '';

  return (
    primaryDetail?.errorMessage ||
    error?.message ||
    `Unknown Apps Script error${location}`
  );
}

export async function runAppsScriptFunction(
  scriptClient: any,
  appsScriptId: string,
  functionName: string,
  parameters: unknown[] = []
) {
  const response = await scriptClient.scripts.run({
    scriptId: appsScriptId,
    requestBody: {
      function: functionName,
      parameters,
    },
  });

  if (response.data?.error) {
    throw new Error(`Apps Script execution failed: ${formatAppsScriptExecutionError(response.data.error)}`);
  }

  return response.data?.response?.result;
}

export function assertAppsScriptSuccessResult(
  result: unknown,
  fallbackMessage = 'Apps Script returned an invalid response.'
): asserts result is { success: true; message?: string } & Record<string, unknown> {
  if (!result || typeof result !== 'object') {
    throw new Error(fallbackMessage);
  }

  const payload = result as { success?: boolean; message?: string };
  if (payload.success !== true) {
    throw new Error(payload.message || fallbackMessage);
  }
}
