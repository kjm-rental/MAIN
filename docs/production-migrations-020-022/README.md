# Production migrations 020–022 — blocked preflight

Date: 2026-10-11. Authorized production target: `slevojynuumrvgiznmxk`.

No migration was applied. The owner's explicit stop condition for missing backup/recovery capability was reached.

## Verified

- Supabase CLI backup lookup explicitly targeted production `slevojynuumrvgiznmxk`.
- Read-only production history query confirmed exactly migrations 001–019, ending in `202610100019`.
- Local migration 020 SHA-256: `1014e63dbedcd818e5abca60f370f490effbd07416951928a673aaf96757e6e2`.
- Local migration 021 SHA-256: `8053be0c90a499a22ead80c9369471ad87822d11552aead16f57b028469e3a06`.
- Local migration 022 SHA-256: `b962b9fb4cde2c72345dfec7571c52ce4c56cec5064c08f2c634918b58715917`.
- These hashes match the disposable deployment evidence. Migration 022 disposable verification recorded 53 integration, 19 security and 28 concurrency assertions passing; its 70 cross-table static trigger lint diagnostics remain disclosed in the existing verification report.

## Blocking backup result

`supabase backups list --project-ref slevojynuumrvgiznmxk --output json` returned:

```json
{
  "backups": null,
  "physical_backup_data": {},
  "pitr_enabled": false,
  "region": "ap-southeast-2",
  "walg_enabled": true
}
```

WAL-G enabled alone does not establish an available restore point. No platform backup or recovery window was returned. No verified production logical backup was found in the workspace or prior verification artifacts. A restorable backup therefore cannot be established from the available evidence.

## Not executed

Production migration application, post-deployment schema/security/data checks and a new application TypeScript/ESLint/test/build run were not executed after the mandatory preflight stop. Previous disposable application checks passed, but are not represented as newly executed production deployment verification.

No production customer, booking, financial, price or settings records were changed. No website deployment, delivery activation, ID-deposit activation, public-booking activation or project deletion occurred.

## Required next step

Make a completed restorable production backup available, or provide an existing verified backup and recovery procedure. Preserve the existing approval: no new per-migration approval is needed. Once backup/recovery is verified, apply unchanged 020 and 021 within one transaction, then 022, and perform the requested postflight and application checks.

Supabase backup reference: https://supabase.com/docs/guides/platform/backups
