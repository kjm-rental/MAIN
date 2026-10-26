/** Timestamps already contain an offset: elapsed time is independent of host timezone. */
export function rentalDuration(startAt: string, endAt: string) {
  const minutes = (Date.parse(endAt) - Date.parse(startAt)) / 60000;
  if (!Number.isFinite(minutes) || minutes < 1440) return null;
  const days = Math.floor(minutes / 1440);
  const hours = Math.ceil((minutes % 1440) / 60);
  return {
    days,
    hours,
    label: `${days} day${days === 1 ? "" : "s"}${hours ? ` + ${hours} hour${hours === 1 ? "" : "s"}` : ""}`,
  };
}
