export function titleCaseFromSnake(input: string): string {
  return input.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function xpRateColor(rate: number): string {
  if (rate >= 70) return 'var(--rpg-green-light)';
  if (rate >= 40) return 'var(--rpg-gold)';
  return 'var(--rpg-red)';
}

/** Human-friendly relative time string from an ISO date or a pre-computed millisecond delta. */
export function relativeTime(isoOrDeltaMs: string | number): string {
  const deltaMs =
    typeof isoOrDeltaMs === 'number'
      ? isoOrDeltaMs
      : Date.now() - new Date(isoOrDeltaMs).getTime();

  const seconds = Math.max(0, Math.floor(deltaMs / 1000));
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

