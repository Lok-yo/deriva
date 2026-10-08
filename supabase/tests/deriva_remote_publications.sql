-- Run after all migrations as an administrator. All fixtures are rolled back.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/deriva_remote_publications.sql
-- May also run as one Supabase execute_sql call. Uses no real Stripe payment.
begin;
set local storage.allow_delete_query = 'true';

create function pg_temp.assert_true(p_condition boolean, p_label text)
returns void language plpgsql security invoker as $$
begin
  if p_condition is distinct from true then raise exception 'Deriva purchase check failed: %', p_label; end if;
end;
$$;
create function pg_temp.must_fail(p_sql text, p_sqlstate text, p_label text)
returns void language plpgsql security invoker as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_sqlstate then return; end if;
    raise exception 'Deriva purchase check failed: % (expected %, received %: %)', p_label, p_sqlstate, sqlstate, sqlerrm;
  end;
  raise exception 'Deriva purchase check failed: % (operation unexpectedly succeeded)', p_label;
end;
$$;
create function pg_temp.set_claims(p_uid uuid, p_role text)
returns void language plpgsql security invoker as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', p_role,
    'user_metadata', jsonb_build_object('is_admin', true, 'role', 'admin'))::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  perform set_config('request.jwt.claim.role', p_role, true);
end;
$$;

select pg_temp.assert_true((select count(*) = 2 from pg_publication_tables where pubname = 'supabase_realtime'
  and schemaname = 'public' and tablename in ('deriva_roles', 'deriva_remote_purchases')), 'access tables join Realtime');
select pg_temp.assert_true(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'deriva_%' and p.prosecdef), 'public functions remain security invokers');

insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
values
  ('11000000-0000-4000-8000-000000000001','authenticated','authenticated','deriva-purchase-free@example.invalid',
    '{"full_name":"Deriva Purchase Free","is_admin":true}','{"provider":"email","providers":["email"]}',now(),now()),
  ('11000000-0000-4000-8000-000000000002','authenticated','authenticated','deriva-purchase-admin@example.invalid',
    '{"full_name":"Deriva Purchase Admin"}','{"provider":"email","providers":["email"]}',now(),now()),
  ('11000000-0000-4000-8000-000000000003','authenticated','authenticated','deriva-purchase-other@example.invalid',
    '{"full_name":"Deriva Purchase Other"}','{"provider":"email","providers":["email"]}',now(),now());

insert into storage.objects (bucket_id, name, owner_id, metadata)
select 'deriva-photos', u.uid::text || '/' || p.pid::text || '.jpg', u.uid::text, '{"mimetype":"image/jpeg","size":100}'::jsonb
from (values ('11000000-0000-4000-8000-000000000001'::uuid), ('11000000-0000-4000-8000-000000000002'::uuid)) u(uid)
cross join (values ('22000000-0000-4000-8000-000000000001'::uuid), ('22000000-0000-4000-8000-000000000002'::uuid),
  ('22000000-0000-4000-8000-000000000003'::uuid), ('22000000-0000-4000-8000-000000000004'::uuid),
  ('22000000-0000-4000-8000-000000000005'::uuid), ('22000000-0000-4000-8000-000000000006'::uuid)) p(pid);

-- Remote publication also requires exploring; this suite covers payments only.
insert into public.deriva_place_visits (user_id, place_key, distance_meters)
select '11000000-0000-4000-8000-000000000001', key, 0 from unnest(array['demo-1','demo-2','demo-3']) key;

-- Legacy verified Premium deliberately exists, but grants no new entitlement.
insert into public.deriva_entitlements(user_id, active, expires_at, verified_at)
values ('11000000-0000-4000-8000-000000000001',true,now()+interval '1 year',now());

select pg_temp.set_claims('11000000-0000-4000-8000-000000000001','authenticated');
set local role authenticated;
select pg_temp.assert_true(public.deriva_get_access() @> '{"is_admin":false,"remote_credits":0}'::jsonb,
  'user metadata and legacy Premium do not confer access');
select pg_temp.must_fail($q$select public.deriva_create_place_v2('22000000-0000-4000-8000-000000000001','Lugar remoto','remote',32.44,-114.78,
  '11000000-0000-4000-8000-000000000001/22000000-0000-4000-8000-000000000001.jpg','gallery')$q$, '42501', 'unpaid remote publication blocked');
select pg_temp.must_fail($q$select public.deriva_create_place('22000000-0000-4000-8000-000000000001','Premium antiguo','misterio',32.44,-114.78,
  '11000000-0000-4000-8000-000000000001/22000000-0000-4000-8000-000000000001.jpg','gallery')$q$, '42501', 'v1 cannot bypass payment with old Premium');
