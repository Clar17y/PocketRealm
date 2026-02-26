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

