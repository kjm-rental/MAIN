import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { InlineQrPayment } from "./inline-qr-payment";
it("shows an unpaid QR on KJM with its saved amount and no confirmation or hosted-checkout link", () => {
  vi.stubGlobal("React", React);
  const html = renderToStaticMarkup(React.createElement(InlineQrPayment, { bookingId: "11111111-1111-4111-8111-111111111111", initial: {
    status: "pending", bookingStatus: "pending", amountCentavos: 147000,
    qrImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB", expiresAt: "2099-01-01T00:00:00Z",
  } }));
  expect(html).toContain("Scan to pay with QRPh");
  expect(html).toContain("awaiting payment");
  expect(html).toContain("1,470");
  expect(html).toContain("data:image/png;base64,");
  expect(html).not.toContain("checkout.paymongo.com");
  expect(html).not.toContain("booking is confirmed");
  vi.unstubAllGlobals();
});
