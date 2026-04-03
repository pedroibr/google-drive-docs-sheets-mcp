import { slides_v1 } from 'googleapis';

type PageElement = slides_v1.Schema$PageElement;
type Page = slides_v1.Schema$Page;
type BatchUpdateReply = slides_v1.Schema$Response;

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

export function extractTextFromShape(shape?: slides_v1.Schema$Shape | null): string {
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

  return cleanupExtractedText(fragments.join(''));
}

export function extractTextFromPageElements(pageElements: PageElement[] = []): string {
  return pageElements
    .map((pageElement) => extractTextFromShape(pageElement.shape))
    .filter((text) => text.length > 0)
    .join('\n')
    .trim();
}

function summarizeSize(size?: slides_v1.Schema$Size | null) {
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

export function summarizePageElement(pageElement: PageElement) {
  const base = {
    objectId: pageElement.objectId ?? null,
    size: summarizeSize(pageElement.size),
  };

  if (pageElement.shape) {
    return {
      ...base,
      elementType: 'shape',
      shapeType: pageElement.shape.shapeType ?? null,
      textContent: extractTextFromShape(pageElement.shape) || null,
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
    };
  }

  if (pageElement.image) {
    return {
      ...base,
      elementType: 'image',
      contentUrl: pageElement.image.contentUrl ?? null,
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

export function summarizePresentationSlides(slides: Page[] = []) {
  return slides.map((slide, index) => {
    const pageElements = slide.pageElements ?? [];
    return {
      slideNumber: index + 1,
      objectId: slide.objectId ?? null,
      pageType: slide.pageType ?? null,
      pageElementCount: pageElements.length,
      textContent: extractTextFromPageElements(pageElements) || null,
    };
  });
}

export function summarizePageSize(pageSize?: slides_v1.Schema$Size | null) {
  return summarizeSize(pageSize);
}

export function summarizeBatchUpdateReplies(replies: BatchUpdateReply[] = []) {
  return replies.map((reply, index) => {
    const operation = Object.keys(reply)[0] ?? 'completed';
    const operationPayload = operation === 'completed' ? null : (reply as Record<string, any>)[operation];

    return {
      index: index + 1,
      operation,
      objectId:
        operationPayload && typeof operationPayload === 'object' && 'objectId' in operationPayload
          ? operationPayload.objectId ?? null
          : null,
    };
  });
}
