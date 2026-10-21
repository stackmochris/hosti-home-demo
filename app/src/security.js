// Client logging that cannot carry receipt contents, photos, barcodes, coupon codes or passwords.
// Production Sentry (not created) must use the same denylist on request bodies.

const DENY = /receipt|line|rawname|barcode|photo|coupon|password|passhash|salt|email|token|session/i;

export function safeEvent(name) {
  return String(name || 'event').replace(/[^\w.-]/g, '').slice(0, 64) || 'event';
}

export function appLog(name, extra) {
  const event = safeEvent(name);
  if (extra && typeof extra === 'object') {
    for (const k of Object.keys(extra)) {
      if (DENY.test(k) || DENY.test(String(extra[k]))) return;
    }
  }
  if (typeof extra === 'string' && DENY.test(extra)) return;
}

export function assertNoSecrets(text) {
  const s = String(text || '');
  if (DENY.test(s) && /[:=]/.test(s)) return false;
  return true;
}
