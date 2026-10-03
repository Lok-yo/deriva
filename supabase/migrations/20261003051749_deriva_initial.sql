-- Deriva is namespaced alongside the existing attendance application.
-- This migration never changes attendance tables, policies, triggers or cron jobs.
-- Publishable client keys may only exercise the explicitly granted user policies.
-- Configure push scheduling ONLY after deploying deriva-push-worker successfully.

create schema deriva_private;
revoke all on schema deriva_private from public, anon, authenticated, service_role;
grant usage on schema deriva_private to authenticated, service_role;
alter default privileges in schema deriva_private revoke execute on functions from public;
alter default privileges in schema deriva_private revoke all on tables from public, anon, authenticated, service_role;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
-- Hosted pg_net tables belong to supabase_admin. Leave their privileges intact.
-- The unexposed net schema receives only short-lived, single-use request tokens;
-- no permanent worker credential is placed in request headers or cron commands.

create table public.deriva_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (display_name = btrim(display_name) and char_length(display_name) between 2 and 80),
  created_at timestamptz not null default clock_timestamp()
);

create table public.deriva_places (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (title = btrim(title) and char_length(title) between 3 and 80),
  category text not null check (category in ('naturaleza', 'urbano', 'misterio')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  photo_path text not null unique,
  photo_source text not null check (photo_source in ('camera', 'gallery')),
  created_at timestamptz not null default clock_timestamp(),
  constraint deriva_places_photo_path check (photo_path = owner_id::text || '/' || id::text || '.jpg')
);
create index deriva_places_created_at_idx on public.deriva_places (created_at desc, id);
create index deriva_places_owner_created_at_idx on public.deriva_places (owner_id, created_at desc);

create table public.deriva_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default false,
  expires_at timestamptz check (expires_at is null or isfinite(expires_at)),
  verified_at timestamptz not null check (isfinite(verified_at))
);

create table public.deriva_saved_places (
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id uuid not null references public.deriva_places(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id, place_id)
);
create index deriva_saved_places_place_id_idx on public.deriva_saved_places (place_id);

create table public.deriva_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id uuid references public.deriva_places(id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz check (read_at is null or isfinite(read_at))
);
create index deriva_notifications_user_created_at_idx on public.deriva_notifications (user_id, created_at desc);
create index deriva_notifications_place_id_idx on public.deriva_notifications (place_id);

create table public.deriva_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  radius_km double precision not null default 5 check (radius_km between 1 and 50),
  constraint deriva_preferences_coordinate_pair check ((latitude is null) = (longitude is null)),
  constraint deriva_preferences_enabled_location check (not enabled or latitude is not null)
);
create index deriva_preferences_enabled_latitude_idx on public.deriva_notification_preferences (latitude) where enabled;

create table public.deriva_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique check (token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,255}\]$'),
  platform text not null check (platform in ('android', 'ios')),
  device_id text not null check (device_id = btrim(device_id) and char_length(device_id) between 3 and 200),
  created_at timestamptz not null default clock_timestamp()
);
create index deriva_push_tokens_user_device_idx on public.deriva_push_tokens (user_id, device_id);

create table public.deriva_push_queue (
  id uuid primary key default gen_random_uuid(),
  token_id uuid not null references public.deriva_push_tokens(id) on delete cascade,
  notification_id uuid not null references public.deriva_notifications(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending', 'processing', 'ticketed', 'delivered', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  available_at timestamptz not null default clock_timestamp(),
  lease_until timestamptz,
  expo_ticket_id text,
  last_error text,
  updated_at timestamptz not null default clock_timestamp(),
  unique (token_id, notification_id)
);
create index deriva_push_queue_pending_idx on public.deriva_push_queue (available_at, id) where state = 'pending';
create index deriva_push_queue_processing_idx on public.deriva_push_queue (lease_until, id) where state = 'processing';
create index deriva_push_queue_ticketed_idx on public.deriva_push_queue (updated_at, id) where state = 'ticketed';
create index deriva_push_queue_notification_idx on public.deriva_push_queue (notification_id);

-- A durable daily counter prevents bypassing the limit by deleting published places.
create table deriva_private.daily_publish_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  publication_day date not null,
  used integer not null check (used between 1 and 20),
  primary key (user_id, publication_day)
);

