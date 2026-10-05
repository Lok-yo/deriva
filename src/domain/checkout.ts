export function checkoutUrl(value: unknown): string {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (data.amount !== 100 || data.currency !== 'usd' || data.testMode !== true || typeof data.sessionId !== 'string' || !data.sessionId.startsWith('cs_test_')) throw new Error('No se pudo verificar el pago de prueba de 1 USD.');
  if (typeof data.url !== 'string') throw new Error('El enlace de pago no está disponible.');
  const url = new URL(data.url);
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com' || url.username || url.password || url.port) throw new Error('El enlace de pago no es válido.');
  return url.toString();
}
