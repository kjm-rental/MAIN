import type { RentalTimeKind } from "./rental-time-slots";
export type BookingTimeBlock = {
  start_at: string;
  end_at: string;
  scope: "pickup" | "return" | "both";
};
/** Manila wall-clock input; end of a blocked interval is available again. */
export function isBookingTimeBlocked(
  value: string,
  kind: RentalTimeKind,
  blocks: BookingTimeBlock[],
) {
  const instant = Date.parse(`${value}:00+08:00`);
  return blocks.some(
    (block) =>
      (block.scope === "both" || block.scope === kind) &&
      instant >= Date.parse(block.start_at) &&
      instant < Date.parse(block.end_at),
  );
}
