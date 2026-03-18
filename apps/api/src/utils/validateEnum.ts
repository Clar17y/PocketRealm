/**
 * Generic validator for DB string columns that should map to a known enum/union type.
 * Returns the value cast to T if it's in the valid set, otherwise returns the fallback.
 */
export function validateEnum<T extends string>(value: string, valid: Set<T>, fallback: T): T {
  return valid.has(value as T) ? (value as T) : fallback;
}
