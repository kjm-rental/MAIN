# KJM Motorcycle Rental — Project Master Plan

## Product vision and business requirements

KJM Motorcycle Rental serves customers renting motorcycles in Lapu-Lapu City on Mactan Island, Cebu, Philippines. The product should present a modern, premium tropical experience while keeping rental information clear and accessible on phones, tablets, and desktops.

The completed product is expected to support:

- public discovery of motorcycle models and accurate daily pricing;
- date-based rental enquiries and bookings against actual physical fleet units;
- customer details, booking status, rental operations, and administrative workflows;
- secure staff access and appropriate auditability;
- future online payment processing with clear payment and refund states;
- operational deployment on Vercel backed by Supabase.

Phase 2 establishes the complete public marketing and model-catalog experience plus a separate admin application foundation. It does not accept bookings, process payments, authenticate users, or expose operational data.

## Repository and deployment architecture

The `KJM` workspace contains two independent applications:

- `KJM MAIN`: public website and the only owner of the current catalog seed and future shared database migrations;
- `KJM ADMIN`: private staff application foundation, with its own dependencies, environment, build, and Vercel project.

Both will connect to one Supabase project. They must not duplicate independently editable fleet/pricing datasets or create conflicting migration histories. Production model and rate management will move to the shared database in a later phase.

## Technology stack

- Next.js 16 App Router with React 19 and Server Components by default
- TypeScript in strict mode
- Tailwind CSS 4
- Supabase PostgreSQL, Auth, and Storage in future phases
- `@supabase/ssr` for cookie-aware App Router clients
- Vercel for hosting
- Lucide React for interface icons
- Zod for future boundary validation
- ESLint and Prettier for code quality
- Vitest for focused unit tests

Versions are locked in `package-lock.json`. Upgrades must be reviewed, tested, and documented rather than applied implicitly.

## Design system

The visual direction is premium, tropical, spacious, and grounded in Mactan Island without making unsupported claims.

| Token      | Value     | Intended use                              |
| ---------- | --------- | ----------------------------------------- |
| Ocean teal | `#087F8C` | Primary actions, links, highlights        |
| Deep teal  | `#123B42` | Primary text, navigation, strong surfaces |
| Sand       | `#F5EAD7` | Warm page backgrounds                     |
| Sunset     | `#FFB65C` | Accent and primary call-to-action         |
| Off-white  | `#FAFAF7` | Neutral surfaces and page background      |

Plus Jakarta Sans is the primary typeface, loaded through `next/font`. Layouts use consistent responsive containers, restrained shadows, subtle rounded corners, visible focus states, semantic HTML, and readable color contrast. The current brand mark is text only. The official logo will replace it once supplied; no substitute logo will be invented.

## Planned customer experience

The future customer journey is expected to move from a focused landing page to model discovery, model details, rental dates, availability, booking details, payment when approved, and confirmation. Important policies and costs must be displayed before commitment. The system must never imply that a model is available until the booking engine has checked eligible physical units for the requested period.

Phase 2 provides the public marketing and catalog experience using confirmed model names and prices. Visual assets remain clearly labeled placeholders until approved photography is supplied.

## Future booking engine

The booking engine will be designed only after rental policies and workflows are confirmed. It should eventually:

- accept date/time and pickup/return inputs in the business timezone (`Asia/Manila`);
- calculate rental duration and pricing using documented rules;
- map a requested model to one or more physical fleet units without double-booking;
- use transactional server-side operations for availability holds and confirmations;
- maintain explicit booking and payment state machines;
- provide idempotency for retries and payment callbacks;
- keep authoritative pricing and availability checks on the server;
- preserve an auditable pricing snapshot on each booking.

No booking logic exists in Phase 2.

## Future admin system

The eventual admin area may cover fleet units, model catalog content, pricing, bookings, customers, maintenance blocks, payments, file uploads, and operational reporting. It will require Supabase Auth, staff roles, protected server-side authorization, row-level security, audit trails, and safe handling of personally identifiable information.

The separate `KJM ADMIN` application contains a development-only sign-in preview and dashboard shell with no sensitive information. It must not be mistaken for a secured dashboard and must be blocked from public access until real authentication and authorization exist.

## Database design considerations

Database tables will be introduced in a reviewed future migration. Likely concepts include `motorcycle_models`, `motorcycle_units`, `customers`, `bookings`, `booking_items` or unit assignments, `availability_blocks`, `payments`, and `audit_events`.

Key principles:

- models and physical units are separate entities; inventory cardinality must never be inferred from this catalog;
- prices are stored as integer Philippine pesos unless fractional currency requirements are later confirmed;
- booking timestamps should be stored unambiguously and presented in Asia/Manila time;
- database constraints and transactions must enforce invariants, not only UI checks;
- lifecycle statuses should use deliberate constrained values and documented transitions;
- mutable catalog pricing must not alter historical booking totals;
- personal data retention, deletion, and access requirements must be defined before collection;
- indexes should follow measured booking and availability query patterns;
- migrations must be reviewed, forward-safe, and tested before production use.

No production tables are created in Phase 2.

## Security requirements

- Never expose Supabase service-role keys, database passwords, signing secrets, or payment secrets to browser code.
- Treat the Supabase publishable/anon key as public and rely on correctly tested row-level security for data access.
- Authenticate staff and authorize every privileged operation on the server; hiding UI is not authorization.
- Validate all untrusted input at server boundaries with Zod and reject unexpected fields.
- Use secure, HTTP-only cookie sessions through the supported Supabase SSR flow.
- Add CSRF-aware, origin-aware protections where state-changing endpoints require them.
- Apply least privilege to database policies, storage buckets, integrations, and staff roles.
- Verify payment webhooks cryptographically and process them idempotently.
- Avoid sensitive values in source code, client bundles, URLs, analytics, or logs.
- Record security-relevant admin actions and define incident, backup, and recovery procedures.
- Review dependencies and remediate applicable advisories before every release.

