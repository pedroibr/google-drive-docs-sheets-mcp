import type { FastMCP } from 'fastmcp';
import { register as getSlideElement } from './getSlideElement.js';
import { register as insertTextIntoSlideShape } from './insertTextIntoSlideShape.js';
import { register as updateSlideTextStyle } from './updateSlideTextStyle.js';
import { register as updateSlideParagraphStyle } from './updateSlideParagraphStyle.js';
import { register as createSlideTextBox } from './createSlideTextBox.js';
import { register as moveSlideElement } from './moveSlideElement.js';
import { register as resizeSlideElement } from './resizeSlideElement.js';
import { register as deleteSlideElement } from './deleteSlideElement.js';
import { register as replaceSlideImage } from './replaceSlideImage.js';
import { register as createSlideImage } from './createSlideImage.js';
import { register as updateSlideElementAltText } from './updateSlideElementAltText.js';
import { register as createSlideTable } from './createSlideTable.js';

export function registerSlideElementTools(server: FastMCP) {
  getSlideElement(server);
  insertTextIntoSlideShape(server);
  updateSlideTextStyle(server);
  updateSlideParagraphStyle(server);
  createSlideTextBox(server);
  moveSlideElement(server);
  resizeSlideElement(server);
  deleteSlideElement(server);
  replaceSlideImage(server);
  createSlideImage(server);
  updateSlideElementAltText(server);
  createSlideTable(server);
}
