/**
 * Generic weighted random selection.
 * Returns a random item from the array, weighted by the callback value.
 */
export function pickWeighted<T>(items: T[], getWeight: (item: T) => number): T | null {
  if (items.length === 0) return null;

  const totalWeight = items.reduce((sum, item) => sum + Math.max(0, getWeight(item)), 0);
  if (totalWeight <= 0) return null;

  let roll = Math.random() * totalWeight;
  for (const item of items) {
    roll -= Math.max(0, getWeight(item));
    if (roll <= 0) return item;
  }
  return items[items.length - 1] ?? null;
}