## Official motorcycle model catalog

These entries are motorcycle models, not individual physical units. Prices are per day in whole Philippine pesos. Specifications, photos, availability, unit counts, deposits, and additional fees are intentionally unspecified.

| Model                   | PHP/day |
| ----------------------- | ------: |
| Honda Beat              |    ₱499 |
| Yamaha Mio Gravis 125cc |    ₱550 |
| Honda Click 125cc       |    ₱599 |
| Honda Click 160cc       |    ₱700 |
| Yamaha Aerox 160cc      |    ₱750 |
| Honda PCX 160cc         |    ₱800 |
| Yamaha NMAX 155 V3      |    ₱850 |
| Honda ADV 160           |    ₱900 |
| Suzuki V-Strom 160      |    ₱950 |
| Honda ADV 350           |  ₱1,800 |

The source-of-truth seed constant is `src/lib/constants/motorcycles.ts`. A later database seed must derive from or be checked against this approved list.

## Development roadmap and phase boundaries

### Phase 1 — Foundation (complete)

- toolchain, strict TypeScript, linting, formatting, and unit test setup;
- scalable source structure and route boundaries;
- responsive initial homepage and explicit catalog/admin placeholders;
- theme tokens, typography, metadata, shared layout primitives;
- browser/server Supabase client factories with optional local configuration;
- typed official model catalog and peso formatter tests;
- architecture, setup, security, and roadmap documentation.

Excluded: production database schema, auth, booking, checkout, payments, customer accounts, complete catalog, and complete admin dashboard.

### Phase 2 — Public website and separate admin foundation (complete)

- full landing-page sections and responsive navigation;
- interactive local catalog and statically generated model-detail pages using confirmed names/prices;
- how-it-works, Explore Cebu, FAQ, contact, and draft legal routes;
- placeholder-only date search and booking calls to action;
- independently deployable `KJM ADMIN` foundation with disabled sign-in and data-free dashboard shell;
- shared Supabase ownership and independent Vercel deployment documentation.

Excluded: verified photography and logo (not supplied), live availability, booking persistence, payments, customer accounts, authentication, and admin operations.

## Phase 2 public page structure

- `/` — marketing homepage
- `/motorcycles` — searchable/sortable model catalog
- `/motorcycles/[slug]` — static model detail pages
- `/how-it-works` — informational booking journey
- `/explore-cebu` — tourism-inspired placeholder content
- `/faq` — confirmed-state answers and policy caveats
- `/contact` — location and pending contact details
- `/terms`, `/privacy` — non-indexed draft placeholders

## Assets and policies still required

- official KJM logo in production-ready formats;
- approved real photos for every motorcycle model, with ownership/licensing records and alt text;
- approved local/Mactan/Cebu photography with accurate location captions;
- verified phone, email, social links, operating hours, pickup point, and directions;
- rental eligibility, license/ID, age, deposit, equipment, insurance, fees, fuel, damage, delivery, cancellation, late-return, refund, and privacy policies;
- legal review of final terms and privacy notice.

### Phase 3 — Data foundation and fleet operations

- reviewed PostgreSQL schema and canonical migrations (implemented, pending local/remote execution);
- separation of models from physical motorcycle units and concurrency-safe reservation foundation;
- least-privilege Row Level Security design and local SQL verification script;
- read-only public Supabase catalog with an explicit offline development fallback;
- shared admin schema types and fail-closed future data-service boundaries.

Excluded from Phase 3: real admin authentication, staff editing, customer self-service, booking writes, live availability, payment processing, and production migration execution.

### Phase 4 — Booking and customer management

- confirmed rental rules and server-side pricing;
- date/time availability and concurrency-safe unit allocation;
- booking lifecycle, customer records, notifications, and admin booking workflows;
- privacy, retention, and operational safeguards.

### Phase 5 — Payments and production readiness

- select and integrate a supported Philippine payment provider;
- payment intents/checkout, verified webhooks, idempotency, reconciliation, refunds, and failure recovery;
- end-to-end, accessibility, performance, and security testing;
- observability, backups, operational runbooks, and production launch checks.

Phase boundaries may be refined after discovery, but later-phase functionality must not be pulled into an earlier phase without explicit approval.

## Assumptions and unresolved requirements

Current assumptions:

- PHP/day prices are whole-peso base rates supplied by the business.
- KJM may operate multiple physical units of any model; this list conveys no unit counts.
- Asia/Manila will be the business timezone.
- The initial user-facing language is English.
- Supabase and Vercel projects will be provisioned later.

Required decisions before booking or production data work:

- operating hours, pickup/return locations, and delivery options;
- minimum/maximum rental periods and partial-day calculation rules;
- booking lead time, extensions, late returns, cancellations, refunds, and no-shows;
- deposits, taxes, included items, additional fees, damage and fuel policies;
- rider eligibility, license/ID requirements, age rules, and document retention;
- confirmed unit inventory, maintenance blocks, and allocation workflow;
- customer communication channels and approved templates;
- staff roles, approval rules, and audit/reporting needs;
- payment provider, accepted methods, settlement, and refund operations;
- legal/privacy terms, consent language, analytics, data retention, and deletion process;
- official logo, approved photography, model descriptions, and contact details;
- localization or multilingual requirements.
