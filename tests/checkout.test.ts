import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkoutUrl } from '../src/domain/checkout';

const checkout = { url: 'https://checkout.stripe.com/c/pay/cs_test_example', sessionId: 'cs_test_example', amount: 100, currency: 'usd', testMode: true };

test('checkout sólo abre el pago fijo de prueba de 1 USD', () => {
  assert.equal(checkoutUrl(checkout), checkout.url);
  for (const change of [{ amount: 200 }, { currency: 'mxn' }, { testMode: false }, { sessionId: 'cs_live_example' }]) {
    assert.throws(() => checkoutUrl({ ...checkout, ...change }), /pago de prueba/);
  }
});

test('checkout rechaza redirecciones fuera de Stripe o transporte inseguro', () => {
  for (const url of ['http://checkout.stripe.com/c/pay/test', 'https://checkout.stripe.com.evil.example/pay', 'https://evil.example/checkout.stripe.com', 'https://username@checkout.stripe.com/pay', 'https://checkout.stripe.com:444/pay']) {
    assert.throws(() => checkoutUrl({ ...checkout, url }), /enlace de pago/);
  }
});

const nonce = 'dc874f15-350c-4779-bf17-3b71ad62a7dd';
const link = { checkoutKind: 'payment_link', url: `https://buy.stripe.com/test_Fixture?client_reference_id=${nonce}`, requestId: nonce, paymentLinkId: 'plink_Fixture', amount: 100, currency: 'usd', testMode: true };
test('Payment Link exige referencia opaca igual al ticket y modo fijo de prueba', () => {
  assert.equal(checkoutUrl(link), link.url);
  for (const change of [{ amount: 1 }, { testMode: false }, { requestId: 'user_id' }, { paymentLinkId: 'cs_test_Fixture' }]) assert.throws(() => checkoutUrl({ ...link, ...change }));
  for (const url of [`https://buy.stripe.com/Fixture?client_reference_id=${nonce}`, `https://buy.stripe.com/test_Fixture?client_reference_id=${nonce}&amount=1`, `https://buy.stripe.com/test_Fixture?client_reference_id=${nonce}&client_reference_id=${nonce}`, 'https://buy.stripe.com/test_Fixture?client_reference_id=wrong', `https://buy.stripe.com.evil.test/test_Fixture?client_reference_id=${nonce}`]) assert.throws(() => checkoutUrl({ ...link, url }));
});
