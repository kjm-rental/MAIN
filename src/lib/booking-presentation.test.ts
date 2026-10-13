import { expect, it } from "vitest";
import { initialBookingStep, formatBookingDate } from "./booking-presentation";
it("skips motorcycle choice only for validated preselection", () => {
  expect(initialBookingStep(true)).toBe(1);
  expect(initialBookingStep(false)).toBe(0);
});
it("formats midnight in Manila without shifting the date", () => {
  expect(formatBookingDate("2035-06-03T00:00")).toContain("Jun 3, 2035");
  expect(formatBookingDate("2035-06-03T00:00")).toContain("12:00 AM");
});
it("does not invent dates", () => {
  expect(formatBookingDate("")).toBe("");
  expect(formatBookingDate("invalid")).toBe("");
});
