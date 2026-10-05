-- Stripe Payment Links use server-minted opaque references, never client user IDs.
create table deriva_private.payment_link_config (
 singleton boolean primary key default true check(singleton),
 payment_link_id text not null check(payment_link_id ~ '^plink_[A-Za-z0-9]+$'),
 payment_link_url text not null check(payment_link_url ~ '^https://buy[.]stripe[.]com/test_[A-Za-z0-9]+$'),
 stripe_account_id text not null check(stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
 webhook_secret_id uuid not null references vault.secrets(id),
 updated_at timestamptz not null default clock_timestamp()
);
create table deriva_private.checkout_tickets (
 ticket_id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 payment_link_id text not null,
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default (clock_timestamp() + interval '24 hours'),
 unique(user_id, request_id)
);
alter table deriva_private.payment_link_config enable row level security;
alter table deriva_private.checkout_tickets enable row level security;
revoke all on deriva_private.payment_link_config, deriva_private.checkout_tickets from public, anon, authenticated, service_role;

create function deriva_private.configure_payment_link(p_payment_link_id text,p_payment_link_url text,p_stripe_account_id text,p_webhook_secret text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_secret uuid;
begin
 perform deriva_private.assert_service();
 if p_webhook_secret is null or p_webhook_secret !~ '^whsec_[A-Za-z0-9]+$' then raise exception 'Invalid webhook secret' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('deriva:payment-link-config',0));
 select webhook_secret_id into v_secret from deriva_private.payment_link_config where singleton;
 if v_secret is null then
   select vault.create_secret(p_webhook_secret,'deriva_stripe_test_webhook','Deriva test Payment Link webhook only') into v_secret;
 else
   perform vault.update_secret(v_secret,p_webhook_secret);
 end if;
 insert into deriva_private.payment_link_config(singleton,payment_link_id,payment_link_url,stripe_account_id,webhook_secret_id)
 values(true,p_payment_link_id,p_payment_link_url,p_stripe_account_id,v_secret)
 on conflict(singleton) do update set payment_link_id=excluded.payment_link_id,payment_link_url=excluded.payment_link_url,
 stripe_account_id=excluded.stripe_account_id,updated_at=clock_timestamp();
end; $$;
create function public.deriva_configure_payment_link(p_payment_link_id text,p_payment_link_url text,p_stripe_account_id text,p_webhook_secret text)
returns void language sql security invoker set search_path='' as $$ select deriva_private.configure_payment_link(p_payment_link_id,p_payment_link_url,p_stripe_account_id,p_webhook_secret); $$;

create function deriva_private.payment_link_config()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_config jsonb;
begin
 perform deriva_private.assert_service();
 select jsonb_build_object('payment_link_id',c.payment_link_id,'payment_link_url',c.payment_link_url,'stripe_account_id',c.stripe_account_id,'webhook_secret',s.decrypted_secret)
 into v_config from deriva_private.payment_link_config c join vault.decrypted_secrets s on s.id=c.webhook_secret_id where c.singleton;
 return v_config;
end; $$;
create function public.deriva_payment_link_config() returns jsonb language sql security invoker set search_path='' as $$ select deriva_private.payment_link_config(); $$;

create function deriva_private.checkout_ticket(p_user_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_ticket deriva_private.checkout_tickets%rowtype; v_config deriva_private.payment_link_config%rowtype;
begin
 perform deriva_private.assert_service();
 if p_user_id is null or p_request_id is null or not exists(select 1 from auth.users where id=p_user_id and not is_anonymous) then raise exception 'Invalid checkout identity' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('deriva:publish:' || p_user_id::text,0));
 if exists(select 1 from public.deriva_roles where user_id=p_user_id and is_admin) or exists(select 1 from public.deriva_remote_purchases where user_id=p_user_id and status='available') then raise exception 'remote_access_available' using errcode='P0001'; end if;
 select * into v_config from deriva_private.payment_link_config where singleton;
 if not found then raise exception 'Payment Link not configured' using errcode='P0001'; end if;
 insert into deriva_private.checkout_tickets(user_id,request_id,payment_link_id) values(p_user_id,p_request_id,v_config.payment_link_id)
 on conflict(user_id,request_id) do nothing;
 select * into v_ticket from deriva_private.checkout_tickets where user_id=p_user_id and request_id=p_request_id;
 if v_ticket.expires_at <= clock_timestamp() or v_ticket.payment_link_id <> v_config.payment_link_id then raise exception 'Checkout request expired; use a new request' using errcode='22023'; end if;
 return jsonb_build_object('ticket_id',v_ticket.ticket_id,'payment_link_id',v_config.payment_link_id,'url',v_config.payment_link_url);
end; $$;
create function public.deriva_checkout_ticket(p_user_id uuid,p_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select deriva_private.checkout_ticket(p_user_id,p_request_id); $$;

create function deriva_private.record_payment_link_purchase(p_ticket_id uuid,p_payment_link_id text,p_checkout_session_id text,p_payment_intent_id text,p_checkout_created_at timestamptz,p_amount_total integer,p_currency text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_ticket deriva_private.checkout_tickets%rowtype;
begin
 perform deriva_private.assert_service();
 select * into v_ticket from deriva_private.checkout_tickets where ticket_id=p_ticket_id;
 if not found or p_payment_link_id is distinct from v_ticket.payment_link_id or not exists(select 1 from deriva_private.payment_link_config where singleton and payment_link_id=p_payment_link_id)
 or p_checkout_created_at is null or p_checkout_created_at < date_trunc('second',v_ticket.created_at) or p_checkout_created_at >= v_ticket.expires_at
 or p_checkout_session_id is null or p_checkout_session_id !~ '^cs_test_[A-Za-z0-9]+$' then raise exception 'Invalid Payment Link ticket' using errcode='22023'; end if;
 return deriva_private.record_remote_purchase(v_ticket.user_id,p_checkout_session_id,p_payment_intent_id,p_amount_total,p_currency);
end; $$;
create function public.deriva_record_payment_link_purchase(p_ticket_id uuid,p_payment_link_id text,p_checkout_session_id text,p_payment_intent_id text,p_checkout_created_at timestamptz,p_amount_total integer,p_currency text)
returns uuid language sql security invoker set search_path='' as $$ select deriva_private.record_payment_link_purchase(p_ticket_id,p_payment_link_id,p_checkout_session_id,p_payment_intent_id,p_checkout_created_at,p_amount_total,p_currency); $$;

revoke all on function deriva_private.configure_payment_link(text,text,text,text),public.deriva_configure_payment_link(text,text,text,text),deriva_private.payment_link_config(),public.deriva_payment_link_config(),deriva_private.checkout_ticket(uuid,uuid),public.deriva_checkout_ticket(uuid,uuid),deriva_private.record_payment_link_purchase(uuid,text,text,text,timestamptz,integer,text),public.deriva_record_payment_link_purchase(uuid,text,text,text,timestamptz,integer,text) from public,anon,authenticated,service_role;
grant execute on function deriva_private.configure_payment_link(text,text,text,text),public.deriva_configure_payment_link(text,text,text,text),deriva_private.payment_link_config(),public.deriva_payment_link_config(),deriva_private.checkout_ticket(uuid,uuid),public.deriva_checkout_ticket(uuid,uuid),deriva_private.record_payment_link_purchase(uuid,text,text,text,timestamptz,integer,text),public.deriva_record_payment_link_purchase(uuid,text,text,text,timestamptz,integer,text) to service_role;