select pg_temp.must_fail($q$select public.deriva_create_place_v2('22000000-0000-4000-8000-000000000001','Gratis galería','local',32.44,-114.78,
  '11000000-0000-4000-8000-000000000001/22000000-0000-4000-8000-000000000001.jpg','gallery',32.44,-114.78,10,now(),true)$q$,
  '42501', 'local publication rejects gallery');
select pg_temp.must_fail($q$select public.deriva_create_place_v2('22000000-0000-4000-8000-000000000001','Sin biometría','local',32.44,-114.78,
  '11000000-0000-4000-8000-000000000001/22000000-0000-4000-8000-000000000001.jpg','camera',32.44,-114.78,10,now(),false)$q$,
  '42501', 'local requires camera biometry');
select pg_temp.must_fail($q$select public.deriva_create_place_v2('22000000-0000-4000-8000-000000000001','GPS antiguo','local',32.44,-114.78,
  '11000000-0000-4000-8000-000000000001/22000000-0000-4000-8000-000000000001.jpg','camera',32.44,-114.78,10,now()-interval '3 minutes',true)$q$,
  '22023', 'local rejects stale GPS');
select pg_temp.must_fail($q$select public.deriva_create_place_v2('22000000-0000-4000-8000-000000000001','GPS impreciso','local',32.44,-114.78,
  '11000000-0000-4000-8000-000000000001/22000000-0000-4000-8000-000000000001.jpg','camera',32.44,-114.78,101,now(),true)$q$,
  '22023', 'local rejects inaccurate GPS');
select pg_temp.must_fail($q$select public.deriva_create_place_v2('22000000-0000-4000-8000-000000000001','GPS remoto','local',32.44,-114.78,
  '11000000-0000-4000-8000-000000000001/22000000-0000-4000-8000-000000000001.jpg','camera',29.07,-110.96,10,now(),true)$q$,
  '42501', 'local rejects remote coordinate');
select pg_temp.assert_true(public.deriva_create_place_v2('22000000-0000-4000-8000-000000000001','  Lugar gratuito  ','local',32.44,-114.78,
  '11000000-0000-4000-8000-000000000001/22000000-0000-4000-8000-000000000001.jpg','camera',32.44,-114.78,10,clock_timestamp(),true)
  = '22000000-0000-4000-8000-000000000001'::uuid, 'local needs no payment');
select pg_temp.assert_true((select title = 'Lugar gratuito' and category = 'misterio' from public.deriva_places
  where id = '22000000-0000-4000-8000-000000000001'), 'title trimmed and category internal');
select pg_temp.assert_true(public.deriva_create_place_v2('22000000-0000-4000-8000-000000000001',null,null,null,null,null,null)
  = '22000000-0000-4000-8000-000000000001'::uuid, 'local duplicate remains idempotent');

-- Neither direct table writes nor service wrappers are available to a client.
select pg_temp.must_fail($q$insert into public.deriva_roles(user_id,is_admin) values('11000000-0000-4000-8000-000000000001',true)$q$,
  '42501', 'client cannot grant admin');
select pg_temp.must_fail($q$update public.deriva_roles set is_admin=true$q$, '42501', 'client cannot update admin');
select pg_temp.must_fail($q$delete from public.deriva_roles$q$, '42501', 'client cannot delete roles');
select pg_temp.must_fail($q$select public.deriva_set_admin('11000000-0000-4000-8000-000000000001',true)$q$, '42501', 'admin RPC restricted');
select pg_temp.must_fail($q$select public.deriva_record_remote_purchase('11000000-0000-4000-8000-000000000001','cs_test_forged','pi_forged',100,'usd')$q$,
  '42501', 'purchase RPC restricted');
select pg_temp.must_fail($q$select public.deriva_refund_remote_purchase('pi_forged',100,'usd')$q$, '42501', 'refund RPC restricted');
select pg_temp.must_fail($q$insert into public.deriva_remote_purchases(user_id,checkout_session_id,payment_intent_id,amount_total,currency,status)
  values('11000000-0000-4000-8000-000000000001','cs_test_forged','pi_forged',100,'usd','available')$q$,
  '42501', 'client cannot forge purchase');
select pg_temp.must_fail($q$update public.deriva_remote_purchases set status='available'$q$, '42501', 'client cannot restore credit');
select pg_temp.must_fail($q$delete from public.deriva_remote_purchases$q$, '42501', 'client cannot delete purchases');
select pg_temp.must_fail($q$select * from deriva_private.remote_refunds$q$, '42501', 'refund ledger is private');
select pg_temp.must_fail($q$select * from deriva_private.publication_requests$q$, '42501', 'request ledger is private');

