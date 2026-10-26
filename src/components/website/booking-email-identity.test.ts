import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { BookingEmailIdentity } from "./booking-email-identity";
it("uses the entered guest email and offers no verification or account controls", () => {
  const html = renderToStaticMarkup(
    createElement(BookingEmailIdentity, {
      verifiedEmail: "old-account@example.invalid",
      value: "guest@example.invalid",
      onChange: vi.fn(),
    }),
  );
  expect(html).toContain('value="guest@example.invalid"');
  expect(html).not.toContain("old-account@example.invalid");
  expect(html).not.toContain("readOnly");
  expect(html).not.toContain("Verify");
});
