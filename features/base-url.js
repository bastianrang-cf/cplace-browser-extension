export function deriveBaseUrl({ origin, hostname, context }) {
  let tenant = null;
  if (typeof context === 'string') {
    try {
      const segments = new URL(context, origin).pathname.split('/').filter(Boolean);
      tenant = segments[0] || null;
    } catch (_) {
      tenant = null;
    }
  }
  return {
    origin,
    instance: hostname,
    tenant,
    baseUrl: tenant ? `${origin}/${tenant}` : origin,
    contextPath: typeof context === 'string' ? context : null,
  };
}