reset role;
select pg_temp.set_claims(null,'service_role');
set local role service_role;
select pg_temp.must_fail($q$select public.deriva_record_remote_purchase('11000000-0000-4000-8000-000000000001','cs_test_wrong','pi_wrong',99,'usd')$q$,
  '22023', 'wrong amount rejected');
select pg_temp.must_fail($q$select public.deriva_record_remote_purchase('11000000-0000-4000-8000-000000000001','cs_test_wrong','pi_wrong',100,'mxn')$q$,
  '22023', 'wrong currency rejected');
select pg_temp.must_fail($q$select public.deriva_record_remote_purchase('11000000-0000-4000-8000-000000000001','cs_test_wrong','pi_wrong',null,'usd')$q$,
  '22023', 'missing amount rejected');
select pg_temp.must_fail($q$select public.deriva_record_remote_purchase('11000000-0000-4000-8000-000000000001','bad','pi_wrong',100,'usd')$q$,
  '22023', 'invalid Stripe identifier rejected');
select pg_temp.must_fail($q$select public.deriva_refund_remote_purchase('pi_wrong',0,'usd')$q$, '22023', 'zero refund cannot revoke');
select pg_temp.must_fail($q$select public.deriva_refund_remote_purchase('pi_wrong',101,'usd')$q$, '22023', 'oversized refund rejected');
select pg_temp.must_fail($q$select public.deriva_refund_remote_purchase('pi_wrong',100,'mxn')$q$, '22023', 'wrong refund currency rejected');
select pg_temp.assert_true(public.deriva_record_remote_purchase('11000000-0000-4000-8000-000000000099','cs_test_deleted','pi_deleted',100,'usd') is null,
  'late webhook ignores deleted user');
select public.deriva_record_remote_purchase('11000000-0000-4000-8000-000000000001','cs_test_credit1','pi_credit1',100,'usd');
select pg_temp.assert_true(public.deriva_record_remote_purchase('11000000-0000-4000-8000-000000000001','cs_test_credit1','pi_credit1',100,'usd')
  = (select id from public.deriva_remote_purchases where payment_intent_id = 'pi_credit1'), 'duplicate webhook returns same purchase');
select pg_temp.assert_true((select count(*) = 1 from public.deriva_remote_purchases where user_id = '11000000-0000-4000-8000-000000000001'),
  'duplicate webhook grants one credit');
select pg_temp.must_fail($q$select public.deriva_record_remote_purchase('11000000-0000-4000-8000-000000000003','cs_test_credit1','pi_credit1',100,'usd')$q$,
  '23505', 'purchase cannot transfer to another user');
select pg_temp.must_fail($q$select public.deriva_record_remote_purchase('11000000-0000-4000-8000-000000000001','cs_test_different','pi_credit1',100,'usd')$q$,
  '23505', 'payment intent cannot be reused for another session');
select pg_temp.must_fail($q$select public.deriva_record_remote_purchase('11000000-0000-4000-8000-000000000001','cs_test_credit1','pi_different',100,'usd')$q$,
  '23505', 'checkout session cannot be reused for another payment intent');

reset role;
select pg_temp.set_claims('11000000-0000-4000-8000-000000000001','authenticated');
set local role authenticated;
select pg_temp.assert_true(public.deriva_get_access() @> '{"is_admin":false,"remote_credits":1}'::jsonb, 'one confirmed payment grants one credit');
select pg_temp.must_fail($q$select public.deriva_create_place('22000000-0000-4000-8000-000000000002','Versión antigua','misterio',29.07,-110.96,
  '11000000-0000-4000-8000-000000000001/22000000-0000-4000-8000-000000000002.jpg','gallery')$q$, '42501', 'v1 never spends a credit silently');
select pg_temp.must_fail($q$select public.deriva_create_place_v2('22000000-0000-4000-8000-000000000099','Falta fotografía','remote',29.07,-110.96,
  '11000000-0000-4000-8000-000000000001/22000000-0000-4000-8000-000000000099.jpg','gallery')$q$, '42501', 'failed photo upload cannot publish');
select pg_temp.assert_true((public.deriva_get_access()->>'remote_credits')::integer = 1, 'failed publication preserves credit');
select pg_temp.assert_true(public.deriva_create_place_v2('22000000-0000-4000-8000-000000000002','Lugar de un dólar','remote',29.07,-110.96,
  '11000000-0000-4000-8000-000000000001/22000000-0000-4000-8000-000000000002.jpg','gallery')
  = '22000000-0000-4000-8000-000000000002'::uuid, 'paid user can publish arbitrary point with gallery');
