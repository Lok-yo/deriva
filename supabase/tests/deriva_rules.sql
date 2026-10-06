-- Run after the migration with an administrator connection:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/deriva_rules.sql
-- Or pass this complete file to Supabase MCP execute_sql in one call.
-- Every fixture, token, queue item, entitlement and cron change is rolled back.
-- Fixtures include full_name for the existing attendance signup trigger.
-- A previously configured worker endpoint and cron job are preserved by ROLLBACK.
-- Hosted Storage checks storage.allow_delete_query='true' inside its API requests;
-- the same transaction-local setting lets these SQL tests exercise Deriva's RLS
-- and photo-reference guard without disabling or changing any Storage trigger.
begin;

create function pg_temp.assert_true(p_condition boolean, p_label text)
returns void language plpgsql security invoker as $$
begin
  if p_condition is distinct from true then raise exception 'Deriva SQL check failed: %', p_label; end if;
end;
$$;

create function pg_temp.must_fail(p_sql text, p_sqlstate text, p_label text)
returns void language plpgsql security invoker as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_sqlstate then return; end if;
    raise exception 'Deriva SQL check failed: % (expected %, received %: %)', p_label, p_sqlstate, sqlstate, sqlerrm;
  end;
  raise exception 'Deriva SQL check failed: % (operation unexpectedly succeeded)', p_label;
end;
$$;

create function pg_temp.no_rows(p_sql text, p_label text)
returns void language plpgsql security invoker as $$
declare v_count bigint;
begin
  execute p_sql;
  get diagnostics v_count = row_count;
  perform pg_temp.assert_true(v_count = 0, p_label);
end;
$$;

create function pg_temp.set_claims(p_uid uuid, p_role text)
returns void language plpgsql security invoker as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', p_role)::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  perform set_config('request.jwt.claim.role', p_role, true);
end;
$$;

do $$
begin
  if to_regprocedure('storage.protect_delete()') is not null then
    perform set_config('storage.allow_delete_query', 'false', true);
    perform pg_temp.must_fail('delete from storage.objects where false', '42501', 'Hosted Storage direct-delete guard remains enabled');
  end if;
end;
$$;
set local storage.allow_delete_query = 'true';

select pg_temp.assert_true((select count(*) = 1 from deriva_private.worker_config where singleton), 'worker configuration singleton exists');
select pg_temp.assert_true((select count(*) = 6 from pg_publication_tables where pubname = 'supabase_realtime' and tablename in
  ('deriva_places', 'deriva_profiles', 'deriva_entitlements', 'deriva_saved_places', 'deriva_notifications', 'deriva_notification_preferences')),
  'all six app subscriptions belong to Realtime');
select pg_temp.assert_true(to_regclass('public.attendance') is null or exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attendance'),
  'attendance Realtime membership preserved');
select pg_temp.assert_true(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'deriva_%' and p.prosecdef), 'public RPC wrappers are invokers');
select pg_temp.assert_true((select not public and file_size_limit = 2097152 and allowed_mime_types = array['image/jpeg'] from storage.buckets where id = 'deriva-photos'),
  'private JPEG bucket with a 2 MiB limit');

insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'deriva-sql-free@example.invalid', '{"full_name":"Deriva SQL Free"}', '{"provider":"email","providers":["email"]}', now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'deriva-sql-near@example.invalid', '{"full_name":"Deriva SQL Near"}', '{"provider":"email","providers":["email"]}', now(), now()),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'deriva-sql-premium@example.invalid', '{"full_name":"Deriva SQL Premium"}', '{"provider":"email","providers":["email"]}', now(), now());