create table deriva_private.worker_config (
  singleton boolean primary key default true check (singleton),
  endpoint text,
  updated_at timestamptz not null default clock_timestamp()
);
insert into deriva_private.worker_config (singleton) values (true);

create table deriva_private.worker_invocations (
  token_hash bytea primary key check (octet_length(token_hash) = 32),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index deriva_worker_invocations_expiry_idx on deriva_private.worker_invocations (expires_at);

alter table public.deriva_profiles enable row level security;
alter table public.deriva_places enable row level security;
alter table public.deriva_entitlements enable row level security;
alter table public.deriva_saved_places enable row level security;
alter table public.deriva_notifications enable row level security;
alter table public.deriva_notification_preferences enable row level security;
alter table public.deriva_push_tokens enable row level security;
alter table public.deriva_push_queue enable row level security;
alter table deriva_private.daily_publish_limits enable row level security;
alter table deriva_private.worker_config enable row level security;
alter table deriva_private.worker_invocations enable row level security;

revoke all on table public.deriva_profiles, public.deriva_places, public.deriva_entitlements,
  public.deriva_saved_places, public.deriva_notifications, public.deriva_notification_preferences,
  public.deriva_push_tokens, public.deriva_push_queue from public, anon, authenticated, service_role;
revoke all on table deriva_private.daily_publish_limits, deriva_private.worker_config, deriva_private.worker_invocations from public, anon, authenticated, service_role;
grant all on table public.deriva_profiles, public.deriva_places, public.deriva_entitlements,
  public.deriva_saved_places, public.deriva_notifications, public.deriva_notification_preferences,
  public.deriva_push_tokens, public.deriva_push_queue to service_role;

grant select on public.deriva_profiles to authenticated;
grant insert (user_id, display_name), update (display_name) on public.deriva_profiles to authenticated;
grant select, delete on public.deriva_places to authenticated;
grant select on public.deriva_entitlements to authenticated;
grant select, insert, delete on public.deriva_saved_places to authenticated;
grant update (place_id) on public.deriva_saved_places to authenticated;
grant select, update (read_at) on public.deriva_notifications to authenticated;
grant select on public.deriva_notification_preferences to authenticated;
grant insert (user_id, enabled, latitude, longitude, radius_km), update (enabled, latitude, longitude, radius_km)
  on public.deriva_notification_preferences to authenticated;
grant select, delete on public.deriva_push_tokens to authenticated;

create policy deriva_profiles_select on public.deriva_profiles for select to authenticated using (true);
create policy deriva_profiles_insert on public.deriva_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy deriva_profiles_update on public.deriva_profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy deriva_places_select on public.deriva_places for select to authenticated using (true);
create policy deriva_places_delete on public.deriva_places for delete to authenticated using ((select auth.uid()) = owner_id);
create policy deriva_entitlements_select on public.deriva_entitlements for select to authenticated using ((select auth.uid()) = user_id);
create policy deriva_saved_select on public.deriva_saved_places for select to authenticated using ((select auth.uid()) = user_id);
create policy deriva_saved_insert on public.deriva_saved_places for insert to authenticated with check ((select auth.uid()) = user_id);
create policy deriva_saved_update on public.deriva_saved_places for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy deriva_saved_delete on public.deriva_saved_places for delete to authenticated using ((select auth.uid()) = user_id);
create policy deriva_notifications_select on public.deriva_notifications for select to authenticated using ((select auth.uid()) = user_id);
create policy deriva_notifications_read on public.deriva_notifications for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy deriva_preferences_select on public.deriva_notification_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy deriva_preferences_insert on public.deriva_notification_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy deriva_preferences_update on public.deriva_notification_preferences for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy deriva_tokens_select on public.deriva_push_tokens for select to authenticated using ((select auth.uid()) = user_id);
create policy deriva_tokens_delete on public.deriva_push_tokens for delete to authenticated using ((select auth.uid()) = user_id);

create function deriva_private.distance_meters(p_lat_a double precision, p_lon_a double precision, p_lat_b double precision, p_lon_b double precision)
returns double precision language sql immutable strict parallel safe security invoker set search_path = ''
as $$
  select 6371000.0 * 2.0 * asin(least(1.0, sqrt(greatest(0.0,
    power(sin(radians(p_lat_b - p_lat_a) / 2.0), 2.0)
    + cos(radians(p_lat_a)) * cos(radians(p_lat_b)) * power(sin(radians(p_lon_b - p_lon_a) / 2.0), 2.0)
  ))));
$$;

-- JWT role comes from a signed service token; administrator SQL is also permitted.
-- A postgres session using SET ROLE authenticated must not pass this administrator test.
create function deriva_private.assert_service()
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
    and coalesce(current_setting('role', true), '') not in ('service_role', 'postgres', 'supabase_admin')
    and not (coalesce(current_setting('role', true), '') in ('none', '') and session_user in ('postgres', 'supabase_admin')) then
    raise exception 'Esta operación requiere acceso del servicio.' using errcode = '42501';
  end if;
end;
$$;

create function deriva_private.create_place(
  p_request_id uuid, p_title text, p_category text, p_latitude double precision, p_longitude double precision,
  p_photo_path text, p_photo_source text, p_gps_latitude double precision, p_gps_longitude double precision,
  p_gps_accuracy double precision, p_gps_timestamp timestamptz, p_biometric_verified boolean
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_existing_owner uuid;
  v_now timestamptz;
  v_premium boolean;
  v_used integer;
begin
  if v_uid is null then
    raise exception 'Inicia sesión para publicar un lugar.' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'La publicación necesita un identificador.' using errcode = '22023';
  end if;
  -- The same lock is used by photo deletion and by every publication of this user.
  perform pg_advisory_xact_lock(hashtextextended('deriva:publish:' || v_uid::text, 0));
  select owner_id into v_existing_owner from public.deriva_places where id = p_request_id;
  if found then
    if v_existing_owner = v_uid then return p_request_id; end if;
    raise exception 'Ese identificador pertenece a otra cuenta.' using errcode = '42501';
  end if;
  v_now := clock_timestamp();
  if p_title is null or char_length(btrim(p_title)) not between 3 and 80 then
    raise exception 'El título debe tener entre 3 y 80 caracteres.' using errcode = '22023';
  end if;
  if p_category is null or p_category not in ('naturaleza', 'urbano', 'misterio') then
    raise exception 'Elige una categoría válida.' using errcode = '22023';
  end if;
  -- Range comparisons reject float NaN and Infinity as well as invalid coordinates.
  if p_latitude is null or p_longitude is null or not (p_latitude between -90 and 90 and p_longitude between -180 and 180) then
    raise exception 'La ubicación no es válida.' using errcode = '22023';
  end if;
  if p_photo_source is null or p_photo_source not in ('camera', 'gallery') then
    raise exception 'La fotografía debe proceder de la cámara o la galería.' using errcode = '22023';
  end if;
  if p_photo_path is null or p_photo_path <> v_uid::text || '/' || p_request_id::text || '.jpg' then
    raise exception 'La fotografía no pertenece a esta publicación.' using errcode = '42501';
  end if;
  select exists (
    select 1 from public.deriva_entitlements
    where user_id = v_uid and active and (expires_at is null or expires_at > v_now)
  ) into v_premium;
  if not v_premium and p_photo_source <> 'camera' then
    raise exception 'La galería está disponible con Premium.' using errcode = '42501';
  end if;
  if p_photo_source = 'camera' and p_biometric_verified is distinct from true then
    raise exception 'Confirma tu identidad con biometría antes de tomar la foto.' using errcode = '42501';
  end if;
  -- These are app-reported sensor readings, not cryptographic sensor attestation.
  if not v_premium then
    if p_gps_latitude is null or p_gps_longitude is null or p_gps_accuracy is null or p_gps_timestamp is null
      or not (p_gps_latitude between -90 and 90 and p_gps_longitude between -180 and 180)
      or not (p_gps_accuracy between 0 and 100) or not isfinite(p_gps_timestamp)
      or p_gps_timestamp < v_now - interval '2 minutes' or p_gps_timestamp > v_now + interval '30 seconds' then
      raise exception 'Necesitas una lectura GPS reciente con precisión de hasta 100 metros.' using errcode = '22023';
    end if;
    if deriva_private.distance_meters(p_latitude, p_longitude, p_gps_latitude, p_gps_longitude) > 100 then
      raise exception 'En el plan gratuito solo puedes publicar donde estás.' using errcode = '42501';
    end if;
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'deriva-photos' and name = p_photo_path and owner_id = v_uid::text
  ) then
    raise exception 'Sube tu fotografía antes de publicar el lugar.' using errcode = '42501';
  end if;
  insert into deriva_private.daily_publish_limits as limits (user_id, publication_day, used)
  values (v_uid, (v_now at time zone 'UTC')::date, 1)
  on conflict (user_id, publication_day) do update set used = limits.used + 1 where limits.used < 20
  returning used into v_used;
  if not found then
    raise exception 'Alcanzaste el límite de 20 publicaciones diarias. Inténtalo mañana.' using errcode = 'P0001';
  end if;
  insert into public.deriva_places (id, owner_id, title, category, latitude, longitude, photo_path, photo_source, created_at)
  values (p_request_id, v_uid, btrim(p_title), p_category, p_latitude, p_longitude, p_photo_path, p_photo_source, v_now);
  return p_request_id;
end;
$$;

create function public.deriva_create_place(
  p_request_id uuid, p_title text, p_category text, p_latitude double precision, p_longitude double precision,
  p_photo_path text, p_photo_source text, p_gps_latitude double precision default null, p_gps_longitude double precision default null,
  p_gps_accuracy double precision default null, p_gps_timestamp timestamptz default null, p_biometric_verified boolean default false
)
returns uuid language sql security invoker set search_path = ''
as $$ select deriva_private.create_place(p_request_id, p_title, p_category, p_latitude, p_longitude,
  p_photo_path, p_photo_source, p_gps_latitude, p_gps_longitude, p_gps_accuracy, p_gps_timestamp, p_biometric_verified); $$;

create function deriva_private.register_push_token(p_token text, p_platform text, p_device_id text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'Inicia sesión para activar las notificaciones.' using errcode = '42501'; end if;
  if p_token is null or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,255}\]$'
    or p_platform is null or p_platform not in ('android', 'ios')
    or p_device_id is null or char_length(btrim(p_device_id)) not between 3 and 200 then
    raise exception 'Los datos del dispositivo no son válidos.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('deriva:push-device:' || v_uid::text || ':' || btrim(p_device_id), 0));
  -- Token rotation on the same device removes obsolete destinations for this user.
  delete from public.deriva_push_tokens where user_id = v_uid and device_id = btrim(p_device_id) and token <> p_token;
  insert into public.deriva_push_tokens as tokens (user_id, token, platform, device_id)
  values (v_uid, p_token, p_platform, btrim(p_device_id))
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, device_id = excluded.device_id
  returning id into v_id;
  -- A shared phone must never receive queued notifications of the previous account.
  delete from public.deriva_push_queue q using public.deriva_notifications n
  where q.token_id = v_id and q.notification_id = n.id and n.user_id <> v_uid;
  return v_id;
