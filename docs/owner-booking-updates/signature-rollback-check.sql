-- Synthetic database integration check. All fixture rows and notifications roll back.
-- No real identity files are uploaded and no provider request is made.
begin;
set local lock_timeout='5s';set local statement_timeout='30s';
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.admin_users where is_active order by id limit 1),true);
update public.notification_settings set telegram_enabled=false,resend_enabled=false where id;
do $$
declare model uuid;unit uuid;customer uuid;bid uuid;vid uuid;access_hash text;selected_payment text:='cash';chosen_color text;
 starts timestamptz;ends timestamptz;q record;result record;kind text;terms text;
 drawing jsonb:='[[{"x":0.1,"y":0.2},{"x":0.6,"y":0.8}]]';
begin
 select m.id,u.id,u.color into model,unit,chosen_color from public.motorcycle_models m join public.motorcycle_units u on u.motorcycle_model_id=m.id where u.status='available' and u.archived_at is null and m.is_published order by u.id limit 1;
 if unit is null then raise exception 'Synthetic inventory unavailable';end if;
  bid:=gen_random_uuid();customer:=gen_random_uuid();vid:=gen_random_uuid();access_hash:=encode(sha256(convert_to(bid::text,'UTF8')),'hex');
  starts:='2033-06-12T01:00:00Z';ends:=starts+interval '24 hours';
  select * into q from private.calculate_booking_quote(model,starts,ends,false);
  insert into public.customers(id,auth_user_id,full_name,email,phone,country_of_residence,customer_type,is_test)
   values(customer,null,'Synthetic rollback finalization','staging-'||bid::text||'@example.invalid','+639000000000','Philippines','philippine_resident',true);
  insert into public.bookings(id,booking_reference,customer_id,motorcycle_model_id,start_at,end_at,status,quoted_total_php,base_total_php,pricing_daily_rate_php,pricing_units,deposit_required_centavos,is_test,expires_at,selected_color)
   values(bid,'SIGNATURE-ROLLBACK-'||bid::text,customer,model,starts,ends,'pending',q.total_php,q.total_php,q.daily_rate_php,q.pricing_units,250000,false,now()+interval '1 hour',chosen_color);
  insert into public.customer_verifications(id,booking_id,customer_id,customer_type,identity_status,license_status,entitlement_status,international_status,overall_status,license_issuing_country,license_expiration_date,permitted_vehicle_categories,identity_name,license_name,privacy_consent_at,customer_declaration_at)
   values(vid,bid,customer,'philippine_resident','submitted','submitted','under_review','not_applicable','submitted','Philippines','2036-01-01','A','Synthetic rollback identity','Synthetic rollback identity',now(),now());
  insert into public.booking_deposits(booking_id,option,required_centavos,partial_return_allowed,collection_instructions,return_instructions,dispute_instructions,policy_version,request_fingerprint,is_test)
   values(bid,'cash',250000,false,'Synthetic rollback deposit','Synthetic rollback return','Synthetic rollback review',now(),'drawn-signature-rollback',false);
  insert into public.guest_booking_contacts values(bid,access_hash,'staging-'||bid::text||'@example.invalid','drawn-signature-rollback',now());
  insert into public.booking_services(booking_id,delivery_fee_centavos,collection_fee_centavos,payment_method) values(bid,0,0,selected_payment);
  insert into public.booking_inventory_holds(booking_id,motorcycle_unit_id,start_at,end_at,expires_at) values(bid,unit,starts,ends,now()+interval '10 minutes');
  foreach kind in array array['government_id','drivers_license_front'] loop
   insert into storage.objects(bucket_id,name,metadata) values('identity-verification','guest/'||bid::text||'/'||kind||'-rollback.png','{"mimetype":"image/png","size":1}');
   perform public.register_guest_verification_document(bid,access_hash,kind,'guest/'||bid::text||'/'||kind||'-rollback.png','image/png',1);
  end loop;

 terms:=(select version from public.rental_terms_versions where is_current);
 select * into result from public.draw_and_finalize_guest_booking_request(bid,access_hash,terms,true,'Synthetic rollback signer',drawing);
 if result.booking_status<>'confirmed' then raise exception 'Cash booking finalization failed';end if;
 if not exists(select 1 from public.booking_electronic_signatures where booking_id=bid and signature_strokes=drawing and signature_name='Synthetic rollback signer' and method='drawn' and terms_version=terms) then raise exception 'Signature not saved';end if;
 if not exists(select 1 from public.booking_terms_acceptances where booking_id=bid and terms_version=terms) then raise exception 'Terms not accepted atomically';end if;
 perform public.draw_and_finalize_guest_booking_request(bid,access_hash,terms,true,'Synthetic rollback signer',drawing);
 if (select count(*) from public.booking_electronic_signatures where booking_id=bid)<>1 then raise exception 'Duplicate signature';end if;
 begin
  perform public.draw_and_finalize_guest_booking_request(bid,access_hash,terms,true,'Synthetic rollback signer','[]');
  raise exception 'UNEXPECTED_BLANK';
 exception when raise_exception then if sqlerrm='UNEXPECTED_BLANK' then raise;end if;end;
 begin
  perform public.draw_and_finalize_guest_booking_request(bid,access_hash,terms,true,'Synthetic rollback signer','[[{"x":0.2,"y":0.2},{"x":0.8,"y":0.8}]]');
  raise exception 'UNEXPECTED_CHANGE';
 exception when raise_exception then if sqlerrm='UNEXPECTED_CHANGE' then raise;end if;end;
 begin
  perform public.draw_and_finalize_guest_booking_request(bid,repeat('0',64),terms,true,'Synthetic rollback signer',drawing);
  raise exception 'UNEXPECTED_OWNER';
 exception when raise_exception then if sqlerrm='UNEXPECTED_OWNER' then raise;end if;end;
 begin
  update public.booking_electronic_signatures set signature_name='Changed signer' where booking_id=bid;
  raise exception 'UNEXPECTED_UPDATE';
 exception when raise_exception then if sqlerrm='UNEXPECTED_UPDATE' then raise;end if;end;
end;$$;
rollback;
select 'Passed: atomic booking + drawn signature + terms, idempotent retry, blank rejection, changed signature rejection, browser ownership, immutable record. All synthetic rows rolled back.' as result;
