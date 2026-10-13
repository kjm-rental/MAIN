import { expect, it } from "vitest";
import { supportedCheckoutMethods } from "./payment-methods";
it("shows only verified account capabilities implemented by hosted Checkout", () => {
  expect(supportedCheckoutMethods(["qrph"])).toEqual(["qrph"]);
  expect(supportedCheckoutMethods(["card", "qrph", "apple_pay", "gcash"])).toEqual(["card", "qrph"]);
  expect(supportedCheckoutMethods({ methods: ["card"] })).toEqual([]);
  expect(supportedCheckoutMethods(["card", null])).toEqual([]);
});
