import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { BRAND, connected, manila, messages, render } from "./templates";
import { dispatchOne, type RPC } from "./worker";

const p = {
  bookingId: "11111111-1111-4111-8111-111111111111",
  reference: "KJM-TEST-001",
  motorcycle: "Honda Click",
  pickupAt: "2026-10-23T01:00:00+00:00",
  returnAt: "2026-10-24T01:00:00+00:00",
  rentalCentavos: 70000,
  amountCentavos: 250000,
  depositOption: "cash",
  depositCentavos: 250000,
  pickupLocation: "Configured test pickup",
  pickupInstructions: "Test instructions",
};
const n = {
  id: "22222222-2222-4222-8222-222222222222",
  lease_token: "33333333-3333-4333-8333-333333333333",
  event_type: "booking_requested",
  recipient_reference: p.bookingId,
  payload: p,
  is_test: false,
  simulated: false,
  template_version: 1,
  attempt_count: 1,
};
function harness(overrides = {}, recipient = "customer@example.test") {
  const calls: [string, Record<string, unknown>][] = [];
  const rpc: RPC = async (name, args) => {
    calls.push([name, args]);
    if (name === "notification_claim" || name === "notification_claim_booking")
      return [{ ...n, ...overrides }];
    if (name === "notification_delivery_context") return { recipient };
    if (name === "notification_prepare") return { recipient, simulated: false };
    return null;
  };
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify({ id: "provider-test" })));
  return { rpc, calls, transport };
}
describe("email templates", () => {
  it.each(Object.keys(messages) as (keyof typeof messages)[])(
    "renders %s with safe booking data",
    (t) => {
      const result = render(t, {
        ...p,
        secretDocument: "PRIVATE_DOCUMENT_MUST_NOT_APPEAR",
      });
      expect(result.html).toContain("max-width:600px");
      expect(result.html).toContain("KJM-TEST-001");
      expect(result.html).toContain("₱2,500");
      expect(result.text).toContain("Cash on Pickup");
      expect(result.text).not.toContain("PRIVATE_DOCUMENT");
      expect(result.html).not.toContain("undefined");
    },
  );
  it("formats Manila dates and rental totals", () => {
    expect(manila("2026-10-22T17:00:00Z")).toMatch(/Oct 23, 2026.*1:00/);
    expect(render("booking_requested", p).text).toContain("₱700.00");
    expect(render("booking_requested", p).text).toContain("1 day");
  });
  it("makes pending status explicit", () =>
    expect(render("booking_requested", p).text).toContain("not yet confirmed"));
  it("escapes dynamic HTML and strips private data", () => {
    const r = render("booking_cancelled", {
      ...p,
      motorcycle: '<script>"&',
      customerExplanation: "<img src=x>",
      privateNotes: "secret",
    });
    expect(r.html).toContain("&lt;script&gt;&quot;&amp;");
    expect(r.html).not.toContain("<img src=x>");
    expect(r.text).not.toContain("secret");
  });
  it("requires actual pickup data and rejects invalid dates", () => {
    expect(() =>
      render("pickup_instructions", { ...p, pickupLocation: undefined }),
    ).toThrow();
    expect(() =>
      render("booking_requested", { ...p, returnAt: p.pickupAt }),
    ).toThrow();
  });
  it("uses only explicitly configured HTTPS links", () => {
    expect(render("review_request", p).html).not.toContain("Leave a review");
    expect(
      render("review_request", p, { review: "https://example.test/review" })
        .html,
    ).toContain("Leave a review");
    expect(() =>
      render("admin_manual_review", p, { admin: "javascript:alert(1)" }),
    ).toThrow();
  });
  it("keeps all online payment templates outside dispatch", () => {
    for (const t of Object.keys(messages).filter((k) =>
      k.startsWith("payment_"),
    ))
      expect(connected[t]).toBeUndefined();
  });
});
describe("outbox worker (mocked RPC and provider only)", () => {
  it("uses database recipient and prepares fingerprint before sending", async () => {
    const h = harness();
    expect(await dispatchOne(h.rpc, { apiKey: "test" }, h.transport)).toBe(
      "sent",
    );
    const [url, req] = h.transport.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(req!.body as string)).toMatchObject({
      to: ["customer@example.test"],
      from: BRAND.from,
      reply_to: BRAND.reply,
    });
    expect(h.calls.map((c) => c[0])).toEqual([
      "notification_claim",
      "notification_delivery_context",
      "notification_prepare",
      "notification_finish",
    ]);
  });
  it("uses stable idempotency keys and identical body on safe retry", async () => {
    const h = harness();
    await dispatchOne(h.rpc, { apiKey: "test" }, h.transport);
    await dispatchOne(h.rpc, { apiKey: "test" }, h.transport);
    expect(h.transport.mock.calls[0][1]!.headers).toEqual(
      h.transport.mock.calls[1][1]!.headers,
    );
    expect(h.transport.mock.calls[0][1]!.body).toEqual(
      h.transport.mock.calls[1][1]!.body,
    );
  });
  it.each([429, 500, 503])(
    "records retriable provider failure %s",
    async (status) => {
      const h = harness();
      h.transport.mockResolvedValue(new Response("", { status }));
      expect(await dispatchOne(h.rpc, { apiKey: "test" }, h.transport)).toBe(
        status === 429 ? "rate_limited" : "transient",
      );
      expect(h.calls.at(-1)?.[1].p_retry_seconds).toBe(120);
    },
  );
  it("handles timeout without exposing exception", async () => {
    const h = harness();
    h.transport.mockRejectedValue(new Error("SECRET"));
    expect(await dispatchOne(h.rpc, { apiKey: "test" }, h.transport)).toBe(
      "transient",
    );
  });
  it("blocks synthetic mail without a safe recipient", async () => {
    const h = harness({ is_test: true });
    expect(await dispatchOne(h.rpc, { apiKey: "test" }, h.transport)).toBe(
      "configuration",
    );
    expect(h.transport).not.toHaveBeenCalled();
  });
  it("redirects synthetic mail exclusively to safe mailbox", async () => {
    const h = harness({ is_test: true });
    await dispatchOne(
      h.rpc,
      { apiKey: "test", testRecipient: "safe@example.test" },
      h.transport,
    );
    expect(JSON.parse(h.transport.mock.calls[0][1]!.body as string).to).toEqual(
      ["safe@example.test"],
    );
  });
  it("rejects wrong admin recipients", async () => {
    const h = harness({
      event_type: "admin_booking_requested",
      recipient_reference: "operations",
    });
    expect(await dispatchOne(h.rpc, { apiKey: "test" }, h.transport)).toBe(
      "invalid_recipient",
    );
    expect(h.transport).not.toHaveBeenCalled();
  });
  it("sends admin mail only to fixed owner", async () => {
    const h = harness(
      {
        event_type: "admin_booking_requested",
        recipient_reference: "operations",
      },
      BRAND.admin,
    );
    expect(await dispatchOne(h.rpc, { apiKey: "test" }, h.transport)).toBe(
      "sent",
    );
  });
  it("never sends stale events cancelled by prepare", async () => {
    const h = harness();
    const rpc: RPC = (name, args) =>
      name === "notification_prepare"
        ? Promise.resolve(null)
        : h.rpc(name, args);
    expect(await dispatchOne(rpc, { apiKey: "test" }, h.transport)).toBe(
      "cancelled",
    );
    expect(h.transport).not.toHaveBeenCalled();
  });
  it("holds changed recipients before send", async () => {
    const h = harness();
    const rpc: RPC = (name, args) =>
      name === "notification_prepare"
        ? Promise.resolve({ recipient: "other@example.test", simulated: false })
        : h.rpc(name, args);
    expect(await dispatchOne(rpc, { apiKey: "test" }, h.transport)).toBe(
      "request_changed",
    );
    expect(h.transport).not.toHaveBeenCalled();
  });
  it("dispatches automatic confirmation without claiming identity approval", async () => {
    const h = harness({
      event_type: "booking_approved",
      payload: {
        ...p,
        status: "confirmed",
        verificationStatus: "under_review",
      },
    });
    expect(
      await dispatchOne(
        h.rpc,
        { apiKey: "test", bookingId: p.bookingId },
        h.transport,
      ),
    ).toBe("sent");
    expect(h.calls[0]).toEqual([
      "notification_claim_booking",
      { p_channel: "resend", p_mock: false, p_booking: p.bookingId },
    ]);
    const body = JSON.parse(h.transport.mock.calls[0][1]!.body as string);
    expect(body.subject).toContain("Booking Confirmed");
    expect(body.text).toContain("Identity verification is separate");
    expect(body.text).not.toContain("pending administrator approval");
    expect(body.text).not.toContain(
      "identification verification has been approved",
    );
  });
  it("cannot dispatch online payment events", async () => {
    const h = harness({ event_type: "payment_successful" });
    expect(await dispatchOne(h.rpc, { apiKey: "test" }, h.transport)).toBe(
      "unsupported_template",
    );
    expect(h.transport).not.toHaveBeenCalled();
  });
  it("marks malformed success as ambiguous", async () => {
    const h = harness();
    h.transport.mockResolvedValue(new Response("{}"));
    expect(await dispatchOne(h.rpc, { apiKey: "test" }, h.transport)).toBe(
      "delivery_ambiguous",
    );
  });
});
describe("prepared SQL safety contract (not database integration)", () => {
  const sql = readFileSync(
    "supabase/migrations/202610220027_resend_email_completion.sql",
    "utf8",
  );
  it("uses actual confirmation transitions independently of identity approval", () => {
    expect(sql).toContain("when 'completed' then 'rental_completed'");
    expect(sql).not.toContain("new.approved_by is null");
    expect(sql).not.toContain("b.approved_by is not null");
    expect(sql).toContain("when 'confirmed' then 'booking_approved'");
    expect(sql).toContain("after insert on public.booking_terms_acceptances");
  });
  it("retains eligibility guards for pickup, return and overdue", () => {
    expect(sql).toContain("b.status='confirmed' and b.start_at>now()");
    expect(sql).toContain("b.status='active' and b.end_at>now()");
    expect(sql).toContain("b.status='active' and b.end_at<now()");
  });
  it("includes confirmation in narrow wakeup and skips stale requests without leasing a batch", () => {
    const claim = sql.slice(
      sql.indexOf("create function public.notification_claim_booking("),
    );
    expect(claim).toContain(
      "event_type in ('booking_requested','booking_approved','admin_booking_requested')",
    );
    expect(claim).toContain("skip locked limit 3 loop");
    expect(claim).toContain("return next n;\n  return;");
    expect(sql).toContain(
      "if p.event_type='booking_requested' then return b.status in ('pending','submitted')",
    );
  });
  it("routes actual review transitions only to staff and requires all approval components", () => {
    expect(sql).toContain(
      "when new.overall_status='under_review' then 'verification_manual_review'",
    );
    expect(sql).toContain("staff:=new.overall_status='under_review'");
    expect(sql).toContain(
      "when 'verification_manual_review' then 'admin_manual_review'",
    );
    expect(sql).toContain(
      "overall_status='approved' and identity_status='approved' and license_status='approved' and entitlement_status='approved' and international_status in ('approved','not_applicable')",
    );
  });
  it("does not activate delivery or modify existing booking records", () => {
    expect(sql).not.toMatch(
      /update public.bookings|resend_enabled\s*=\s*true|cron.schedule/,
    );
    expect(sql).toContain(
      "on conflict(event_key,channel,recipient_reference) do nothing",
    );
  });
});

