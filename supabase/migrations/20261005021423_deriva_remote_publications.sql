-- One verified USD 1 payment buys one remote publication. Existing subscriptions
-- no longer authorize publication. Only Deriva objects are changed here.
-- No administrator identity or payment credential is embedded in this migration.

create table public.deriva_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);

create table public.deriva_remote_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  checkout_session_id text not null unique check (checkout_session_id ~ '^cs_[A-Za-z0-9_]{4,250}$'),
  payment_intent_id text not null unique check (payment_intent_id ~ '^pi_[A-Za-z0-9_]{4,250}$'),
  amount_total integer not null check (amount_total = 100),
  currency text not null check (currency = 'usd'),
  status text not null check (status in ('available', 'consumed', 'refunded')),
  consumed_by_request_id uuid unique,
  consumed_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint deriva_purchase_consumption_pair check ((consumed_by_request_id is null) = (consumed_at is null)),
  constraint deriva_purchase_status check (
    (status = 'available' and consumed_at is null and refunded_at is null)
    or (status = 'consumed' and consumed_at is not null and refunded_at is null)
    or (status = 'refunded' and refunded_at is not null)
  )
);
create index deriva_remote_purchases_owner_idx on public.deriva_remote_purchases (user_id, created_at, id);
create index deriva_remote_purchases_available_idx on public.deriva_remote_purchases (user_id, created_at, id)
  where status = 'available';

-- A refund can arrive before checkout completion, or be retried much later.
-- This payment-intent tombstone prevents those events from recreating a credit.
create table deriva_private.remote_refunds (
  payment_intent_id text primary key check (payment_intent_id ~ '^pi_[A-Za-z0-9_]{4,250}$'),
  amount_refunded integer not null check (amount_refunded between 1 and 100),
  currency text not null check (currency = 'usd'),
  refunded_at timestamptz not null default clock_timestamp()
);

-- Keep request IDs after a place is deleted. Retrying the same publication must
-- never spend another credit or recreate a deleted place.
create table deriva_private.publication_requests (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('local', 'remote', 'legacy')),
  created_at timestamptz not null default clock_timestamp()
);
create index deriva_publication_requests_owner_idx on deriva_private.publication_requests (user_id);
insert into deriva_private.publication_requests (request_id, user_id, mode, created_at)
select id, owner_id, 'legacy', created_at from public.deriva_places;

alter table public.deriva_roles enable row level security;
alter table public.deriva_remote_purchases enable row level security;
alter table deriva_private.remote_refunds enable row level security;
alter table deriva_private.publication_requests enable row level security;
revoke all on public.deriva_roles, public.deriva_remote_purchases,
  deriva_private.remote_refunds, deriva_private.publication_requests from public, anon, authenticated, service_role;
grant select on public.deriva_roles, public.deriva_remote_purchases to authenticated, service_role;
create policy deriva_roles_select on public.deriva_roles for select to authenticated using ((select auth.uid()) = user_id);
create policy deriva_remote_purchases_select on public.deriva_remote_purchases for select to authenticated using ((select auth.uid()) = user_id);

create function deriva_private.get_access()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Inicia sesión para consultar tu acceso.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'is_admin', exists (select 1 from public.deriva_roles where user_id = v_uid and is_admin),
    'remote_credits', (select count(*) from public.deriva_remote_purchases where user_id = v_uid and status = 'available')
  );
end;
$$;
create function public.deriva_get_access()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select deriva_private.get_access(); $$;

