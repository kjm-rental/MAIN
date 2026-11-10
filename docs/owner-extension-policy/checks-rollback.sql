begin;
-- Synthetic database integration check. All fixture rows and notifications roll back.
-- No real identity files are uploaded and no provider request is made.

set local lock_timeout='5s';set local statement_timeout='30s';
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.admin_users where is_active order by id limit 1),true);
update public.notification_settings set telegram_enabled=false,resend_enabled=false where id;
do $$
declare model uuid;unit uuid;customer uuid;bid uuid;vid uuid;access_hash text;selected_payment text:='cash';chosen_color text;
 starts timestamptz;ends timestamptz;q record;result record;kind text;terms text;
 drawing jsonb:='[[{"x":0.1,"y":0.2},{"x":0.6,"y":0.8}]]';
begin
 select m.id,u.id,u.color into model,unit,chosen_color from public.motorcycle_models m join public.motorcycle_units u on u.motorcycle_model_id=m.id where u.status='available' and u.archived_at is null and m.is_published and m.daily_rate_php=499 order by u.id limit 1;
 if unit is null then raise exception 'Synthetic inventory unavailable';end if;
  bid:=gen_random_uuid();customer:=gen_random_uuid();vid:=gen_random_uuid();access_hash:=encode(sha256(convert_to(bid::text,'UTF8')),'hex');
  starts:='2033-06-12T01:00:00Z';ends:=starts+interval '25 hours';
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

do $checks$
declare row record; rate integer; seconds numeric; expected numeric; detail jsonb; model uuid; quote jsonb; payload jsonb; saved jsonb; selected_unit uuid; selected_color text;
begin
 for row in select * from (values
  (86400::numeric,700,700::numeric),(90000,700,770),(90001,700,840),(93600,700,840),(93601,700,1400),(100800,700,1400),(172800,700,1400),
  (90000,499,548.90),(93600,499,598.80),(93601,499,998),(90000,599,658.90),(93600,599,718.80),(93601,599,1198),
  (180000,700,1540),(90000,0,0)) x(seconds,rate,expected)
 loop
  detail:=private.owner_extension_periods(row.seconds,row.rate,null,null);
  if (detail->>'totalPhp')::numeric<>row.expected then raise exception 'Wrong total for % seconds @ %: %',row.seconds,row.rate,detail;end if;
  if (detail->>'hourlyRatePhp')::numeric<>row.rate::numeric/10 or (detail->>'maxExtensionHours')::integer<>2 then raise exception 'Wrong hourly policy';end if;
 end loop;
 select id into model from public.motorcycle_models where daily_rate_php=499 and is_published and archived_at is null limit 1;
 if model is null then raise exception 'Fractional-rate fixture unavailable';end if;
 quote:=public.get_booking_quote_v4(model,'2034-05-20T01:00Z','2034-05-21T02:00Z','[]', 'cash',null);
 if (quote->>'base_total_centavos')::integer<>54890 or (quote->'rental_pricing'->>'hourlyRatePhp')::numeric<>49.90 then raise exception 'Public quote lost centavo precision: %',quote;end if;
 quote:=public.admin_quote_manual_booking(jsonb_build_object('modelId',model,'startAt','2034-05-20T01:00Z','endAt','2034-05-21T02:00Z','extras','[]'::jsonb,'services','{"delivery":null,"collection":null}'::jsonb,'adjustment','{"kind":"none","value":0,"reason":""}'::jsonb));
 if (quote->>'base')::numeric<>548.90 or (quote->>'standard')::numeric<>548.90 or (quote->>'final')::numeric<>548.90 then raise exception 'Manual quote lost centavo precision: %',quote;end if;
 select id,color into selected_unit,selected_color from public.motorcycle_units where motorcycle_model_id=model and status='available' and archived_at is null order by id limit 1;
 payload:=jsonb_build_object('modelId',model,'unitId',selected_unit,'selectedColor',selected_color,'requestId',gen_random_uuid(),'revision',0,'fullName','Synthetic fractional manual booking','phone','+990123456789','email','manual-policy@example.invalid','customerType','philippine_resident','source','phone','action','pending','notes','Synthetic rollback only','startAt','2034-05-20T01:00Z','endAt','2034-05-21T02:00Z','extras','[]'::jsonb,'services','{"delivery":null,"collection":null}'::jsonb,'adjustment','{"kind":"none","value":0,"reason":""}'::jsonb);
 quote:=public.admin_quote_manual_booking(payload);
 saved:=public.admin_save_manual_booking(payload||jsonb_build_object('quoteToken',quote->>'token','expectedTotal',548.90));
 if not exists(select 1 from public.bookings where id=(saved->>'bookingId')::uuid and base_total_php=548.90 and base_total_centavos=54890 and total_centavos=54890) then raise exception 'Manual save lost centavo precision';end if;
 if has_function_privilege('anon','private.calculate_booking_quote(uuid,timestamptz,timestamptz,boolean)','execute') then raise exception 'Private quote exposed';end if;
 if not has_function_privilege('anon','public.get_booking_quote(uuid,timestamptz,timestamptz)','execute') then raise exception 'Public quote privilege lost';end if;
end;$checks$;

do $check$
declare model uuid; chosen_color text; made record; payload jsonb;
begin
 select m.id,u.color into model,chosen_color from public.motorcycle_models m join public.motorcycle_units u on u.motorcycle_model_id=m.id where m.is_published and u.status='available' and u.archived_at is null and m.daily_rate_php=499 order by u.id limit 1;
 payload:=jsonb_build_object('p_idempotency_key',gen_random_uuid(),'p_model_id',model,'p_selected_color',chosen_color,'p_start_at','2034-03-12T01:00:00Z','p_end_at','2034-03-13T02:00:00Z','p_extra_items','[]'::jsonb,'p_full_name','Synthetic Single Name','p_email','single-name@example.invalid','p_phone','+639000000000','p_country','Philippines','p_customer_type','philippine_resident','p_license_country','Philippines','p_license_expiration','2036-01-01','p_entry_date',null,'p_privacy_consent',true,'p_declaration',true,'p_deposit_option','cash','p_policy_version',(select updated_at from public.security_deposit_settings where id),'p_document_type',null,'p_payment_method','cash','p_services','{"delivery":null,"collection":null}'::jsonb,'p_expected_service_centavos',0,'p_expected_delivery_centavos',0,'p_expected_collection_centavos',0);
 select * into made from public.submit_guest_booking_request_with_color(payload,repeat('a',64));
 if made.rental_total_centavos<>54890 then raise exception 'Guest submission rounded extension: %',made;end if;
 if made.booking_id is null then raise exception 'Single-name submission failed';end if;
 if not exists(select 1 from public.customer_verifications where booking_id=made.booking_id and identity_name is null and license_name is null and permitted_vehicle_categories is null and overall_status='submitted') then raise exception 'Missing declarations were invented or approval changed';end if;
end;$check$;

rollback;
select 'Passed new extension policy, centavo precision, guest/manual bookings, signature, privilege and history checks; synthetic rows rolled back' as result;