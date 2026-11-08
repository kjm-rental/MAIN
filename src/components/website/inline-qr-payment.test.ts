import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { InlineQrPayment, resolveInlinePayment } from "./inline-qr-payment";
it("shows a newly created QR immediately when an earlier status poll had no image", () => {
  const created = {
    status: "pending",
    qrImage: "data:image/png;base64,qr",
    amountCentavos: 49900,
    expiresAt: "2099-01-01T00:00:00Z",
  };
  expect(
    resolveInlinePayment(created, {
      status: "pending",
      qrImage: null,
      amountCentavos: 49900,
      expiresAt: created.expiresAt,
    }).qrImage,
  ).toBe(created.qrImage);
  for (const status of [
    "paid",
    "expired_unpaid",
    "cancelled_unpaid",
    "review_required",
  ])
    expect(
      resolveInlinePayment(created, { status, qrImage: null }).qrImage,
    ).toBeNull();
  expect(
    resolveInlinePayment(created, {
      status: "pending",
      qrImage: null,
      amountCentavos: 50000,
    }).qrImage,
  ).toBeNull();
  expect(
    resolveInlinePayment(created, {
      status: "pending",
      qrImage: null,
      expiresAt: "2099-02-01T00:00:00Z",
    }).qrImage,
  ).toBeNull();
});
it("shows an unpaid QR on KJM with its saved amount and no confirmation or hosted-checkout link", () => {
  vi.stubGlobal("React", React);
  const html = renderToStaticMarkup(
    React.createElement(InlineQrPayment, {
      bookingId: "11111111-1111-4111-8111-111111111111",
      initial: {
        status: "pending",
        bookingStatus: "pending",
        amountCentavos: 147000,
        qrImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
        expiresAt: "2099-01-01T00:00:00Z",
      },
    }),
  );
  expect(html).toContain("Scan to pay with QRPh");
  expect(html).toContain("awaiting payment");
  expect(html).toContain("1,470");
  expect(html).toContain("data:image/png;base64,");
  expect(html).not.toContain("checkout.paymongo.com");
  expect(html).not.toContain("booking is confirmed");
  vi.unstubAllGlobals();
});
