import { describe, expect, it } from "vitest";
import { rentalJourney } from "./rental-journey";
describe("rental journey content", () => {
  it("includes all seven stages in order", () => {
    expect(rentalJourney).toHaveLength(7);
    expect(rentalJourney[0].title).toBe("Find your motorcycle");
    expect(rentalJourney[1].text).toContain("extras");
    expect(rentalJourney[6].title).toContain("Return");
  });
  it("does not describe submission as confirmation", () => {
    expect(rentalJourney[3].text).toContain("does not guarantee confirmation");
    expect(rentalJourney[4].text).toContain("KJM must review");
    expect(rentalJourney[4].text).toContain("before pickup");
    expect(rentalJourney[4].text).toContain(
      "International bookings retain manual approval",
    );
  });
  it("retains document and international-renter requirements", () => {
    expect(rentalJourney[2].text).toContain("government ID or passport");
    expect(rentalJourney[2].text).toContain("driver’s license");
    expect(rentalJourney[2].text).toContain("International renters");
  });
});
