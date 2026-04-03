import { describe, expect, it } from 'vitest';
import {
  extractTextFromPageElements,
  summarizePageElements,
  summarizePresentationSlides,
} from './googleSlidesApiHelpers.js';

describe('googleSlidesApiHelpers', () => {
  it('extracts text from shapes with multiple text elements in index order', () => {
    const text = extractTextFromPageElements([
      {
        shape: {
          text: {
            textElements: [
              { startIndex: 10, textRun: { content: 'World' } },
              { startIndex: 1, textRun: { content: 'Hello ' } },
            ],
          },
        },
      } as any,
    ]);

    expect(text).toBe('Hello World');
  });

  it('summarizes slides without text as null textContent', () => {
    const slides = summarizePresentationSlides([
      {
        objectId: 'slide-1',
        pageType: 'SLIDE',
        pageElements: [],
      } as any,
    ]);

    expect(slides).toEqual([
      {
        slideNumber: 1,
        objectId: 'slide-1',
        pageType: 'SLIDE',
        pageElementCount: 0,
        textContent: null,
      },
    ]);
  });

  it('summarizes shape, table, line, image, and unknown elements', () => {
    const pageElements = summarizePageElements([
      {
        objectId: 'shape-1',
        shape: {
          shapeType: 'TEXT_BOX',
          text: {
            textElements: [{ startIndex: 1, textRun: { content: 'Agenda' } }],
          },
        },
      } as any,
      {
        objectId: 'table-1',
        table: { rows: 2, columns: 3 },
      } as any,
      {
        objectId: 'line-1',
        line: { lineType: 'STRAIGHT_LINE' },
      } as any,
      {
        objectId: 'image-1',
        image: { contentUrl: 'https://example.com/image.png' },
      } as any,
      {
        objectId: 'unknown-1',
      } as any,
    ]);

    expect(pageElements).toEqual([
      {
        objectId: 'shape-1',
        size: null,
        elementType: 'shape',
        shapeType: 'TEXT_BOX',
        textContent: 'Agenda',
      },
      {
        objectId: 'table-1',
        size: null,
        elementType: 'table',
        rows: 2,
        columns: 3,
      },
      {
        objectId: 'line-1',
        size: null,
        elementType: 'line',
        lineType: 'STRAIGHT_LINE',
      },
      {
        objectId: 'image-1',
        size: null,
        elementType: 'image',
        contentUrl: 'https://example.com/image.png',
      },
      {
        objectId: 'unknown-1',
        size: null,
        elementType: 'unknown',
      },
    ]);
  });
});
