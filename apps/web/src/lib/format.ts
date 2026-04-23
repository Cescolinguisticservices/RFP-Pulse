/** Minimal date-distance formatter to avoid pulling in date-fns for one call site. */
export function formatDistanceToNowStrict(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const day = 24 * 60 * 60 * 1000;
  const hour = 60 * 60 * 1000;
  if (abs >= day) {
    const days = Math.round(abs / day);
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  const hours = Math.max(1, Math.round(abs / hour));
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}