end;
$$;

create function public.deriva_register_push_token(p_token text, p_platform text, p_device_id text)
returns uuid language sql security invoker set search_path = ''
as $$ select deriva_private.register_push_token(p_token, p_platform, p_device_id); $$;

create function deriva_private.notify_nearby_place()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_recipient uuid;
  v_notification_id uuid;
begin
  for v_recipient in
    select p.user_id from public.deriva_notification_preferences p
    where p.enabled and p.user_id <> new.owner_id
      and p.latitude between new.latitude - p.radius_km / 110.5 and new.latitude + p.radius_km / 110.5
      and deriva_private.distance_meters(p.latitude, p.longitude, new.latitude, new.longitude) <= p.radius_km * 1000
  loop
    insert into public.deriva_notifications (user_id, place_id, title, body)
    values (v_recipient, new.id, 'Nuevo lugar cerca de ti', new.title || ' está dentro de tu radio de exploración.')
    returning id into v_notification_id;
    insert into public.deriva_push_queue (token_id, notification_id)
    select t.id, v_notification_id from public.deriva_push_tokens t where t.user_id = v_recipient
    on conflict (token_id, notification_id) do nothing;
  end loop;
  return new;
end;
$$;
create trigger deriva_place_notifications after insert on public.deriva_places
  for each row execute function deriva_private.notify_nearby_place();

