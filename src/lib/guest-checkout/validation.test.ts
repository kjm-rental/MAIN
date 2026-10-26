import { expect, it } from "vitest";
import { customerFieldErrors } from "./validation";
it("returns friendly per-field contact validation", () => {
  expect(
    customerFieldErrors({
      fullName: "",
      email: "bad",
      phone: "x",
      country: "",
      customerType: "philippine_resident",
    }),
  ).toEqual({
    fullName: "Please enter your full name.",
    email: "Please enter a valid email address.",
    phone: "Please enter a valid phone number.",
    country: "Please select your country.",
  });
});
it("accepts valid guest contact details without any account or verified email", () => {
  expect(
    customerFieldErrors({
      fullName: "Guest Customer",
      email: "guest@example.com",
      phone: "+639171234567",
      country: "Philippines",
      customerType: "philippine_resident",
    }),
  ).toEqual({});
});