select pg_temp.assert_true((public.deriva_get_access()->>'remote_credits')::integer = 0, 'successful remote publication consumes credit');
select pg_temp.assert_true((select status = 'consumed' and consumed_by_request_id = '22000000-0000-4000-8000-000000000002'
  from public.deriva_remote_purchases where payment_intent_id = 'pi_credit1'), 'purchase records exact consuming request');
select pg_temp.assert_true(public.deriva_create_place_v2('22000000-0000-4000-8000-000000000002',null,null,null,null,null,null)
  = '22000000-0000-4000-8000-000000000002'::uuid, 'retry succeeds without another payment');
select pg_temp.must_fail($q$select public.deriva_create_place_v2('22000000-0000-4000-8000-000000000003','Segundo punto','remote',29.08,-110.95,
  '11000000-0000-4000-8000-000000000001/22000000-0000-4000-8000-000000000003.jpg','gallery')$q$,
  '42501', 'a second request cannot share one consumed credit');
delete from public.deriva_places where id = '22000000-0000-4000-8000-000000000002';
select pg_temp.assert_true(public.deriva_create_place_v2('22000000-0000-4000-8000-000000000002',null,null,null,null,null,null)
  = '22000000-0000-4000-8000-000000000002'::uuid, 'deleted request remains idempotent');
select pg_temp.assert_true(not exists (select 1 from public.deriva_places where id = '22000000-0000-4000-8000-000000000002'),
  'retry does not recreate deleted place');
select pg_temp.assert_true((public.deriva_get_access()->>'remote_credits')::integer = 0, 'deletion does not restore consumed credit');

-- Admin is a Deriva role only. A remote admin publication does not consume a paid credit.
reset role;
select pg_temp.set_claims(null,'service_role');
set local role service_role;
select public.deriva_set_admin('11000000-0000-4000-8000-000000000002',true);
select public.deriva_record_remote_purchase('11000000-0000-4000-8000-000000000002','cs_test_admincredit','pi_admincredit',100,'usd');
reset role;
select pg_temp.set_claims('11000000-0000-4000-8000-000000000002','authenticated');
set local role authenticated;
select pg_temp.assert_true(public.deriva_get_access() @> '{"is_admin":true,"remote_credits":1}'::jsonb, 'server grants app admin role');
select pg_temp.assert_true(public.deriva_create_place_v2('22000000-0000-4000-8000-000000000003','Lugar admin','remote',19.43,-99.13,
  '11000000-0000-4000-8000-000000000002/22000000-0000-4000-8000-000000000003.jpg','gallery')
  = '22000000-0000-4000-8000-000000000003'::uuid, 'admin publishes remote without GPS or payment');
select pg_temp.assert_true((public.deriva_get_access()->>'remote_credits')::integer = 1, 'admin preserves purchased credits');
select pg_temp.must_fail($q$select public.deriva_create_place_v2('22000000-0000-4000-8000-000000000004','Cámara sin biometría','remote',19.43,-99.13,
  '11000000-0000-4000-8000-000000000002/22000000-0000-4000-8000-000000000004.jpg','camera')$q$,
  '42501', 'even admin camera retains biometrics');
select pg_temp.must_fail($q$select public.deriva_create_place_v2('22000000-0000-4000-8000-000000000001',null,null,null,null,null,null)$q$,
  '42501', 'admin cannot replay another user request');

reset role;
select pg_temp.set_claims(null,'service_role');
set local role service_role;
select public.deriva_set_admin('11000000-0000-4000-8000-000000000002',false);
select public.deriva_refund_remote_purchase('pi_admincredit',100,'usd');
reset role;
select pg_temp.set_claims('11000000-0000-4000-8000-000000000002','authenticated');
set local role authenticated;
select pg_temp.assert_true(public.deriva_get_access() @> '{"is_admin":false,"remote_credits":0}'::jsonb, 'role revocation takes effect without a new JWT');
select pg_temp.must_fail($q$select public.deriva_create_place_v2('22000000-0000-4000-8000-000000000004','Admin revocado','remote',19.43,-99.13,
  '11000000-0000-4000-8000-000000000002/22000000-0000-4000-8000-000000000004.jpg','gallery')$q$,
  '42501', 'revoked admin cannot publish another remote point');