create function deriva_private.protect_referenced_photo()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.bucket_id <> 'deriva-photos' then return old; end if;
  perform pg_advisory_xact_lock(hashtextextended('deriva:publish:' || split_part(old.name, '/', 1), 0));
  if exists (select 1 from public.deriva_places where photo_path = old.name) then
    raise exception 'Elimina el lugar antes de borrar su fotografía.' using errcode = '23503';
  end if;
  return old;
end;
$$;
-- The guard only examines Deriva objects; other applications retain their behavior.
create trigger deriva_photo_delete_guard before delete on storage.objects
  for each row execute function deriva_private.protect_referenced_photo();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('deriva-photos', 'deriva-photos', false, 2097152, array['image/jpeg']);

create policy deriva_photo_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'deriva-photos' and owner_id = (select auth.uid()::text)
  and name ~ ('^' || (select auth.uid()::text) || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')
);
create policy deriva_photo_select on storage.objects for select to authenticated using (
  bucket_id = 'deriva-photos' and (
    (owner_id = (select auth.uid()::text) and name like (select auth.uid()::text) || '/%')
    or exists (select 1 from public.deriva_places p where p.photo_path = name)
  )
);
create policy deriva_photo_delete on storage.objects for delete to authenticated using (
  bucket_id = 'deriva-photos' and owner_id = (select auth.uid()::text)
  and name like (select auth.uid()::text) || '/%'
  and not exists (select 1 from public.deriva_places p where p.photo_path = name)
);
-- No Deriva UPDATE policy: replacing an uploaded photo or using upsert is denied.

