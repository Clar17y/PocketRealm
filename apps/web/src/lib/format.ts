export function titleCaseFromSnake(input: string): string {
  return input.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
});

const MIN_NON_ZERO_DISPLAY_VALUE = 0.001;
const MIN_TWO_DECIMAL_ROUNDING_VALUE = 0.005;
const SUB_TWO_DECIMAL_DISPLAY = '<0.01';

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const absValue = Math.abs(n);
  if (absValue < MIN_NON_ZERO_DISPLAY_VALUE) return '0';
  if (absValue < MIN_TWO_DECIMAL_ROUNDING_VALUE) {
    return n < 0 ? `-${SUB_TWO_DECIMAL_DISPLAY}` : SUB_TWO_DECIMAL_DISPLAY;
  }
  return NUMBER_FORMATTER.format(n);
}

export function formatPercent(ratio: number): string {
  return `${formatNumber(ratio * 100)}%`;
}

/** Format durability to 2 decimal places (omits decimals for whole numbers). */
export function fmtDur(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function xpRateColor(rate: number): string {
  if (rate >= 70) return 'var(--rpg-green-light)';
  if (rate >= 40) return 'var(--rpg-gold)';
  return 'var(--rpg-red)';
}

/** Human-friendly relative time string from an ISO date or a pre-computed millisecond delta. */
/** Format a millisecond duration as "Xh Ym" / "Xh" / "Ym". */
export function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

/** Human-friendly countdown string from an ISO expiry date. Returns 'Expired' when past. */
export function formatTimeRemaining(expiresAt: string | null): string {
  if (!expiresAt) return 'Permanent';
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return 'Expired';
  return formatDuration(remaining);
}

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

