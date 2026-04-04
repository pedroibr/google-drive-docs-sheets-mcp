# Slides

Tools for creating, inspecting, updating, templating, and previewing Google Slides presentations.

Slides tools follow the same conventions as the rest of the server: flat public schemas where possible, stable structured payloads in responses, and direct use of native Google API concepts when flattening would hide important functionality. `batchUpdatePresentation` remains available as the low-level escape hatch for native Slides API requests that are not yet wrapped directly.

## Core Presentation Tools

| Tool                           | Description                                         |
| ------------------------------ | --------------------------------------------------- |
| `createPresentation`           | Creates a new presentation and optionally moves it  |
| `getPresentation`              | Reads presentation metadata and summarizes slides   |
| `listPresentations`            | Presentation-focused list wrapper over `listDriveFiles` |
| `searchPresentations`          | Presentation-focused search wrapper over `searchDriveFiles` |
| `batchUpdatePresentation`      | Applies raw Google Slides batch update requests     |
| `getPresentationPage`          | Reads a specific slide/page and its element list    |
| `getPresentationPageThumbnail` | Generates a PNG thumbnail URL for a slide           |

## Template Tools

Template workflows use speaker notes as the primary metadata source. Notes can store lines such as `template_category: content_1c` and `template_name: default-one-column`.

| Tool                                 | Description                                                            |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `listPresentationTemplateSlides`     | Lists all slides in a template deck with notes and parsed metadata     |
| `getPresentationTemplateSlide`       | Reads one template slide with placeholders, notes, and element summary |
| `readSlideNotes`                     | Reads speaker notes and the notes/speaker shape IDs                    |
| `updateSlideNotes`                   | Replaces or appends speaker notes                                      |
| `readPresentationTemplateMetadata`   | Parses template metadata from notes                                    |
| `updatePresentationTemplateMetadata` | Updates managed template metadata keys in notes                        |
| `validateSlidePlaceholders`          | Discovers placeholders and compares them with an expected list         |

## Presentation Lifecycle Tools

| Tool                       | Description                                                  |
| -------------------------- | ------------------------------------------------------------ |
| `copyPresentation`         | Copies an existing presentation into a new deck              |
| `getPresentationSlides`    | Returns a slide list with optional notes and placeholders    |
| `deletePresentationSlide`  | Deletes a single slide                                       |
| `deletePresentationSlides` | Deletes multiple slides in one batch                         |
| `reorderPresentationSlides`| Moves one or more slides to a new insertion index            |
| `createSlideFromLayout`    | Creates a new slide from a layout or predefined layout value |
| `insertPresentationTemplateSlide` | Copies one slide from a template deck into another presentation |

## Slide-Level Tools

| Tool                            | Description                                                  |
| ------------------------------- | ------------------------------------------------------------ |
| `duplicatePresentationSlide`    | Duplicates a slide, optionally assigning deterministic IDs   |
| `replaceSlidePlaceholders`      | Replaces placeholders on one slide only                      |
| `replacePresentationPlaceholders` | Replaces placeholders across the whole deck                |
| `listSlideElements`             | Lists summarized page elements on a slide                    |

## Apps Script-backed Features

`insertPresentationTemplateSlide` uses the Apps Script Execution API because the native Google Slides API cannot copy a slide directly from one presentation into another. Configure `GOOGLE_APPS_SCRIPT_ID` with your API Executable deployment ID. The legacy `APPS_SCRIPT_DEPLOYMENT_ID` env var remains supported as a fallback.

## Element Tools

| Tool                         | Description                                              |
| ---------------------------- | -------------------------------------------------------- |
| `getSlideElement`            | Reads one page element with a stable summarized payload  |
| `insertTextIntoSlideShape`   | Replaces, appends, or inserts text into a shape          |
| `updateSlideTextStyle`       | Applies text style updates to a text-capable shape       |
| `updateSlideParagraphStyle`  | Applies paragraph style updates to a text-capable shape  |
| `createSlideTextBox`         | Creates a text box or other text-capable shape           |
| `moveSlideElement`           | Moves an element to an absolute position                 |
| `resizeSlideElement`         | Resizes an element by computing a new absolute transform |
| `deleteSlideElement`         | Deletes a page element                                   |
| `replaceSlideImage`          | Replaces an existing image by object ID                  |
| `createSlideImage`           | Creates a new image element                              |
| `updateSlideElementAltText`  | Updates alt text title and description                   |
| `createSlideTable`           | Creates a new table element                              |
