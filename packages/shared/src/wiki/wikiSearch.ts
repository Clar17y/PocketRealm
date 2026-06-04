import { wikiNavigation } from './wikiNavigation';

export interface WikiSearchResult {
  label: string;
  section: string;
  href: string;
  snippet: string;
  score: number;
}

export function searchWiki(query: string, options: { limit?: number } = {}): WikiSearchResult[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const results: WikiSearchResult[] = [];
  for (const section of wikiNavigation) {
    for (const item of section.items) {
      const haystack = [
        item.label,
        section.label,
        item.href,
        ...(item.aliases ?? []),
        ...(item.keywords ?? []),
      ]
        .join(' ')
        .toLowerCase();

      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      if (score > 0) {
        results.push({
          label: item.label,
          section: section.label,
          href: item.href,
          snippet: `${section.label}: ${item.label}`,
          score,
        });
      }
    }
  }

  return results
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, options.limit ?? 5);
}
