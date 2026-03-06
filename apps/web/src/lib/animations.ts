export function getStaggerDelay(index: number, increment = 40, maxDelay = 400): string {
  return `${Math.min(index * increment, maxDelay)}ms`;
}
