const MAX_SUGGESTIONS = 5;
const MAX_EDIT_DISTANCE = 3;

/** Lowercase, trim, and collapse internal whitespace for case-insensitive matching. */
export function normalizeLookupName(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

interface RankedName {
  name: string;
  tier: number; // 0 = startsWith, 1 = contains, 2 = edit-distance
  distance: number;
}

export function matchLookupName(
  query: string,
  names: string[],
): { matchedName: string | null; suggestions: string[] } {
  const normalizedQuery = normalizeLookupName(query);
  if (!normalizedQuery) {
    return { matchedName: null, suggestions: [] };
  }

  const seen = new Set<string>();
  const ranked: RankedName[] = [];

  for (const name of names) {
    const normalized = normalizeLookupName(name);
    if (normalized === normalizedQuery) {
      return { matchedName: name, suggestions: [] };
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    if (normalized.startsWith(normalizedQuery)) {
      ranked.push({ name, tier: 0, distance: 0 });
    } else if (normalized.includes(normalizedQuery)) {
      ranked.push({ name, tier: 1, distance: 0 });
    } else {
      const distance = editDistance(normalizedQuery, normalized);
      if (distance <= MAX_EDIT_DISTANCE) {
        ranked.push({ name, tier: 2, distance });
      }
    }
  }

  ranked.sort((a, b) => a.tier - b.tier || a.distance - b.distance || a.name.localeCompare(b.name));

  return {
    matchedName: null,
    suggestions: ranked.slice(0, MAX_SUGGESTIONS).map((entry) => entry.name),
  };
}

/** Standard Levenshtein distance. */
function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[] = Array.from({ length: cols }, (_, i) => i);

  for (let i = 1; i < rows; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j < cols; j += 1) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }

  return dp[cols - 1];
}
