-- Remote publication is earned by exploring. An account must physically arrive
-- (fresh GPS within the arrival radius) at three places published by other
-- people or at the local SLRC examples before it can pay for a remote point.
-- Visits are durable: deleting a place never revokes the visit it granted.
-- Server-managed Deriva administrators remain exempt. Only Deriva objects change.

create function deriva_private.required_visits()
returns integer language sql immutable parallel safe security invoker set search_path = ''
as $$ select 3; $$;

create function deriva_private.arrival_radius_meters()
returns double precision language sql immutable parallel safe security invoker set search_path = ''
as $$ select 100.0::double precision; $$;

-- Mirrors src/data/preview.ts. Examples stay out of deriva_places; this table only
-- lets the server verify that a visit to an example happened at its coordinate.
create table deriva_private.preview_places (
  place_key text primary key check (place_key ~ '^demo-[0-9]{1,3}$'),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180)
);
insert into deriva_private.preview_places (place_key, latitude, longitude) values
  ('demo-1', 32.4452716, -114.7894500),
  ('demo-2', 32.4800748, -114.7804175),
  ('demo-3', 32.4525674, -114.8043819),
  ('demo-4', 32.4327620, -114.7571808),
  ('demo-5', 32.4634193, -114.7408790),
  ('demo-6', 32.4671593, -114.8019795);

-- place_key is a deriva_places UUID or an example key. There is deliberately no
-- foreign key: a visit survives the deletion of the place it refers to.
create table public.deriva_place_visits (
  user_id uuid not null references auth.users(id) on delete cascade,
  place_key text not null check (place_key ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|demo-[0-9]{1,3})$'),
  distance_meters double precision not null check (distance_meters >= 0),
  visited_at timestamptz not null default clock_timestamp(),
  primary key (user_id, place_key)
);

alter table deriva_private.preview_places enable row level security;
alter table public.deriva_place_visits enable row level security;
revoke all on deriva_private.preview_places, public.deriva_place_visits from public, anon, authenticated, service_role;
grant select on public.deriva_place_visits to authenticated, service_role;
create policy deriva_place_visits_select on public.deriva_place_visits for select to authenticated
  using ((select auth.uid()) = user_id);

create function deriva_private.visit_count(p_user_id uuid)
returns integer language sql stable security invoker set search_path = ''
as $$ select count(*)::integer from public.deriva_place_visits where user_id = p_user_id; $$;

