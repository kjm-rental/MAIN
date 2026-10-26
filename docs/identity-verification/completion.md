# MAIN identity verification integration

MAIN (localhost:3000) and ADMIN (localhost:3001) use the existing shared MAIN Supabase connection. Migration 029/030 functions, guards, risk columns and permissions were verified read-only; migrations were not reapplied.

Customer checks, corrections, reuploads and history use the normal booking/status flow. ADMIN uses its existing verification center, private document viewer and authorized decision actions. Automatic document checks run after booking finalization, remain separate from identity approval and preserve existing international/inventory safeguards. Original catalog records, prices and approved photos are retained.

Separate identity TEST services, login routes, launch scripts and build-cache configuration have been removed. Database records were not deleted. Local private environment backups remain ignored.

Full identity verification and handover require authorized authenticity, ownership and motorcycle-license review, plus existing recorded pickup requirements. Emails, reminders and online payments remain disabled.
