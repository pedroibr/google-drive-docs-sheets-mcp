import { UserError } from 'fastmcp';
import { slides_v1 } from 'googleapis';
import { hexToRgbColor } from './types.js';

type PageElement = slides_v1.Schema$PageElement;
type Page = slides_v1.Schema$Page;
type Presentation = slides_v1.Schema$Presentation;
type BatchUpdateReply = slides_v1.Schema$Response;
type AffineTransform = slides_v1.Schema$AffineTransform;
type OptionalColor = slides_v1.Schema$OptionalColor;
type TextStyle = slides_v1.Schema$TextStyle;
type ParagraphStyle = slides_v1.Schema$ParagraphStyle;

const EMU_PER_PT = 12_700;
const TEMPLATE_METADATA_KEYS = ['template_category', 'template_name', 'version'] as const;

export type TemplateMetadataKey = (typeof TEMPLATE_METADATA_KEYS)[number];

export interface ParsedTemplateMetadata {
  templateCategory: string | null;
  templateName: string | null;
  version: string | null;
  rawEntries: Record<string, string>;
}

export interface SlidesTextStyleInput {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  smallCaps?: boolean;
  fontSize?: number;
  fontFamily?: string;
  foregroundColor?: string;
  backgroundColor?: string;
  linkUrl?: string;
}

export interface SlidesParagraphStyleInput {
  alignment?: 'START' | 'CENTER' | 'END' | 'JUSTIFIED';
  direction?: 'LEFT_TO_RIGHT' | 'RIGHT_TO_LEFT';
  indentStart?: number;
  indentEnd?: number;
  indentFirstLine?: number;
  lineSpacing?: number;
  spaceAbove?: number;
  spaceBelow?: number;
}

function normalizeTextChunk(content: string): string {
  return content.replace(/\r/g, '').replace(/\u000b/g, '\n');
}

function cleanupExtractedText(content: string): string {
  return content
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .join('\n')
    .trim();
}

function getRawShapeText(shape?: slides_v1.Schema$Shape | null): string {
  const fragments =
    shape?.text?.textElements
      ?.flatMap((textElement) => {
        const content = textElement.textRun?.content;
        if (!content) return [];
        return [
          {
            startIndex: textElement.startIndex ?? 0,
            content: normalizeTextChunk(content),
          },
        ];
      })
      .sort((left, right) => left.startIndex - right.startIndex)
      .map((fragment) => fragment.content) ?? [];

  return fragments.join('');
}

function getShapeTextBounds(shape?: slides_v1.Schema$Shape | null) {
  const endIndexes = (shape?.text?.textElements || [])
    .map((textElement) => textElement.endIndex ?? 0)
    .filter((value) => typeof value === 'number');

  return {
    maxEndIndex: endIndexes.length > 0 ? Math.max(...endIndexes) : 0,
  };
}

function parseMetadataLine(line: string): { key: string; value: string } | null {
  const match = line.match(/^\s*([a-zA-Z0-9_\-]+)\s*:\s*(.+?)\s*$/);
  if (!match) return null;
  return {
    key: match[1].toLowerCase(),
    value: match[2].trim(),
  };
}

function toOptionalColor(hex?: string): OptionalColor | undefined {
  if (hex === undefined) return undefined;
  const rgbColor = hexToRgbColor(hex);
  if (!rgbColor) {
    throw new UserError(`Invalid hex color format: "${hex}".`);
  }
  return {
    opaqueColor: {
      rgbColor,
    },
  };
}

export function convertDimensionMagnitude(
  value: number,
  fromUnit: 'EMU' | 'PT',
  toUnit: 'EMU' | 'PT'
): number {
  if (fromUnit === toUnit) return value;
  if (fromUnit === 'PT' && toUnit === 'EMU') return value * EMU_PER_PT;
  return value / EMU_PER_PT;
}