create function deriva_private.record_visit(
  p_place_key text, p_gps_latitude double precision, p_gps_longitude double precision,
  p_gps_accuracy double precision, p_gps_timestamp timestamptz
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_key text := lower(btrim(p_place_key));
  v_now timestamptz := clock_timestamp();
  v_required integer := deriva_private.required_visits();
  v_radius double precision := deriva_private.arrival_radius_meters();
  v_owner uuid;
  v_latitude double precision;
  v_longitude double precision;
  v_distance double precision;
  v_admin boolean;
  v_before integer;
  v_after integer;
  v_recorded boolean;
  v_unlocked_now boolean;
begin
  if v_uid is null then raise exception 'Inicia sesión para registrar tus visitas.' using errcode = '42501'; end if;
  if v_key is null or v_key !~ '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|demo-[0-9]{1,3})$' then
    raise exception 'Ese lugar no existe.' using errcode = '22023';
  end if;
  if v_key like 'demo-%' then
    select p.latitude, p.longitude into v_latitude, v_longitude from deriva_private.preview_places p where p.place_key = v_key;
  else
    select p.owner_id, p.latitude, p.longitude into v_owner, v_latitude, v_longitude from public.deriva_places p where p.id = v_key::uuid;
  end if;
  if v_latitude is null then raise exception 'Este lugar ya no está en el mapa.' using errcode = 'P0002'; end if;
  if v_owner = v_uid then
    raise exception 'Tus propios lugares no cuentan como visita. Explora los de otras personas.' using errcode = '42501';
  end if;
  -- App-reported sensor readings, not cryptographic hardware attestation.
  if p_gps_latitude is null or p_gps_longitude is null or p_gps_accuracy is null or p_gps_timestamp is null
    or not (p_gps_latitude between -90 and 90 and p_gps_longitude between -180 and 180)
    or not (p_gps_accuracy between 0 and 100) or not isfinite(p_gps_timestamp)
    or p_gps_timestamp < v_now - interval '2 minutes' or p_gps_timestamp > v_now + interval '30 seconds' then
    raise exception 'Necesitas una lectura GPS reciente con precisión de hasta 100 metros.' using errcode = '22023';
  end if;
  v_distance := deriva_private.distance_meters(v_latitude, v_longitude, p_gps_latitude, p_gps_longitude);
  if v_distance > v_radius then
    raise exception 'Todavía estás a % m. Acércate a menos de % m para registrar la visita.', round(v_distance), round(v_radius)
      using errcode = '22023';
  end if;
  -- Same per-user lock as publication, so the unlock and a remote publication never interleave.
  perform pg_advisory_xact_lock(hashtextextended('deriva:publish:' || v_uid::text, 0));
  v_before := deriva_private.visit_count(v_uid);
  insert into public.deriva_place_visits (user_id, place_key, distance_meters, visited_at)
  values (v_uid, v_key, v_distance, v_now)
  on conflict (user_id, place_key) do nothing;
  v_recorded := found;
  v_after := v_before + case when v_recorded then 1 else 0 end;
  select exists (select 1 from public.deriva_roles where user_id = v_uid and is_admin) into v_admin;
  v_unlocked_now := v_recorded and not v_admin and v_before < v_required and v_after >= v_required;
  if v_unlocked_now then
    insert into public.deriva_notifications (user_id, place_id, title, body)
    values (v_uid, null, 'Exploración completada',
      format('Visitaste %s lugares. Ya puedes agregar una ubicación en cualquier punto del mapa.', v_required));
  end if;
  return jsonb_build_object('recorded', v_recorded, 'visits', v_after, 'required_visits', v_required,
    'unlocked', v_admin or v_after >= v_required, 'just_unlocked', v_unlocked_now);
end;
$$;
create function public.deriva_record_visit(
  p_place_key text, p_gps_latitude double precision, p_gps_longitude double precision,
  p_gps_accuracy double precision, p_gps_timestamp timestamptz
)
returns jsonb language sql security invoker set search_path = ''
as $$ select deriva_private.record_visit(p_place_key, p_gps_latitude, p_gps_longitude, p_gps_accuracy, p_gps_timestamp); $$;

create or replace function deriva_private.get_access()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Inicia sesión para consultar tu acceso.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'is_admin', exists (select 1 from public.deriva_roles where user_id = v_uid and is_admin),
    'remote_credits', (select count(*) from public.deriva_remote_purchases where user_id = v_uid and status = 'available'),
    'visits', deriva_private.visit_count(v_uid),
    'required_visits', deriva_private.required_visits()
  );
end;
$$;

