import { describe, expect, it } from "vitest";

import { formatPhp } from "@/lib/currency";

describe("formatPhp", () => {
  it("formats whole Philippine pesos without decimal places", () => {
    expect(formatPhp(499)).toBe("₱499");
    expect(formatPhp(1800)).toBe("₱1,800");
  });

  it("rejects invalid peso values", () => {
    expect(() => formatPhp(-1)).toThrow(RangeError);
    expect(() => formatPhp(10.5)).toThrow(RangeError);
  });
});

import { formatCentavos } from "./currency";
it("formats refundable deposit centavos exactly", () =>
  expect(formatCentavos(12345)).toBe("₱123.45"));
it("rejects fractional centavos", () =>
  expect(() => formatCentavos(1.2)).toThrow());