create function deriva_private.sync_entitlement(p_user_id uuid, p_active boolean, p_expires_at timestamptz, p_verified_at timestamptz)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform deriva_private.assert_service();
  if p_user_id is null or p_active is null or p_verified_at is null or not isfinite(p_verified_at)
    or (p_expires_at is not null and not isfinite(p_expires_at)) then
    raise exception 'La verificación de Premium no es válida.' using errcode = '22023';
  end if;
  -- Webhooks for a deleted account do not recreate it or retry indefinitely.
  if not exists (select 1 from auth.users where id = p_user_id) then return; end if;
  insert into public.deriva_entitlements as entitlements (user_id, active, expires_at, verified_at)
  values (p_user_id, p_active, p_expires_at, p_verified_at)
  on conflict (user_id) do update set active = excluded.active, expires_at = excluded.expires_at, verified_at = excluded.verified_at
  where excluded.verified_at >= entitlements.verified_at;
end;
$$;
create function public.deriva_sync_entitlement(p_user_id uuid, p_active boolean, p_expires_at timestamptz, p_verified_at timestamptz)
returns void language sql security invoker set search_path = ''
as $$ select deriva_private.sync_entitlement(p_user_id, p_active, p_expires_at, p_verified_at); $$;

create function deriva_private.authorize_worker(p_secret text)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  perform deriva_private.assert_service();
  if p_secret is null or char_length(p_secret) <> 72 then return false; end if;
  update deriva_private.worker_invocations i set consumed_at = clock_timestamp()
  where i.token_hash = extensions.digest(p_secret, 'sha256')
    and i.consumed_at is null and i.expires_at > clock_timestamp();
  return found;
