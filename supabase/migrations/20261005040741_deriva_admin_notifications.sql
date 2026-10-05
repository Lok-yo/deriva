-- Administrators receive every new place regardless of preferences, distance or ownership.
-- Normal accounts retain their enabled saved GPS zone and exclude their own places.
-- Align the default for future preference rows with the 10 km client default.
alter table public.deriva_notification_preferences alter column radius_km set default 10;

create or replace function deriva_private.notify_nearby_place()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_recipient record;
  v_notification_id uuid;
begin
  for v_recipient in
    select r.user_id, true as is_admin from public.deriva_roles r where r.is_admin
    union all
    select p.user_id, false as is_admin from public.deriva_notification_preferences p
    where p.enabled and p.user_id <> new.owner_id
      and not exists (select 1 from public.deriva_roles r where r.user_id = p.user_id and r.is_admin)
      and p.latitude between new.latitude - p.radius_km / 110.5 and new.latitude + p.radius_km / 110.5
      and deriva_private.distance_meters(p.latitude, p.longitude, new.latitude, new.longitude) <= p.radius_km * 1000
  loop
    insert into public.deriva_notifications (user_id, place_id, title, body)
    values (v_recipient.user_id, new.id,
      case when v_recipient.is_admin then 'Nuevo lugar publicado' else 'Nuevo lugar cerca de ti' end,
      case when v_recipient.is_admin then new.title else new.title || ' está dentro de tu radio de exploración.' end)
    returning id into v_notification_id;
    insert into public.deriva_push_queue (token_id, notification_id)
    select t.id, v_notification_id from public.deriva_push_tokens t where t.user_id = v_recipient.user_id
    on conflict (token_id, notification_id) do nothing;
  end loop;
  return new;
end;
$$;
revoke all on function deriva_private.notify_nearby_place() from public, anon, authenticated, service_role;
comment on function deriva_private.notify_nearby_place() is 'New places notify server-managed administrators globally, including their own places; normal users only receive enabled saved-zone notifications for other authors.';