export function buildSlidesTextStyle(style: SlidesTextStyleInput): {
  style: TextStyle;
  fields: string[];
} {
  const textStyle: TextStyle = {};
  const fields: string[] = [];

  if (style.bold !== undefined) {
    textStyle.bold = style.bold;
    fields.push('bold');
  }
  if (style.italic !== undefined) {
    textStyle.italic = style.italic;
    fields.push('italic');
  }
  if (style.underline !== undefined) {
    textStyle.underline = style.underline;
    fields.push('underline');
  }
  if (style.strikethrough !== undefined) {
    textStyle.strikethrough = style.strikethrough;
    fields.push('strikethrough');
  }
  if (style.smallCaps !== undefined) {
    textStyle.smallCaps = style.smallCaps;
    fields.push('smallCaps');
  }
  if (style.fontSize !== undefined) {
    textStyle.fontSize = { magnitude: style.fontSize, unit: 'PT' };
    fields.push('fontSize');
  }
  if (style.fontFamily !== undefined) {
    textStyle.fontFamily = style.fontFamily;
    fields.push('fontFamily');
  }
  if (style.foregroundColor !== undefined) {
    textStyle.foregroundColor = toOptionalColor(style.foregroundColor);
    fields.push('foregroundColor');
  }
  if (style.backgroundColor !== undefined) {
    textStyle.backgroundColor = toOptionalColor(style.backgroundColor);
    fields.push('backgroundColor');
  }
  if (style.linkUrl !== undefined) {
    textStyle.link = style.linkUrl ? { url: style.linkUrl } : undefined;
    fields.push('link');
  }

  return { style: textStyle, fields };
}

export function buildSlidesParagraphStyle(style: SlidesParagraphStyleInput): {
  style: ParagraphStyle;
  fields: string[];
} {
  const paragraphStyle: ParagraphStyle = {};
  const fields: string[] = [];

  if (style.alignment !== undefined) {
    paragraphStyle.alignment = style.alignment;
    fields.push('alignment');
  }
  if (style.direction !== undefined) {
    paragraphStyle.direction = style.direction;
    fields.push('direction');
  }
  if (style.indentStart !== undefined) {
    paragraphStyle.indentStart = { magnitude: style.indentStart, unit: 'PT' };
    fields.push('indentStart');
  }
  if (style.indentEnd !== undefined) {
    paragraphStyle.indentEnd = { magnitude: style.indentEnd, unit: 'PT' };
    fields.push('indentEnd');
  }
  if (style.indentFirstLine !== undefined) {
    paragraphStyle.indentFirstLine = { magnitude: style.indentFirstLine, unit: 'PT' };
    fields.push('indentFirstLine');
  }
  if (style.lineSpacing !== undefined) {
    paragraphStyle.lineSpacing = style.lineSpacing;
    fields.push('lineSpacing');
  }
  if (style.spaceAbove !== undefined) {
    paragraphStyle.spaceAbove = { magnitude: style.spaceAbove, unit: 'PT' };
    fields.push('spaceAbove');
  }
  if (style.spaceBelow !== undefined) {
    paragraphStyle.spaceBelow = { magnitude: style.spaceBelow, unit: 'PT' };
    fields.push('spaceBelow');
  }

  return { style: paragraphStyle, fields };
}

export function buildTextRange(startIndex?: number, endIndex?: number): slides_v1.Schema$Range {
  if (startIndex === undefined && endIndex === undefined) {
    return { type: 'ALL' };
  }
  if (startIndex !== undefined && endIndex !== undefined) {
    if (endIndex <= startIndex) {
      throw new UserError('endIndex must be greater than startIndex.');
    }
    return {
      type: 'FIXED_RANGE',
      startIndex,
      endIndex,
    };
  }
  if (startIndex !== undefined) {
    return {
      type: 'FROM_START_INDEX',
      startIndex,
    };
  }
  throw new UserError('startIndex is required when endIndex is provided.');
}

