# Migration 019 integration results

Disposable project: uuxjymzrtncrnnkvdpjy. Production: slevojynuumrvgiznmxk.
Verified 001–018 applied in disposable before applying 019. Production 019 remains pending. No production mutation occurred.

Review correction: quantity management table locks now use NOWAIT. Blocking waits could deadlock with another model's submission holding the inventory-holds table and waiting to insert a booking. NOWAIT aborts the quantity transaction with SQLSTATE 55P03 and a retry message. Same-model advisory locks serialize administrator saves and submissions.

Actual PostgreSQL harness: supabase/tests/quantity-integration.cjs. Target guard refuses a connection without the disposable project reference. Fixtures use unique synthetic names and .invalid email addresses. Customers and bookings are is_test=true. Models and units are labeled Synthetic/SYN or generated internal codes associated with synthetic models. Fixtures are retained for review.

22 assertions passed: 2→5 units, unique identities/codes, NULL plates, archive-only reduction, previously archived preservation, pending/confirmed/active protection with atomic rollback, live-hold protection, maintenance protection, historical associations, stale save rejection, ordinary and anonymous authorization rejection, simultaneous administrator saves, forced cross-model lock-cycle fail-fast behavior, busy rollback, both orderings of submission versus reduction, and date availability (0 in held period; 1 outside).

Concurrency used independent PostgreSQL sessions and explicit open transactions. First administrator committed 5; waiting administrator rejected stale expected count. Submission-first preserved its held unit and rejected reduction. Reduction-first retired the last unit; waiting submission rejected no physical unit. Forced conflicting holds-table lock caused immediate retry error without partial quantity change. No deadlock or unexpected SQL errors occurred in the suite.

Disposable database lint: no errors or warnings. ADMIN lint/typecheck and 11 tests passed. No migration applied to production; no public booking or Auth setting changed. No temporary project deletion.

Operational limitation: quantity saves briefly take fleet-wide table write locks and may ask administrators to retry during unrelated booking writes. Reductions are deliberately conservative around pending requests and future maintenance. These tests are finite concurrency scenarios, not an exhaustive proof against every privileged SQL mutation.

019 is ready for production review, subject to explicit deployment approval.
