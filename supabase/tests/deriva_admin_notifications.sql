-- Run as database administrator; all users, places, inbox and queue fixtures roll back.
-- full_name preserves the shared attendance signup trigger contract.
begin;
create function pg_temp.assert_true(p_condition boolean, p_label text)
returns void language plpgsql security invoker as $$
begin
  if p_condition is distinct from true then raise exception 'Deriva notification check failed: %', p_label; end if;
end;
$$;

insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
select ('90000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
  'authenticated', 'authenticated', 'deriva-notification-' || i || '@example.invalid',
  jsonb_build_object('full_name','Deriva notification ' || i), '{"provider":"email","providers":["email"]}', now(), now()
from generate_series(1,8) i;
-- 1 admin no preference; 2 admin disabled/no GPS; 3 admin nearby enabled;
-- 4 normal nearby; 5 normal far; 6 normal disabled; 7 normal owner; 8 explicit non-admin nearby.
insert into public.deriva_roles (user_id,is_admin)
select ('90000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid, i <= 3
from generate_series(1,3) i;
insert into public.deriva_roles (user_id,is_admin) values ('90000000-0000-4000-8000-000000000008',false);
insert into public.deriva_notification_preferences (user_id,enabled,latitude,longitude,radius_km) values
('90000000-0000-4000-8000-000000000002',false,null,null,1),
('90000000-0000-4000-8000-000000000003',true,32.456,-114.772,10),
('90000000-0000-4000-8000-000000000004',true,32.456,-114.772,10),
('90000000-0000-4000-8000-000000000005',true,33,-114.772,10),
('90000000-0000-4000-8000-000000000006',false,32.456,-114.772,10),
('90000000-0000-4000-8000-000000000007',true,32.456,-114.772,10),
('90000000-0000-4000-8000-000000000008',true,32.456,-114.772,10);
insert into public.deriva_push_tokens(user_id,token,platform,device_id)
select ('90000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
  'ExpoPushToken[notificationFixture' || i || ']', 'android','notification-fixture-' || i
from generate_series(1,8) i;

-- Own publication for the administrator, nearby to enabled normal recipients.
insert into public.deriva_places(id,owner_id,title,category,latitude,longitude,photo_path,photo_source)
values ('91000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001',
'Admin SLRC','urbano',32.457,-114.772,
'90000000-0000-4000-8000-000000000001/91000000-0000-4000-8000-000000000001.jpg','gallery');
-- Normal owner should not get their own place.
insert into public.deriva_places(id,owner_id,title,category,latitude,longitude,photo_path,photo_source)
values ('91000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000007',
'Normal SLRC','urbano',32.457,-114.772,
'90000000-0000-4000-8000-000000000007/91000000-0000-4000-8000-000000000002.jpg','camera');
-- Far from every normal zone but still delivered to all administrators.
insert into public.deriva_places(id,owner_id,title,category,latitude,longitude,photo_path,photo_source)
values ('91000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000001',
'Admin lejano','urbano',20,-100,
'90000000-0000-4000-8000-000000000001/91000000-0000-4000-8000-000000000003.jpg','gallery');

select pg_temp.assert_true((select count(*) = 3 from public.deriva_notifications
 where user_id = ('90000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid),
 'administrator receives own/far/other places once, regardless of absent or disabled preference')
from generate_series(1,3) i;
select pg_temp.assert_true((select count(*) = 2 from public.deriva_notifications
 where user_id = ('90000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid),
 'normal enabled nearby recipients, including false admin role, receive only nearby other-author places')
from unnest(array[4,8]) i;
select pg_temp.assert_true((select count(*) = 0 from public.deriva_notifications
 where user_id = ('90000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid),
 'normal far or disabled recipients receive no places') from unnest(array[5,6]) i;
select pg_temp.assert_true((select count(*) = 1 from public.deriva_notifications
 where user_id = '90000000-0000-4000-8000-000000000007'), 'normal author excludes self and far places');
select pg_temp.assert_true((select count(*) = 14 from public.deriva_push_queue q
 join public.deriva_push_tokens t on t.id = q.token_id
 where t.device_id like 'notification-fixture-%'), 'one push queue item per eligible recipient/token');
select pg_temp.assert_true((select count(*) = 9 from public.deriva_notifications
 where user_id in ('90000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000003')
 and title = 'Nuevo lugar publicado'), 'administrator notices do not claim a nearby distance');
insert into public.deriva_notification_preferences(user_id) values ('90000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select radius_km = 10 from public.deriva_notification_preferences
 where user_id = '90000000-0000-4000-8000-000000000001'), 'new preference default matches 10 km app default');

-- A normal account cannot see administrator inboxes or promote itself.
select set_config('request.jwt.claims','{"sub":"90000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select pg_temp.assert_true((select count(*) = 2 from public.deriva_notifications), 'RLS exposes only the current account inbox');
do $$
begin
  begin
    update public.deriva_roles set is_admin = true where user_id = '90000000-0000-4000-8000-000000000004';
  exception when insufficient_privilege then return;
  end;
  raise exception 'Normal account was allowed to edit admin roles';
end;
$$;
reset role;
rollback;