insert into storage.objects (bucket_id, name, owner_id, metadata)
values
  ('deriva-photos', '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.jpg', '10000000-0000-4000-8000-000000000001', '{"mimetype":"image/jpeg","size":100}'),
  ('deriva-photos', '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000003.jpg', '10000000-0000-4000-8000-000000000001', '{"mimetype":"image/jpeg","size":100}'),
  ('deriva-photos', '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000004.jpg', '10000000-0000-4000-8000-000000000002', '{"mimetype":"image/jpeg","size":100}'),
  ('deriva-photos', '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000005.jpg', '10000000-0000-4000-8000-000000000001', '{"mimetype":"image/jpeg","size":100}'),
  ('deriva-photos', '10000000-0000-4000-8000-000000000003/20000000-0000-4000-8000-000000000002.jpg', '10000000-0000-4000-8000-000000000003', '{"mimetype":"image/jpeg","size":100}');

insert into deriva_private.worker_invocations (token_hash, expires_at)
values (extensions.digest(repeat('a', 72), 'sha256'), clock_timestamp() + interval '2 minutes'),
  (extensions.digest(repeat('b', 72), 'sha256'), clock_timestamp() - interval '1 minute');

select pg_temp.set_claims('10000000-0000-4000-8000-000000000001', 'authenticated');
set local role authenticated;
insert into public.deriva_profiles (user_id, display_name) values ('10000000-0000-4000-8000-000000000001', 'Explorador libre');
update public.deriva_profiles set display_name = 'Explorador' where user_id = '10000000-0000-4000-8000-000000000001';
select pg_temp.must_fail($sql$update public.deriva_profiles set created_at = now()$sql$, '42501', 'profile created_at is immutable');
select pg_temp.must_fail($sql$insert into public.deriva_profiles(user_id,display_name) values ('10000000-0000-4000-8000-000000000002','Otra cuenta')$sql$, '42501', 'cannot create another user profile');
insert into public.deriva_notification_preferences (user_id, enabled, latitude, longitude, radius_km)
values ('10000000-0000-4000-8000-000000000001', true, 29.07, -110.96, 5);
select pg_temp.must_fail($sql$update public.deriva_notification_preferences set radius_km = 51$sql$, '23514', 'radius upper bound');
select pg_temp.must_fail($sql$update public.deriva_notification_preferences set radius_km = 'NaN'::float8$sql$, '23514', 'finite radius');
select pg_temp.must_fail($sql$update public.deriva_notification_preferences set latitude = null, longitude = null$sql$, '23514', 'enabled preferences require GPS');

select pg_temp.must_fail($sql$select public.deriva_create_place('20000000-0000-4000-8000-000000000005','Lugar de prueba','naturaleza',29.07,-110.96,'10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000005.jpg','gallery')$sql$,
  '42501', 'free cannot use gallery');
select pg_temp.must_fail($sql$select public.deriva_create_place('20000000-0000-4000-8000-000000000005','Lugar de prueba','naturaleza',29.07,-110.96,'10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000005.jpg','camera',29.07,-110.96,10,clock_timestamp(),false)$sql$,
  '42501', 'camera requires biometric verification');
select pg_temp.must_fail($sql$select public.deriva_create_place('20000000-0000-4000-8000-000000000005','Lugar de prueba','naturaleza',29.07,-110.96,'10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000005.jpg','camera',p_biometric_verified=>true)$sql$,
  '22023', 'free requires all GPS readings');
select pg_temp.must_fail($sql$select public.deriva_create_place('20000000-0000-4000-8000-000000000005','Lugar de prueba','naturaleza',29.07,-110.96,'10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000005.jpg','camera',29.07,-110.96,10,clock_timestamp()-interval '3 minutes',true)$sql$,
  '22023', 'stale GPS rejected');
select pg_temp.must_fail($sql$select public.deriva_create_place('20000000-0000-4000-8000-000000000005','Lugar de prueba','naturaleza',29.07,-110.96,'10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000005.jpg','camera',29.07,-110.96,10,clock_timestamp()+interval '1 minute',true)$sql$,
  '22023', 'future GPS rejected');
select pg_temp.must_fail($sql$select public.deriva_create_place('20000000-0000-4000-8000-000000000005','Lugar de prueba','naturaleza',29.07,-110.96,'10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000005.jpg','camera',29.07,-110.96,101,clock_timestamp(),true)$sql$,
  '22023', 'inaccurate GPS rejected');
