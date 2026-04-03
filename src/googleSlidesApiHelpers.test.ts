import { describe, expect, it } from 'vitest';
import {
  extractPlaceholdersFromPageElements,
  extractSlideTitle,
  extractTextFromPageElements,
  parseTemplateMetadata,
  summarizePageElements,
  summarizePresentationSlides,
  updateTemplateMetadataText,
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
        title: null,
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
        title: null,
        description: null,
        size: null,
        transform: null,
        elementType: 'shape',
        shapeType: 'TEXT_BOX',
        placeholderType: null,
        textContent: 'Agenda',
        placeholders: [],
      },
      {
        objectId: 'table-1',
        title: null,
        description: null,
        size: null,
        transform: null,
        elementType: 'table',
        rows: 2,
        columns: 3,
      },
      {
        objectId: 'line-1',
        title: null,
        description: null,
        size: null,
        transform: null,
        elementType: 'line',
        lineType: 'STRAIGHT_LINE',
        lineCategory: null,
      },
      {
        objectId: 'image-1',
        title: null,
        description: null,
        size: null,
        transform: null,
        elementType: 'image',
        contentUrl: 'https://example.com/image.png',
        sourceUrl: null,
      },
      {
        objectId: 'unknown-1',
        title: null,
        description: null,
        size: null,
        transform: null,
        elementType: 'unknown',
      },
    ]);
  });

  it('extracts placeholders and title from templated slide content', () => {
    const pageElements = [
      {
        objectId: 'title-1',
        shape: {
          placeholder: { type: 'TITLE' },
          text: {
            textElements: [{ startIndex: 1, textRun: { content: '[[title]]' } }],
          },
        },
      },
      {
        objectId: 'body-1',
        shape: {
          text: {
            textElements: [{ startIndex: 1, textRun: { content: '[[column_1]]\n[[column_2]]' } }],
          },
        },
      },
    ] as any;

    expect(extractSlideTitle(pageElements)).toBe('[[title]]');
    expect(extractPlaceholdersFromPageElements(pageElements)).toEqual([
      '[[title]]',
      '[[column_1]]',
      '[[column_2]]',
    ]);
  });

  it('parses and updates template metadata stored in speaker notes', () => {
    const notesText = 'template_category: content_1c\ntemplate_name: base-one-column\nversion: 1\n\nKeep this note.';

    expect(parseTemplateMetadata(notesText)).toEqual({
      templateCategory: 'content_1c',
      templateName: 'base-one-column',
      version: '1',
      rawEntries: {
        template_category: 'content_1c',
        template_name: 'base-one-column',
        version: '1',
      },
    });

    expect(
      updateTemplateMetadataText(
        notesText,
        {
          template_category: 'content_2c',
          version: '2',
        },
        false
      )
    ).toBe(
      'template_category: content_2c\ntemplate_name: base-one-column\nversion: 2\n\nKeep this note.'
    );

    expect(
      updateTemplateMetadataText(
        notesText,
        {
          template_name: 'section-break',
        },
        true
      )
    ).toBe('template_name: section-break\n\nKeep this note.');
  });
});
