import { UserError, type ContentResult } from 'fastmcp';
import { z } from 'zod';

export const SpreadsheetCellValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const SpreadsheetRowValuesSchema = z.array(SpreadsheetCellValueSchema);
export const SpreadsheetMatrixValuesSchema = z.array(SpreadsheetRowValuesSchema);

export function assertRangeOrder(
  startIndex: number,
  endIndex: number,
  message = 'endIndex must be greater than startIndex.'
): void {
  if (endIndex <= startIndex) {
    throw new UserError(message);
  }
}

export function assertAtLeastOneDefined(
  payload: Record<string, unknown>,
  fields: string[],
  message: string
): void {
  if (!fields.some((field) => payload[field] !== undefined)) {
    throw new UserError(message);
  }
}

export function assertExactlyOneDefined(
  payload: Record<string, unknown>,
  fields: string[],
  message: string
): void {
  const present = fields.filter((field) => payload[field] !== undefined && payload[field] !== null);
  if (present.length !== 1) {
    throw new UserError(message);
  }
}

export function mutationResult(
  message: string,
  extra: Record<string, unknown> = {}
): ContentResult {
  return dataResult(
    {
      success: true,
      message,
      ...extra,
    },
    message
  );
}

export function dataResult(data: unknown, summary?: string): ContentResult {
  const serialized = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const text = summary ? `${summary}\n\n${serialized}` : serialized;

  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
  };
}