-- Refund delivery order and duplicates never recreate spendable balance.
reset role;
select pg_temp.set_claims(null,'service_role');
set local role service_role;
select public.deriva_record_remote_purchase('11000000-0000-4000-8000-000000000001','cs_test_credit2','pi_credit2',100,'usd');
select public.deriva_refund_remote_purchase('pi_credit2',50,'usd');
select public.deriva_refund_remote_purchase('pi_credit2',50,'usd');
select public.deriva_refund_remote_purchase('pi_credit2',100,'usd');
select public.deriva_record_remote_purchase('11000000-0000-4000-8000-000000000001','cs_test_credit2','pi_credit2',100,'usd');
select pg_temp.assert_true((select status = 'refunded' and consumed_by_request_id is null from public.deriva_remote_purchases
  where payment_intent_id = 'pi_credit2'), 'partial, full, duplicate and late completion remain refunded');
select public.deriva_refund_remote_purchase('pi_credit3',100,'usd');
select public.deriva_record_remote_purchase('11000000-0000-4000-8000-000000000001','cs_test_credit3','pi_credit3',100,'usd');
select pg_temp.assert_true((select status = 'refunded' from public.deriva_remote_purchases where payment_intent_id = 'pi_credit3'),
  'refund before completion yields no credit');
select public.deriva_refund_remote_purchase('pi_credit1',100,'usd');
select public.deriva_record_remote_purchase('11000000-0000-4000-8000-000000000001','cs_test_credit1','pi_credit1',100,'usd');
select pg_temp.assert_true((select status = 'refunded' and consumed_by_request_id = '22000000-0000-4000-8000-000000000002'
  from public.deriva_remote_purchases where payment_intent_id = 'pi_credit1'), 'refund after spend retains audit and no reusable credit');

-- A failure after purchase selection rolls back all publication effects.
select public.deriva_record_remote_purchase('11000000-0000-4000-8000-000000000001','cs_test_credit4','pi_credit4',100,'usd');
reset role;
update deriva_private.daily_publish_limits set used=20 where user_id='11000000-0000-4000-8000-000000000001'
  and publication_day=(clock_timestamp() at time zone 'UTC')::date;
select pg_temp.set_claims('11000000-0000-4000-8000-000000000001','authenticated');
set local role authenticated;
select pg_temp.must_fail($q$select public.deriva_create_place_v2('22000000-0000-4000-8000-000000000005','Límite diario','remote',19.43,-99.13,
  '11000000-0000-4000-8000-000000000001/22000000-0000-4000-8000-000000000005.jpg','gallery')$q$, 'P0001', 'daily limit rejects late-stage publication');
select pg_temp.assert_true((public.deriva_get_access()->>'remote_credits')::integer = 1, 'transaction rollback preserves purchase');
reset role;
select pg_temp.assert_true(not exists (select 1 from deriva_private.publication_requests where request_id='22000000-0000-4000-8000-000000000005'),
  'failed transaction does not reserve request ID');
select pg_temp.assert_true(not exists (select 1 from public.deriva_places where id='22000000-0000-4000-8000-000000000005'),
  'failed transaction leaves no place');

select pg_temp.set_claims('11000000-0000-4000-8000-000000000003','authenticated');
set local role authenticated;
select pg_temp.assert_true((select count(*)=0 from public.deriva_remote_purchases), 'purchase rows private to owner');
select pg_temp.assert_true((select count(*)=0 from public.deriva_roles), 'role rows private to owner');
select pg_temp.assert_true(public.deriva_get_access() @> '{"is_admin":false,"remote_credits":0}'::jsonb, 'access cannot target another user');

reset role;
select pg_temp.set_claims(null,'anon');
set local role anon;
select pg_temp.must_fail($q$select * from public.deriva_roles$q$, '42501', 'anonymous cannot read roles');
select pg_temp.must_fail($q$select * from public.deriva_remote_purchases$q$, '42501', 'anonymous cannot read purchases');
select pg_temp.must_fail($q$select public.deriva_get_access()$q$, '42501', 'anonymous cannot query access');
select pg_temp.must_fail($q$select public.deriva_create_place_v2(null,null,null,null,null,null,null)$q$, '42501', 'anonymous cannot publish');
reset role;
select pg_temp.set_claims(null,'authenticated');
set local role authenticated;
select pg_temp.must_fail($q$select public.deriva_get_access()$q$, '42501', 'role without user identity cannot query access');
select pg_temp.must_fail($q$select public.deriva_create_place_v2(null,null,null,null,null,null,null)$q$, '42501', 'role without user identity cannot publish');
reset role;
rollback;
select 'Deriva remote publication checks passed; all fixtures rolled back.' as result;
