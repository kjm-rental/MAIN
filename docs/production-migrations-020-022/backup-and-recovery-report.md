# Production backup and migration deployment — recovery verification blocked

Date: 2026-10-11. Production: `slevojynuumrvgiznmxk`. Disposable Supabase: `uuxjymzrtncrnnkvdpjy` (not restored over or modified during this run).

**No production migration was applied.** A full database archive was created, but a complete recovery procedure could not be verified in the isolated restore environment. Deployment stopped under the owner's explicit instruction to stop when recovery verification fails.

## Backup

- Directory: `/Users/mac/KJM-Backups/slevojynuumrvgiznmxk-2026-10-11T08-25-49.523Z-yfXwQ8/`
- Archive: `production.dump`, PostgreSQL custom format, uncompressed.
- Size: **1,342,789 bytes** (approximately 1.28 MiB).
- Metadata captured: **2026-10-11 16:26:16 Asia/Manila**.
- Dump completed: **2026-10-11 16:29:41 Asia/Manila**.
- SHA-256: `f9a4cb9291ecb11b178d5ea27186c122989bc6316dd22abb4d3f2d9a804a11c8`.
- Secure directory permissions: 0700. Backup/metadata files: 0600. Outside the repository, not committed to Git. Each attempted export used a unique directory; no existing backup was overwritten.
- Export used PostgreSQL 18.4 `pg_dump` against production PostgreSQL 17.11. It included all schemas without filtering application, Auth or Storage data, and retained ownership and ACL entries.
- `pg_restore --list` successfully read the archive. It contains 65 table-data entries, 401 function entries, 37 triggers, 46 policies and 464 ACL entries, including application schemas, Auth, Storage metadata and migration history.
- Additional owner-only files include a count/fingerprint manifest, role definitions without passwords, archive table of contents and private tool diagnostics. No database passwords were printed or stored in these backup logs. Temporary CLI credential material was removed after use.

The final dump used its own internally consistent snapshot. Source counts/fingerprints were captured before the dump in a read-only repeatable-read transaction; the separate exported snapshot identifier in the manifest is informational and was not imported by the final dump. Application fingerprints were reconfirmed against production afterward. Restored counts have **not** been verified.

## Restore verification and blocker

Fresh local PostgreSQL environments were created under the backup directories, bound only to loopback on ports 55439 and 55440. Neither production nor the existing disposable Supabase project was a restore target.

Preparing a full restore required Supabase's extension dependencies. Native PostgreSQL 18.4 was available locally; production uses 17.11 with `pg_cron` 1.6.4. The 1.6.4 Cron source did not compile against PostgreSQL 18 headers. The PostgreSQL-18-compatible 1.6.7 Cron source and Vault 0.3.1 were built locally. The restore instance was configured with job execution disabled.

The local Cron launcher nevertheless repeatedly crashed with signal 11, forcing server recovery and rejecting connections. Therefore full archive restoration and restored table counts/fingerprints could not be verified. This was a failure of the isolated restore environment; it does **not** establish that the archive is corrupt or restorable. The restore setup reached role creation, but a successful `pg_restore` database restore was not executed. No passed restore test is claimed.

Both isolated instances were stopped; the failing instance required immediate shutdown after fast shutdown did not complete. Backup files and diagnostics remain preserved. The existing Phase 10 local testing environment and disposable Supabase project were not deleted.

## Production identity, reconciliation and migration state

- Explicit project-targeted production reads verified migrations **001–019**, latest `202610100019`, both before this work and after the stopped restore attempt.
- No versions 020, 021 or 022 were applied.
- Local migration files match their tested hashes:
  - 020: `1014e63dbedcd818e5abca60f370f490effbd07416951928a673aaf96757e6e2`.
  - 021: `8053be0c90a499a22ead80c9369471ad87822d11552aead16f57b028469e3a06`.
  - 022: `b962b9fb4cde2c72345dfec7571c52ce4c56cec5064c08f2c634918b58715917`.
- Final read-only reconciliation matched counts **and row fingerprints for all 24 existing application tables** against the pre-export manifest. These include inventory, prices, customers, bookings, administrator records and financial/audit tables.
- Production baseline includes 12 motorcycle models, 36 units, 9 media records, 1 administrator, 57 audit records and zero customer/booking/payment records. No prices or existing application records changed.
- Public booking and anonymous Auth remain disabled in the final read-only API check. Notification settings and worker RPCs remain absent because 022 was not applied. No physical ID deposit feature was activated; 020 remains absent.

## Application checks executed in this run

| Application | TypeScript | ESLint | Automated tests | Production build |
| --- | --- | --- | --- | --- |
| MAIN | Pass | Pass | 56/56, 9 files | Pass |
| ADMIN | Pass | Pass | 204/204, 17 files | Pass |

Builds used `next build --webpack`. Logs are `/tmp/kjm-production-{main,admin}-{typecheck,lint,tests,build}.log`. No website was deployed.

## Recovery limitations

A database archive includes Auth users/session metadata and Storage bucket/object metadata, but not the actual Storage object bytes. The production Storage snapshot contains 12 object metadata rows; object-file recovery was not backed up or tested. Supabase-managed services, project secrets, JWT/signing keys, Auth/provider configuration, edge-function code, external delivery credentials and infrastructure are also outside a logical database dump. Supabase Vault's external root key is not exportable via SQL; the captured Vault table has zero secret records. Cluster role passwords were intentionally excluded; managed roles/credentials require provisioning or resetting in the recovery target. The supplemental role export is not a verified replacement for Supabase platform role provisioning.

These exclusions must be handled in a documented recovery procedure; this archive alone is not certified as a complete Supabase disaster-recovery backup. See [Supabase's backup/restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) and [database backup limitations](https://supabase.com/docs/guides/platform/backups).

## Remaining work

Provision an isolated restore environment matching the supported Supabase PostgreSQL 17 and extension stack, perform the full restore, reconcile application tables, functions, policies, triggers and grants, and document managed-component recovery. Only after that passes may deployment resume under the existing authorization: atomic 020 → 021, verification of its corrections, then 022 and the requested production postflight. No further per-migration approval is needed.

No application source, migration SQL, environment configuration, booking rules, prices, public booking, anonymous Auth, messaging integration or website deployment changed. This run added this report and sanitized JSON evidence under `docs/production-migrations-020-022/`; all database archives, role exports, raw metadata and restore data remain outside the repository.
