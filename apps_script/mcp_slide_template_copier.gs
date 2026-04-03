/**
 * MCP Google Slides Server — Template Slide Copier
 *
 * Copies one specific slide from a source presentation into a target
 * presentation. Deploy this Apps Script as an API Executable so the MCP
 * server can call it via google.script('v1').scripts.run().
 *
 * Setup:
 *   1. Create a new Apps Script project at https://script.google.com
 *   2. Link the project to the SAME Google Cloud project as the OAuth client
 *      used by this MCP server (Project Settings -> Change project).
 *   3. Paste this file's contents.
 *   4. Deploy -> New deployment -> Select type: API Executable -> Deploy.
 *   5. Store the deployment ID in GOOGLE_APPS_SCRIPT_ID
 *      (APPS_SCRIPT_DEPLOYMENT_ID remains supported as a fallback).
 */

/**
 * Copy a slide from one presentation into another presentation.
 *
 * @param {string} sourcePresentationId
 * @param {string} sourceSlideId
 * @param {string} targetPresentationId
 * @param {number|null} insertionIndex
 * @return {{success: boolean, message?: string, newSlideId?: string, targetPresentationId?: string}}
 */
function copySlideToPresentation(
  sourcePresentationId,
  sourceSlideId,
  targetPresentationId,
  insertionIndex
) {
  try {
    if (!sourcePresentationId || !sourceSlideId || !targetPresentationId) {
      return {
        success: false,
        message: 'Missing required fields: sourcePresentationId, sourceSlideId, and targetPresentationId are required.',
      };
    }

    var sourceDeck = SlidesApp.openById(sourcePresentationId);
    var targetDeck = SlidesApp.openById(targetPresentationId);
    var sourceSlide = null;
    var slides = sourceDeck.getSlides();

    for (var i = 0; i < slides.length; i++) {
      if (slides[i].getObjectId() === sourceSlideId) {
        sourceSlide = slides[i];
        break;
      }
    }

    if (!sourceSlide) {
      return {
        success: false,
        message: 'Slide template not found',
      };
    }

    var hasInsertionIndex =
      insertionIndex !== null &&
      insertionIndex !== undefined &&
      !isNaN(Number(insertionIndex)) &&
      Number(insertionIndex) >= 0;

    var copiedSlide = hasInsertionIndex
      ? targetDeck.insertSlide(Number(insertionIndex), sourceSlide)
      : targetDeck.appendSlide(sourceSlide);

    return {
      success: true,
      newSlideId: copiedSlide.getObjectId(),
      targetPresentationId: targetPresentationId,
    };
  } catch (error) {
    return {
      success: false,
      message: String(error),
    };
  }
}