export function buildPageElementProperties(
  pageObjectId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  unit: 'EMU' | 'PT'
): slides_v1.Schema$PageElementProperties {
  return {
    pageObjectId,
    size: {
      width: { magnitude: width, unit },
      height: { magnitude: height, unit },
    },
    transform: {
      scaleX: 1,
      scaleY: 1,
      shearX: 0,
      shearY: 0,
      translateX: x,
      translateY: y,
      unit,
    },
  };
}

export function summarizeTransform(transform?: AffineTransform | null) {
  if (!transform) return null;
  return {
    scaleX: transform.scaleX ?? null,
    scaleY: transform.scaleY ?? null,
    shearX: transform.shearX ?? null,
    shearY: transform.shearY ?? null,
    translateX: transform.translateX ?? null,
    translateY: transform.translateY ?? null,
    unit: transform.unit ?? null,
  };
}

export function summarizeSize(size?: slides_v1.Schema$Size | null) {
  if (!size) return null;

  return {
    width: size.width
      ? {
          magnitude: size.width.magnitude ?? null,
          unit: size.width.unit ?? null,
        }
      : null,
    height: size.height
      ? {
          magnitude: size.height.magnitude ?? null,
          unit: size.height.unit ?? null,
        }
      : null,
  };
}

export function summarizePageSize(pageSize?: slides_v1.Schema$Size | null) {
  return summarizeSize(pageSize);
}

export function extractTextFromShape(shape?: slides_v1.Schema$Shape | null): string {
  return cleanupExtractedText(getRawShapeText(shape));
}

export function extractTextFromPageElements(pageElements: PageElement[] = []): string {
  return pageElements
    .map((pageElement) => extractTextFromShape(pageElement.shape))
    .filter((text) => text.length > 0)
    .join('\n')
    .trim();
}

export function extractPlaceholdersFromText(content: string): string[] {
  const matches = content.match(/\[\[[a-zA-Z0-9_-]+\]\]/g) || [];
  return Array.from(new Set(matches));
}

export function extractPlaceholdersFromPageElements(pageElements: PageElement[] = []): string[] {
  return Array.from(
    new Set(
      pageElements.flatMap((pageElement) => extractPlaceholdersFromText(getRawShapeText(pageElement.shape)))
    )
  );
}

export function extractSlideTitle(pageElements: PageElement[] = []): string | null {
  const titleShape = pageElements.find((pageElement) => {
    const placeholderType = pageElement.shape?.placeholder?.type;
    return placeholderType === 'TITLE' || placeholderType === 'CENTERED_TITLE';
  });

  const titleText = extractTextFromShape(titleShape?.shape);
  if (titleText) {
    return titleText.split('\n')[0]?.trim() || null;
  }

  const firstText = pageElements
    .map((pageElement) => extractTextFromShape(pageElement.shape))
    .find((text) => text.length > 0);

  return firstText ? firstText.split('\n')[0]?.trim() || null : null;
}

export function parseTemplateMetadata(notesText: string): ParsedTemplateMetadata {
  const rawEntries: Record<string, string> = {};

  for (const line of notesText.split('\n')) {
    const parsedLine = parseMetadataLine(line);
    if (!parsedLine) continue;
    rawEntries[parsedLine.key] = parsedLine.value;
  }

  return {
    templateCategory: rawEntries.template_category ?? null,
    templateName: rawEntries.template_name ?? null,
    version: rawEntries.version ?? null,
    rawEntries,
  };
}

