# KJM Motorcycle Rental Architecture

## Two-application architecture

The root workspace contains two independently deployable codebases:

- `KJM MAIN` is the public customer-facing website.
- `KJM ADMIN` is the private rental-management application foundation.

Each application owns its own `package.json`, lockfile, environment variables, Next.js build, and Vercel project. They must never be combined into one Next.js route tree. Phase 2 removed the former public-app `/admin` placeholder so the separation is explicit.

Both applications will eventually connect to the same Supabase project. `KJM MAIN/supabase/migrations` is the single planned migration source of truth unless a dedicated infrastructure repository is approved. `KJM ADMIN` consumes the shared schema and must not introduce a competing migration history.

Phase 3 establishes that shared schema and read-only public integration. See [SUPABASE_PHASE3.md](SUPABASE_PHASE3.md) for the entity model, RLS matrix, concurrency design, migration order, and deployment procedure.

## Architectural goals

The application uses explicit boundaries so the public experience, privileged staff experience, server-side business rules, data access, and third-party integrations can evolve independently. Next.js Server Components are the default. Client Components should be introduced only for browser state, event handlers, or browser-only APIs.

## Layer and ownership map

| Area                 | Location                                      | Responsibility                                                          |
| -------------------- | --------------------------------------------- | ----------------------------------------------------------------------- |
| Customer UI          | `src/app/(website)`, `src/components/website` | Public routes and customer-facing compositions                          |
| Shared layout/UI     | `src/components/layout`, `src/components/ui`  | Presentational primitives without business/data access                  |
| Admin UI             | sibling application `../KJM ADMIN`            | Future staff-only screens; currently an unprotected placeholder         |
| Server HTTP boundary | `src/app/api` and future Server Actions       | Input validation, authentication, authorization, orchestration          |
| Application services | `src/services`                                | Booking, pricing, fleet, customer, and payment use cases                |
| Supabase access      | `src/lib/supabase`                            | Environment-safe browser/server client creation and future repositories |
| Domain contracts     | `src/types`, `src/lib/constants`              | Shared domain types and approved immutable reference data               |
| Database evolution   | `supabase/migrations`                         | Reviewed PostgreSQL schema, functions, constraints, and RLS policies    |

Dependencies should flow from routes/components toward services and data adapters, not from data access back into UI. UI components must not hold service-role credentials or directly implement authorization rules.

## Customer and admin separation

The `(website)` route group provides the customer layout without changing public URLs. The admin interface is not a route inside this application; it is the separate sibling `KJM ADMIN` codebase and Vercel deployment.

The route split is organizational, not a security boundary. Before real admin functionality is added, every admin route and server operation must verify a valid staff session and role. Database Row Level Security remains mandatory even when route guards exist.

## Server-side operations

Mutations and sensitive reads belong on the server through narrowly scoped route handlers or Server Actions. The server boundary will:

1. authenticate the caller;
2. parse and validate input with Zod;
3. authorize the action against a defined role/capability;
4. call an application service;
5. perform transactional database work where consistency matters;
6. return a minimal typed result without leaking internal errors or private records.

Pricing, availability, booking status transitions, payment state, and administrative permissions must never rely on browser-provided truth.

## Supabase data access

`src/lib/supabase/client.ts` creates a browser client using only the public URL and publishable/anon key. `src/lib/supabase/server.ts` uses the supported `@supabase/ssr` cookie adapter and the asynchronous Next.js cookies API. Configuration is checked when a client is created, allowing static Phase 2 builds without credentials.

Future authentication will add a Next.js proxy for safe session refresh following current Supabase guidance. Until it is designed and tested, no route is presented as protected.

As the data model grows, feature-oriented repository functions should contain queries and return narrow typed results. Elevated service-role access, if ever required, must live in a clearly named server-only module, use a non-public environment variable, and be restricted to use cases that cannot be satisfied through a user session plus RLS.

## Model catalog versus fleet inventory

The catalog represents rentable models and current advertised daily rates. `motorcycle_units` represents physical motorcycles. Availability must query units and overlapping bookings or maintenance blocks; the presence of a catalog entry is never evidence of availability.

Manufacturer-reference fields on `motorcycle_models` carry an explicit verification state and source URL. They must not be interpreted as a physical-unit inspection. Fields affected by an unknown year or variant remain null or visibly qualified. Research provenance and unresolved questions live in `docs/MOTORCYCLE_RESEARCH.md`.

Catalog media metadata is stored separately in `motorcycle_media`, including sort order, alt text, license status/source, media type, and verification status. Binary assets are planned for the public `motorcycle-catalog` Storage bucket. Public reads are appropriate only for approved catalog media; object writes require an authenticated active admin under RLS. The customer app does not expose upload or editing controls. Future admin screens must use the staff session and existing RLS boundary, never a browser-exposed service key.

Booking records should preserve the quoted model, rate, duration rules, line totals, and final amount so later catalog edits cannot rewrite history.

## Future payment integration

Payment support will sit behind a provider-neutral service contract in `src/services`. Provider SDK calls and secrets will be server-only. A typical flow will create an internal booking/payment attempt, initiate provider checkout, redirect the customer, and use a cryptographically verified webhook as the authoritative asynchronous result.

Webhook processing must be idempotent, persist raw provider identifiers safely, tolerate repeated or reordered events, and transition payment/booking states transactionally. Browser return pages may show status but must not mark a payment successful on their own. Provider selection and exact flow remain unresolved.

## Caching and rendering

Marketing and approved catalog content can be statically rendered or revalidated. Availability, customer records, bookings, admin pages, and payment status are user-specific or time-sensitive and must use dynamic server reads with deliberate cache controls. Mutations should revalidate only affected paths/tags after successful commits.

## Security and observability boundaries

- Secrets are server-only; only the public Supabase project URL and publishable/anon key use `NEXT_PUBLIC_*`.
- RLS and database constraints protect data even if application code is bypassed.
- Logs should use request/correlation identifiers and exclude credentials, ID documents, payment data, and unnecessary personal data.
- Future operational metrics should cover booking failures, payment/webhook failures, authorization denials, and data-layer latency without exposing customer details.
- Error messages shown to customers remain helpful but non-sensitive; detailed diagnostics remain server-side.

## Current implementation reality

The public marketing and catalog routes read published model data from Supabase when configured, with a conspicuously labeled local development fallback when offline. The fallback includes the researched catalog content. Catalog controls remain client-side after the server read. Date search is a transparent preview and does not query inventory. The migration files define database tables, catalog-content fields, governed media metadata/storage, and RLS but were not applied in this environment; there are still no booking writes, customer self-service rules, live availability, media uploads, or payment integration.

`KJM ADMIN` provides disabled sign-in UI, an unsecured data-free dashboard shell, shared schema types, and fail-closed service abstractions. Before any deployment or operational work, it requires platform-level deployment protection, Supabase Auth, server-side role verification, tested RLS, and audit logging.