select pg_temp.must_fail($sql$select public.deriva_create_place('20000000-0000-4000-8000-000000000005','Lugar de prueba','naturaleza',29.07,-110.96,'10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000005.jpg','camera',29.07,-110.96,'NaN'::float8,clock_timestamp(),true)$sql$,
  '22023', 'NaN accuracy rejected');
select pg_temp.must_fail($sql$select public.deriva_create_place('20000000-0000-4000-8000-000000000005','Lugar de prueba','naturaleza','NaN'::float8,-110.96,'10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000005.jpg','camera',29.07,-110.96,10,clock_timestamp(),true)$sql$,
  '22023', 'NaN coordinates rejected');
select pg_temp.must_fail($sql$select public.deriva_create_place('20000000-0000-4000-8000-000000000005','Lugar de prueba','naturaleza',29.07,'Infinity'::float8,'10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000005.jpg','camera',29.07,-110.96,10,clock_timestamp(),true)$sql$,
  '22023', 'infinite coordinates rejected');
select pg_temp.must_fail($sql$select public.deriva_create_place('20000000-0000-4000-8000-000000000005','Lugar de prueba','naturaleza',29.17,-110.96,'10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000005.jpg','camera',29.07,-110.96,10,clock_timestamp(),true)$sql$,
  '42501', 'free cannot choose a remote location');
select pg_temp.must_fail($sql$select public.deriva_create_place('20000000-0000-4000-8000-000000000005','  x  ','naturaleza',29.07,-110.96,'10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000005.jpg','camera',29.07,-110.96,10,clock_timestamp(),true)$sql$,
  '22023', 'trimmed title minimum');
select pg_temp.must_fail($sql$select public.deriva_create_place('20000000-0000-4000-8000-000000000005','Lugar de prueba','naturaleza',29.07,-110.96,'10000000-0000-4000-8000-000000000002/20000000-0000-4000-8000-000000000005.jpg','camera',29.07,-110.96,10,clock_timestamp(),true)$sql$,
  '42501', 'photo path must exactly match user and request');
select pg_temp.must_fail($sql$select public.deriva_create_place('20000000-0000-4000-8000-000000000004','Lugar de prueba','naturaleza',29.07,-110.96,'10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000004.jpg','camera',29.07,-110.96,10,clock_timestamp(),true)$sql$,
  '42501', 'Storage object must belong to current user');
select pg_temp.must_fail($sql$select public.deriva_create_place('20000000-0000-4000-8000-000000000099','Lugar de prueba','naturaleza',29.07,-110.96,'10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000099.jpg','camera',29.07,-110.96,10,clock_timestamp(),true)$sql$,
  '42501', 'Storage object must already exist');
select pg_temp.must_fail($sql$insert into public.deriva_places (id,owner_id,title,category,latitude,longitude,photo_path,photo_source)
 values ('20000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000001','Direct insert','naturaleza',29.07,-110.96,'10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000099.jpg','gallery')$sql$,
 '42501', 'cannot bypass publication RPC');
select pg_temp.must_fail($sql$update public.deriva_places set latitude = 0$sql$, '42501', 'published location is immutable');
select pg_temp.must_fail($sql$insert into public.deriva_entitlements (user_id,active,verified_at) values ('10000000-0000-4000-8000-000000000001',true,now())$sql$,
 '42501', 'client cannot grant Premium');
select pg_temp.must_fail($sql$select public.deriva_sync_entitlement('10000000-0000-4000-8000-000000000001',true,null,now())$sql$,
 '42501', 'client cannot invoke entitlement service RPC');
select pg_temp.must_fail($sql$select public.deriva_claim_push(100)$sql$, '42501', 'client cannot claim push jobs');
select pg_temp.must_fail($sql$select public.deriva_authorize_worker('anything')$sql$, '42501', 'client cannot check worker secret');
select pg_temp.must_fail($sql$select * from deriva_private.worker_invocations$sql$, '42501', 'client cannot read worker credentials');
select pg_temp.must_fail($sql$select * from public.deriva_push_queue$sql$, '42501', 'client cannot read push queue');
select pg_temp.must_fail($sql$insert into public.deriva_push_tokens(user_id,token,platform,device_id)
 values ('10000000-0000-4000-8000-000000000001','ExpoPushToken[test_token_123456]','android','sql-device')$sql$,
 '42501', 'tokens must be registered through RPC');