export function updateTemplateMetadataText(
  notesText: string,
  updates: Partial<Record<TemplateMetadataKey, string | null>>,
  replaceExisting = false
): string {
  const lines = notesText.length > 0 ? notesText.split('\n') : [];
  const remainingLines = replaceExisting
    ? lines.filter((line) => {
        const parsedLine = parseMetadataLine(line);
        return !parsedLine || !TEMPLATE_METADATA_KEYS.includes(parsedLine.key as TemplateMetadataKey);
      })
    : [...lines];

  const nextEntries = new Map<TemplateMetadataKey, string>();

  if (!replaceExisting) {
    for (const line of lines) {
      const parsedLine = parseMetadataLine(line);
      if (!parsedLine || !TEMPLATE_METADATA_KEYS.includes(parsedLine.key as TemplateMetadataKey)) {
        continue;
      }
      nextEntries.set(parsedLine.key as TemplateMetadataKey, parsedLine.value);
    }
  }

  for (const key of TEMPLATE_METADATA_KEYS) {
    const value = updates[key];
    if (value === null) {
      nextEntries.delete(key);
    } else if (value !== undefined) {
      nextEntries.set(key, value);
    }
  }

  const nonMetadataLines = remainingLines.filter((line) => {
    const parsedLine = parseMetadataLine(line);
    return !parsedLine || !TEMPLATE_METADATA_KEYS.includes(parsedLine.key as TemplateMetadataKey);
  });

  while (nonMetadataLines[0] !== undefined && nonMetadataLines[0].trim().length === 0) {
    nonMetadataLines.shift();
  }
  while (
    nonMetadataLines[nonMetadataLines.length - 1] !== undefined &&
    nonMetadataLines[nonMetadataLines.length - 1]!.trim().length === 0
  ) {
    nonMetadataLines.pop();
  }

  const metadataLines = TEMPLATE_METADATA_KEYS.flatMap((key) => {
    const value = nextEntries.get(key);
    return value ? [`${key}: ${value}`] : [];
  });

  const outputLines = [...metadataLines];
  if (metadataLines.length > 0 && nonMetadataLines.length > 0) {
    outputLines.push('');
  }
  outputLines.push(...nonMetadataLines);

  return outputLines.join('\n').trim();
}

export function summarizePageElement(pageElement: PageElement) {
  const base = {
    objectId: pageElement.objectId ?? null,
    title: pageElement.title ?? null,
    description: pageElement.description ?? null,
    size: summarizeSize(pageElement.size),
    transform: summarizeTransform(pageElement.transform),
  };

  if (pageElement.shape) {
    return {
      ...base,
      elementType: 'shape',
      shapeType: pageElement.shape.shapeType ?? null,
      placeholderType: pageElement.shape.placeholder?.type ?? null,
      textContent: extractTextFromShape(pageElement.shape) || null,
      placeholders: extractPlaceholdersFromText(getRawShapeText(pageElement.shape)),
    };
  }

  if (pageElement.table) {
    return {
      ...base,
      elementType: 'table',
      rows: pageElement.table.rows ?? null,
      columns: pageElement.table.columns ?? null,
    };
  }

  if (pageElement.line) {
    return {
      ...base,
      elementType: 'line',
      lineType: pageElement.line.lineType ?? null,
      lineCategory: pageElement.line.lineCategory ?? null,
    };
  }

  if (pageElement.image) {
    return {
      ...base,
      elementType: 'image',
      contentUrl: pageElement.image.contentUrl ?? null,
      sourceUrl: pageElement.image.sourceUrl ?? null,
    };
  }

  if (pageElement.sheetsChart) {
    return {
      ...base,
      elementType: 'sheetsChart',
      spreadsheetId: pageElement.sheetsChart.spreadsheetId ?? null,
      chartId: pageElement.sheetsChart.chartId ?? null,
    };
  }

  if (pageElement.wordArt) {
    return {
      ...base,
      elementType: 'wordArt',
      text: pageElement.wordArt.renderedText ?? null,
    };
  }

  if (pageElement.video) {
    return {
      ...base,
      elementType: 'video',
      source: pageElement.video.source ?? null,
    };
  }

  return {
    ...base,
    elementType: 'unknown',
  };
}

