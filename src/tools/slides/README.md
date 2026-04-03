# Slides

Tools for creating, inspecting, updating, and previewing Google Slides presentations.

Slides tools follow the same conventions as the rest of the server: flat public schemas where possible, stable structured payloads in responses, and direct use of native Google API concepts when flattening would hide important functionality.

## Presentation Management

| Tool                      | Description                                         |
| ------------------------- | --------------------------------------------------- |
| `createPresentation`      | Creates a new presentation and optionally moves it  |
| `getPresentation`         | Reads presentation metadata and summarizes slides   |
| `batchUpdatePresentation` | Applies raw Google Slides batch update requests     |

## Slide Inspection

| Tool                           | Description                                      |
| ------------------------------ | ------------------------------------------------ |
| `getPresentationPage`          | Reads a specific slide/page and its element list |
| `getPresentationPageThumbnail` | Generates a PNG thumbnail URL for a slide        |
