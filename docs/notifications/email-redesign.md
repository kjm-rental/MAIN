# KJM email presentation redesign

October 23, 2026 · MAIN only. Implemented against the three-panel reference attached in the conversation. No website pages, ADMIN files, database schema/data, booking/verification decisions, worker, API routes, event mappings, recipient logic, retries or idempotency logic were changed. No email, migration, deployment, push, payment activation or production database operation occurred.

## DESIGN

All **27 existing templates** now share the reference-inspired visual system, including the four still-disconnected future payment templates. The template keys and dispatch mapping remain unchanged. Customer and administrator notifications adapt status colors/headings/content to their actual event.

Recreated the white original-logo masthead, business location/site line, scenic motorcycle banner with white italic heading, rounded white content area, status badge, pale-blue booking reference, motorcycle/date details, rental-price panel, yellow Cash on Pickup badge, separate deposit information, dark teal full-width button and tropical scenic footer.

Specific panels:

- Booking confirmation uses **Your Ride Is Confirmed!**, confirmed status, customer greeting when supplied, real-model data, dates/duration/rental amount, separate ₱2,500 cash deposit, and explicit separation of identity verification from booking confirmation.
- Verification approval uses **Identity Verification Approved**, numbered next steps and a green completion notice. Unlike the reference's “now ready for pickup,” the copy preserves all remaining payment/inspection/handover requirements. Rejected/correction messages use the same design; `verification_action` is presented as **Additional Documents Required**. Existing administrator manual-review mail is styled consistently.
- Pickup reminder uses **Pickup Reminder**, known model/dates, original-document/cash/deposit reminder, and pickup location/instructions only if actually supplied. It does not claim a motorcycle is already ready for release.

The customer CTA uses the existing authenticated `/booking/status/{bookingId}` route. Admin and review CTAs retain their existing configured destinations. No signed document URLs, private identity images, invented pickup address or review URL are introduced.

## BRANDING

Reused the exact original `public/images/brand/kjm-logo.png`. Colors come from the website: deep teal `#153f40`, ocean `#086d69`, sand `#f1e9db`, with muted text and white cards. CSS names Outfit and Plus Jakarta Sans with local email-safe fallbacks; no external font downloads are required. The hero uses an italic serif fallback to approximate the handwritten reference in email clients.

Lapu-Lapu City/Cebu is the existing verified business location from the website footer/About content; it is not presented as a specific pickup address. The template's pickup-location field stays separate.

## PREVIEWS

Open [all three together](previews/index.html), or individually:

1. `/Users/mac/Desktop/KJM/KJM MAIN/docs/notifications/previews/booking-confirmed.html`
2. `/Users/mac/Desktop/KJM/KJM MAIN/docs/notifications/previews/identity-verification-approved.html`
3. `/Users/mac/Desktop/KJM/KJM MAIN/docs/notifications/previews/pickup-reminder.html`

Each has a matching `.txt` plain-text preview, plus mobile/desktop PNGs. Preview details are fictional and explicitly labelled. No fictional booking or verification record was created. Previews reference existing local image files, so they open directly without a server or image network connection. Their customer buttons point to the existing authenticated site route, but the fictional UUID has no real booking.

Regenerate without sending or accessing Supabase:

```sh
node scripts/preview-notification-emails.cjs
```

## IMAGES

| Asset                                | Usage / verification                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original KJM PNG logo                | Masthead. `https://kjmride.com/images/brand/kjm-logo.png` returned HTTP 200 with `image/png`.                                                                                                                                                                                                                                                                                                                                                  |
| Existing `cebu-coastal-ride-v2.webp` | Decorative hero/footer scenery. `https://kjmride.com/images/island/cebu-coastal-ride-v2.webp` returned HTTP 200 with `image/webp`. Existing project provenance documents this as AI illustration. The email explicitly labels it decorative Cebu-inspired artwork, not the booked motorcycle.                                                                                                                                                  |
| Actual booked-model photo            | Optional only. No approved local motorcycle photograph is available: `APPROVED_LOCAL_MOTORCYCLE_MEDIA` is empty. No generated/stock/reference scooter was substituted. The renderer can display a supplied actual-model public catalog image from the configured Supabase project or the site's motorcycle image directory; private/signed/untrusted/scenic URLs are omitted. Rights and exact-model suitability must be established upstream. |

Only the two currently accessible, existing project-owned asset URLs are used by default in real email HTML. The newer coastal-sunset asset returned 404 on the live site and was deliberately excluded. No image was generated, copied from the reference, uploaded or deployed.

The current outbox snapshot does not supply a customer name or actual motorcycle image, so real messages gracefully omit those optional elements. Presentation support was added without changing database payload generation. No speculative model-to-image mapping was added.

Decorative photo backgrounds are intended for clients supporting CSS backgrounds/WebP. Classic Outlook receives an explicit solid teal VML header fallback and readable content; rounded corners and fonts can fall back to native client rendering. When clients block remote images, the logo alt text, solid backgrounds and all booking text remain available. Actual inbox rendering is not claimed verified.

## TESTS

**116 tests passed across five focused files**, covering all 27 layouts plus existing worker, smoke-test, authenticated wakeup and scheduler protections. New presentation cases verify:

- Common branding, inline/table markup, Outlook fallback, responsive media rule and plain-text data.
- Required headings, no false handover readiness, approved/correction separation.
- Existing authenticated customer links, no arbitrary booking URL or private-document injection.
- Missing optional values omitted; supplied name/instructions escaped and kept consistent in plain text.
- Actual-model public catalog image allowlisting; private/signed/cross-project/scenic image rejection.
- Existing online payment templates remain disconnected; recipient/retry/idempotency tests still pass.

TypeScript and focused ESLint passed, as did formatting/whitespace checks. No full build or broad suite was run. Rendered fixture HTML is approximately 10 KB or less per template.

All three previews were rendered and visually inspected in Edge at **390px mobile and 800px desktop**. Each document's scroll width matched its viewport, logo assets loaded, and scenic backgrounds displayed. Six screenshots and [browser metrics](previews/browser-checks.json) are saved alongside the HTML. No clipping/overlap was found in those checks.

No real Gmail, Outlook or mobile mail application received these redesigned templates. The owner's earlier successful Gmail test was for the earlier design and is not represented as a new compatibility test.

## REMAINING

- Review the local previews against the supplied reference. Exact reference photography, handwriting and palm/watercolor footer artwork were not copied: the current project assets and email-client fallbacks are used instead.
- Supply approved, correctly identified motorcycle photographs if bike thumbnails are desired. Populate optional customer-name/photo fields only from trusted existing booking/catalog data in a separately reviewed integration; no infrastructure change is included here.
- Supply actual stored pickup details and a real review URL where those existing integrations remain incomplete.
- After separate authorization, perform a controlled safe-recipient Gmail/Outlook/mobile inbox test for this design. Do not automatically resend the previous one-shot smoke test or remove its attempt lock.
- Review any already-attempted outbox items before a future rollout: changed rendered content is intentionally blocked by the existing request-fingerprint protection rather than resent with changed content.
- Normal booking delivery and reminders remain explicitly disabled in the local environment. No secrets or recipient values were displayed. Existing database/configuration launch requirements remain in the separate verification reports.
