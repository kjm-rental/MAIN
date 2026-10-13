# Rental time-selection grid

Only KJM MAIN's existing rental date/time picker and its two existing callers were updated. The calendar, modal shell, navigation, colors, typography, animations and peach “Use this time” action remain. The dropdowns are replaced by a three-column button grid with 44 px minimum tap targets, dark teal selection, subtle unselected borders and a bounded 112 px scrolling list. Existing dialog overflow handles exceptionally short screens without stretching the popup beyond 90% of viewport height.

## Operating hours and booking values

- Checkout passes its existing `booking_settings.operating_hours` to the picker. The homepage picker reads only that existing public settings column when opened. No Supabase schema, setting or data mutation is made.
- Pickup and return schedules are read separately. Missing/malformed/inaccessible hours fail closed; no invented fallback hours are provided.
- Generate half-hour clock slots dynamically, including exact configured opening/closing boundaries if those are not aligned to a half-hour. Exact boundaries such as 23:59 are not silently lost.
- A configured closing `00:00` is midnight at the **end** of that business day. The closing button displays “12:00 AM · Next day” and emits the next calendar date's `T00:00` value.
- Also preserve midnight belonging to the prior business day's close, even if the actual calendar day is closed. Reopening a previously selected closing midnight keeps that valid slot. Separate pickup/return close rules apply, and duplicate instants are removed.
- Internal values remain `YYYY-MM-DDTHH:mm`; customer labels use 12-hour AM/PM. All past/ordering comparisons use explicit Asia/Manila offsets, not the host timezone.
- Past dates/times and closed-day/out-of-hours choices are unavailable. Return options at or before the selected pickup are disabled. Application rechecks current time before emitting a choice.
- Calendar arrow navigation skips disabled dates. Time buttons support Tab, Enter/Space, arrows, Home/End; native modal Escape and trigger focus restoration remain.
- Actual motorcycle inventory availability continues through the existing period-based availability/quote/submission flow. The grid presents operating-hour slots, not a promise of inventory availability. No model-specific availability rule or pricing formula was introduced.

## Validation performed

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: **11 files, 79 tests passed**. Fourteen added tests cover pickup/return differences, inclusive boundaries, midnight on closed following days, distinct midnights, non-grid endpoints, month/year rollover, malformed schedules, past times, strict return ordering and Manila day conversion.
- `npm run build`: passed. Existing `home-motion.module.css` global-selector warnings remain outside this task.
- Browser test of the actual picker in an isolated local harness at 1440, 390 and 320 px: date/time disabled states, keyboard time selection, pickup output, return after pickup, next-day midnight output, reopening midnight on a closed day, Escape, no horizontal overflow and independently scrolling time list passed. At 320 × 667 the existing outer modal scroll remains necessary; its height stays within 90dvh.
- Live localhost homepage check at 390 px: loaded the existing configured operating hours, selected pickup/return into the existing form, confirmed the internal format and return ordering. No booking/availability submission was made.
- Evidence: `picker-{1440,390,320}.png`, `live-390.png`, `ui-results.json`, `live-results.json` in this directory.

No KJM ADMIN edits, Supabase modifications, pricing changes, public booking activation or deployment were made in this task.