export function summarizePageElements(pageElements: PageElement[] = []) {
  return pageElements.map((pageElement) => summarizePageElement(pageElement));
}

export function summarizePresentationSlides(
  slides: Page[] = [],
  options: { includeNotes?: boolean; includePlaceholders?: boolean } = {}
) {
  return slides.map((slide, index) => {
    const pageElements = slide.pageElements ?? [];
    const notesText = options.includeNotes ? extractNotesTextFromSlide(slide) : null;
    const placeholders = options.includePlaceholders
      ? extractPlaceholdersFromPageElements(pageElements)
      : undefined;
    const metadata = options.includeNotes && notesText ? parseTemplateMetadata(notesText) : null;

    return {
      slideNumber: index + 1,
      objectId: slide.objectId ?? null,
      pageType: slide.pageType ?? null,
      title: extractSlideTitle(pageElements),
      pageElementCount: pageElements.length,
      textContent: extractTextFromPageElements(pageElements) || null,
      ...(options.includeNotes
        ? {
            notesText,
            templateCategory: metadata?.templateCategory ?? null,
            templateName: metadata?.templateName ?? null,
            version: metadata?.version ?? null,
          }
        : {}),
      ...(options.includePlaceholders
        ? {
            placeholders: placeholders ?? [],
          }
        : {}),
    };
  });
}

export function summarizeBatchUpdateReplies(replies: BatchUpdateReply[] = []) {
  return replies.map((reply, index) => {
    const operation = Object.keys(reply)[0] ?? 'completed';
    const operationPayload =
      operation === 'completed' ? null : (reply as Record<string, any>)[operation];

    return {
      index: index + 1,
      operation,
      objectId:
        operationPayload && typeof operationPayload === 'object' && 'objectId' in operationPayload
          ? operationPayload.objectId ?? null
          : null,
      occurrencesChanged:
        operationPayload &&
        typeof operationPayload === 'object' &&
        'occurrencesChanged' in operationPayload
          ? operationPayload.occurrencesChanged ?? null
          : null,
    };
  });
}

export function findSlideById(presentation: Presentation, pageObjectId: string): Page | null {
  return presentation.slides?.find((slide) => slide.objectId === pageObjectId) ?? null;
}

export function findPageElementById(page: Page, objectId: string): PageElement | null {
  return page.pageElements?.find((pageElement) => pageElement.objectId === objectId) ?? null;
}

export function getSlideNotesInfo(slide: Page) {
  const notesPage = slide.slideProperties?.notesPage;
  const speakerNotesObjectId = notesPage?.notesProperties?.speakerNotesObjectId ?? null;
  const notesShape =
    notesPage?.pageElements?.find((pageElement) => pageElement.objectId === speakerNotesObjectId) ??
    null;

  return {
    notesPageObjectId: notesPage?.objectId ?? null,
    speakerNotesObjectId,
    notesShape,
    notesText: extractTextFromShape(notesShape?.shape) || '',
  };
}

export function extractNotesTextFromSlide(slide: Page): string {
  return getSlideNotesInfo(slide).notesText;
}

export function buildDeleteAllTextRequest(
  objectId: string
): slides_v1.Schema$Request {
  return {
    deleteText: {
      objectId,
      textRange: {
        type: 'ALL',
      },
    },
  };
}

export function buildInsertTextRequest(
  objectId: string,
  text: string,
  insertionIndex = 0
): slides_v1.Schema$Request {
  return {
    insertText: {
      objectId,
      text,
      insertionIndex,
    },
  };
}

export function getAppendInsertionIndexForShape(shape?: slides_v1.Schema$Shape | null): number {
  const { maxEndIndex } = getShapeTextBounds(shape);
  return Math.max(0, maxEndIndex - 1);
}

export async function getPresentationOrThrow(
  slidesClient: slides_v1.Slides,
  presentationId: string
): Promise<Presentation> {
  const response = await slidesClient.presentations.get({ presentationId });
  return response.data;
}

