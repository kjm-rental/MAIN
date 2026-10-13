# Design B — Minimal Elegant

Implemented the five separate booking screens: Motorcycle (only without preselection), Dates & Times, Your Details, Upload Documents, Review & Confirm, then the backend-derived receipt.

## Local URLs

- Preselected motorcycle; opens Dates & Times: http://localhost:3000/book/yamaha-mio-gravis-125-d1342cb8
- Motorcycle selection: http://localhost:3000/book

## Interface

Booking now has its own compact KJM header and white page, a small Step X of 5 progress bar, teal actions and simple form controls. The full website header/footer, introductory hero and repeated mobile motorcycle summary are removed only from booking routes. Mobile active content scrolls above a separate action area, with safe-area spacing. Desktop retains a compact optional summary.

Details and document uploads are separate. Upload cards provide camera capture, file selection, replacement, local image preview, enlargement and supported-type/8MB validation. Required files block Continue. Existing required document metadata is grouped under Document information. The single approved cash option is preselected when it is the only permitted arrangement; multiple arrangements still require a choice. Existing policy and server quote validation are unchanged.

Files remain in memory until the existing secure booking submission uploads them. The interface accurately labels selection as Ready for secure upload; it does not claim an upload succeeded before storage accepts it. Actual submission shows document-count progress, including safe retry of previously saved files. No document is placed in localStorage or a public bucket.

Existing model validation, URL preselection/refresh preservation, live whole-period availability, Manila time, prices, private storage, terms, idempotency, unit locking, automatic domestic confirmation and international manual review remain. The receipt includes actual backend reference/status, pending verification and Back to Home. No migration, backend setting, ADMIN change, commit, push or deployment occurred.

## Validation

- 39 targeted tests passed across seven files.
- TypeScript and focused ESLint passed; route types regenerated after moving booking into its dedicated layout group.
- One production build passed. Existing homepage motion CSS warnings remain.
- 25 actual-browser assertions passed using localhost routes and real read-only availability/quote APIs. Dates, Details, Documents and Review were checked at 375, 390 and 400 pixels; preselection, separate document step, required files, rejected formats, camera/file selection, enlargement and preservation on Back were verified.
- Seven isolated confirmation-fixture assertions passed, including failed finalization preventing success, explicit confirmed response, pending verification, Back to Home and all three mobile widths. Fixture screenshots are labelled confirmation-fixture; they are not real customer bookings. No production submission or private-storage write was made for browser testing.
- Screenshots and result JSON files are stored in this directory. Document and confirmation screenshots were visually inspected.

The connected availability RPC currently responds successfully. The existing booking master switch was not changed.

## Files

- Booking route files moved from `src/app/(website)/book` to `src/app/(booking)/book` with the same public URLs; added `src/app/(booking)/layout.tsx`.
- Updated `src/components/website/booking-checkout.tsx`, `booking-page.tsx`, and `booking-wizard.css`.
- Added `src/components/website/booking-document-upload.tsx`, `src/lib/booking-document-file.ts`, and its targeted tests.
