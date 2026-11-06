import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { MotorcycleColorOptions } from "./motorcycle-color-options";
import { CheckoutSummary } from "./checkout-summary";
import { render } from "@/lib/notifications/templates";

const props = {
  options: [
    { color: "Green", available_count: 1 },
    { color: "White / Black", available_count: 0 },
  ],
  value: "Green",
  onChange: () => undefined,
  loading: false,
  error: "",
};
it("shows actual configured colors, disables unavailable options and selects an available color", () => {
  const html = renderToStaticMarkup(
    createElement(MotorcycleColorOptions, props),
  );
  expect(html).toContain("Green");
  expect(html).toContain("White / Black");
  expect(html).toContain("Unavailable");
  expect(html).toMatch(/<input(?=[^>]*value="Green")(?=[^>]*checked="")[^>]*>/);
  expect(html).toMatch(/disabled=""[^>]*value="White \/ Black"/);
  expect(html).not.toContain("registration_plate");
});
it("keeps a color selectable when multiple physical units share it and one remains available", () => {
  const html = renderToStaticMarkup(
    createElement(MotorcycleColorOptions, {
      ...props,
      options: [{ color: "Green", available_count: 1 }],
    }),
  );
  expect(html).not.toContain('disabled=""');
});
it("handles missing colors and loading errors without displaying blank options", () => {
  expect(
    renderToStaticMarkup(
      createElement(MotorcycleColorOptions, {
        ...props,
        options: [],
        value: "",
      }),
    ),
  ).toContain("continue without a color preference");
  expect(
    renderToStaticMarkup(
      createElement(MotorcycleColorOptions, { ...props, error: "Try again" }),
    ),
  ).toContain("Try again");
  expect(
    renderToStaticMarkup(
      createElement(MotorcycleColorOptions, { ...props, loading: true }),
    ),
  ).toContain("Checking colors for your dates");
});
it("asks for a new choice after a selected color becomes unavailable", () => {
  const html = renderToStaticMarkup(
    createElement(MotorcycleColorOptions, { ...props, value: "" }),
  );
  expect(html).toContain("select another");
  expect(html).not.toContain('checked=""');
});
it("preserves the selected color in summary and identifies model photographs", () => {
  const html = renderToStaticMarkup(
    createElement(CheckoutSummary, {
      model: "Test model",
      selectedColor: "White / Black",
      image: { src: "/model.png", alt: "Model photograph" },
      pickup: "Pickup",
      returnAt: "Return",
      duration: "1 day",
      rentalCentavos: 10000,
      extrasCentavos: 0,
      deliveryCentavos: 0,
      collectionCentavos: 0,
      totalCentavos: 10000,
      depositCentavos: 250000,
      online: false,
    }),
  );
  expect(html).toContain("Selected color");
  expect(html).toContain("White / Black");
  expect(html).toContain("actual unit color may differ");
});
it("renders selected color snapshots in confirmation email without internal plates", () => {
  const message = render("booking_approved", {
    bookingId: "11111111-1111-4111-8111-111111111111",
    reference: "TEST",
    motorcycle: "Test model",
    selectedColor: "White / Black",
    pickupAt: "2030-01-01T00:00:00Z",
    returnAt: "2030-01-02T00:00:00Z",
    rentalCentavos: 10000,
    registration_plate: "PRIVATE_PLATE",
  });
  expect(message.text).toContain("White / Black");
  expect(message.html).toContain("White / Black");
  expect(message.text).not.toContain("PRIVATE_PLATE");
  expect(message.html).not.toContain("PRIVATE_PLATE");
});
