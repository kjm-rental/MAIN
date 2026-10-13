# Booking design replacement — October 12, 2026

## View locally

- Preselected motorcycle; skips showroom: http://localhost:3000/book/yamaha-mio-gravis-125-d1342cb8
- No preselection; opens showroom: http://localhost:3000/book

## Implemented

A new editorial page composition replaces the previous twin-calendar/sidebar cards: large motorcycle feature panel, dark teal model/rate block, pickup/return trip strip, linear progress navigation, white booking workspace, and a separate price breakdown. The new date stage displays one active pickup or return calendar, with selection tabs, larger date cells, time buttons, availability indicators and automatic advancement to return. Empty extras no longer occupy a booking section. Details/upload controls, review blocks and the receipt use the new visual hierarchy and scoped styling.

Model-specific Book Now URLs resolve an existing published model to its database ID and begin at Dates & Times. The generic URL begins at Motorcycle. Explicit Change Motorcycle opens the showroom. Selecting a replacement updates the canonical model URL without remounting the entered form; refresh resolves that published model again. Existing motorcycle entry-point URLs remain compatible.

Pricing, private upload state/previews, required documents, terms, cash/deposit policies, backend submission, holds, idempotency and actual confirmation statuses are reused. No database schema, migration, prices, ADMIN, production settings, or existing API implementation changed. The unconfigured state now shows a read-only planning interface; Dates & Times cannot continue and submission remains guarded until the existing configuration conditions permit it.

## Validation

- 38 targeted tests passed across six files, including new preselection and Manila midnight presentation tests.
- TypeScript and focused ESLint passed.
- One production build passed; existing motion CSS warnings remain.
- 11 actual localhost browser checks passed: generic showroom, preselected skip, model/rate summary, one calendar, connected availability response, required dates before Continue, refresh preservation, explicit change, URL persistence, changed-model refresh, mobile width.
- Three additional actual connected-backend checks passed: pickup apply advances to return, whole-period return validation enables Continue, selected rental mobile layout fits. These were read-only availability requests; no booking submission or production mutation occurred.
- Desktop/mobile screenshots are saved alongside the browser result files and visually inspected. No simulated availability was used for these checks.

## Current backend state

Unlike the earlier investigation, the connected availability RPC now responds successfully. A read-only check also observed `public_booking_enabled=true` in the connected environment. This task did not enable it, apply migration 023, or alter any backend setting. No missing-RPC blocker was reproduced during the final checks. Failed requests still fail closed and retain one clear Retry message in the single active calendar.

## Files

`src/components/website/booking-checkout.tsx`, `booking-page.tsx`, `booking-date-stage.tsx`, `booking-wizard.css`; `src/lib/booking-presentation.ts` and its tests; `src/app/(website)/book/page.tsx` and `book/[slug]/page.tsx`.

No deployment, commit or push performed. Full booking submission was not repeated against production during this frontend task.
