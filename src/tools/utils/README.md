# Utils

Higher-level utility tools that orchestrate multiple API operations to support common workflows. These tools aren't coupled to a single API call but instead combine parsing, content manipulation, and batch updates.

Utility tools follow the same contract as the domain tools: explicit inputs, runtime validation, and structured result payloads.

| Tool                          | Description                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| `replaceDocumentWithMarkdown` | Replaces entire document content with Markdown-formatted content (headings, bold, italic, links, lists) |
| `appendMarkdownToGoogleDoc`   | Appends Markdown content to the end of a document with full formatting                                  |
