import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { CheckoutSummary, type CheckoutSummaryProps } from "./checkout-summary";
beforeEach(() => vi.stubGlobal("React", React));
const base: CheckoutSummaryProps = {
  model: "Honda Click 160",
  pickup: "Oct 27 · 1:00 PM",
  returnAt: "Oct 29 · 6:00 PM",
  duration: "2 days + 5 hours",
  rentalCentavos: 210000,
  extrasCentavos: 0,
  deliveryCentavos: 20000,
  collectionCentavos: 40000,
  totalCentavos: 270000,
  depositCentavos: 250000,
  online: true,
};
const markup = (props: Partial<CheckoutSummaryProps> = {}) =>
  renderToStaticMarkup(
    React.createElement(CheckoutSummary, { ...base, ...props }),
  );
it("clearly separates online rental/services from refundable cash at handover", () => {
  const html = markup();
  expect(html).toContain("₱2,700.00");
  expect(html).toContain("₱2,500.00");
  expect(html).toContain("₱5,200.00");
  expect(html).toContain("Pay online · rental &amp; services");
  expect(html).toContain("Cash at handover · deposit");
});
it("shows total cash due for cash checkout without an online amount", () => {
  const html = markup({ online: false });
  expect(html).toContain("Cash at handover");
  expect(html).toContain("₱5,200.00");
  expect(html).not.toContain("Pay online");
});
it("hides zero fees and extras instead of displaying clutter", () => {
  const html = markup({
    deliveryCentavos: 0,
    collectionCentavos: 0,
    extrasCentavos: 0,
  });
  expect(html).not.toContain("Delivery fee");
  expect(html).not.toContain("Collection fee");
  expect(html).not.toContain(">Extras<");
});
it("keeps hourly extension inside the existing rental amount", () => {
  const html = markup({
    pricing: {
      version: 1,
      mode: "hourly",
      baseDays: 2,
      baseChargePhp: 1400,
      additionalHours: 5,
      hourlyRatePhp: 70,
      extensionChargePhp: 350,
      totalPhp: 1750,
      maxExtensionHours: 23,
    },
    rentalCentavos: 175000,
    totalCentavos: 235000,
  });
  expect(html).toContain("Includes 5 additional");
  expect(html).toContain("₱350.00");
  expect(html).toContain("View calculation");
  expect(html).toContain("₱2,350.00");
  expect(html).not.toContain("₱2,700.00");
});
it("does not present pending service fees as an agreed total", () =>
  expect(markup({ servicesPending: true })).toContain("Quote pending"));