select pg_temp.must_fail($sql$select public.deriva_register_push_token('ExpoPushToken[bad]','android','sql-device')$sql$,
  '22023', 'malformed push token rejected');
insert into public.deriva_profiles (user_id,display_name) values ('10000000-0000-4000-8000-000000000001','Otro nombre')
  on conflict (user_id) do nothing;
select pg_temp.assert_true((select display_name='Explorador' from public.deriva_profiles where user_id='10000000-0000-4000-8000-000000000001'),
  'client profile creation can ignore duplicate without updating protected primary key');

reset role;
select pg_temp.set_claims('10000000-0000-4000-8000-000000000002', 'authenticated');
set local role authenticated;
insert into public.deriva_profiles (user_id, display_name) values ('10000000-0000-4000-8000-000000000002', 'Explorador cercano');
select pg_temp.assert_true(exists (select 1 from public.deriva_profiles where user_id = '10000000-0000-4000-8000-000000000001'), 'display names are publicly readable for signed-in users');
select pg_temp.no_rows($sql$update public.deriva_profiles set display_name='No autorizado' where user_id='10000000-0000-4000-8000-000000000001'$sql$, 'cannot edit another profile');
insert into public.deriva_notification_preferences (user_id, enabled, latitude, longitude, radius_km)
values ('10000000-0000-4000-8000-000000000002', true, 29.0701, -110.9601, 5);
select public.deriva_register_push_token('ExpoPushToken[nearby_test_1234567890]', 'android', 'sql-nearby-device');

reset role;
select pg_temp.set_claims('10000000-0000-4000-8000-000000000003', 'authenticated');
set local role authenticated;
insert into public.deriva_profiles (user_id, display_name) values ('10000000-0000-4000-8000-000000000003', 'Explorador Premium');
insert into public.deriva_notification_preferences (user_id, enabled, latitude, longitude, radius_km)
values ('10000000-0000-4000-8000-000000000003', true, 30, -109, 5);
select public.deriva_register_push_token('ExponentPushToken[faraway_test_1234567890]', 'ios', 'sql-premium-device');

reset role;
select pg_temp.set_claims('10000000-0000-4000-8000-000000000001', 'authenticated');
set local role authenticated;
select pg_temp.assert_true(public.deriva_create_place('20000000-0000-4000-8000-000000000001','  Sendero de prueba  ','naturaleza',29.07,-110.96,
  '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.jpg','camera',29.07,-110.96,10,clock_timestamp(),true)
  = '20000000-0000-4000-8000-000000000001'::uuid, 'valid free publication');
select pg_temp.assert_true(public.deriva_create_place('20000000-0000-4000-8000-000000000001',null,null,null,null,null,null)
  = '20000000-0000-4000-8000-000000000001'::uuid, 'idempotent retry precedes all other validation');
select pg_temp.assert_true((select title = 'Sendero de prueba' from public.deriva_places where id = '20000000-0000-4000-8000-000000000001'), 'published title trimmed');
select pg_temp.assert_true((select count(*) = 0 from public.deriva_notifications), 'author does not notify itself');
select pg_temp.no_rows($sql$delete from storage.objects where bucket_id='deriva-photos' and name='10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.jpg'$sql$, 'cannot delete referenced photo');
insert into storage.objects (bucket_id,name,owner_id) values ('deriva-photos','10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000006.jpg','10000000-0000-4000-8000-000000000001');
select pg_temp.must_fail($sql$insert into storage.objects(bucket_id,name,owner_id) values ('deriva-photos','10000000-0000-4000-8000-000000000002/20000000-0000-4000-8000-000000000006.jpg','10000000-0000-4000-8000-000000000001')$sql$,
  '42501', 'upload cannot use another account folder');