export async function getSlideOrThrow(
  slidesClient: slides_v1.Slides,
  presentationId: string,
  pageObjectId: string
): Promise<Page> {
  const presentation = await getPresentationOrThrow(slidesClient, presentationId);
  const slide = findSlideById(presentation, pageObjectId);
  if (!slide) {
    throw new UserError(
      `Slide not found (presentationId: ${presentationId}, pageObjectId: ${pageObjectId}).`
    );
  }
  return slide;
}

export async function getPresentationPageOrThrow(
  slidesClient: slides_v1.Slides,
  presentationId: string,
  pageObjectId: string
): Promise<Page> {
  const response = await slidesClient.presentations.pages.get({
    presentationId,
    pageObjectId,
  });
  if (!response.data) {
    throw new UserError(
      `Page not found (presentationId: ${presentationId}, pageObjectId: ${pageObjectId}).`
    );
  }
  return response.data;
}

export function resolveElementVisualSize(
  pageElement: PageElement,
  outputUnit: 'EMU' | 'PT'
): { width: number | null; height: number | null; unit: 'EMU' | 'PT' } {
  const sizeUnit = (pageElement.size?.width?.unit || pageElement.size?.height?.unit || 'EMU') as
    | 'EMU'
    | 'PT';
  const widthMagnitude = pageElement.size?.width?.magnitude ?? null;
  const heightMagnitude = pageElement.size?.height?.magnitude ?? null;
  const scaleX = pageElement.transform?.scaleX ?? 1;
  const scaleY = pageElement.transform?.scaleY ?? 1;

  const width =
    widthMagnitude == null
      ? null
      : convertDimensionMagnitude(widthMagnitude * scaleX, sizeUnit, outputUnit);
  const height =
    heightMagnitude == null
      ? null
      : convertDimensionMagnitude(heightMagnitude * scaleY, sizeUnit, outputUnit);

  return {
    width,
    height,
    unit: outputUnit,
  };
}

export function buildTransformForMove(
  pageElement: PageElement,
  x: number,
  y: number,
  unit: 'EMU' | 'PT'
): AffineTransform {
  return {
    scaleX: pageElement.transform?.scaleX ?? 1,
    scaleY: pageElement.transform?.scaleY ?? 1,
    shearX: pageElement.transform?.shearX ?? 0,
    shearY: pageElement.transform?.shearY ?? 0,
    translateX: x,
    translateY: y,
    unit,
  };
}

export function buildTransformForResize(
  pageElement: PageElement,
  width: number,
  height: number,
  unit: 'EMU' | 'PT'
): AffineTransform {
  const currentWidth = pageElement.size?.width?.magnitude;
  const currentHeight = pageElement.size?.height?.magnitude;
  const currentSizeUnit = (pageElement.size?.width?.unit ||
    pageElement.size?.height?.unit ||
    'EMU') as 'EMU' | 'PT';

  if (currentWidth == null || currentHeight == null) {
    throw new UserError(
      `Element ${pageElement.objectId} does not expose size information needed for resize.`
    );
  }

  const targetWidth = convertDimensionMagnitude(width, unit, currentSizeUnit);
  const targetHeight = convertDimensionMagnitude(height, unit, currentSizeUnit);

  return {
    scaleX: targetWidth / currentWidth,
    scaleY: targetHeight / currentHeight,
    shearX: pageElement.transform?.shearX ?? 0,
    shearY: pageElement.transform?.shearY ?? 0,
    translateX:
      convertDimensionMagnitude(pageElement.transform?.translateX ?? 0, (pageElement.transform?.unit ||
        unit) as 'EMU' | 'PT', unit),
    translateY:
      convertDimensionMagnitude(pageElement.transform?.translateY ?? 0, (pageElement.transform?.unit ||
        unit) as 'EMU' | 'PT', unit),
    unit,
  };
}
