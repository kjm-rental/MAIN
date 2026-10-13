import { expect, it } from "vitest";
import { availabilityErrorMessage } from "./availability-error";

it("identifies a missing availability RPC without exposing backend details", () => {
  expect(availabilityErrorMessage({ code: "PGRST202" })).toBe(
    "Live availability is not configured yet. Please retry or contact KJM for help choosing dates.",
  );
});
it("keeps transient failures retryable", () => {
  expect(availabilityErrorMessage({ code: "503" })).toBe(
    "Live availability could not be loaded. Please retry.",
  );
});
