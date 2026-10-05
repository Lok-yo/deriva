-- Entire suite is rolled back, including fixture secret/config and users.
begin;
create function pg_temp.assert_true(v boolean, message text) returns void language plpgsql as $$ begin if v is distinct from true then raise exception 'Assertion failed: %',message; end if; end $$;
create function pg_temp.expect_error(q text) returns void language plpgsql as $$ begin begin execute q; exception when others then return; end; raise exception 'Expected error: %',q; end $$;
select pg_temp.assert_true(not has_function_privilege('authenticated','public.deriva_payment_link_config()','EXECUTE'),'private config ACL');
select pg_temp.assert_true(not has_function_privilege('anon','public.deriva_checkout_ticket(uuid,uuid)','EXECUTE'),'ticket anon ACL');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.deriva_record_payment_link_purchase(uuid,text,text,text,timestamptz,integer,text)','EXECUTE'),'record ACL');
select pg_temp.assert_true(not has_table_privilege('authenticated','deriva_private.checkout_tickets','SELECT'),'tickets private');
-- Protected Vault update occurs inside this transaction; ROLLBACK restores real config.
select public.deriva_configure_payment_link('plink_Fixture','https://buy.stripe.com/test_Fixture','acct_Fixture','whsec_Fixture');
select pg_temp.assert_true(public.deriva_payment_link_config()->>'webhook_secret'='whsec_Fixture','Vault decrypt only protected RPC');
select pg_temp.expect_error($q$select public.deriva_configure_payment_link('plink_Fixture','https://evil.test','acct_Fixture','whsec_Fixture')$q$);
insert into auth.users(id,aud,role,email,raw_user_meta_data,is_anonymous) values
 ('76a814f7-3ebd-43fa-9baa-1ca759ae76dc','authenticated','authenticated','deriva-ticket-fixture@example.invalid','{"full_name":"Ticket Fixture"}',false),
 ('725d9620-812b-4517-9fe1-2ab7d0b3b129','authenticated','authenticated','deriva-ticket-second@example.invalid','{"full_name":"Second Fixture"}',false);
create temporary table fixture_tickets as select public.deriva_checkout_ticket('76a814f7-3ebd-43fa-9baa-1ca759ae76dc','dc874f15-350c-4779-bf17-3b71ad62a7dd') as ticket;
select pg_temp.assert_true((select ticket from fixture_tickets)=public.deriva_checkout_ticket('76a814f7-3ebd-43fa-9baa-1ca759ae76dc','dc874f15-350c-4779-bf17-3b71ad62a7dd'),'retry stable ticket');
select pg_temp.assert_true((select ticket->>'ticket_id' from fixture_tickets) <> public.deriva_checkout_ticket('725d9620-812b-4517-9fe1-2ab7d0b3b129','dc874f15-350c-4779-bf17-3b71ad62a7dd')->>'ticket_id','request bound to owner');
select pg_temp.expect_error($q$select public.deriva_record_payment_link_purchase(gen_random_uuid(),'plink_Fixture','cs_test_Fixture','pi_fixture',clock_timestamp(),100,'usd')$q$);
select pg_temp.expect_error(format('select public.deriva_record_payment_link_purchase(%L,''plink_Other'',''cs_test_Fixture'',''pi_fixture'',clock_timestamp(),100,''usd'')',(select ticket->>'ticket_id' from fixture_tickets)));
select pg_temp.expect_error(format('select public.deriva_record_payment_link_purchase(%L,''plink_Fixture'',''cs_test_Fixture'',''pi_fixture'',clock_timestamp(),99,''usd'')',(select ticket->>'ticket_id' from fixture_tickets)));
select pg_temp.expect_error(format('select public.deriva_record_payment_link_purchase(%L,''plink_Fixture'',''cs_test_Fixture'',''pi_fixture'',clock_timestamp()+interval ''25 hours'',100,''usd'')',(select ticket->>'ticket_id' from fixture_tickets)));
select public.deriva_record_payment_link_purchase((select (ticket->>'ticket_id')::uuid from fixture_tickets),'plink_Fixture','cs_test_Fixture','pi_fixture',clock_timestamp(),100,'usd');
select public.deriva_record_payment_link_purchase((select (ticket->>'ticket_id')::uuid from fixture_tickets),'plink_Fixture','cs_test_Fixture','pi_fixture',clock_timestamp(),100,'usd');
select public.deriva_record_payment_link_purchase((select (ticket->>'ticket_id')::uuid from fixture_tickets),'plink_Fixture','cs_test_Secondfixture','pi_secondfixture',clock_timestamp(),100,'usd');
select pg_temp.assert_true((select count(*)=2 from public.deriva_remote_purchases where user_id='76a814f7-3ebd-43fa-9baa-1ca759ae76dc'),'two paid sessions same ticket two credits');
select pg_temp.assert_true((select count(*)=1 from public.deriva_remote_purchases where payment_intent_id='pi_fixture'),'duplicate webhook exactly one credit');
select pg_temp.assert_true((select user_id='76a814f7-3ebd-43fa-9baa-1ca759ae76dc'::uuid from public.deriva_remote_purchases where payment_intent_id='pi_fixture'),'credit belongs to ticket owner');
select pg_temp.expect_error($q$select public.deriva_checkout_ticket('76a814f7-3ebd-43fa-9baa-1ca759ae76dc',gen_random_uuid())$q$);
select public.deriva_refund_remote_purchase('pi_fixture',100,'usd');
select public.deriva_refund_remote_purchase('pi_beforefixture',100,'usd');
select public.deriva_record_payment_link_purchase((select (ticket->>'ticket_id')::uuid from fixture_tickets),'plink_Fixture','cs_test_Beforefixture','pi_beforefixture',clock_timestamp(),100,'usd');
select pg_temp.assert_true((select status='refunded' from public.deriva_remote_purchases where payment_intent_id='pi_beforefixture'),'refund before completion tombstone');
-- Delivery may be delayed: valid checkout creation time matters, not arrival.
update deriva_private.checkout_tickets set created_at=clock_timestamp()-interval '25 hours',expires_at=clock_timestamp()-interval '1 hour' where ticket_id=(select (ticket->>'ticket_id')::uuid from fixture_tickets);
select public.deriva_record_payment_link_purchase((select (ticket->>'ticket_id')::uuid from fixture_tickets),'plink_Fixture','cs_test_Latefixture','pi_latefixture',clock_timestamp()-interval '2 hours',100,'usd');
select public.deriva_set_admin('725d9620-812b-4517-9fe1-2ab7d0b3b129',true);
select pg_temp.expect_error($q$select public.deriva_checkout_ticket('725d9620-812b-4517-9fe1-2ab7d0b3b129',gen_random_uuid())$q$);
rollback;