end;
$$;
create function public.deriva_authorize_worker(p_secret text)
returns boolean language sql security invoker set search_path = ''
as $$ select deriva_private.authorize_worker(p_secret); $$;

create function deriva_private.claim_push(p_limit integer)
returns table (id uuid, token_id uuid, token text, notification_id uuid, title text, body text, place_id uuid, attempts integer)
language plpgsql security definer set search_path = ''
as $$
declare v_now timestamptz := clock_timestamp();
begin
  perform deriva_private.assert_service();
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'El lote debe contener entre 1 y 100 notificaciones.' using errcode = '22023';
  end if;
  with exhausted as (
    select q.id from public.deriva_push_queue q where q.attempts >= 5 and (
      (q.state = 'pending' and q.available_at <= v_now)
      or (q.state = 'processing' and (q.lease_until is null or q.lease_until <= v_now))
    ) for update of q skip locked
  )
  update public.deriva_push_queue q set state = 'failed', lease_until = null,
    last_error = 'Se agotaron los 5 intentos de envío.', updated_at = v_now
  from exhausted e where q.id = e.id;
  return query
  with candidates as (
    select q.id from public.deriva_push_queue q
    join public.deriva_push_tokens t on t.id = q.token_id
    join public.deriva_notifications n on n.id = q.notification_id and n.user_id = t.user_id
    where q.attempts < 5 and (
      (q.state = 'pending' and q.available_at <= v_now)
      or (q.state = 'processing' and (q.lease_until is null or q.lease_until <= v_now))
    )
    order by q.available_at, q.id limit p_limit for update of q skip locked
  ), claimed as (
    update public.deriva_push_queue q set state = 'processing', attempts = q.attempts + 1,
      lease_until = v_now + interval '2 minutes', updated_at = v_now
    from candidates c where q.id = c.id
    returning q.id, q.token_id, q.notification_id, q.attempts
  )
  select c.id, c.token_id, t.token, c.notification_id, n.title, n.body, n.place_id, c.attempts
  from claimed c join public.deriva_push_tokens t on t.id = c.token_id
  join public.deriva_notifications n on n.id = c.notification_id and n.user_id = t.user_id;
end;
$$;
create function public.deriva_claim_push(p_limit integer default 100)
returns table (id uuid, token_id uuid, token text, notification_id uuid, title text, body text, place_id uuid, attempts integer)
language sql security invoker set search_path = ''
as $$ select * from deriva_private.claim_push(p_limit); $$;

create function deriva_private.invoke_push_worker()
returns void language plpgsql security definer set search_path = ''
as $$
declare v_endpoint text; v_token text; v_now timestamptz := clock_timestamp();
begin
  select c.endpoint into v_endpoint from deriva_private.worker_config c where singleton;
  if v_endpoint is null then return; end if;
  delete from deriva_private.worker_invocations where expires_at <= v_now;
  v_token := gen_random_uuid()::text || gen_random_uuid()::text;
  insert into deriva_private.worker_invocations (token_hash, expires_at)
  values (extensions.digest(v_token, 'sha256'), v_now + interval '2 minutes');
  -- Only this one-time token enters pg_net; it is never returned or logged.
  perform net.http_post(url := v_endpoint, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-deriva-job-token', v_token),
    timeout_milliseconds := 15000);
