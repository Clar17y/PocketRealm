/** Shared low-level helpers for the Discord bot. Keep this module dependency-free. */

/** Narrow an unknown value to a plain record. Arrays are excluded on purpose. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Truncate text to maxLength characters, ending with an ellipsis when cut. */
export function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

/** Discord timestamp display styles used by the bot: F = full date/time, R = relative. */
export type DiscordTimestampStyle = 'F' | 'R';

/**
 * Format an ISO date string as a Discord timestamp tag, returning the provided
 * fallback copy when the value is not a parseable date.
 */
export function formatDiscordTimestamp(
  value: string,
  style: DiscordTimestampStyle,
  fallback: string,
): string {
  const timestamp = Math.floor(new Date(value).getTime() / 1000);
  if (!Number.isFinite(timestamp)) {
    return fallback;
  }

  return `<t:${timestamp}:${style}>`;
}
