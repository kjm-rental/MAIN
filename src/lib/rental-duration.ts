/** Actual elapsed duration; pricing rounds billable extensions separately. */
export function rentalDuration(startAt: string, endAt: string) {
  const elapsed = (Date.parse(endAt) - Date.parse(startAt)) / 60000;
  if (!Number.isFinite(elapsed) || elapsed < 1440) return null;
  const totalMinutes = Math.floor(elapsed);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [
    `${days} day${days === 1 ? "" : "s"}`,
    ...(hours ? [`${hours} hour${hours === 1 ? "" : "s"}`] : []),
    ...(minutes ? [`${minutes} minute${minutes === 1 ? "" : "s"}`] : []),
  ];
  return { days, hours, minutes, label: parts.join(" + ") };
}
