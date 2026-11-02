-- Isolated staging only. Synthetic metadata is visible only inside this transaction.
-- No provider request or physical document upload; every fixture row is rolled back.
begin;
set local lock_timeout='5s';set local statement_timeout='30s';
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.admin_users where is_active order by id limit 1),true);
update public.booking_readiness_checks set passed=true;
update public.booking_settings set public_booking_enabled=true,policies_approved_at=coalesce(policies_approved_at,now()) where id;
update public.notification_settings set telegram_enabled=false,resend_enabled=false where id;
update public.paymongo_live_settings set enabled=true,migration_verified=true,webhook_verified=true,reconciliation_verified=true,concurrency_verified=true where id;
update public.delivery_settings set qrph_enabled=true where id;
create temporary table payment_first_results(name text,passed boolean);
do $$
declare model uuid;unit uuid;customer uuid;bid uuid;vid uuid;checkout uuid;access_hash text;method text;
starts timestamptz;ends timestamptz;q record;result record;session_id text;payment_id text;amount integer;settled text;kind text;
begin
 select m.id,u.id into model,unit from public.motorcycle_models m join public.motorcycle_units u on u.motorcycle_model_id=m.id where m.slug='honda-adv-160' and u.status='available' and u.archived_at is null order by u.id limit 1;
 if unit is null then raise exception 'Synthetic staging inventory unavailable';end if;
 foreach method in array array['qrph','cash'] loop
  bid:=gen_random_uuid();customer:=gen_random_uuid();vid:=gen_random_uuid();access_hash:=encode(sha256(convert_to(bid::text,'UTF8')),'hex');
  starts:=case method when 'qrph' then '2033-06-10T01:00:00Z' else '2033-06-12T01:00:00Z' end;ends:=starts+interval '24 hours';
  select * into q from private.calculate_booking_quote(model,starts,ends,false);amount:=q.total_php*100;
  insert into public.customers(id,auth_user_id,full_name,email,phone,country_of_residence,customer_type,is_test)
   values(customer,null,'Synthetic staging finalization','staging-'||bid::text||'@example.invalid','+639000000000','Philippines','philippine_resident',true);
  insert into public.bookings(id,booking_reference,customer_id,motorcycle_model_id,start_at,end_at,status,quoted_total_php,base_total_php,pricing_daily_rate_php,pricing_units,deposit_required_centavos,is_test,expires_at)
   values(bid,'INLINE-ROLLBACK-'||bid::text,customer,model,starts,ends,'pending',q.total_php,q.total_php,q.daily_rate_php,q.pricing_units,250000,false,now()+interval '1 hour');
  insert into public.customer_verifications(id,booking_id,customer_id,customer_type,identity_status,license_status,entitlement_status,international_status,overall_status,license_issuing_country,license_expiration_date,permitted_vehicle_categories,identity_name,license_name,privacy_consent_at,customer_declaration_at)
   values(vid,bid,customer,'philippine_resident','submitted','submitted','under_review','not_applicable','submitted','Philippines','2036-01-01','A','Synthetic staging identity','Synthetic staging identity',now(),now());
  insert into public.booking_deposits(booking_id,option,required_centavos,partial_return_allowed,collection_instructions,return_instructions,dispute_instructions,policy_version,request_fingerprint,is_test)
   values(bid,'cash',250000,false,'Synthetic staging deposit','Synthetic staging return','Synthetic staging review',now(),'inline-finalize-rollback',false);
  insert into public.guest_booking_contacts values(bid,access_hash,'staging-'||bid::text||'@example.invalid','inline-finalize-rollback',now());
  insert into public.booking_services(booking_id,delivery_fee_centavos,collection_fee_centavos,payment_method) values(bid,0,0,method);
  insert into public.booking_inventory_holds(booking_id,motorcycle_unit_id,start_at,end_at,expires_at) values(bid,unit,starts,ends,now()+interval '10 minutes');
  foreach kind in array array['government_id','drivers_license_front'] loop
   insert into storage.objects(bucket_id,name,metadata) values('identity-verification','guest/'||bid::text||'/'||kind||'-rollback.png','{"mimetype":"image/png","size":1}');
   perform public.register_guest_verification_document(bid,access_hash,kind,'guest/'||bid::text||'/'||kind||'-rollback.png','image/png',1);
  end loop;
  select f.* into result from public.finalize_guest_booking_request(bid,access_hash,(select version from public.rental_terms_versions where is_current),true) f;
  if method='qrph' then
   if result.booking_status<>'pending' or (select status from public.bookings where id=bid)<>'pending' then raise exception 'Unpaid QRPh was confirmed';end if;
   insert into payment_first_results values('Actual guest finalization reserves QRPh while keeping booking pending',true);
   if (select motorcycle_unit_id from public.bookings where id=bid) is distinct from unit then raise exception 'QRPh unit was not reserved';end if;
   insert into payment_first_results values('Unpaid QRPh keeps its assigned inventory reservation',true);
   begin
    update public.bookings set status='confirmed' where id=bid;
    raise exception 'UNEXPECTED_CONFIRMATION';
   exception when raise_exception then
    if sqlerrm='UNEXPECTED_CONFIRMATION' then raise;end if;
   end;
   insert into payment_first_results values('Manual confirmation is blocked before verified QRPh payment',true);
   select (public.prepare_paymongo_guest_checkout(bid,access_hash,gen_random_uuid())).id into checkout;
   perform public.claim_paymongo_live_creation(checkout);
   session_id:='cs_rollback'||replace(bid::text,'-','');payment_id:='pay_rollback'||replace(bid::text,'-','');
   perform public.attach_paymongo_live_session(checkout,session_id);
   perform public.bind_paymongo_inline_intent(checkout,'pi_rollback'||replace(bid::text,'-',''));
   if public.find_paymongo_inline_checkout('pi_rollback'||replace(bid::text,'-','')) is distinct from checkout then raise exception 'Bound intent lookup failed';end if;
   begin
    perform public.bind_paymongo_inline_intent(checkout,'pi_wrongrollback');
    raise exception 'UNEXPECTED_REBIND';
   exception when raise_exception then
    if sqlerrm='UNEXPECTED_REBIND' then raise;end if;
   end;
   insert into payment_first_results values('Inline intent is bound immutably and looked up by provider identity',true);
   if not public.claim_paymongo_qr_generation(checkout) then raise exception 'First QR claim failed';end if;
   if public.claim_paymongo_qr_generation(checkout) then raise exception 'Duplicate QR generation claim';end if;
   insert into payment_first_results values('Only one QR generation claim succeeds for the saved intent',true);
   settled:=public.settle_paymongo_live_checkout(session_id,payment_id,amount,'PHP',true);
   if settled<>'paid' or (select status from public.bookings where id=bid)<>'confirmed' then raise exception 'Verified payment did not confirm booking';end if;
   insert into payment_first_results values('Verified settlement confirms the pending domestic booking',true);
   perform public.settle_paymongo_live_checkout(session_id,payment_id,amount,'PHP',true);
   if (select count(*) from public.payment_events where payment_intent_id=checkout)<>1 then raise exception 'Duplicate credit';end if;
   if (select count(*) from public.booking_status_history where booking_id=bid and new_status='confirmed')<>1 then raise exception 'Duplicate confirmation';end if;
   insert into payment_first_results values('Repeated settlement creates one credit and one confirmation',true);
  else
   if result.booking_status<>'confirmed' then raise exception 'Cash confirmation policy changed';end if;
   insert into payment_first_results values('Cash on pickup retains its existing reservation policy',true);
  end if;
 end loop;
end $$;
select * from payment_first_results;
rollback;