end;
$$;

create function deriva_private.configure_push(p_url text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform deriva_private.assert_service();
  if p_url is null or p_url !~ '^https://[a-z0-9]{20}\.supabase\.co/functions/v1/deriva-push-worker$' then
    raise exception 'Usa la URL HTTPS de la función deriva-push-worker desplegada en Supabase.' using errcode = '22023';
  end if;
  update deriva_private.worker_config set endpoint = p_url, updated_at = clock_timestamp() where singleton;
  -- Calling this RPC is the explicit activation step after the endpoint is deployed.
  perform cron.schedule('deriva-push', '* * * * *', 'select deriva_private.invoke_push_worker();');
end;
$$;
create function public.deriva_configure_push(p_url text)
returns void language sql security invoker set search_path = ''
as $$ select deriva_private.configure_push(p_url); $$;

revoke all on all functions in schema deriva_private from public, anon, authenticated, service_role;
revoke all on function public.deriva_create_place(uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, double precision, timestamptz, boolean) from public, anon, authenticated, service_role;
revoke all on function public.deriva_register_push_token(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.deriva_sync_entitlement(uuid, boolean, timestamptz, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.deriva_authorize_worker(text) from public, anon, authenticated, service_role;
revoke all on function public.deriva_claim_push(integer) from public, anon, authenticated, service_role;
revoke all on function public.deriva_configure_push(text) from public, anon, authenticated, service_role;

grant execute on function deriva_private.create_place(uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, double precision, timestamptz, boolean) to authenticated;
grant execute on function public.deriva_create_place(uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, double precision, timestamptz, boolean) to authenticated;
grant execute on function deriva_private.register_push_token(text, text, text), public.deriva_register_push_token(text, text, text) to authenticated;
grant execute on function deriva_private.sync_entitlement(uuid, boolean, timestamptz, timestamptz),
  public.deriva_sync_entitlement(uuid, boolean, timestamptz, timestamptz) to service_role;
grant execute on function deriva_private.authorize_worker(text), public.deriva_authorize_worker(text) to service_role;
grant execute on function deriva_private.claim_push(integer), public.deriva_claim_push(integer) to service_role;
grant execute on function deriva_private.configure_push(text), public.deriva_configure_push(text) to service_role;

-- Add Deriva without replacing the publication or touching attendance membership.
do $$
declare v_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach v_table in array array['deriva_places', 'deriva_profiles', 'deriva_entitlements', 'deriva_notifications', 'deriva_saved_places', 'deriva_notification_preferences'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;

comment on function public.deriva_create_place(uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, double precision, timestamptz, boolean)
  is 'Authenticated, idempotent publication. Free requires camera, app-reported biometric verification and GPS <=100m, <=2min old. Premium comes only from verified server entitlements. Daily limit: 20 per UTC day.';
comment on function public.deriva_register_push_token(text, text, text)
  is 'Authenticated token registration with atomic reassignment and cleanup of the previous account queue.';
comment on function public.deriva_sync_entitlement(uuid, boolean, timestamptz, timestamptz)
  is 'Service only. RevenueCat verified result; ignores older verified_at and deleted auth users.';
comment on function public.deriva_claim_push(integer)
  is 'Service only. Claims up to 100 pending/abandoned jobs with SKIP LOCKED, a 2-minute lease and at most 5 attempts.';
comment on function public.deriva_configure_push(text)
  is 'Service/admin activation after deploying the worker. Stores the endpoint and schedules only deriva-push. Each request uses a one-time token, hashed privately and valid for 120 seconds.';
comment on function public.deriva_authorize_worker(text)
  is 'Service only. Atomically consumes a SHA256-matched, unexpired one-time worker token. Replays are rejected.';
