-- Follow-up to applied migration 020; do not rewrite migration history.
-- Apply 020 then 021 together only after separate production approval.
-- Client roles have no legitimate direct use of the event ordering sequence.
-- SECURITY DEFINER writers retain the sequence owner's privileges.
revoke all on sequence public.security_deposit_events_sequence_seq from public, anon, authenticated;

create or replace function public.admin_record_offline_payment(p_booking_id uuid,p_amount_centavos integer,p_method text,p_transaction_reference text,p_paid_at timestamptz,p_notes text,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare intent_id uuid; paid integer; total integer; test_record boolean; existing public.payment_intents%rowtype; fingerprint jsonb;
begin
  if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
  if p_amount_centavos<=0 or p_method not in ('cash','bank_transfer','other_offline') then raise exception 'Invalid offline payment'; end if;
  if p_method='bank_transfer' and length(trim(coalesce(p_transaction_reference,'')))=0 then raise exception 'A verified transfer reference is required'; end if;
  fingerprint:=jsonb_build_object('operation','payment','booking_id',p_booking_id,'amount_centavos',p_amount_centavos,'method',p_method,'transaction_reference',coalesce(trim(p_transaction_reference),''),'occurred_at',p_paid_at);
  select * into existing from public.payment_intents where idempotency_key=p_idempotency_key;
  if found then
    if existing.request_fingerprint<>fingerprint then raise exception 'Idempotency key was reused with different payment parameters'; end if;
    return existing.id;
  end if;
  select total_centavos,is_test into total,test_record from public.bookings where id=p_booking_id for update;
  if total is null then raise exception 'Booking not found'; end if;
  -- A concurrent identical request may have committed while this lock waited.
  select * into existing from public.payment_intents where idempotency_key=p_idempotency_key;
  if found then
    if existing.request_fingerprint<>fingerprint then raise exception 'Idempotency key was reused with different payment parameters'; end if;
    return existing.id;
  end if;
  select coalesce(sum(case when event_type='payment' then amount_centavos else -amount_centavos end),0)::integer into paid from public.payment_events where booking_id=p_booking_id;
  if paid+p_amount_centavos>total then raise exception 'Payment exceeds the outstanding balance'; end if;
  insert into public.payment_intents(booking_id,idempotency_key,kind,amount_centavos,status,provider,provider_reference,request_fingerprint,is_test,created_by)
  values(p_booking_id,p_idempotency_key,'charge',p_amount_centavos,'succeeded','offline',nullif(trim(p_transaction_reference),''),fingerprint,test_record,auth.uid()) returning id into intent_id;
  insert into public.payment_attempts(payment_intent_id,attempt_number,status,provider_reference,is_test,completed_at) values(intent_id,1,'succeeded',nullif(trim(p_transaction_reference),''),test_record,now());
  insert into public.payment_events(booking_id,payment_intent_id,event_type,amount_centavos,method,transaction_reference,occurred_at,recorded_by,internal_notes,idempotency_key,is_test)
  values(p_booking_id,intent_id,'payment',p_amount_centavos,p_method,nullif(trim(p_transaction_reference),''),p_paid_at,auth.uid(),nullif(trim(p_notes),''),p_idempotency_key,test_record);
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'payment.offline_recorded','booking',p_booking_id,jsonb_build_object('payment_intent_id',intent_id,'amount_centavos',p_amount_centavos,'method',p_method));
  return intent_id;
exception when unique_violation then
  select * into existing from public.payment_intents where idempotency_key=p_idempotency_key;
  if existing.id is not null and existing.request_fingerprint=fingerprint then return existing.id; end if;
  if existing.id is not null then raise exception 'Idempotency key was reused with different payment parameters'; end if;
  raise exception 'Duplicate payment transaction reference';
end; $$;
revoke all on function public.admin_record_offline_payment(uuid,integer,text,text,timestamptz,text,uuid) from public,anon;
grant execute on function public.admin_record_offline_payment(uuid,integer,text,text,timestamptz,text,uuid) to authenticated;