it("uses the stored deposit arrangement without inventing the cash amount", () => {
  const cash = render("booking_approved", {
    ...p,
    depositOption: "cash",
    depositCentavos: 180000,
  });
  expect(cash.text).toContain("₱1,800");
  expect(cash.html).not.toContain("₱2,500");
  const id = render("booking_approved", {
    ...p,
    depositOption: "eligible_id",
    depositCentavos: null,
  });
  expect(id.text).toContain("Eligible ID deposit arrangement recorded");
  expect(id.html).not.toContain("₱2,500");
});
it("connects factual document receipts and requires real pickup details", () => {
  expect(connected.documents_received).toBe("verification_review");
  expect(connected.pickup_instructions).toBe("pickup_instructions");
  expect(() =>
    render("pickup_instructions", { ...p, pickupInstructions: undefined }),
  ).toThrow();
});

it("renders the authoritative hourly booking snapshot in email and plain text", () => {
  const result = render("booking_approved", {
    ...p,
    rentalCentavos: 175000,
    rentalPricing: {
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
  });
  for (const text of [
    "Base rental",
    "Additional time",
    "₱1,400.00",
    "₱350.00",
    "₱1,750.00",
  ]) {
    expect(result.html).toContain(text);
    expect(result.text).toContain(text);
  }
});

it("uses a cookie-protected guest receipt link without OTP or document-access tokens", () => {
  const result = render("booking_requested", { ...p, guestCheckout: true });
  expect(result.text).toContain(`/guest/booking/${p.bookingId}`);
  expect(result.text).not.toContain("/booking/status/");
  expect(result.text).not.toContain("token=");
  expect(result.text).toContain("not yet confirmed");
});

it("includes escaped delivery/collection snapshots and verified payment state in guest email", () => {
  const result = render("booking_approved", {
    ...p,
    delivery: {
      address: "<b>Hotel lobby</b>",
      areaName: "Owner area",
      scheduledAt: p.pickupAt,
    },
    collection: { address: "Return hotel", scheduledAt: p.returnAt },
    deliveryFeeCentavos: 20000,
    collectionFeeCentavos: 40000,
    paymentMethod: "qrph",
    paymentStatus: "unpaid",
    rentalCentavos: 130000,
  });
  expect(result.text).toContain("QRPh via PayMongo");
  expect(result.text).toContain("Payment status: unpaid");
  expect(result.text).toContain("Return hotel");
  expect(result.html).toContain("&lt;b&gt;Hotel lobby&lt;/b&gt;");
  expect(result.html).toContain("Collection fee");
  expect(result.html).not.toContain("<b>Hotel lobby</b>");
});
