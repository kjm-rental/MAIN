# Phase 7 design review

MAIN only. No migration, production settings, prices, or ADMIN changes.

Photography: `public/images/island/mactan-beach.jpg`, Lsj, https://commons.wikimedia.org/wiki/File:Mactan-beach.jpg, CC BY-SA 3.0 https://creativecommons.org/licenses/by-sa/3.0/. Original downloaded locally; CSS cropping only. Attribution visible in homepage hero. Scene depicts destination scenery, not KJM premises or motorcycles.

Review locally: `npm run dev -- --port 3000`. Review homepage, fleet, detail, rental information, FAQ, contact, privacy and terms drafts, restricted booking sign-in, booking checkout and owned booking status. Booking submissions remain subject to existing access gates.

Check 360, 390, 768, 1024 and 1440 pixel widths, menu keyboard controls, date validation, extras quantities, upload selection, and pending request states. No synthetic records should be inserted in production for visual review.

## Changed files

- src/app/globals.css
- src/app/layout.tsx
- src/app/not-found.tsx
- src/app/(website)/page.tsx
- src/app/(website)/about/page.tsx
- src/app/(website)/explore-cebu/page.tsx
- src/app/(website)/how-it-works/page.tsx
- src/app/(website)/motorcycles/[slug]/page.tsx
- src/app/(website)/privacy/page.tsx
- src/app/(website)/error.tsx
- src/app/(website)/loading.tsx
- src/components/layout/site-header.tsx
- src/components/layout/site-footer.tsx
- src/components/ui/page-hero.tsx
- src/components/website/hero.tsx
- src/components/website/home-sections.tsx
- src/components/website/booking-preview.tsx
- src/components/website/motorcycle-card.tsx
- src/components/website/booking-checkout.tsx
- src/components/website/faq-list.tsx
- public/images/island/mactan-beach.jpg
- docs/phase7-design.md

## Verification

Lint, TypeScript, existing 29 tests and webpack production build passed. Edge/Playwright reviewed nine routes at each requested width; all returned 200 with no horizontal overflow or browser runtime errors. Mobile navigation opens and Escape closes it. About, product detail and restricted booking gate returned 200; missing page returned 404. Homepage screenshots: /tmp/kjm-phase7-360.png, /tmp/kjm-phase7-390.png, /tmp/kjm-phase7-768.png, /tmp/kjm-phase7-1024.png, /tmp/kjm-phase7-1440.png.

Remaining review: authenticated checkout stage transitions, actual upload progress/retry and owned booking status require an authorized tester session. Existing backend calls remain intact; these journeys were not executed in this phase. Upload feedback indicates file selection rather than successful transfer. Shared tokens and PageHero update remaining existing informational pages; their content structures were retained. Product photography missing from the approved catalog remains a placeholder.
