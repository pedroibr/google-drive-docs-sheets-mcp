import { z } from 'zod';

export const PresentationIdParameter = z.object({
  presentationId: z
    .string()
    .describe(
      'The presentation ID — the long string between /d/ and /edit in a Google Slides URL.'
    ),
});

export const SlidePageParameter = PresentationIdParameter.extend({
  pageObjectId: z
    .string()
    .describe('The object ID of the target slide/page inside the presentation.'),
});

export const SlideElementParameter = SlidePageParameter.extend({
  objectId: z
    .string()
    .describe('The object ID of the target page element inside the slide/page.'),
});

export const DimensionUnitSchema = z
  .enum(['PT', 'EMU'])
  .optional()
  .default('PT')
  .describe('Measurement unit for sizes and positions. Defaults to PT.');

export const PlaceholderReplacementSchema = z.object({
  placeholder: z
    .string()
    .min(1)
    .describe('Placeholder token to replace, including delimiters such as [[title]].'),
  value: z.string().describe('Replacement value for the placeholder.'),
});

export const PlaceholderReplacementsParameter = z.object({
  replacements: z
    .array(PlaceholderReplacementSchema)
    .min(1)
    .describe('List of placeholder replacements to apply.'),
});

export const SlidesTextStyleSchema = z.object({
  bold: z.boolean().optional().describe('Apply bold formatting.'),
  italic: z.boolean().optional().describe('Apply italic formatting.'),
  underline: z.boolean().optional().describe('Apply underline formatting.'),
  strikethrough: z.boolean().optional().describe('Apply strikethrough formatting.'),
  smallCaps: z.boolean().optional().describe('Apply small caps formatting.'),
  fontSize: z.number().min(1).optional().describe('Font size in points.'),
  fontFamily: z.string().optional().describe('Font family for the text.'),
  foregroundColor: z
    .string()
    .optional()
    .describe('Text color as hex, for example "#FF0000".'),
  backgroundColor: z
    .string()
    .optional()
    .describe('Text background color as hex, for example "#FFFF00".'),
  linkUrl: z.string().optional().describe('Optional hyperlink URL to assign to the text.'),
});

export const SlidesParagraphStyleSchema = z.object({
  alignment: z
    .enum(['START', 'CENTER', 'END', 'JUSTIFIED'])
    .optional()
    .describe('Paragraph alignment.'),
  direction: z
    .enum(['LEFT_TO_RIGHT', 'RIGHT_TO_LEFT'])
    .optional()
    .describe('Text direction for the paragraph.'),
  indentStart: z.number().min(0).optional().describe('Paragraph start indent in points.'),
  indentEnd: z.number().min(0).optional().describe('Paragraph end indent in points.'),
  indentFirstLine: z
    .number()
    .optional()
    .describe('First-line indent in points. Use negative values for hanging indents if needed.'),
  lineSpacing: z.number().positive().optional().describe('Line spacing percentage.'),
  spaceAbove: z.number().min(0).optional().describe('Space above the paragraph in points.'),
  spaceBelow: z.number().min(0).optional().describe('Space below the paragraph in points.'),
});

export const TemplateMetadataParameter = z.object({
  templateCategory: z
    .string()
    .min(1)
    .optional()
    .describe('Template category to store in speaker notes, for example "content_1c".'),
  templateName: z
    .string()
    .min(1)
    .optional()
    .describe('Optional human-readable template name stored in speaker notes.'),
  version: z
    .string()
    .min(1)
    .optional()
    .describe('Optional version string stored in speaker notes.'),
});
