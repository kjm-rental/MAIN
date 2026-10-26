-- REVIEW REQUIRED. Narrow public catalog projection; no direct pricing_rules grants.
begin;
create function public.get_public_package_rates(p_model_ids uuid[])
returns table(motorcycle_model_id uuid,pricing_type text,amount_php integer,is_active boolean,valid_from timestamptz,valid_until timestamptz)
language sql stable security definer set search_path='' as $$
 select r.motorcycle_model_id,r.pricing_type,r.amount_php,r.is_active,r.valid_from,r.valid_until
 from public.pricing_rules r join public.motorcycle_models m on m.id=r.motorcycle_model_id
 where m.is_published and m.archived_at is null and m.id=any(p_model_ids)
 and r.is_active and r.pricing_type in ('weekly','monthly')
 and (r.valid_from is null or r.valid_from<=now()) and (r.valid_until is null or r.valid_until>=now());
$$;
revoke all on function public.get_public_package_rates(uuid[]) from public;
grant execute on function public.get_public_package_rates(uuid[]) to anon,authenticated;
commit;
