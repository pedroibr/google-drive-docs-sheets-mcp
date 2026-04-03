import type { FastMCP } from 'fastmcp';
import { register as copyPresentation } from './copyPresentation.js';
import { register as getPresentationSlides } from './getPresentationSlides.js';
import { register as deletePresentationSlide } from './deletePresentationSlide.js';
import { register as deletePresentationSlides } from './deletePresentationSlides.js';
import { register as reorderPresentationSlides } from './reorderPresentationSlides.js';
import { register as createSlideFromLayout } from './createSlideFromLayout.js';
import { register as insertPresentationTemplateSlide } from './insertPresentationTemplateSlide.js';

export function registerSlidePresentationTools(server: FastMCP) {
  copyPresentation(server);
  getPresentationSlides(server);
  deletePresentationSlide(server);
  deletePresentationSlides(server);
  reorderPresentationSlides(server);
  createSlideFromLayout(server);
  insertPresentationTemplateSlide(server);
}