select pg_temp.must_fail($sql$insert into storage.objects(bucket_id,name,owner_id) values ('deriva-photos','10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000006.png','10000000-0000-4000-8000-000000000001')$sql$,
  '42501', 'upload path must be JPEG');
select pg_temp.no_rows($sql$update storage.objects set metadata='{}' where bucket_id='deriva-photos' and name='10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000006.jpg'$sql$, 'uploaded photo cannot be replaced');
delete from storage.objects where bucket_id = 'deriva-photos' and name = '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000006.jpg';

reset role;
select pg_temp.set_claims('10000000-0000-4000-8000-000000000002', 'authenticated');
set local role authenticated;
select pg_temp.assert_true((select count(*) = 1 from public.deriva_notifications), 'nearby user receives one notification');
select pg_temp.assert_true((select count(*) = 1 from storage.objects where bucket_id='deriva-photos'
  and name='10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.jpg'), 'published photos readable by signed-in explorers');
select pg_temp.assert_true((select count(*) = 0 from storage.objects where bucket_id='deriva-photos'
  and name='10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000005.jpg'), 'another account unpublished upload remains private');
select pg_temp.must_fail($sql$select public.deriva_create_place('20000000-0000-4000-8000-000000000001',null,null,null,null,null,null)$sql$,
  '42501', 'request ID cannot be replayed by another owner');
update public.deriva_notifications set read_at = clock_timestamp();
select pg_temp.assert_true((select bool_and(read_at is not null) from public.deriva_notifications), 'recipient can mark inbox read');
select pg_temp.must_fail($sql$update public.deriva_notifications set body='Forged message'$sql$, '42501', 'inbox body immutable');
select pg_temp.must_fail($sql$update public.deriva_notifications set user_id='10000000-0000-4000-8000-000000000001'$sql$, '42501', 'inbox ownership immutable');
select pg_temp.must_fail($sql$insert into public.deriva_notifications(user_id,title,body) values ('10000000-0000-4000-8000-000000000002','Forged','Forged')$sql$,
  '42501', 'client cannot forge notifications');
insert into public.deriva_saved_places (user_id, place_id) values ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select count(*) = 1 from public.deriva_saved_places), 'own saved place readable');
select pg_temp.must_fail($sql$update public.deriva_saved_places set user_id='10000000-0000-4000-8000-000000000001'$sql$, '42501', 'cannot transfer saved place ownership');
select pg_temp.must_fail($sql$update public.deriva_push_tokens set token='ExpoPushToken[forged_test_1234567890]'$sql$, '42501', 'token values immutable for clients');

reset role;
select pg_temp.set_claims('10000000-0000-4000-8000-000000000003', 'authenticated');
set local role authenticated;
select pg_temp.assert_true((select count(*) = 0 from public.deriva_notifications), 'distant user receives no notification');

reset role;
select pg_temp.set_claims(null, 'service_role');
set local role service_role;
select pg_temp.assert_true((select count(*) = 1 from public.deriva_push_queue q join public.deriva_notifications n on n.id=q.notification_id
  where n.user_id='10000000-0000-4000-8000-000000000002'), 'one queue item per nearby registered fixture token');
-- Claims have a global service contract; only fixture results are asserted here.
-- Their transaction also rolls back any leases acquired for other queued jobs.
select pg_temp.assert_true((select count(*) = 1 from public.deriva_claim_push(100) c join public.deriva_notifications n on n.id=c.notification_id
  where n.user_id='10000000-0000-4000-8000-000000000002'), 'service claims ready fixture job');
select pg_temp.assert_true((select count(*) = 0 from public.deriva_claim_push(100) c join public.deriva_notifications n on n.id=c.notification_id
  where n.user_id='10000000-0000-4000-8000-000000000002'), 'live lease prevents duplicate fixture claim');
update public.deriva_push_queue q set lease_until = clock_timestamp() - interval '1 minute'
  where q.notification_id in (select id from public.deriva_notifications where user_id='10000000-0000-4000-8000-000000000002');
