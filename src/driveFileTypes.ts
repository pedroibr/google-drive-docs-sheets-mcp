/**
 * Human-friendly aliases for common Google Drive file types.
 * The mapping is intentionally permissive so clients can use singular/plural terms.
 */
export const DRIVE_MIME_TYPE_ALIASES: Record<string, string> = {
  doc: 'application/vnd.google-apps.document',
  docs: 'application/vnd.google-apps.document',
  document: 'application/vnd.google-apps.document',
  documents: 'application/vnd.google-apps.document',
  sheet: 'application/vnd.google-apps.spreadsheet',
  sheets: 'application/vnd.google-apps.spreadsheet',
  spreadsheet: 'application/vnd.google-apps.spreadsheet',
  spreadsheets: 'application/vnd.google-apps.spreadsheet',
  slide: 'application/vnd.google-apps.presentation',
  slides: 'application/vnd.google-apps.presentation',
  presentation: 'application/vnd.google-apps.presentation',
  presentations: 'application/vnd.google-apps.presentation',
  folder: 'application/vnd.google-apps.folder',
  folders: 'application/vnd.google-apps.folder',
  form: 'application/vnd.google-apps.form',
  forms: 'application/vnd.google-apps.form',
  pdf: 'application/pdf',
  pdfs: 'application/pdf',
  zip: 'application/zip',
  zips: 'application/zip',
};

export function resolveDriveMimeTypeAlias(mimeType: string): string;
export function resolveDriveMimeTypeAlias(mimeType?: string): string | undefined;
export function resolveDriveMimeTypeAlias(mimeType?: string): string | undefined {
  if (!mimeType) return undefined;
  return DRIVE_MIME_TYPE_ALIASES[mimeType.trim().toLowerCase()] ?? mimeType;
}
