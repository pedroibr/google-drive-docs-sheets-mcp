import type { FastMCP } from 'fastmcp';
import { register as duplicatePresentationSlide } from './duplicatePresentationSlide.js';
import { register as replaceSlidePlaceholders } from './replaceSlidePlaceholders.js';
import { register as replacePresentationPlaceholders } from './replacePresentationPlaceholders.js';
import { register as listSlideElements } from './listSlideElements.js';

export function registerSlideTools(server: FastMCP) {
  duplicatePresentationSlide(server);
  replaceSlidePlaceholders(server);
  replacePresentationPlaceholders(server);
  listSlideElements(server);
}
