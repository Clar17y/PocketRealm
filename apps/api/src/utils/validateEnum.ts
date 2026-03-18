/**
 * Validate a DB string column against a known set of values,
 * returning the fallback if the value is unrecognised.
 */
export function validateEnum<T extends string>(
  value: string,
  valid: ReadonlySet<T>,
  fallback: T,
): T {
  return valid.has(value as T) ? (value as T) : fallback;
}
