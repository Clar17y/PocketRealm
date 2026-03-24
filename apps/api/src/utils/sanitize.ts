/**
 * Strip Unicode control characters from user-provided text.
 * Preserves normal whitespace (space, tab, newline) but removes
 * C0/C1 control chars that can cause rendering issues or be used
 * for text injection attacks.
 */
export function sanitizeUserText(input: string): string {
  // Remove C0 controls (except \t \n \r) and C1 controls and DEL
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x80-\x9F]/g, '');
}

/** Escape HTML entities for safe interpolation into HTML templates (e.g., emails). */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
