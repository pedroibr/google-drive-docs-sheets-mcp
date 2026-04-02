// src/types.ts
import { z } from 'zod';
import { docs_v1 } from 'googleapis';

// --- Helper function for hex color validation ---
export const hexColorRegex = /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
export const validateHexColor = (color: string) => hexColorRegex.test(color);

// --- Helper function for Hex to RGB conversion ---
export function hexToRgbColor(hex: string): docs_v1.Schema$RgbColor | null {
  if (!hex) return null;
  let hexClean = hex.startsWith('#') ? hex.slice(1) : hex;

  if (hexClean.length === 3) {
    hexClean = hexClean[0] + hexClean[0] + hexClean[1] + hexClean[1] + hexClean[2] + hexClean[2];
  }
  if (hexClean.length !== 6) return null;
  const bigint = parseInt(hexClean, 16);
  if (isNaN(bigint)) return null;

  const r = ((bigint >> 16) & 255) / 255;
  const g = ((bigint >> 8) & 255) / 255;
  const b = (bigint & 255) / 255;

  return { red: r, green: g, blue: b };
}

// --- Zod Schema Fragments for Reusability ---

export const DocumentIdParameter = z.object({
  documentId: z
    .string()
    .describe('The document ID — the long string between /d/ and /edit in a Google Docs URL.'),
});

export const RangeParameters = z
  .object({
    startIndex: z
      .number()
      .int()
      .min(1)
      .describe('The starting index of the text range (inclusive, starts from 1).'),
    endIndex: z.number().int().min(1).describe('The ending index of the text range (exclusive).'),
  });

export const OptionalRangeParameters = z
  .object({
    startIndex: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'Optional: The starting index of the text range (inclusive, starts from 1). If omitted, might apply to a found element or whole paragraph.'
      ),
    endIndex: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'Optional: The ending index of the text range (exclusive). If omitted, might apply to a found element or whole paragraph.'
      ),
  });

export const TextFindParameter = z.object({
  textToFind: z.string().min(1).describe('The exact text string to locate.'),
  matchInstance: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .describe('Which instance of the text to target (1st, 2nd, etc.). Defaults to 1.'),
});

// --- Style Parameter Schemas ---

export const TextStyleParameters = z
  .object({
    bold: z.boolean().optional().describe('Apply bold formatting.'),
    italic: z.boolean().optional().describe('Apply italic formatting.'),
    underline: z.boolean().optional().describe('Apply underline formatting.'),
    strikethrough: z.boolean().optional().describe('Apply strikethrough formatting.'),
    fontSize: z.number().min(1).optional().describe('Set font size (in points, e.g., 12).'),
    fontFamily: z
      .string()
      .optional()
      .describe('Set font family (e.g., "Arial", "Times New Roman").'),
    foregroundColor: z
      .string()
      .optional()
      .describe('Set text color using hex format (e.g., "#FF0000").'),
    backgroundColor: z
      .string()
      .optional()
      .describe('Set text background color using hex format (e.g., "#FFFF00").'),
    linkUrl: z
      .string()
      .optional()
      .describe('Make the text a hyperlink pointing to this URL (http or https only).'),
    // clearDirectFormatting: z.boolean().optional().describe('If true, attempts to clear all direct text formatting within the range before applying new styles.') // Harder to implement perfectly
  })
  .describe('Parameters for character-level text formatting.');

// Subset of TextStyle used for passing to helpers
export type TextStyleArgs = z.infer<typeof TextStyleParameters>;

export const ParagraphStyleParameters = z
  .object({
    alignment: z
      .enum(['START', 'END', 'CENTER', 'JUSTIFIED'])
      .optional()
      .describe('Paragraph alignment. START=left for LTR languages, END=right for LTR languages.'),
    indentStart: z.number().min(0).optional().describe('Left indentation in points.'),
    indentEnd: z.number().min(0).optional().describe('Right indentation in points.'),
    spaceAbove: z.number().min(0).optional().describe('Space before the paragraph in points.'),
    spaceBelow: z.number().min(0).optional().describe('Space after the paragraph in points.'),
    namedStyleType: z
      .enum([
        'NORMAL_TEXT',
        'TITLE',
        'SUBTITLE',
        'HEADING_1',
        'HEADING_2',
        'HEADING_3',
        'HEADING_4',
        'HEADING_5',
        'HEADING_6',
      ])
      .optional()
      .describe('Apply a built-in named paragraph style (e.g., HEADING_1).'),
    keepWithNext: z
      .boolean()
      .optional()
      .describe('Keep this paragraph together with the next one on the same page.'),
    // Borders are more complex, might need separate objects/tools
    // clearDirectFormatting: z.boolean().optional().describe('If true, attempts to clear all direct paragraph formatting within the range before applying new styles.') // Harder to implement perfectly
  })
  .describe('Parameters for paragraph-level formatting.');

// Subset of ParagraphStyle used for passing to helpers
export type ParagraphStyleArgs = z.infer<typeof ParagraphStyleParameters>;

// --- Combination Schemas for Tools ---

export const ApplyTextStyleToolParameters = DocumentIdParameter.extend({
  targetType: z
    .enum(['range', 'text'])
    .optional()
    .default('range')
    .describe('How to identify the target text. Use "range" or "text".'),
  startIndex: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Required when targetType="range". Start of range (inclusive, 1-based).'),
  endIndex: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Required when targetType="range". End of range (exclusive).'),
  textToFind: z
    .string()
    .optional()
    .describe('Required when targetType="text". Exact text string to locate.'),
  matchInstance: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .describe('When targetType="text", which instance to style. Defaults to 1.'),
  style: TextStyleParameters.describe('The text styling to apply.'),
  tabId: z
    .string()
    .optional()
    .describe(
      'The ID of the specific tab to apply formatting in. Use listDocumentTabs to get tab IDs. If not specified, operates on the first tab.'
    ),
});
export type ApplyTextStyleToolArgs = z.infer<typeof ApplyTextStyleToolParameters>;

export const ApplyParagraphStyleToolParameters = DocumentIdParameter.extend({
  targetType: z
    .enum(['range', 'text', 'paragraphIndex'])
    .optional()
    .default('text')
    .describe('How to identify the paragraph to style.'),
  startIndex: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Required when targetType="range". Paragraph start index.'),
  endIndex: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Required when targetType="range". Paragraph end index.'),
  textToFind: z
    .string()
    .optional()
    .describe('Required when targetType="text". Find the paragraph containing this text.'),
  matchInstance: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .describe('When targetType="text", which matching instance to use. Defaults to 1.'),
  indexWithinParagraph: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Required when targetType="paragraphIndex". Any index inside the target paragraph.'),
  style: ParagraphStyleParameters.describe('The paragraph styling to apply.'),
  tabId: z
    .string()
    .optional()
    .describe(
      'The ID of the specific tab to apply formatting in. Use listDocumentTabs to get tab IDs. If not specified, operates on the first tab.'
    ),
});
export type ApplyParagraphStyleToolArgs = z.infer<typeof ApplyParagraphStyleToolParameters>;

// --- Error Classes ---
// Use FastMCP's UserError for client-facing issues
// Define custom errors for internal issues if needed
export class NotImplementedError extends Error {
  constructor(message = 'This feature is not yet implemented.') {
    super(message);
    this.name = 'NotImplementedError';
  }
}

export class MarkdownConversionError extends Error {
  constructor(
    message: string,
    public markdownPosition?: number,
    public tokenType?: string
  ) {
    super(message);
    this.name = 'MarkdownConversionError';
  }
}