select pg_temp.assert_true((select count(*) = 1 and max(c.attempts) = 2 from public.deriva_claim_push(100) c join public.deriva_notifications n on n.id=c.notification_id
  where n.user_id='10000000-0000-4000-8000-000000000002'), 'abandoned fixture lease reclaimed with next attempt');
update public.deriva_push_queue q set attempts = 5, lease_until = clock_timestamp() - interval '1 minute'
  where q.notification_id in (select id from public.deriva_notifications where user_id='10000000-0000-4000-8000-000000000002');
select pg_temp.assert_true((select count(*) = 0 from public.deriva_claim_push(100) c join public.deriva_notifications n on n.id=c.notification_id
  where n.user_id='10000000-0000-4000-8000-000000000002'), 'sixth fixture attempt is never claimed');
select pg_temp.assert_true((select bool_and(q.state = 'failed') from public.deriva_push_queue q join public.deriva_notifications n on n.id=q.notification_id
  where n.user_id='10000000-0000-4000-8000-000000000002'), 'exhausted abandoned fixture jobs become failed');
select pg_temp.must_fail($sql$select public.deriva_claim_push(0)$sql$, '22023', 'claim lower bound');
select pg_temp.must_fail($sql$select public.deriva_claim_push(101)$sql$, '22023', 'claim upper bound');
select pg_temp.assert_true(not public.deriva_authorize_worker('incorrect'), 'incorrect worker credential rejected');
select pg_temp.assert_true(public.deriva_authorize_worker(repeat('a', 72)), 'fresh one-time worker token accepted');
select pg_temp.assert_true(not public.deriva_authorize_worker(repeat('a', 72)), 'worker token replay rejected');
select pg_temp.assert_true(not public.deriva_authorize_worker(repeat('b', 72)), 'expired worker token rejected');
select public.deriva_sync_entitlement('10000000-0000-4000-8000-000000000003', true, clock_timestamp() - interval '1 day', clock_timestamp() - interval '10 seconds');
select public.deriva_sync_entitlement('10000000-0000-4000-8000-000000000099', true, null, clock_timestamp());
select pg_temp.assert_true(not exists (select 1 from public.deriva_entitlements where user_id='10000000-0000-4000-8000-000000000099'), 'deleted/nonexistent account webhook ignored');

reset role;
select pg_temp.set_claims('10000000-0000-4000-8000-000000000003', 'authenticated');
set local role authenticated;
select pg_temp.must_fail($sql$select public.deriva_create_place('20000000-0000-4000-8000-000000000002','Mirador remoto','misterio',19.43,-99.13,
  '10000000-0000-4000-8000-000000000003/20000000-0000-4000-8000-000000000002.jpg','gallery')$sql$, '42501', 'expired Premium behaves as free');

reset role;
select pg_temp.set_claims(null, 'service_role');
set local role service_role;
select public.deriva_sync_entitlement('10000000-0000-4000-8000-000000000003', true, clock_timestamp() + interval '1 day', clock_timestamp());
select public.deriva_sync_entitlement('10000000-0000-4000-8000-000000000003', false, null, clock_timestamp() - interval '1 day');
select pg_temp.assert_true((select active and expires_at > now() from public.deriva_entitlements where user_id='10000000-0000-4000-8000-000000000003'), 'older verification cannot revoke newer Premium');

reset role;
select pg_temp.set_claims('10000000-0000-4000-8000-000000000003', 'authenticated');
set local role authenticated;
select pg_temp.must_fail($sql$select public.deriva_create_place('20000000-0000-4000-8000-000000000002','Mirador remoto','misterio',19.43,-99.13,
  '10000000-0000-4000-8000-000000000003/20000000-0000-4000-8000-000000000002.jpg','camera')$sql$, '42501', 'Premium camera still needs biometrics');
select pg_temp.must_fail($sql$select public.deriva_create_place('20000000-0000-4000-8000-000000000002','Mirador remoto','misterio',19.43,-99.13,
  '10000000-0000-4000-8000-000000000003/20000000-0000-4000-8000-000000000002.jpg','gallery')$sql$,
  '42501', 'legacy active Premium no longer authorizes arbitrary locations');
