import { wikiNavigation } from './wikiNavigation';

export interface WikiSearchResult {
  label: string;
  section: string;
  href: string;
  snippet: string;
  score: number;
}

const SCORE = {
  labelExact: 120,
  aliasExact: 100,
  labelContains: 60,
  aliasContains: 50,
  keywordExact: 40,
  keywordContains: 25,
  sectionContains: 8,
  hrefContains: 5,
} as const;

function normalizeSearchText(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

function getFieldScore(value: string, term: string, exactScore: number, containsScore: number): number {
  const normalizedValue = normalizeSearchText(value);
  if (normalizedValue === term) return exactScore;
  if (normalizedValue.includes(term)) return containsScore;
  return 0;
}

function getExactFieldScore(value: string, query: string, exactScore: number): number {
  return normalizeSearchText(value) === query ? exactScore : 0;
}

function getBestExactFieldScore(values: string[], query: string, exactScore: number): number {
  return values.reduce((bestScore, value) => Math.max(bestScore, getExactFieldScore(value, query, exactScore)), 0);
}

function getBestFieldScore(values: string[], term: string, exactScore: number, containsScore: number): number {
  return values.reduce(
    (bestScore, value) => Math.max(bestScore, getFieldScore(value, term, exactScore, containsScore)),
    0,
  );
}

export function searchWiki(query: string, options: { limit?: number } = {}): WikiSearchResult[] {
  const normalizedQuery = normalizeSearchText(query);
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const results: WikiSearchResult[] = [];
  for (const section of wikiNavigation) {
    for (const item of section.items) {
      const aliases = item.aliases ?? [];
      const keywords = item.keywords ?? [];
      const exactPhraseScore =
        getExactFieldScore(item.label, normalizedQuery, SCORE.labelExact) +
        getBestExactFieldScore(aliases, normalizedQuery, SCORE.aliasExact) +
        getBestExactFieldScore(keywords, normalizedQuery, SCORE.keywordExact);
      const termScore = terms.reduce((sum, term) => {
        return (
          sum +
          getFieldScore(item.label, term, SCORE.labelExact, SCORE.labelContains) +
          getBestFieldScore(aliases, term, SCORE.aliasExact, SCORE.aliasContains) +
          getBestFieldScore(keywords, term, SCORE.keywordExact, SCORE.keywordContains) +
          getFieldScore(section.label, term, SCORE.sectionContains, SCORE.sectionContains) +
          getFieldScore(item.href, term, SCORE.hrefContains, SCORE.hrefContains)
        );
      }, 0);
      const score = exactPhraseScore + termScore;
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
