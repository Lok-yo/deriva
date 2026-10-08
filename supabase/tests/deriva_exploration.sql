-- Run after all migrations as an administrator. All fixtures are rolled back.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/deriva_exploration.sql
-- May also run as one Supabase execute_sql call. Uses no real Stripe payment.
begin;

create function pg_temp.assert_true(p_condition boolean, p_label text)
returns void language plpgsql security invoker as $$
begin
  if p_condition is distinct from true then raise exception 'Deriva exploration check failed: %', p_label; end if;
end;
$$;
create function pg_temp.must_fail(p_sql text, p_sqlstate text, p_label text, p_message text default null)
returns void language plpgsql security invoker as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_sqlstate and (p_message is null or sqlerrm like p_message) then return; end if;
    raise exception 'Deriva exploration check failed: % (expected % %, received %: %)', p_label, p_sqlstate, coalesce(p_message, ''), sqlstate, sqlerrm;
  end;
  raise exception 'Deriva exploration check failed: % (operation unexpectedly succeeded)', p_label;
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

select pg_temp.assert_true((select relrowsecurity from pg_class where oid = 'public.deriva_place_visits'::regclass), 'visits have RLS');
select pg_temp.assert_true((select relrowsecurity from pg_class where oid = 'deriva_private.preview_places'::regclass), 'example coordinates have RLS');
select pg_temp.assert_true(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
  and schemaname = 'public' and tablename = 'deriva_place_visits'), 'visits join Realtime');
select pg_temp.assert_true(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'deriva_%' and p.prosecdef), 'public functions remain security invokers');
select pg_temp.assert_true(not has_table_privilege('authenticated', 'public.deriva_place_visits', 'INSERT')
  and not has_table_privilege('authenticated', 'public.deriva_place_visits', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.deriva_place_visits', 'DELETE'), 'clients cannot write visits');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.deriva_record_visit(text,double precision,double precision,double precision,timestamptz)', 'EXECUTE'),
  'anonymous cannot record visits');
select pg_temp.assert_true((select count(*) = 6 from deriva_private.preview_places), 'six SLRC examples are verifiable');

insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
values
  ('13000000-0000-4000-8000-000000000001','authenticated','authenticated','deriva-explore-author@example.invalid',
    '{"full_name":"Deriva Explore Author"}','{"provider":"email","providers":["email"]}',now(),now()),
  ('13000000-0000-4000-8000-000000000002','authenticated','authenticated','deriva-explore-walker@example.invalid',
    '{"full_name":"Deriva Explore Walker"}','{"provider":"email","providers":["email"]}',now(),now()),
  ('13000000-0000-4000-8000-000000000003','authenticated','authenticated','deriva-explore-admin@example.invalid',
    '{"full_name":"Deriva Explore Admin"}','{"provider":"email","providers":["email"]}',now(),now());
insert into public.deriva_places (id, owner_id, title, category, latitude, longitude, photo_path, photo_source)
values ('23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','Mirador de prueba','misterio',29.07,-110.96,
  '13000000-0000-4000-8000-000000000001/23000000-0000-4000-8000-000000000001.jpg','camera');
insert into storage.objects (bucket_id, name, owner_id, metadata) values
  ('deriva-photos','13000000-0000-4000-8000-000000000002/23000000-0000-4000-8000-000000000002.jpg','13000000-0000-4000-8000-000000000002','{"mimetype":"image/jpeg","size":100}'),
  ('deriva-photos','13000000-0000-4000-8000-000000000003/23000000-0000-4000-8000-000000000003.jpg','13000000-0000-4000-8000-000000000003','{"mimetype":"image/jpeg","size":100}');

-- The author cannot farm visits on their own publications.
select pg_temp.set_claims('13000000-0000-4000-8000-000000000001','authenticated');
set local role authenticated;
select pg_temp.must_fail($q$select public.deriva_record_visit('23000000-0000-4000-8000-000000000001',29.07,-110.96,10,clock_timestamp())$q$,
  '42501', 'own place never counts');

reset role;
select pg_temp.set_claims('13000000-0000-4000-8000-000000000002','authenticated');
set local role authenticated;
select pg_temp.assert_true(public.deriva_get_access() @> '{"is_admin":false,"remote_credits":0,"visits":0,"required_visits":3}'::jsonb,
  'access reports exploration progress');
