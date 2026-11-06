/** Convert exact 12-hour input to the database's 24-hour wall-clock format. */
export function preferredTime24(
  hour: string,
  minute: string,
  period: "AM" | "PM",
) {
  if (!/^\d{1,2}$/.test(hour) || !/^\d{1,2}$/.test(minute)) return "";
  const h = Number(hour),
    m = Number(minute);
  if (h < 1 || h > 12 || m > 59) return "";
  return `${String((h % 12) + (period === "PM" ? 12 : 0)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
export function preferredTimeParts(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    return { hour: "", minute: "", period: "AM" as const };
  const h = Number(value.slice(0, 2));
  return {
    hour: String(h % 12 || 12).padStart(2, "0"),
    minute: value.slice(3),
    period: h < 12 ? ("AM" as const) : ("PM" as const),
  };
}
