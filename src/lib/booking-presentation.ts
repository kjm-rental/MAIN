export function initialBookingStep(preselected: boolean) {
  return preselected ? 1 : 0;
}
export function formatBookingDate(value: string) {
  if (!value) return "";
  const date = new Date(`${value}:00+08:00`);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
