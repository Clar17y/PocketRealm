export function titleCaseFromSnake(input: string): string {
  return input.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