select pg_temp.must_fail($q$select public.deriva_record_visit('23000000-0000-4000-8000-000000000001',29.08,-110.96,10,clock_timestamp())$q$,
  '22023', 'visit more than 100 m away rejected', 'Todavía estás a%');
select pg_temp.must_fail($q$select public.deriva_record_visit('23000000-0000-4000-8000-000000000001',29.07,-110.96,10,clock_timestamp()-interval '3 minutes')$q$,
  '22023', 'stale GPS rejected');
select pg_temp.must_fail($q$select public.deriva_record_visit('23000000-0000-4000-8000-000000000001',29.07,-110.96,101,clock_timestamp())$q$,
  '22023', 'inaccurate GPS rejected');
select pg_temp.must_fail($q$select public.deriva_record_visit('23000000-0000-4000-8000-000000000001',null,null,null,null)$q$,
  '22023', 'missing GPS rejected');
select pg_temp.must_fail($q$select public.deriva_record_visit('23000000-0000-4000-8000-000000000099',29.07,-110.96,10,clock_timestamp())$q$,
  'P0002', 'unknown place rejected');
select pg_temp.must_fail($q$select public.deriva_record_visit('demo-99',32.44,-114.78,10,clock_timestamp())$q$,
  'P0002', 'unknown example rejected');
select pg_temp.must_fail($q$select public.deriva_record_visit('anything',29.07,-110.96,10,clock_timestamp())$q$,
  '22023', 'malformed key rejected');
select pg_temp.assert_true(public.deriva_record_visit('23000000-0000-4000-8000-000000000001',29.0702,-110.9601,15,clock_timestamp())
  @> '{"recorded":true,"visits":1,"required_visits":3,"unlocked":false,"just_unlocked":false}'::jsonb, 'arrival within radius counts');
select pg_temp.assert_true(public.deriva_record_visit('23000000-0000-4000-8000-000000000001',29.07,-110.96,15,clock_timestamp())
  @> '{"recorded":false,"visits":1}'::jsonb, 'repeated arrival is idempotent');
select pg_temp.assert_true((select distance_meters between 0 and 100 from public.deriva_place_visits
  where place_key = '23000000-0000-4000-8000-000000000001'), 'visit stores verified distance');

-- Paying is impossible until the third visit.
reset role;
select pg_temp.set_claims(null,'service_role');
set local role service_role;
select pg_temp.must_fail($q$select public.deriva_checkout_ticket('13000000-0000-4000-8000-000000000002',gen_random_uuid())$q$,
  'P0001', 'checkout blocked before exploring', 'exploration_required');
select public.deriva_record_remote_purchase('13000000-0000-4000-8000-000000000002','cs_test_explore','pi_explore',100,'usd');
reset role;
select pg_temp.set_claims('13000000-0000-4000-8000-000000000002','authenticated');
set local role authenticated;
select pg_temp.must_fail($q$select public.deriva_create_place_v2('23000000-0000-4000-8000-000000000002','Punto remoto','remote',19.43,-99.13,
  '13000000-0000-4000-8000-000000000002/23000000-0000-4000-8000-000000000002.jpg','gallery')$q$,
  '42501', 'a credit alone does not unlock remote points', 'Visita 3 lugares%Llevas 1/3.');
select pg_temp.assert_true((public.deriva_get_access()->>'remote_credits')::integer = 1, 'blocked publication preserves credit');

select pg_temp.assert_true(public.deriva_record_visit(' DEMO-1 ',32.4452,-114.7894,20,clock_timestamp())
  @> '{"recorded":true,"visits":2,"unlocked":false}'::jsonb, 'examples count and keys are normalized');
select pg_temp.assert_true((select count(*) = 0 from public.deriva_notifications where title = 'Exploración completada'),
  'no unlock notice before the requirement');
select pg_temp.assert_true(public.deriva_record_visit('demo-2',32.4800748,-114.7804175,20,clock_timestamp())
  @> '{"recorded":true,"visits":3,"unlocked":true,"just_unlocked":true}'::jsonb, 'third visit unlocks');
