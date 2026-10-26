-- PREPARED ONLY. Do not apply without review/approval.
-- Internal gateway-cost estimates only: no checkout, payment activation, surcharge,
-- historical transaction, ledger, or booking-price changes. No seeded fee rates.
create table public.payment_gateway_fee_settings (
 id uuid primary key default gen_random_uuid(),
 provider text not null check(provider in ('paymongo','maya')),
 payment_method text not null check(payment_method in ('card','gcash','maya')),
 percentage_basis_points integer not null check(percentage_basis_points between 0 and 10000),
 flat_fee_centavos integer not null check(flat_fee_centavos between 0 and 2147483647),
 notes text not null default '' check(length(notes)<=1000),
 updated_at timestamptz not null default now(),
 updated_by uuid not null references auth.users(id) on delete restrict,
 unique(provider,payment_method),
 check(provider<>'maya' or payment_method<>'gcash')
);
alter table public.payment_gateway_fee_settings enable row level security;
alter table public.payment_gateway_fee_settings force row level security;
revoke all on public.payment_gateway_fee_settings from public,anon,authenticated,service_role;
grant select on public.payment_gateway_fee_settings to authenticated;
create policy payment_gateway_fee_settings_admin_read on public.payment_gateway_fee_settings for select to authenticated using((select private.is_active_admin()));
create function public.admin_save_payment_gateway_fee(p_provider text,p_payment_method text,p_percentage_basis_points integer,p_flat_fee_centavos integer,p_notes text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
 insert into public.payment_gateway_fee_settings(provider,payment_method,percentage_basis_points,flat_fee_centavos,notes,updated_by)
 values(p_provider,p_payment_method,p_percentage_basis_points,p_flat_fee_centavos,trim(coalesce(p_notes,'')),auth.uid())
 on conflict(provider,payment_method) do update set percentage_basis_points=excluded.percentage_basis_points,flat_fee_centavos=excluded.flat_fee_centavos,notes=excluded.notes,updated_at=now(),updated_by=auth.uid()
 returning id into result;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'gateway_fee.settings_saved','payment_gateway_fee_settings',result,jsonb_build_object('provider',p_provider,'payment_method',p_payment_method,'percentage_basis_points',p_percentage_basis_points,'flat_fee_centavos',p_flat_fee_centavos));
 return result;
end; $$;
revoke all on function public.admin_save_payment_gateway_fee(text,text,integer,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.admin_save_payment_gateway_fee(text,text,integer,integer,text) to authenticated;