reset role;
select pg_temp.set_claims(null, 'service_role');
set local role service_role;
select public.deriva_record_remote_purchase('10000000-0000-4000-8000-000000000003','cs_test_legacy_rules','pi_legacy_rules',100,'usd');
reset role;
select pg_temp.set_claims('10000000-0000-4000-8000-000000000003', 'authenticated');
set local role authenticated;
select pg_temp.assert_true(public.deriva_create_place_v2('20000000-0000-4000-8000-000000000002','Mirador remoto','remote',19.43,-99.13,
  '10000000-0000-4000-8000-000000000003/20000000-0000-4000-8000-000000000002.jpg','gallery') = '20000000-0000-4000-8000-000000000002'::uuid,
  'one confirmed payment permits one arbitrary location with gallery');

reset role;
select pg_temp.set_claims('10000000-0000-4000-8000-000000000001', 'authenticated');
set local role authenticated;
select pg_temp.assert_true((select count(*) = 0 from public.deriva_entitlements), 'entitlement visibility isolated by owner');
select pg_temp.assert_true((select count(*) = 0 from public.deriva_saved_places), 'saved places isolated by owner');
select pg_temp.assert_true((select count(*) = 0 from public.deriva_push_tokens), 'tokens isolated by owner');
select pg_temp.assert_true((select count(*) = 1 from public.deriva_notification_preferences), 'preferences isolated by owner');
select pg_temp.no_rows($sql$delete from public.deriva_saved_places where user_id='10000000-0000-4000-8000-000000000002'$sql$, 'cannot delete another account saved place');
select pg_temp.no_rows($sql$delete from public.deriva_places where owner_id='10000000-0000-4000-8000-000000000003'$sql$, 'cannot delete another account place');
select pg_temp.no_rows($sql$delete from public.deriva_push_tokens where user_id='10000000-0000-4000-8000-000000000002'$sql$, 'cannot delete another account token');
select pg_temp.no_rows($sql$update public.deriva_notification_preferences set enabled=false where user_id='10000000-0000-4000-8000-000000000002'$sql$, 'cannot disable another account notifications');
select public.deriva_create_place('20000000-0000-4000-8000-000000000003', 'Segundo sendero', 'urbano', 29.07, -110.96,
  '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000003.jpg', 'camera', 29.07, -110.96, 10, clock_timestamp(), true);
select public.deriva_register_push_token('ExpoPushToken[nearby_test_1234567890]', 'android', 'sql-shared-device');
select pg_temp.assert_true((select count(*) = 1 from public.deriva_push_tokens), 'same physical token reassigned to current account');

reset role;
select pg_temp.set_claims('10000000-0000-4000-8000-000000000002', 'authenticated');
set local role authenticated;
select pg_temp.assert_true((select count(*) = 0 from public.deriva_push_tokens), 'previous account no longer owns shared phone token');
select pg_temp.assert_true((select count(*) = 2 from public.deriva_notifications), 'token reassignment preserves previous inbox');

reset role;
select pg_temp.set_claims(null, 'service_role');
set local role service_role;
select pg_temp.assert_true((select count(*) = 0 from public.deriva_push_queue q join public.deriva_notifications n on n.id=q.notification_id
  where n.user_id='10000000-0000-4000-8000-000000000002'), 'reassignment removes all old fixture account queued deliveries');
select pg_temp.assert_true((select count(*) = 0 from public.deriva_claim_push(100) c join public.deriva_notifications n on n.id=c.notification_id
  where n.user_id='10000000-0000-4000-8000-000000000002'), 'old fixture account jobs cannot be claimed after reassignment');
select pg_temp.must_fail($sql$select public.deriva_configure_push('http://localhost/worker')$sql$, '22023', 'worker URL must be exact Supabase HTTPS endpoint');

reset role;
select pg_temp.set_claims('10000000-0000-4000-8000-000000000001', 'authenticated');
set local role authenticated;
delete from public.deriva_places where id = '20000000-0000-4000-8000-000000000001';
delete from storage.objects where bucket_id='deriva-photos' and name='10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.jpg';

