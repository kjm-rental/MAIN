# Admin-managed motorcycle catalog

## Data ownership

`KJM MAIN` no longer has an active hardcoded fleet. Each request reads published, non-archived models and approved media from the shared Supabase project. The public query never selects physical-unit codes or registration plates and returns an empty/error state instead of stale seed data when Supabase is unavailable.

`KJM ADMIN` performs mutations with the signed-in user's Supabase session. Database RLS checks that the user has an active `admin_users` row. No service-role credential is used by either application.

Migration `202610090007_admin_managed_fleet.sql` adds archive and primary-media fields, public-safe policies, audit-log insertion, and unpublishes the original ten migration seeds for administrator review. It preserves all model and unit rows.

## Setup

1. Apply every migration in `supabase/migrations` to a non-production Supabase project in filename order, then review the SQL before applying it to production.
2. Configure both Vercel projects with the same `NEXT_PUBLIC_SUPABASE_URL` and either `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. In Supabase Authentication, create or invite the administrator. Copy that user's UUID.
4. Using the Supabase SQL editor as a trusted operator, add the authorization record:

   ```sql
   insert into public.admin_users (auth_user_id, role, is_active)
   values ('AUTH-USER-UUID-HERE', 'admin', true)
   on conflict (auth_user_id)
   do update set role = excluded.role, is_active = excluded.is_active;
   ```

5. Start `KJM ADMIN`, sign in at `/sign-in`, review or create a model, upload business-owned/authorized images, and explicitly publish it.
6. Confirm the model on `KJM MAIN`; draft, archived, and unpublished records must remain absent.

Do not put a service-role key, database password, or JWT secret in either Vercel application.

## Synchronization and cache behavior

The public server components use the request-bound Supabase SSR client and do not persist catalog results in the Next.js data cache. Consequently, a later public request sees committed admin changes without a redeployment or a cross-project webhook. A browser already displaying a page must navigate or refresh to issue that request.

## Required live smoke test

With a configured staging project, verify: authorized sign-in; draft creation; photo upload; pricing/specification edits; draft invisibility; publish visibility; price update visibility after refresh; unpublish removal; and rejected anonymous mutation attempts. These checks cannot be represented by local unit tests alone.
