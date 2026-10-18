const crypto = require('crypto');
const { COOKIE, send, secret, sign, body } = require('../../lib/security');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected || !secret()) return send(res, 503, { error: 'admin_not_configured' });
  const password = String(body(req).password || '');
  if (!password || password.length > 256) return send(res, 400, { error: 'invalid_request' });
  const a = Buffer.from(password), b = Buffer.from(expected);
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!valid) return send(res, 401, { error: 'invalid_credentials' });
  const expiry = String(Date.now() + 8 * 60 * 60 * 1000);
  const token = expiry + '.' + sign(expiry);
  res.setHeader('Set-Cookie', COOKIE + '=' + encodeURIComponent(token) + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800');
  return send(res, 200, { ok: true });
};