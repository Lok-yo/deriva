import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { HttpError } from '../supabase/functions/_shared/core.ts';
import {
  checkoutBody, checkoutRequestId, checkoutReturnResponse, createStripeCheckout,
  readStripeBody, stripeEventAction, stripeTestSecret, verifyStripeSignature,
} from '../supabase/functions/_shared/stripe.ts';

const userA = '76a814f7-3ebd-43fa-9baa-1ca759ae76dc';
const userB = '725d9620-812b-4517-9fe1-2ab7d0b3b129';
const requestId = 'dc874f15-350c-4779-bf17-3b71ad62a7dd';
const returnUrl = 'https://project.supabase.co/functions/v1/deriva-remote-checkout';
const now = 1791090000000;
const secret = 'whsec_FixtureOnlyNotARealSecret';
const metadata = { application: 'deriva', deriva_kind: 'remote_point', deriva_user_id: userA, deriva_request_id: requestId };

function session(overrides: Record<string, unknown> = {}) {
  return { object: 'checkout.session', id: 'cs_test_fixture', livemode: false, mode: 'payment',
    status: 'complete', payment_status: 'paid', amount_total: 100, currency: 'usd',
    client_reference_id: userA, payment_intent: 'pi_fixture', metadata, ...overrides };
}
function event(type = 'checkout.session.completed', object: unknown = session()) {
  return { id: 'evt_fixture', type, livemode: false, data: { object } };
}
function signed(body: string, timestamp = Math.floor(now / 1000)) {
  return `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}
const httpStatus = (status: number) => (error: unknown) => error instanceof HttpError && error.status === status;

test('Stripe solo acepta una clave de prueba del servidor', () => {
  assert.equal(stripeTestSecret('sk_test_Fixture'), 'sk_test_Fixture');
  for (const value of [undefined, '', 'sk_live_Fixture', 'pk_test_Fixture', 'rk_live_Fixture']) {
    assert.throws(() => stripeTestSecret(value), httpStatus(503));
  }
});

test('la solicitud de compra exige UUID; monto y usuario del cliente no controlan Checkout', () => {
  assert.throws(() => checkoutRequestId({ requestId: 'invalid' }), httpStatus(400));
  assert.equal(checkoutRequestId({ requestId: requestId.toUpperCase(), amount: 1, userId: userB }), requestId);
  const body = checkoutBody(userA, requestId, returnUrl);
  assert.equal(body.get('line_items[0][price_data][unit_amount]'), '100');
  assert.equal(body.get('line_items[0][price_data][currency]'), 'usd');
  assert.equal(body.get('line_items[0][quantity]'), '1');
  assert.equal(body.get('mode'), 'payment');
  assert.equal(body.get('client_reference_id'), userA);
  for (const [key, value] of Object.entries(metadata)) {
    assert.equal(body.get(`metadata[${key}]`), value);
    assert.equal(body.get(`payment_intent_data[metadata][${key}]`), value);
  }
  assert.equal(body.get('success_url'), `${returnUrl}?return=success`);
});

test('Checkout usa idempotencia por usuario y solicitud y solo devuelve Stripe HTTPS', async () => {
  const keys: string[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, 'https://api.stripe.com/v1/checkout/sessions');
    const headers = new Headers(init?.headers);
    keys.push(headers.get('Idempotency-Key')!);
    const userId = (init?.body as URLSearchParams).get('client_reference_id');
    return Response.json(session({ client_reference_id: userId, url: 'https://checkout.stripe.com/c/pay/cs_test_fixture' }));
  };
  const first = await createStripeCheckout(userA, requestId, returnUrl, 'sk_test_Fixture', fetcher);
  await createStripeCheckout(userA, requestId, returnUrl, 'sk_test_Fixture', fetcher);
  await createStripeCheckout(userB, requestId, returnUrl, 'sk_test_Fixture', fetcher);
  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[0], keys[2]);
  assert.equal(first.testMode, true);
  assert.equal(first.amount, 100);
});

test('Checkout falla cerrado ante live, usuario distinto, monto alterado o redirección ajena', async () => {
  for (const overrides of [
    { livemode: true }, { id: 'cs_live_fixture' }, { amount_total: 1 },
    { currency: 'mxn' }, { client_reference_id: userB }, { mode: 'subscription' },
    { url: 'https://checkout.stripe.com.attacker.test/pay' }, { url: 'http://checkout.stripe.com/pay' },
    { url: 'https://someone@checkout.stripe.com/pay' },
  ]) {
    await assert.rejects(createStripeCheckout(userA, requestId, returnUrl, 'sk_test_Fixture', async () =>
      Response.json(session({ url: 'https://checkout.stripe.com/pay', ...overrides }))), httpStatus(503));
  }
});

test('un fallo Stripe no concede pago ni expone su respuesta privada', async () => {
  await assert.rejects(createStripeCheckout(userA, requestId, returnUrl, 'sk_test_Fixture', async () =>
    new Response('secret internal details', { status: 500 })), (error: unknown) =>
    httpStatus(503)(error) && !(error as Error).message.includes('secret internal'));
});

test('firma Stripe valida bytes exactos y admite rotación con varias firmas v1', async () => {
  const body = JSON.stringify(event());
  await verifyStripeSignature(body, signed(body), secret, now);
  await verifyStripeSignature(body, `${signed(body)},v1=${'0'.repeat(64)}`, secret, now);
  await verifyStripeSignature(body, `v1=${'0'.repeat(64)},${signed(body)}`, secret, now);
  await assert.rejects(verifyStripeSignature(`${body} `, signed(body), secret, now), httpStatus(400));
  await assert.rejects(verifyStripeSignature(body, signed(body), 'whsec_Different', now), httpStatus(400));
});

test('firma rechaza replay viejo, futuro, downgrade v0 y timestamps ambiguos', async () => {
  const body = JSON.stringify(event());
  for (const signature of [
    null, signed(body, now / 1000 - 301), signed(body, now / 1000 + 301),
    signed(body).replace('v1=', 'v0='), `${signed(body)},t=${now / 1000}`,
    `t=garbage,v1=${'0'.repeat(64)}`, `t=${now / 1000},v1=short`,
  ]) await assert.rejects(verifyStripeSignature(body, signature, secret, now), httpStatus(400));
  await assert.rejects(verifyStripeSignature(body, signed(body), undefined, now), httpStatus(503));
});

test('webhook lee UTF-8 original y limita bytes antes de analizar JSON', async () => {
  const body = '{ "lugar": "río" }';
  assert.equal(await readStripeBody(new Request(returnUrl, { method: 'POST', body })), body);
  await assert.rejects(readStripeBody(new Request(returnUrl, { method: 'POST', body: 'á'.repeat(8) }), 10), httpStatus(413));
  await assert.rejects(readStripeBody(new Request(returnUrl, { method: 'POST', body: new Uint8Array([0xff]) })), httpStatus(400));
});

test('solo Checkout pagado completo de Deriva genera acción de crédito de 1USD', () => {
  const action = stripeEventAction(event());
  assert.deepEqual(action, { type: 'purchase', userId: userA, sessionId: 'cs_test_fixture', paymentIntentId: 'pi_fixture', amountTotal: 100, currency: 'usd' });
  assert.deepEqual(stripeEventAction(event('checkout.session.async_payment_succeeded')), action);
  assert.deepEqual(stripeEventAction(event('checkout.session.completed', session({ payment_status: 'unpaid' }))), { type: 'ignore' });
  assert.deepEqual(stripeEventAction(event('payment_intent.succeeded')), { type: 'ignore' });
});

test('eventos de otra aplicación o sin metadata no afectan pagos de Deriva', () => {
  for (const otherMetadata of [null, {}, { ...metadata, application: 'another' }, { ...metadata, deriva_kind: 'subscription' }]) {
    assert.deepEqual(stripeEventAction(event('checkout.session.completed', session({ metadata: otherMetadata }))), { type: 'ignore' });
  }
});

test('checkout firmado pero inválido nunca concede acceso', () => {
  for (const overrides of [
    { amount_total: 99 }, { currency: 'mxn' }, { mode: 'subscription' }, { livemode: true },
    { client_reference_id: userB }, { payment_intent: '' }, { status: 'open' },
    { metadata: { ...metadata, deriva_user_id: 'invalid' } },
  ]) assert.throws(() => stripeEventAction(event('checkout.session.completed', session(overrides))), httpStatus(400));
  assert.throws(() => stripeEventAction({ ...event(), livemode: true }), httpStatus(400));
});

test('refund exitoso total o parcial de Deriva revoca por PaymentIntent, incluso si llega primero', () => {
  const charge = { object: 'charge', livemode: false, metadata, payment_intent: 'pi_fixture',
    currency: 'usd', amount: 100, amount_refunded: 100, status: 'succeeded', paid: true };
  assert.deepEqual(stripeEventAction(event('charge.refunded', charge)), { type: 'refund', paymentIntentId: 'pi_fixture', amountRefunded: 100, currency: 'usd' });
  assert.equal(stripeEventAction(event('charge.refunded', { ...charge, amount_refunded: 1 })).type, 'refund');
  for (const overrides of [{ amount_refunded: 0 }, { amount_refunded: 101 }, { amount_refunded: 1.5 }, { amount: 500 }, { currency: 'mxn' }, { paid: false }, { status: 'failed' }, { livemode: true }]) {
    assert.throws(() => stripeEventAction(event('charge.refunded', { ...charge, ...overrides })), httpStatus(400));
  }
  assert.deepEqual(stripeEventAction(event('charge.refunded', { ...charge, metadata: {} })), { type: 'ignore' });
});

test('volver del Checkout es informativo y no declara pago verificado', async () => {
  const response = checkoutReturnResponse(false);
  assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
  const text = await response.text();
  assert.match(text, /comprobará el pago con el servidor/);
  assert.doesNotMatch(text, /pago confirmado|pago exitoso/i);
  assert.match(await checkoutReturnResponse(true).text(), /Pago cancelado/);
});
