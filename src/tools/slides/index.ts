import type { FastMCP } from 'fastmcp';
import { register as createPresentation } from './createPresentation.js';
import { register as getPresentation } from './getPresentation.js';
import { register as batchUpdatePresentation } from './batchUpdatePresentation.js';
import { register as getPresentationPage } from './getPresentationPage.js';
import { register as getPresentationPageThumbnail } from './getPresentationPageThumbnail.js';
import { registerSlideTemplateTools } from './templates/index.js';
import { registerSlidePresentationTools } from './presentations/index.js';
import { registerSlideTools } from './slides/index.js';
import { registerSlideElementTools } from './elements/index.js';

export function registerSlidesTools(server: FastMCP) {
  createPresentation(server);
  getPresentation(server);
  batchUpdatePresentation(server);
  getPresentationPage(server);
  getPresentationPageThumbnail(server);
  registerSlideTemplateTools(server);
  registerSlidePresentationTools(server);
  registerSlideTools(server);
  registerSlideElementTools(server);
}
