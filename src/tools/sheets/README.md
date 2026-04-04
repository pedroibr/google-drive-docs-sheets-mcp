# Sheets

Tools for reading, writing, and managing Google Spreadsheets, including cell data operations, formatting, validation, sheet/tab management, and spreadsheet creation.

Sheets tools use flatter schemas for write and formatting actions, plus structured response objects designed to work well in stricter MCP hosts.

## Data

| Tool               | Description                                              |
| ------------------ | -------------------------------------------------------- |
| `readSpreadsheet`  | Reads data from a range in a spreadsheet                 |
| `writeSpreadsheet` | Writes data to a range, overwriting existing values      |
| `appendRows`       | Appends rows to the end of a sheet                       |
| `clearRange`       | Clears all cell values in a range without deleting cells |
| `querySpreadsheet` | Query data with filters, sort, groupBy, aggregations, and optional output |
| `pivotSpreadsheet` | Build a logical pivot table, optionally materializing a native pivot in a new sheet |
| `drillDownPivotSpreadsheet` | Expand a logical pivot bucket back into its source rows |
| `suggestSpreadsheetAnalyses` | Inspect a dataset and suggest useful analyses, from simple summaries to crossed pivots |

## Formatting & Validation

| Tool                    | Description                                                             |
| ----------------------- | ----------------------------------------------------------------------- |
| `formatCells`           | Applies formatting (bold, colors, alignment) to a range, row, or column |
| `freezeRowsAndColumns`  | Pins rows and/or columns so they stay visible when scrolling            |
| `setDropdownValidation` | Adds a dropdown list to cells, restricting input to specified values    |

## Management

| Tool                 | Description                                            |
| -------------------- | ------------------------------------------------------ |
| `getSpreadsheetInfo` | Gets metadata about a spreadsheet including all sheets |
| `addSheet`           | Adds a new sheet (tab) to an existing spreadsheet      |
| `createSpreadsheet`  | Creates a new spreadsheet                              |
| `listSpreadsheets`   | Spreadsheet-focused list wrapper over `listDriveFiles` |
| `searchSpreadsheets` | Spreadsheet-focused search wrapper over `searchDriveFiles` |

Analytics defaults:
- `pivotSpreadsheet` never creates a native pivot unless `output` is provided.
- When a native pivot is requested without an explicit destination mode, it creates a new sheet.
- Large query and drill-down results return a preview plus a temporary CSV path instead of flooding the response.
- `suggestSpreadsheetAnalyses` returns human-readable suggestions by default; payloads are opt-in.
- `suggestSpreadsheetAnalyses` defaults to up to 5 suggestions, can return fewer for simple datasets, and can go up to 10 when explicitly requested.
