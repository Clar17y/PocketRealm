export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function randomUnit(roll?: number): number {
  if (typeof roll === 'number' && Number.isFinite(roll)) {
    return clamp(roll, 0, 0.999999999);
  }
  return Math.random();
}
