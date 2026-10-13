# KJM Motorcycle Rental

Customer-facing website foundation for KJM Motorcycle Rental in Lapu-Lapu City, Mactan Island, Cebu. The current catalog addition provides researched manufacturer-reference specifications, original descriptions, and license-safe image placeholders.

This is now the public customer-facing application in a two-app workspace. The sibling `KJM ADMIN` directory is a separate Next.js application and must be deployed independently.

## Requirements

- Node.js 20.9 or newer (Next.js 16 requirement)
- npm 10 or newer

## Local startup

1. Clone the repository and enter its root directory.
2. Install the locked dependencies:

   ```bash
   npm ci
   ```

3. Copy the environment template:

   ```bash
   cp .env.example .env.local
   ```

4. Supabase credentials are optional for local builds. To exercise the published catalog read, replace the placeholders in `.env.local` with the public values from **Supabase Dashboard → Project Settings → API**:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000).

The local build and public pages do not require Supabase credentials. Supabase client factories validate configuration only when called.

## Quality commands

```bash
npm run lint
npm run typecheck
npm test
npm run format:check
npm run build
```

Run the production build locally with `npm start` after `npm run build`.

## Environment and security

Only the browser-safe Supabase project URL and anon/publishable credentials belong in `NEXT_PUBLIC_*` variables. Never place a service-role key, database password, JWT secret, or any other privileged credential in a `NEXT_PUBLIC_*` variable or commit it to Git. All `.env*` files are ignored except `.env.example`.

Reviewed database migrations are included, but this delivery does not apply them to a live Supabase project. Authentication, booking operations, media uploads, and payments are not active. The proposed public `motorcycle-catalog` bucket permits writes only to authenticated users who pass the existing active-admin RLS check.

## Vercel deployment preparation

1. Push the repository to the Git provider connected to Vercel.
2. Import it as a new Vercel project. Vercel should detect Next.js and use `npm run build`.
3. Leave the root directory as the repository root.
4. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in **Project Settings → Environment Variables** when a Supabase project exists. Use public project credentials only.
5. Deploy and verify the public routes listed in the project master plan. Deploy `KJM ADMIN` as a separate protected Vercel project only after its authentication requirements are complete.

Vercel deployment and live Supabase connectivity are intentionally not performed or claimed in this delivery.

## Project map

- `src/app/(website)` — public customer routes and layout
- `src/app/api` — reserved for server route handlers
- `src/components` — reusable UI, layout, website, and admin components
- `src/lib/constants` — typed domain constants and catalog seed data
- `src/lib/supabase` — browser and server Supabase factories
- `src/services` — future use-case and integration services
- `supabase/migrations` — future reviewed database migrations
- `docs` — architecture and delivery planning

Manufacturer sources, model-name caveats, and image-license status are recorded in [docs/MOTORCYCLE_RESEARCH.md](docs/MOTORCYCLE_RESEARCH.md).

See [docs/PROJECT_MASTER_PLAN.md](docs/PROJECT_MASTER_PLAN.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Database setup and migration procedures are documented in [docs/SUPABASE_PHASE3.md](docs/SUPABASE_PHASE3.md).

## Running both applications

Use separate terminals:

```bash
cd "/Users/mac/Desktop/KJM/KJM MAIN"
npm run dev
```

```bash
cd "/Users/mac/Desktop/KJM/KJM ADMIN"
npm run dev -- --port 3001
```

The applications use independent dependencies and environment files. They are planned to share one Supabase project, with migrations owned from `KJM MAIN/supabase/migrations` to prevent conflicting schema histories.