create or replace function deriva_private.create_place_v2(
  p_request_id uuid, p_title text, p_mode text, p_latitude double precision, p_longitude double precision,
  p_photo_path text, p_photo_source text, p_gps_latitude double precision, p_gps_longitude double precision,
  p_gps_accuracy double precision, p_gps_timestamp timestamptz, p_biometric_verified boolean
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_existing_owner uuid;
  v_now timestamptz;
  v_admin boolean;
  v_visits integer;
  v_required integer := deriva_private.required_visits();
  v_purchase_id uuid;
  v_used integer;
begin
  if v_uid is null then raise exception 'Inicia sesión para publicar un lugar.' using errcode = '42501'; end if;
  if p_request_id is null then raise exception 'La publicación necesita un identificador.' using errcode = '22023'; end if;
  -- Serializes retries, competing publications, visits, refunds and role changes
  -- for this user; it is also the existing Storage photo-deletion lock.
  perform pg_advisory_xact_lock(hashtextextended('deriva:publish:' || v_uid::text, 0));
  select user_id into v_existing_owner from deriva_private.publication_requests where request_id = p_request_id;
  if found then
    if v_existing_owner = v_uid then return p_request_id; end if;
    raise exception 'Ese identificador pertenece a otra cuenta.' using errcode = '42501';
  end if;
  select owner_id into v_existing_owner from public.deriva_places where id = p_request_id;
  if found then
    if v_existing_owner = v_uid then return p_request_id; end if;
    raise exception 'Ese identificador pertenece a otra cuenta.' using errcode = '42501';
  end if;
  v_now := clock_timestamp();
  if p_title is null or char_length(btrim(p_title)) not between 3 and 80 then
    raise exception 'El título debe tener entre 3 y 80 caracteres.' using errcode = '22023';
  end if;
  if p_mode is null or p_mode not in ('local', 'remote') then
    raise exception 'Elige publicar aquí o en el punto seleccionado.' using errcode = '22023';
  end if;
  if p_latitude is null or p_longitude is null or not (p_latitude between -90 and 90 and p_longitude between -180 and 180) then
    raise exception 'La ubicación no es válida.' using errcode = '22023';
  end if;
  if p_photo_source is null or p_photo_source not in ('camera', 'gallery') then
    raise exception 'La fotografía debe proceder de la cámara o la galería.' using errcode = '22023';
  end if;
  if p_photo_path is null or p_photo_path <> v_uid::text || '/' || p_request_id::text || '.jpg' then
    raise exception 'La fotografía no pertenece a esta publicación.' using errcode = '42501';
  end if;
  if p_photo_source = 'camera' and p_biometric_verified is distinct from true then
    raise exception 'Confirma tu identidad con biometría antes de tomar la foto.' using errcode = '42501';
  end if;
  if p_mode = 'local' then
    if p_photo_source <> 'camera' then
      raise exception 'Para publicar gratis donde estás, toma una foto con la cámara.' using errcode = '42501';
    end if;
    -- App-reported sensor readings, not cryptographic hardware attestation.
    if p_gps_latitude is null or p_gps_longitude is null or p_gps_accuracy is null or p_gps_timestamp is null
      or not (p_gps_latitude between -90 and 90 and p_gps_longitude between -180 and 180)
      or not (p_gps_accuracy between 0 and 100) or not isfinite(p_gps_timestamp)
      or p_gps_timestamp < v_now - interval '2 minutes' or p_gps_timestamp > v_now + interval '30 seconds' then
      raise exception 'Necesitas una lectura GPS reciente con precisión de hasta 100 metros.' using errcode = '22023';
    end if;
    if deriva_private.distance_meters(p_latitude, p_longitude, p_gps_latitude, p_gps_longitude) > 100 then
      raise exception 'La publicación gratuita debe estar donde estás.' using errcode = '42501';
    end if;
  else
    select exists (select 1 from public.deriva_roles where user_id = v_uid and is_admin) into v_admin;
    if not v_admin then
      v_visits := deriva_private.visit_count(v_uid);
      if v_visits < v_required then
        raise exception 'Visita % lugares para desbloquear las ubicaciones en cualquier punto. Llevas %/%.', v_required, v_visits, v_required
          using errcode = '42501';
      end if;
      select id into v_purchase_id from public.deriva_remote_purchases
      where user_id = v_uid and status = 'available'
      order by created_at, id limit 1 for update;
      if not found then
        raise exception 'Para agregar una ubicación en otro lugar debes pagar 1 USD.' using errcode = '42501';
      end if;
    end if;
  end if;
  if not exists (select 1 from storage.objects
    where bucket_id = 'deriva-photos' and name = p_photo_path and owner_id = v_uid::text) then
    raise exception 'Sube tu fotografía antes de publicar el lugar.' using errcode = '42501';
  end if;
  insert into deriva_private.daily_publish_limits as limits (user_id, publication_day, used)
  values (v_uid, (v_now at time zone 'UTC')::date, 1)
  on conflict (user_id, publication_day) do update set used = limits.used + 1 where limits.used < 20
  returning used into v_used;
  if not found then
    raise exception 'Alcanzaste el límite de 20 publicaciones diarias. Inténtalo mañana.' using errcode = 'P0001';
  end if;
  insert into deriva_private.publication_requests (request_id, user_id, mode, created_at)
  values (p_request_id, v_uid, p_mode, v_now);
  -- Legacy category stays internal so old records and consumers remain valid.
  insert into public.deriva_places (id, owner_id, title, category, latitude, longitude, photo_path, photo_source, created_at)
  values (p_request_id, v_uid, btrim(p_title), 'misterio', p_latitude, p_longitude, p_photo_path, p_photo_source, v_now);
  if v_purchase_id is not null then
    update public.deriva_remote_purchases set status = 'consumed', consumed_by_request_id = p_request_id,
      consumed_at = v_now, updated_at = v_now where id = v_purchase_id;
  end if;
  return p_request_id;
end;
$$;

-- Nobody pays for a remote point before exploring enough to be allowed to use it.
create or replace function deriva_private.checkout_ticket(p_user_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_ticket deriva_private.checkout_tickets%rowtype; v_config deriva_private.payment_link_config%rowtype;
begin
 perform deriva_private.assert_service();
 if p_user_id is null or p_request_id is null or not exists(select 1 from auth.users where id=p_user_id and not is_anonymous) then raise exception 'Invalid checkout identity' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('deriva:publish:' || p_user_id::text,0));
 if exists(select 1 from public.deriva_roles where user_id=p_user_id and is_admin) or exists(select 1 from public.deriva_remote_purchases where user_id=p_user_id and status='available') then raise exception 'remote_access_available' using errcode='P0001'; end if;
 if deriva_private.visit_count(p_user_id) < deriva_private.required_visits() then raise exception 'exploration_required' using errcode='P0001'; end if;
 select * into v_config from deriva_private.payment_link_config where singleton;
 if not found then raise exception 'Payment Link not configured' using errcode='P0001'; end if;
 insert into deriva_private.checkout_tickets(user_id,request_id,payment_link_id) values(p_user_id,p_request_id,v_config.payment_link_id)
 on conflict(user_id,request_id) do nothing;
 select * into v_ticket from deriva_private.checkout_tickets where user_id=p_user_id and request_id=p_request_id;
 if v_ticket.expires_at <= clock_timestamp() or v_ticket.payment_link_id <> v_config.payment_link_id then raise exception 'Checkout request expired; use a new request' using errcode='22023'; end if;
 return jsonb_build_object('ticket_id',v_ticket.ticket_id,'payment_link_id',v_config.payment_link_id,'url',v_config.payment_link_url);
end; $$;

revoke all on function deriva_private.required_visits(), deriva_private.arrival_radius_meters(), deriva_private.visit_count(uuid),
  deriva_private.record_visit(text, double precision, double precision, double precision, timestamptz),
  public.deriva_record_visit(text, double precision, double precision, double precision, timestamptz)
from public, anon, authenticated, service_role;
grant execute on function deriva_private.record_visit(text, double precision, double precision, double precision, timestamptz),
  public.deriva_record_visit(text, double precision, double precision, double precision, timestamptz)
to authenticated;

alter publication supabase_realtime add table public.deriva_place_visits;

comment on table public.deriva_place_visits is 'Places an account physically reached (server-checked GPS within the arrival radius). Owner-readable; written only by deriva_record_visit. Survives place deletion.';
comment on table deriva_private.preview_places is 'Coordinates of the local SLRC examples (src/data/preview.ts) so their visits can be verified. Not publications.';
comment on function public.deriva_record_visit(text, double precision, double precision, double precision, timestamptz)
is 'Authenticated, idempotent arrival. Requires fresh GPS <=2min, accuracy <=100m, distance <= arrival radius; own places never count. The visit that reaches the requirement adds an Activity notification.';
comment on function public.deriva_create_place_v2(uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, double precision, timestamptz, boolean)
is 'Local: camera, biometric assertion and fresh GPS <=100m. Remote: three verified visits plus one verified 100-cent USD purchase per request, or server-managed Deriva admin. Retries are idempotent even after place deletion. Category is internal.';