create or replace function public.admin_record_payment_adjustment(p_original_payment_event_id uuid,p_operation text,p_amount_centavos integer,p_method text,p_transaction_reference text,p_occurred_at timestamptz,p_reason text,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare original public.payment_events%rowtype; existing public.payment_intents%rowtype; adjusted integer; intent_id uuid; fingerprint jsonb;
begin
  if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
  if p_operation not in ('refund','reversal') or p_amount_centavos<=0 or p_method not in ('cash','bank_transfer','other_offline') then raise exception 'Invalid financial adjustment'; end if;
  if length(trim(coalesce(p_transaction_reference,'')))=0 or length(trim(coalesce(p_reason,'')))<5 then raise exception 'A transaction reference and clear reason are required'; end if;
  fingerprint:=jsonb_build_object('operation',p_operation,'original_payment_event_id',p_original_payment_event_id,'amount_centavos',p_amount_centavos,'method',p_method,'transaction_reference',trim(p_transaction_reference),'occurred_at',p_occurred_at,'reason',trim(p_reason));
  select * into existing from public.payment_intents where idempotency_key=p_idempotency_key;
  if found then if existing.request_fingerprint<>fingerprint then raise exception 'Idempotency key was reused with different adjustment parameters'; end if; return existing.id; end if;
  select * into original from public.payment_events where id=p_original_payment_event_id and event_type='payment' for update;
  if original.id is null then raise exception 'Original verified payment not found'; end if;
  perform 1 from public.bookings where id=original.booking_id for update;
  -- Recheck after serialization, before the refundable balance is evaluated.
  select * into existing from public.payment_intents where idempotency_key=p_idempotency_key;
  if found then
    if existing.request_fingerprint<>fingerprint then raise exception 'Idempotency key was reused with different adjustment parameters'; end if;
    return existing.id;
  end if;
  select coalesce(sum(amount_centavos),0)::integer into adjusted from public.payment_events where original_payment_event_id=original.id and event_type in ('refund','reversal');
  if adjusted+p_amount_centavos>original.amount_centavos then raise exception 'Adjustment exceeds remaining refundable amount'; end if;
  if p_operation='reversal' and (adjusted<>0 or p_amount_centavos<>original.amount_centavos) then raise exception 'A reversal must correct the full, previously unadjusted payment'; end if;
  insert into public.payment_intents(booking_id,idempotency_key,kind,amount_centavos,status,provider,provider_reference,request_fingerprint,is_test,created_by)
  values(original.booking_id,p_idempotency_key,'refund',p_amount_centavos,'succeeded','offline',trim(p_transaction_reference),fingerprint,original.is_test,auth.uid()) returning id into intent_id;
  insert into public.payment_attempts(payment_intent_id,attempt_number,status,provider_reference,is_test,completed_at) values(intent_id,1,'succeeded',trim(p_transaction_reference),original.is_test,now());
  insert into public.payment_events(booking_id,payment_intent_id,event_type,original_payment_event_id,amount_centavos,method,transaction_reference,occurred_at,recorded_by,internal_notes,idempotency_key,is_test)
  values(original.booking_id,intent_id,p_operation,original.id,p_amount_centavos,p_method,trim(p_transaction_reference),p_occurred_at,auth.uid(),trim(p_reason),p_idempotency_key,original.is_test);
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'payment.'||p_operation||'_recorded','booking',original.booking_id,jsonb_build_object('payment_intent_id',intent_id,'original_payment_event_id',original.id,'amount_centavos',p_amount_centavos,'reason',trim(p_reason)));
  return intent_id;
exception when unique_violation then
  select * into existing from public.payment_intents where idempotency_key=p_idempotency_key;
  if existing.id is not null and existing.request_fingerprint=fingerprint then return existing.id; end if;
  if existing.id is not null then raise exception 'Idempotency key was reused with different adjustment parameters'; end if;
  raise exception 'Duplicate adjustment transaction reference';
end; $$;
revoke all on function public.admin_record_payment_adjustment(uuid,text,integer,text,text,timestamptz,text,uuid) from public,anon;
grant execute on function public.admin_record_payment_adjustment(uuid,text,integer,text,text,timestamptz,text,uuid) to authenticated;

