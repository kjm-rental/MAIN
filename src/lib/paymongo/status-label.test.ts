import { expect, it } from "vitest";
import { paymentStatusLabel } from "./status-label";
it.each([
  "pending",
  "failed_unpaid",
  "cancelled_unpaid",
  "expired_unpaid",
  "review_required",
  "creation_unresolved",
])("never describes %s as a paid booking", (state) => {
  expect(paymentStatusLabel(state)).not.toBe("Paid — verified by PayMongo");
  expect(paymentStatusLabel(state)).not.toContain("Booking confirmed");
});
it("only presents paid from the verified server status", () =>
  expect(paymentStatusLabel("paid")).toBe("Paid — verified by PayMongo"));
it("does not expose unknown technical status values", () =>
  expect(paymentStatusLabel("SQL_UNEXPECTED_STATUS")).toBe(
    "Payment status is temporarily unavailable",
  ));
