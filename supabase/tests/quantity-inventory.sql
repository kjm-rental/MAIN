-- Run only in an approved disposable database AFTER migration 019.
-- Requires fixtures supplied by the integration harness: admin JWT context,
-- model id, free unit, held unit, confirmed unit, active unit, historic unit.
-- Every mutation must run within BEGIN/ROLLBACK. No production execution.
-- Required scenarios:
-- 1. Ordinary/anonymous caller: RPC denied; no units created.
-- 2. Admin increases 2 -> 5: three unique ids/codes, NULL plates, available.
-- 3. Identical total save: no unit identity changes.
-- 4. Decrease archives eligible units, never deletes historic booking links.
-- 5. Below committed quantity: exception and full rollback.
-- 6. Live hold, confirmed, active, maintenance block: retained.
-- 7. Pending request with no live hold: reduction rejected.
-- 8. Two connections save same expected_total: one commits, other stale error.
-- 9. Concurrent submission/confirmation and reduction: serialized, commitments
--    preserved; inspect physical availability and overlap constraints afterward.
-- 10. Expired/released holds do not protect a unit unless a pending unassigned
--     request still requires capacity; booking history survives retirement.
select proname,prosecdef,proconfig from pg_proc
where oid='public.admin_set_motorcycle_quantity(uuid,integer,integer)'::regprocedure;
select has_function_privilege('anon','public.admin_set_motorcycle_quantity(uuid,integer,integer)','EXECUTE') as anonymous_execute;
