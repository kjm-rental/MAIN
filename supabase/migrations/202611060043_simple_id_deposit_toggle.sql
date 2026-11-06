-- Owner-requested one-button ID deposit activation. Does not activate the option.
-- Existing booking/deposit snapshots and physical receipt/return guards are retained.
begin;

-- Preserve installed pricing and availability logic; remove only the old ID review gate.
do $$
declare definition text; item record;
begin
  definition := pg_get_functiondef('public.get_booking_quote_v3(uuid,timestamptz,timestamptz,jsonb,text,text)'::regprocedure);
  if position('and s.id_legal_approved_at is not null' in definition) = 0 then
    raise exception 'Unexpected deposit quote definition; review before applying';
  end if;
  execute replace(definition, 'and s.id_legal_approved_at is not null', '');

  definition := pg_get_functiondef('public.get_security_deposit_options()'::regprocedure);
  if position('id_enabled and id_legal_approved_at is not null' in definition) = 0 then
    raise exception 'Unexpected deposit options definition; review before applying';
  end if;
  execute replace(definition, 'id_enabled and id_legal_approved_at is not null', 'id_enabled');

  for item in select conname from pg_constraint
    where conrelid='public.security_deposit_settings'::regclass and contype='c'
      and pg_get_constraintdef(oid) like '%id_legal_approved_at%'
  loop
    execute format('alter table public.security_deposit_settings drop constraint %I', item.conname);
  end loop;
  for item in select conname from pg_constraint
    where conrelid='public.booking_deposits'::regclass and contype='c'
      and pg_get_constraintdef(oid) like '%legal_reference%'
  loop
    execute format('alter table public.booking_deposits drop constraint %I', item.conname);
  end loop;
end;
$$;

alter table public.security_deposit_settings add constraint security_deposit_settings_id_types
  check(not id_enabled or jsonb_array_length(accepted_document_types)>0);
alter table public.booking_deposits add constraint booking_deposits_arrangement
  check((option='cash' and required_centavos>0 and document_type is null)
    or (option='eligible_id' and required_centavos=0 and document_type is not null and length(trim(document_type))>0));

-- The simplified option has one standard label; existing booking snapshots stay intact.
update public.security_deposit_settings
set accepted_document_types='["Original ID"]'::jsonb,updated_at=clock_timestamp()
where id=true and id_enabled;

create function public.admin_set_id_deposit_enabled(p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare previous public.security_deposit_settings%rowtype;
begin
  if auth.uid() is null or not private.is_active_admin() then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  if p_enabled is null then raise exception 'Choose enabled or disabled'; end if;
  select * into previous from public.security_deposit_settings where id=true for update;
  if not found then raise exception 'Deposit settings are unavailable'; end if;
  update public.security_deposit_settings set
    id_enabled=p_enabled,
    accepted_document_types=case when p_enabled
      then '["Original ID"]'::jsonb else previous.accepted_document_types end,
    collection_instructions=case when p_enabled and btrim(previous.collection_instructions)=''
      then 'Bring your selected deposit to KJM at pickup. An ID deposit requires the original ID.' else previous.collection_instructions end,
    return_instructions=case when p_enabled and btrim(previous.return_instructions)=''
      then 'Collect your ID or refundable cash deposit when the motorcycle return is completed.' else previous.return_instructions end,
    dispute_instructions=case when p_enabled and btrim(previous.dispute_instructions)=''
      then 'Contact KJM if you have a question about your deposit.' else previous.dispute_instructions end,
    updated_at=clock_timestamp(),updated_by=auth.uid()
  where id=true;
  -- Enabling is an operator choice, not a fabricated legal-review attestation.
  insert into public.audit_logs(actor_user_id,action,entity_type,metadata)
  values(auth.uid(),'deposit.id_option_changed','security_deposit_settings',
    jsonb_build_object('before',previous.id_enabled,'enabled',p_enabled));
end;
$$;
revoke all on function public.admin_set_id_deposit_enabled(boolean) from public,anon,service_role;
grant execute on function public.admin_set_id_deposit_enabled(boolean) to authenticated;

-- General deposit saves no longer toggle the independent ID option or alter its historical review fields.
create or replace function public.admin_save_security_deposit_settings(p_settings jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare previous public.security_deposit_settings%rowtype; cash_approved boolean;
begin
  if not private.is_active_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  if p_settings is null or jsonb_typeof(p_settings)<>'object' then raise exception 'Invalid deposit settings'; end if;
  select * into previous from public.security_deposit_settings where id=true for update;
  if not found then raise exception 'Deposit settings are unavailable'; end if;
  cash_approved:=coalesce((p_settings->>'cash_policy_approved')::boolean,false);
  update public.security_deposit_settings set
    cash_enabled=coalesce((p_settings->>'cash_enabled')::boolean,false),
    cash_amount_centavos=nullif(p_settings->>'cash_amount_centavos','')::integer,
    cash_policy_approved_at=case when cash_approved then now() else null end,
    collection_instructions=trim(coalesce(p_settings->>'collection_instructions','')),
    return_instructions=trim(coalesce(p_settings->>'return_instructions','')),
    dispute_instructions=trim(coalesce(p_settings->>'dispute_instructions','')),
    partial_cash_return_allowed=coalesce((p_settings->>'partial_cash_return_allowed')::boolean,false),
    updated_at=clock_timestamp(),updated_by=auth.uid()
  where id=true;
  insert into public.audit_logs(actor_user_id,action,entity_type,metadata)
  values(auth.uid(),'deposit.settings_changed','security_deposit_settings',
    jsonb_build_object('before',to_jsonb(previous),'after',(select to_jsonb(s) from public.security_deposit_settings s where id=true)));
end;
$$;

notify pgrst, 'reload schema';
commit;
