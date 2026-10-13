# Production catalog audit

Read-only inspection, 10 October 2026, project slevojynuumrvgiznmxk. No data or application changes.

| Database ID | Model | PHP/day | Images | Published | Archived | Current units | Seed origin | Proposed action |
|---|---|---:|---:|---|---|---:|---|---|
| 2915bc15-68fd-461e-9a29-645cbc8beace | Honda Beat | 499 | 0 | No | Yes | 0 | Yes | Keep excluded; no data change needed |
| f8177abc-4d8e-4606-aa32-be3beab478ec | Yamaha Mio Gravis 125cc | 550 | 0 | No | Yes | 0 | Yes | Keep excluded; no data change needed |
| 183e8f6d-5a40-423b-b7e2-51589b548b4d | Yamaha Mio Gravis 125cc | 550 | 1 | Yes | No | 3 | No; model.created audit | Preserve published model, image, price and units |
| cf24bed9-0ab3-45b8-a107-cd6ce59ac7fd | Honda Click 125cc | 599 | 1 | Yes | No | 9 | Yes; subsequently admin-updated | Preserve; seed origin alone does not imply unwanted |
| 64720cfd-e3a1-4223-98d1-bcbc9a3fb3ae | Honda Click 160cc | 700 | 1 | Yes | No | 2 | Yes; admin published/updated | Preserve |
| 667d3049-5d09-4998-97d7-03d7485052aa | Yamaha Aerox 160cc | 750 | 1 | Yes | No | 2 | Yes; subsequently admin-updated | Preserve |
| 69ea75b7-0a6e-4931-94c8-2762a64b5d21 | Honda PCX 160cc | 800 | 1 | Yes | No | 4 | Yes; subsequently admin-updated | Preserve |
| 609709ab-6952-4ec3-9a13-0a292bb8d52d | Yamaha NMAX 155 V3 | 850 | 1 | Yes | No | 2 | Yes; subsequently admin-updated | Preserve |
| fcf80dc3-425f-4e9f-9ede-a6b3c93d0680 | Honda ADV 160 | 900 | 1 | Yes | No | 9 | Yes; subsequently admin-updated | Preserve |
| f83dec69-7afc-497d-b9d2-16aa754978fb | Suzuki V-Strom 160 | 950 | 1 | Yes | No | 2 | Yes; subsequently admin-updated | Preserve |
| be131d5a-e672-423c-8455-e9dbfd79168a | Honda ADV 350 | 1800 | 1 | Yes | No | 2 | Yes; subsequently admin-updated | Preserve |
| 5aa961db-f836-419f-bd70-126bfe4d267e | Honda Adv 160 | 900 | 0 | No | Yes | 1 | No; model.created audit | Preserve existing archived record and unit; no cleanup proposed |

Every recorded image meets existing approved-media query criteria. Every model has zero booking references at inspection. Unit counts exclude archived units; total historic unit counts equal current counts here. Seed provenance comes from exact original slugs and the common creation timestamp 2026-10-09T06:09:22.509905Z, corroborated by migration 003, not absence of images.

Honda Beat and original Yamaha were archived by an administrator on 9 October at 14:34:52 and 14:35:01 Asia/Manila. The retained Yamaha was created through the administrator action on 10 October at 13:42:21 Asia/Manila and subsequently updated. Different IDs and slugs establish two distinct Yamaha rows.

Anonymous live query returns nine published, unarchived models. Neither unwanted seed row is returned. MAIN's fetchPublishedRows currently omits explicit publication/archive filters and uses session cookies; administrator RLS permits reading all models. Consequently an administrator session shared between localhost ports can cause MAIN to render archived/draft rows. This is a query defect, not current automatic seed publication. Session state in the user's browser was not inspected.

Proposed correction, pending approval: add .eq('is_published',true).is('archived_at',null) to MAIN model queries; ensure media follows the filtered model set; add regression coverage for administrator browsing. Keep RLS administrator capabilities unchanged. No production unpublish/archive/delete operation is needed for the reported unwanted rows.

Current table default is is_published=false; new ADMIN form defaults unchecked. saveModel requires an active administrator and only sets publication when the checkbox is on. Dedicated publish action requires an active administrator. Migration 003 originally explicitly inserted published seeds; migration 007 reset those ten slugs to drafts. Do not edit applied migrations. Future seed scripts should insert drafts explicitly. A migration or public approval workflow is unnecessary to resolve the current display defect.

Relevant existing tests executed: public-catalog.test.ts and migrations.test.ts, 24 passing tests. They do not currently prove explicit filtering under an administrator session; proposed regression coverage remains pending.
