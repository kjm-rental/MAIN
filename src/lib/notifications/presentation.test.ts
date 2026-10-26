import { afterEach, expect, it, vi } from "vitest";
import {
  BRAND,
  EMAIL_ASSETS,
  messages,
  render,
  type Template,
} from "./templates";
const p = {
  bookingId: "11111111-1111-4111-8111-111111111111",
  reference: "KJM-VISUAL-TEST",
  customerName: "Alex Sample",
  motorcycle: "Honda Click 160",
  pickupAt: "2030-01-01T01:00:00Z",
  returnAt: "2030-01-02T01:00:00Z",
  rentalCentavos: 70000,
  amountCentavos: 250000,
  pickupLocation: "Verified fixture pickup location",
  pickupInstructions: "Verified fixture collection instructions",
};
afterEach(() => vi.unstubAllEnvs());
it.each(Object.keys(messages) as Template[])(
  "shares accessible branded layout and plain text for %s",
  (template) => {
    const r = render(template, p);
    expect(r.html).toContain(EMAIL_ASSETS.logo);
    expect(r.html).toContain(EMAIL_ASSETS.scenic);
    expect(r.html).toContain("Cebu-inspired illustration");
    expect(r.html).toContain("max-width:600px");
    expect(r.html).toContain('role="presentation"');
    expect(r.html).toContain("<!--[if mso]>");
    expect(r.html).toContain("@media only screen and (max-width:480px)");
    expect(r.html).not.toMatch(
      /<script|<svg|<iframe|display:flex|display:grid|@import/,
    );
    expect(r.text).toContain("KJM-VISUAL-TEST");
    expect(r.text).toContain("Cash on Pickup");
    expect(r.html).not.toContain("undefined");
  },
);
it("matches the three required headings while keeping verification and handover separate", () => {
  expect(render("booking_approved", p).html).toContain(
    "Your Ride Is Confirmed!",
  );
  expect(render("verification_approved", p).html).toContain(
    "Identity Verification Approved",
  );
  expect(render("pickup_reminder", p).html).toContain("Pickup Reminder");
  expect(render("verification_approved", p).text).toContain(
    "all remaining pickup requirements still apply",
  );
  expect(render("verification_approved", p).text).not.toMatch(
    /now ready for pickup|You’re all set/,
  );
});
it("uses only the existing authenticated booking URL for customer actions", () => {
  const r = render("booking_approved", {
    ...p,
    bookingUrl: "https://attacker.test",
    documentUrl: "https://private.test/id.png",
  });
  expect(r.html).toContain(
    `href="${BRAND.site}/booking/status/${p.bookingId}"`,
  );
  expect(r.html).not.toContain("attacker.test");
  expect(r.html).not.toContain("private.test");
});
it("omits missing location, customer name and motorcycle photo without inventing them", () => {
  const { customerName, pickupLocation, pickupInstructions, ...base } = p;
  void customerName;
  void pickupLocation;
  void pickupInstructions;
  const r = render("pickup_reminder", base);
  expect(r.html).not.toContain("Hi Alex");
  expect(r.html).not.toContain("Pickup location");
  expect(r.html).not.toContain("booked model");
  expect(r.text).toContain("driver’s license");
});
it("includes only provided pickup instructions and escapes the customer name", () => {
  const r = render("pickup_reminder", {
    ...p,
    customerName: '<img src=x onerror="alert(1)">',
  });
  expect(r.html).toContain("&lt;img");
  expect(r.html).not.toContain("<img src=x");
  expect(r.text).toContain(p.pickupLocation);
  expect(r.text).toContain(p.pickupInstructions);
});
it("allows an actual supplied public catalog photo from the configured project", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://catalog.example.test");
  const url =
    "https://catalog.example.test/storage/v1/object/public/motorcycle-catalog/approved-model.jpg";
  expect(
    render("booking_approved", { ...p, motorcycleImageUrl: url }).html,
  ).toContain(`src="${url}"`);
});
it.each([
  "https://catalog.example.test/storage/v1/object/sign/identity-verification/id.jpg?token=secret",
  "https://catalog.example.test/storage/v1/object/public/identity-verification/id.jpg",
  "https://other.example.test/storage/v1/object/public/motorcycle-catalog/bike.jpg",
  "https://kjmride.com/images/island/cebu-coastal-ride-v2.webp",
  "https://catalog.example.test/storage/v1/object/public/motorcycle-catalog/bike.jpg?token=secret",
  "javascript:alert(1)",
])(
  "never treats private, untrusted or scenic URLs as a booked bike photo: %s",
  (url) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://catalog.example.test");
    const r = render("booking_approved", { ...p, motorcycleImageUrl: url });
    expect(r.html).not.toContain("booked model");
    expect(r.html).not.toContain("token=secret");
  },
);
it("preserves customer-safe correction instructions", () => {
  const r = render("verification_action", {
    ...p,
    customerExplanation:
      "Replace the requested document through your secure booking page.",
  });
  expect(r.html).toContain("Additional Documents Required");
  expect(r.text).toContain("Replace the requested document");
  expect(r.html).not.toContain("Identity Verification Approved");
});