reset role;
select pg_temp.assert_true((select used = 2 from deriva_private.daily_publish_limits where user_id='10000000-0000-4000-8000-000000000001' and publication_day=(clock_timestamp() at time zone 'UTC')::date),
  'deletion does not refund daily publication counter');
select pg_temp.assert_true(not exists (select 1 from public.deriva_saved_places where place_id='20000000-0000-4000-8000-000000000001'), 'place deletion cascades saved places');
select pg_temp.assert_true(exists (select 1 from public.deriva_notifications where user_id='10000000-0000-4000-8000-000000000002' and place_id is null), 'place deletion preserves inbox with null reference');
update deriva_private.daily_publish_limits set used=20 where user_id='10000000-0000-4000-8000-000000000001' and publication_day=(clock_timestamp() at time zone 'UTC')::date;
select pg_temp.must_fail($sql$delete from storage.objects where bucket_id='deriva-photos' and name='10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000003.jpg'$sql$,
  '23503', 'trigger protects referenced photo even from administrator deletion');

select pg_temp.set_claims('10000000-0000-4000-8000-000000000001', 'authenticated');
set local role authenticated;
select pg_temp.must_fail($sql$select public.deriva_create_place('20000000-0000-4000-8000-000000000005','Límite diario','naturaleza',29.07,-110.96,
  '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000005.jpg','camera',29.07,-110.96,10,clock_timestamp(),true)$sql$,
  'P0001', 'daily limit rejects the 21st publication');
select pg_temp.assert_true(public.deriva_create_place('20000000-0000-4000-8000-000000000003',null,null,null,null,null,null)
  = '20000000-0000-4000-8000-000000000003'::uuid, 'idempotent retry allowed after daily limit');

reset role;
select pg_temp.set_claims(null, 'anon');
set local role anon;
select pg_temp.must_fail($sql$select * from public.deriva_places$sql$, '42501', 'anonymous callers cannot read places');
select pg_temp.must_fail($sql$select public.deriva_register_push_token('ExpoPushToken[test_token_123456]','android','sql-device')$sql$,
  '42501', 'anonymous callers cannot register push');

reset role;
select pg_temp.set_claims(null, 'authenticated');
set local role authenticated;
select pg_temp.must_fail($sql$select public.deriva_create_place('20000000-0000-4000-8000-000000000099',null,null,null,null,null,null)$sql$,
  '42501', 'authenticated database role without user identity cannot publish');

reset role;
select pg_temp.set_claims(null, 'service_role');
select public.deriva_configure_push('https://exampleprojectref000.supabase.co/functions/v1/deriva-push-worker');
select pg_temp.assert_true((select count(*) = 1 from cron.job where jobname='deriva-push' and schedule='* * * * *' and command='select deriva_private.invoke_push_worker();'),
  'explicit configuration schedules exactly the Deriva worker without embedding its secret');
-- pg_net does not dispatch requests before commit. This invocation is rolled back.
select deriva_private.invoke_push_worker();
do $$
declare v_token text;
begin
  select q.headers ->> 'x-deriva-job-token' into v_token from net.http_request_queue q
  where q.url='https://exampleprojectref000.supabase.co/functions/v1/deriva-push-worker'
    and q.xmin = pg_current_xact_id()::xid
  order by q.id desc limit 1;
  perform pg_temp.assert_true(char_length(v_token) = 72, 'scheduled request has a random one-time token');
  perform pg_temp.assert_true(exists (select 1 from deriva_private.worker_invocations
    where token_hash=extensions.digest(v_token,'sha256') and expires_at > clock_timestamp()), 'worker keeps only the token hash');
  perform pg_temp.assert_true(public.deriva_authorize_worker(v_token), 'issued cron token accepted once');
  perform pg_temp.assert_true(not public.deriva_authorize_worker(v_token), 'issued cron token rejects replay');
end;
$$;
rollback;
select 'Deriva SQL checks passed; fixtures, Storage setting and prior cron configuration restored by rollback.' as result;
