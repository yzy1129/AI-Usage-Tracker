export const DEFAULT_ACTIVE_WINDOW_MS = 10 * 60 * 1000;

export function isRecentlyActive(
  lastActive: number,
  now: number = Date.now(),
  activeWindowMs: number = DEFAULT_ACTIVE_WINDOW_MS,
): boolean {
  return lastActive > 0 && now - lastActive < activeWindowMs;
}

export function calculateObservedDuration(
  startTime: number,
  lastActive: number,
  isActive: boolean,
  now: number = Date.now(),
): number {
  if (!startTime) {
    return 0;
  }

  const fallbackEnd = lastActive > 0 ? lastActive : now;
  const endTime = isActive ? Math.max(now, fallbackEnd) : fallbackEnd;
  return Math.max(0, endTime - startTime);
}

export function computeCounterDelta(previousValue: number | undefined, currentValue: number): number {
  if (currentValue <= 0) {
    return 0;
  }

  if (typeof previousValue !== 'number') {
    return currentValue;
  }

  return currentValue >= previousValue ? currentValue - previousValue : currentValue;
}
