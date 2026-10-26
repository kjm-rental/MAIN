import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { PaymentMethodChoice } from "./payment-method-choice";
afterEach(() => vi.unstubAllGlobals());
it.each(["cash", "online"] as const)(
  "shows only selected cash even when the previous selection was %s and online capabilities are cached",
  (value) => {
    vi.stubGlobal("React", React);
    const markup = renderToStaticMarkup(
      React.createElement(PaymentMethodChoice, {
        value,
        methods: ["card", "qrph"],
        onlineEnabled: true,
        disabled: false,
        onChange: vi.fn(),
      }),
    );
    expect(markup).toContain("Cash on Pickup");
    expect(markup).toMatch(/checked=""[^>]*value="cash"/);
    expect(markup.match(/type="radio"/g)).toHaveLength(2);
    expect(markup).toMatch(/<input[^>]*disabled=""[^>]*value="online"/);
    for (const method of [
      "QRPh — Pay Online",
      "Visa",
      "Mastercard",
      "Google Pay",
      "Apple Pay",
      "GCash",
      "Maya",
      "Coming Soon",
    ])
      expect(markup).toContain(method);
    expect(markup).not.toMatch(/<input[^>]*disabled=""[^>]*value="cash"/);
  },
);
