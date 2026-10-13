-- Record the client-confirmed NMAX generation without claiming a trim or color.

update public.motorcycle_models
set
  model_name = 'NMAX 155 V3',
  display_name = 'Yamaha NMAX 155 V3',
  description = 'A premium automatic scooter intended for composed urban and open-road travel. KJM identifies this rental model as the NMAX 155 V3; its exact trim, model year and color still require confirmation.',
  specification_status = 'pending',
  specification_note = 'KJM confirms the V3 generation, but Yamaha Philippines lists multiple NMAX trims with differing equipment. Confirm the unit''s model year and exact trim before publishing technical fields or photography.'
where slug = 'yamaha-nmax-155cc';
