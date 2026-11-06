# Navigation latency improvements — 6 November 2026

Production Supabase project region was verified via `supabase projects list`: ap-southeast-2 (Sydney). Before this change, a live delivery-options response identified its function region as iad1 (Washington). Both apps now declare syd1 in vercel.json; live MAIN/API and ADMIN/API responses confirmed the new function region.

Changes:

- MAIN: parallel media/package-rate reads; request-scoped catalog deduplication for metadata + page; booking settings/extras/deposit reads run alongside catalog loading; booking route loading boundary.
- MAIN homepage: static headline, photo and navigation prerender immediately; only current rates, catalog count and featured catalog await live data inside Suspense. No time-based/shared pricing cache.
- ADMIN: proxy uses signature-verified getClaims (production JWKS advertises ES256). Server pages and mutations retain fresh getUser + active administrator membership checks; no authenticated data is cached across requests. Cookie refresh behavior is covered by tests.
- ADMIN: independent payment/service/context and settings reads overlap; nested loading boundaries provide immediate feedback while protected sections load.

Median of three sequential HTTP requests from the same local connection, before/after the first performance deployment:

| Endpoint | Before | After |
|---|---:|---:|
| Homepage | 1,807 ms | 1,747 ms |
| Motorcycle catalog | 2,042 ms | 562 ms |
| Booking page | 1,993 ms | 869 ms |
| Delivery options API | 1,073 ms | 258 ms |
| Admin sign-in | 469 ms | 228 ms |

These measure complete server response transfer, not image loading, hydration, browser rendering or a universal performance guarantee. Cold starts and network variation are included. The separate homepage streaming change was added afterward: build output confirms the headline and photo are in prerendered HTML, rather than waiting for catalog reads. Measurements are in before.json/after.json; reproduce with `node scripts/measure-public-loading.mjs`.

Validation: MAIN 471 tests, ADMIN 513 tests; both ESLint and production builds pass. Production checks confirmed the intended regions, unauthorized Admin export remains 401, and signed-in Fleet navigation shows the loading boundary then real data without another login. No SQL, prices, booking states, payments or notification-delivery settings changed.