create function deriva_private.set_admin(p_user_id uuid, p_is_admin boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform deriva_private.assert_service();
  if p_user_id is null or p_is_admin is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'La cuenta de Deriva no existe o el rol es inválido.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('deriva:publish:' || p_user_id::text, 0));
  insert into public.deriva_roles (user_id, is_admin) values (p_user_id, p_is_admin)
  on conflict (user_id) do update set is_admin = excluded.is_admin, updated_at = clock_timestamp();
end;
$$;
create function public.deriva_set_admin(p_user_id uuid, p_is_admin boolean)
returns void language sql security invoker set search_path = ''
as $$ select deriva_private.set_admin(p_user_id, p_is_admin); $$;

create function deriva_private.record_remote_purchase(
  p_user_id uuid, p_checkout_session_id text, p_payment_intent_id text, p_amount_total integer, p_currency text
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_existing public.deriva_remote_purchases%rowtype;
  v_id uuid;
  v_refunded_at timestamptz;
begin
  perform deriva_private.assert_service();
  if p_user_id is null or p_checkout_session_id is null or p_checkout_session_id !~ '^cs_[A-Za-z0-9_]{4,250}$'
    or p_payment_intent_id is null or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]{4,250}$'
    or p_amount_total is distinct from 100 or p_currency is distinct from 'usd' then
    raise exception 'La compra debe ser un pago verificado de 1 USD.' using errcode = '22023';
  end if;
  -- Global payment lock precedes the owner lock in both payment event handlers.
  perform pg_advisory_xact_lock(hashtextextended('deriva:payment:' || p_payment_intent_id, 0));
  perform pg_advisory_xact_lock(hashtextextended('deriva:publish:' || p_user_id::text, 0));
  select * into v_existing from public.deriva_remote_purchases
    where payment_intent_id = p_payment_intent_id or checkout_session_id = p_checkout_session_id;
  if found then
    if v_existing.user_id <> p_user_id or v_existing.checkout_session_id <> p_checkout_session_id
      or v_existing.payment_intent_id <> p_payment_intent_id then
      raise exception 'Este pago ya pertenece a otra compra.' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  -- A deleted account cannot be resurrected by a delayed webhook.
  if not exists (select 1 from auth.users where id = p_user_id) then return null; end if;
  select refunded_at into v_refunded_at from deriva_private.remote_refunds where payment_intent_id = p_payment_intent_id;
  insert into public.deriva_remote_purchases
    (user_id, checkout_session_id, payment_intent_id, amount_total, currency, status, refunded_at)
  values (p_user_id, p_checkout_session_id, p_payment_intent_id, p_amount_total, p_currency,
    case when v_refunded_at is null then 'available' else 'refunded' end, v_refunded_at)
  returning id into v_id;
  return v_id;
end;
$$;
create function public.deriva_record_remote_purchase(
  p_user_id uuid, p_checkout_session_id text, p_payment_intent_id text, p_amount_total integer, p_currency text
)
returns uuid language sql security invoker set search_path = ''
as $$ select deriva_private.record_remote_purchase(p_user_id, p_checkout_session_id, p_payment_intent_id, p_amount_total, p_currency); $$;

create function deriva_private.refund_remote_purchase(p_payment_intent_id text, p_amount_refunded integer, p_currency text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid;
begin
  perform deriva_private.assert_service();
  if p_payment_intent_id is null or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]{4,250}$'
    or p_amount_refunded is null or p_amount_refunded not between 1 and 100 or p_currency is distinct from 'usd' then
    raise exception 'El reembolso no corresponde a una compra de Deriva.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('deriva:payment:' || p_payment_intent_id, 0));
  select user_id into v_uid from public.deriva_remote_purchases where payment_intent_id = p_payment_intent_id;
  if v_uid is not null then
    perform pg_advisory_xact_lock(hashtextextended('deriva:publish:' || v_uid::text, 0));
  end if;
  insert into deriva_private.remote_refunds as refunds (payment_intent_id, amount_refunded, currency)
  values (p_payment_intent_id, p_amount_refunded, p_currency)
  on conflict (payment_intent_id) do update set amount_refunded = greatest(refunds.amount_refunded, excluded.amount_refunded);
  update public.deriva_remote_purchases set status = 'refunded',
    refunded_at = coalesce(refunded_at, clock_timestamp()), updated_at = clock_timestamp()
  where payment_intent_id = p_payment_intent_id and status <> 'refunded';
end;
$$;
create function public.deriva_refund_remote_purchase(p_payment_intent_id text, p_amount_refunded integer, p_currency text)
returns void language sql security invoker set search_path = ''
as $$ select deriva_private.refund_remote_purchase(p_payment_intent_id, p_amount_refunded, p_currency); $$;

create function deriva_private.create_place_v2(
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
  v_purchase_id uuid;
  v_used integer;
begin
  if v_uid is null then raise exception 'Inicia sesión para publicar un lugar.' using errcode = '42501'; end if;
  if p_request_id is null then raise exception 'La publicación necesita un identificador.' using errcode = '22023'; end if;
  -- Serializes retries, competing publications, refunds and role changes for
  -- this user; it is also the existing Storage photo-deletion lock.
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
create function public.deriva_create_place_v2(
  p_request_id uuid, p_title text, p_mode text, p_latitude double precision, p_longitude double precision,
  p_photo_path text, p_photo_source text, p_gps_latitude double precision default null, p_gps_longitude double precision default null,
  p_gps_accuracy double precision default null, p_gps_timestamp timestamptz default null, p_biometric_verified boolean default false
)
returns uuid language sql security invoker set search_path = ''
as $$ select deriva_private.create_place_v2(p_request_id, p_title, p_mode, p_latitude, p_longitude,
  p_photo_path, p_photo_source, p_gps_latitude, p_gps_longitude, p_gps_accuracy, p_gps_timestamp, p_biometric_verified); $$;

-- Existing clients retain local publication and idempotent retries. They cannot
-- silently spend a purchase or bypass the new price through old entitlements.
create or replace function deriva_private.create_place(
  p_request_id uuid, p_title text, p_category text, p_latitude double precision, p_longitude double precision,
  p_photo_path text, p_photo_source text, p_gps_latitude double precision, p_gps_longitude double precision,
  p_gps_accuracy double precision, p_gps_timestamp timestamptz, p_biometric_verified boolean
)
returns uuid language sql security invoker set search_path = ''
as $$ select deriva_private.create_place_v2(p_request_id, p_title, 'local', p_latitude, p_longitude,
  p_photo_path, p_photo_source, p_gps_latitude, p_gps_longitude, p_gps_accuracy, p_gps_timestamp, p_biometric_verified); $$;

revoke all on function deriva_private.get_access(), public.deriva_get_access(),
  deriva_private.set_admin(uuid, boolean), public.deriva_set_admin(uuid, boolean),
  deriva_private.record_remote_purchase(uuid, text, text, integer, text), public.deriva_record_remote_purchase(uuid, text, text, integer, text),
  deriva_private.refund_remote_purchase(text, integer, text), public.deriva_refund_remote_purchase(text, integer, text),
  deriva_private.create_place_v2(uuid, text, text, double precision, double precision, text, text, double precision, double precision, double precision, timestamptz, boolean),
  public.deriva_create_place_v2(uuid, text, text, double precision, double precision, text, text, double precision, double precision, double precision, timestamptz, boolean)
from public, anon, authenticated, service_role;
grant execute on function deriva_private.get_access(), public.deriva_get_access(),
  deriva_private.create_place_v2(uuid, text, text, double precision, double precision, text, text, double precision, double precision, double precision, timestamptz, boolean),
  public.deriva_create_place_v2(uuid, text, text, double precision, double precision, text, text, double precision, double precision, double precision, timestamptz, boolean)
to authenticated;
grant execute on function deriva_private.set_admin(uuid, boolean), public.deriva_set_admin(uuid, boolean),
  deriva_private.record_remote_purchase(uuid, text, text, integer, text), public.deriva_record_remote_purchase(uuid, text, text, integer, text),
  deriva_private.refund_remote_purchase(text, integer, text), public.deriva_refund_remote_purchase(text, integer, text)
to service_role;

-- Add only the two new own-account subscriptions to the existing publication.
alter publication supabase_realtime add table public.deriva_roles, public.deriva_remote_purchases;

comment on function public.deriva_create_place_v2(uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, double precision, timestamptz, boolean)
is 'Local: camera, biometric assertion and fresh GPS <=100m. Remote: one verified 100-cent USD purchase per request, or server-managed Deriva admin. Retries are idempotent even after place deletion. Category is internal.';
comment on function public.deriva_create_place(uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, double precision, timestamptz, boolean)
is 'Legacy local-only wrapper. Category ignored. Old subscription entitlements never grant remote publication.';
comment on table public.deriva_roles is 'Deriva-only roles, not attendance or Supabase administrators. Server-only mutation through deriva_set_admin.';
comment on table public.deriva_remote_purchases is 'Service-verified Stripe payments of exactly 100 cents USD. Clients may read their own rows; only protected RPCs consume credits or apply refunds.';
