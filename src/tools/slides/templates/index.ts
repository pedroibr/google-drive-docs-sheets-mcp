import type { FastMCP } from 'fastmcp';
import { register as listPresentationTemplateSlides } from './listPresentationTemplateSlides.js';
import { register as getPresentationTemplateSlide } from './getPresentationTemplateSlide.js';
import { register as readSlideNotes } from './readSlideNotes.js';
import { register as updateSlideNotes } from './updateSlideNotes.js';
import { register as readPresentationTemplateMetadata } from './readPresentationTemplateMetadata.js';
import { register as updatePresentationTemplateMetadata } from './updatePresentationTemplateMetadata.js';
import { register as validateSlidePlaceholders } from './validateSlidePlaceholders.js';

export function registerSlideTemplateTools(server: FastMCP) {
  listPresentationTemplateSlides(server);
  getPresentationTemplateSlide(server);
  readSlideNotes(server);
  updateSlideNotes(server);
  readPresentationTemplateMetadata(server);
  updatePresentationTemplateMetadata(server);
  validateSlidePlaceholders(server);
}
