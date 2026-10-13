import { describe, it, expect } from "vitest";
import {
  depositOptionsSchema,
  pickupCashTotal,
  isMissingDepositSchema,
} from "./security-deposits";
const disabled = {
  cash_enabled: false,
  cash_amount_centavos: null,
  id_enabled: false,
  accepted_document_types: [],
  collection_instructions: "",
  return_instructions: "",
  dispute_instructions: "",
  policy_version: "2026-10-11T00:00:00Z",
};
describe("approved deposit options", () => {
  it("defaults to unavailable without inventing an amount", () =>
    expect(
      depositOptionsSchema.parse(disabled).cash_amount_centavos,
    ).toBeNull());
  it("rejects cash without a configured amount", () =>
    expect(
      depositOptionsSchema.safeParse({ ...disabled, cash_enabled: true })
        .success,
    ).toBe(false));
  it("rejects ID without explicitly approved types", () =>
    expect(
      depositOptionsSchema.safeParse({ ...disabled, id_enabled: true }).success,
    ).toBe(false));
  it("keeps rental and refundable deposit separate", () =>
    expect(pickupCashTotal(175000, 12345)).toBe(187345));
  it.each([-1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid money %s",
    (value) => expect(() => pickupCashTotal(value, 0)).toThrow(),
  );
  it("rejects overflow", () =>
    expect(() => pickupCashTotal(Number.MAX_SAFE_INTEGER, 1)).toThrow());
  it("recognizes only missing-schema errors", () => {
    expect(isMissingDepositSchema({ code: "PGRST202" })).toBe(true);
    for (const code of ["42501", "57014", "08006"])
      expect(isMissingDepositSchema({ code })).toBe(false);
  });
});
