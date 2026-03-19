const TURNS_SPENT_PREFIX = 'turns-spent:';

export function recordTurnsSpent(zoneId: string, count: number): void {
  if (count <= 0) return;
  const key = `${TURNS_SPENT_PREFIX}${zoneId}`;
  const current = parseInt(sessionStorage.getItem(key) ?? '0', 10);
  sessionStorage.setItem(key, String(current + count));
}

export function getTopZone(): string | null {
  let topZone: string | null = null;
  let topCount = 0;

  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (!key?.startsWith(TURNS_SPENT_PREFIX)) continue;

    const count = parseInt(sessionStorage.getItem(key) ?? '0', 10);
    if (count > topCount) {
      topCount = count;
      topZone = key.slice(TURNS_SPENT_PREFIX.length);
    }
  }

  return topZone;
}