select pg_temp.assert_true((select count(*) = 1 from public.deriva_notifications where title = 'Exploración completada' and place_id is null),
  'unlock adds one Activity notice');
select pg_temp.assert_true(public.deriva_record_visit('demo-3',32.4525674,-114.8043819,20,clock_timestamp())
  @> '{"recorded":true,"visits":4,"unlocked":true,"just_unlocked":false}'::jsonb, 'later visits do not unlock again');
select pg_temp.assert_true((select count(*) = 1 from public.deriva_notifications where title = 'Exploración completada'),
  'unlock notice is not repeated');
select pg_temp.assert_true(public.deriva_create_place_v2('23000000-0000-4000-8000-000000000002','Punto remoto','remote',19.43,-99.13,
  '13000000-0000-4000-8000-000000000002/23000000-0000-4000-8000-000000000002.jpg','gallery')
  = '23000000-0000-4000-8000-000000000002'::uuid, 'explorer with a credit publishes a remote point');
select pg_temp.assert_true((public.deriva_get_access()->>'remote_credits')::integer = 0, 'remote publication consumes credit');

select pg_temp.must_fail($q$insert into public.deriva_place_visits(user_id,place_key,distance_meters) values('13000000-0000-4000-8000-000000000002','demo-4',0)$q$,
  '42501', 'client cannot forge a visit');
select pg_temp.must_fail($q$update public.deriva_place_visits set visited_at = now()$q$, '42501', 'client cannot edit visits');
select pg_temp.must_fail($q$delete from public.deriva_place_visits$q$, '42501', 'client cannot delete visits');
select pg_temp.must_fail($q$select * from deriva_private.preview_places$q$, '42501', 'example table is private');
select pg_temp.must_fail($q$select deriva_private.visit_count('13000000-0000-4000-8000-000000000001')$q$, '42501', 'private helper not callable');

-- Visits are durable and private.
reset role;
delete from public.deriva_places where id = '23000000-0000-4000-8000-000000000001';
select pg_temp.set_claims('13000000-0000-4000-8000-000000000002','authenticated');
set local role authenticated;
select pg_temp.assert_true((public.deriva_get_access()->>'visits')::integer = 4, 'deleting a place keeps its visit');
select pg_temp.assert_true((select count(*) = 4 from public.deriva_place_visits), 'owner reads own visits');
reset role;
select pg_temp.set_claims('13000000-0000-4000-8000-000000000001','authenticated');
set local role authenticated;
select pg_temp.assert_true((select count(*) = 0 from public.deriva_place_visits), 'visits private to owner');

-- Administrators publish remote points without exploring or paying.
reset role;
select pg_temp.set_claims(null,'service_role');
set local role service_role;
select public.deriva_set_admin('13000000-0000-4000-8000-000000000003',true);
reset role;
select pg_temp.set_claims('13000000-0000-4000-8000-000000000003','authenticated');
set local role authenticated;
select pg_temp.assert_true(public.deriva_create_place_v2('23000000-0000-4000-8000-000000000003','Punto admin','remote',19.43,-99.13,
  '13000000-0000-4000-8000-000000000003/23000000-0000-4000-8000-000000000003.jpg','gallery')
  = '23000000-0000-4000-8000-000000000003'::uuid, 'admin remains exempt');
select pg_temp.assert_true(public.deriva_record_visit('demo-1',32.4452716,-114.78945,10,clock_timestamp())
  @> '{"recorded":true,"visits":1,"unlocked":true,"just_unlocked":false}'::jsonb, 'admin visits never send an unlock notice');

reset role;
select pg_temp.set_claims(null,'anon');
set local role anon;
select pg_temp.must_fail($q$select * from public.deriva_place_visits$q$, '42501', 'anonymous cannot read visits');
select pg_temp.must_fail($q$select public.deriva_record_visit('demo-1',32.4452716,-114.78945,10,now())$q$, '42501', 'anonymous cannot call visit RPC');
reset role;
select pg_temp.set_claims(null,'authenticated');
set local role authenticated;
select pg_temp.must_fail($q$select public.deriva_record_visit('demo-1',32.4452716,-114.78945,10,now())$q$, '42501', 'role without identity cannot visit');
reset role;
rollback;
select 'Deriva exploration checks passed; all fixtures rolled back.' as result;
