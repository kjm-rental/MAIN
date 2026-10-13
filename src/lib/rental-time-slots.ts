export const rentalWeekdays = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
export type RentalTimeKind = "pickup" | "return";
type BusinessDay =
  | { enabled: false }
  | {
      enabled: true;
      pickupOpen: string;
      pickupClose: string;
      returnOpen: string;
      returnClose: string;
    };
export type RentalOperatingHours = Partial<
  Record<(typeof rentalWeekdays)[number], BusinessDay>
>;
export type RentalTimeSlot = { value: string; label: string; nextDay: boolean };
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export function readRentalOperatingHours(
  value: unknown,
): RentalOperatingHours | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const result: RentalOperatingHours = {};
  for (const weekday of rentalWeekdays) {
    if (!(weekday in input)) continue;
    const day = input[weekday];
    if (!day || typeof day !== "object" || Array.isArray(day)) return null;
    const data = day as Record<string, unknown>;
    if (data.enabled === false) {
      result[weekday] = { enabled: false };
      continue;
    }
    if (data.enabled !== true) return null;
    for (const kind of ["pickup", "return"] as const) {
      const open = data[`${kind}Open`],
        close = data[`${kind}Close`];
      if (
        typeof open !== "string" ||
        typeof close !== "string" ||
        !timePattern.test(open) ||
        !timePattern.test(close) ||
        (close !== "00:00" && close < open)
      )
        return null;
    }
    result[weekday] = data as BusinessDay;
  }
  return Object.keys(result).length ? result : null;
}

export function manilaDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function shiftRentalDay(day: string, delta: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}
export function formatRentalTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}
function scheduleFor(day: string, hours: RentalOperatingHours) {
  return hours[rentalWeekdays[new Date(`${day}T12:00:00Z`).getUTCDay()]];
}
function minutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

// Match the existing database validator: midnight may belong to the prior
// business day's closing boundary, even when its actual calendar day is closed.
export function rentalTimeSlots(
  day: string,
  hours: RentalOperatingHours | null,
  kind: RentalTimeKind,
): RentalTimeSlot[] {
  if (!hours || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day)
    return [];
  const slots = new Map<string, RentalTimeSlot>();
  const add = (minute: number) => {
    const nextDay = minute === 1440;
    const slotDay = nextDay ? shiftRentalDay(day, 1) : day;
    const time = nextDay
      ? "00:00"
      : `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    const value = `${slotDay}T${time}`;
    slots.set(value, { value, label: formatRentalTime(time), nextDay });
  };
  const previous = scheduleFor(shiftRentalDay(day, -1), hours);
  if (previous?.enabled && previous[`${kind}Close`] === "00:00") add(0);
  const schedule = scheduleFor(day, hours);
  if (schedule?.enabled) {
    const start = minutes(schedule[`${kind}Open`]);
    const close = schedule[`${kind}Close`];
    const end = close === "00:00" ? 1440 : minutes(close);
    // Include exact configured boundaries even when they are off the half-hour grid.
    add(start);
    for (let minute = Math.ceil(start / 30) * 30; minute <= end; minute += 30)
      add(minute);
    add(end);
  }
  return [...slots.values()].sort((a, b) => a.value.localeCompare(b.value));
}

export function isRentalTimeSelectable(
  value: string,
  now = new Date(),
  after?: string,
) {
  const instant = new Date(`${value}:00+08:00`).getTime();
  const minimum = after ? new Date(`${after}:00+08:00`).getTime() : null;
  return (
    Number.isFinite(instant) &&
    instant > now.getTime() &&
    (minimum === null || (Number.isFinite(minimum) && instant > minimum))
  );
}
