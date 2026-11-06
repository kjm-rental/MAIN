import { expect, it } from "vitest";
import {
  isBookingTimeBlocked,
  type BookingTimeBlock,
} from "./booking-time-blocks";
const block: BookingTimeBlock = {
  start_at: "2026-11-10T23:17:00+08:00",
  end_at: "2026-11-11T02:43:00+08:00",
  scope: "pickup",
};
it("respects exact minutes and overnight blocks in Philippine time", () => {
  expect(isBookingTimeBlocked("2026-11-10T23:16", "pickup", [block])).toBe(
    false,
  );
  expect(isBookingTimeBlocked("2026-11-10T23:17", "pickup", [block])).toBe(
    true,
  );
  expect(isBookingTimeBlocked("2026-11-11T00:01", "pickup", [block])).toBe(
    true,
  );
  expect(isBookingTimeBlocked("2026-11-11T02:42", "pickup", [block])).toBe(
    true,
  );
  expect(isBookingTimeBlocked("2026-11-11T02:43", "pickup", [block])).toBe(
    false,
  );
});
it("keeps pickup and return restrictions independent", () => {
  expect(isBookingTimeBlocked("2026-11-11T00:01", "return", [block])).toBe(
    false,
  );
  expect(
    isBookingTimeBlocked("2026-11-11T00:01", "return", [
      { ...block, scope: "both" },
    ]),
  ).toBe(true);
  expect(
    isBookingTimeBlocked("2026-11-11T00:01", "pickup", [
      { ...block, scope: "return" },
    ]),
  ).toBe(false);
});
