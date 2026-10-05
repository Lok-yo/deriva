export function checkoutUrl(value: unknown): string {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (data.checkoutKind === 'payment_link') {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (data.amount !== 100 || data.currency !== 'usd' || data.testMode !== true || typeof data.requestId !== 'string' || !uuid.test(data.requestId) || typeof data.paymentLinkId !== 'string' || !/^plink_[A-Za-z0-9]+$/.test(data.paymentLinkId)) throw new Error('No se pudo verificar el pago de prueba de 1 USD.');
    if (typeof data.url !== 'string') throw new Error('El enlace de pago no está disponible.');
    const link = new URL(data.url);
    if (link.protocol !== 'https:' || link.hostname !== 'buy.stripe.com' || link.port || link.username || link.password || link.hash || !/^\/test_[A-Za-z0-9]+$/.test(link.pathname) || link.searchParams.size !== 1 || link.searchParams.get('client_reference_id') !== data.requestId) throw new Error('El enlace de pago no es válido.');
    return link.toString();
  }
  if (data.amount !== 100 || data.currency !== 'usd' || data.testMode !== true || typeof data.sessionId !== 'string' || !data.sessionId.startsWith('cs_test_')) throw new Error('No se pudo verificar el pago de prueba de 1 USD.');
  if (typeof data.url !== 'string') throw new Error('El enlace de pago no está disponible.');
  const url = new URL(data.url);
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com' || url.username || url.password || url.port) throw new Error('El enlace de pago no es válido.');
  return url.toString();
}
