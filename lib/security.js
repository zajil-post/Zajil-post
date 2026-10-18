const crypto = require('crypto');
const COOKIE = 'zajil_admin';
function send(res, status, body, headers = {}) {
  res.status(status).setHeader('Cache-Control', 'no-store').setHeader('X-Content-Type-Options', 'nosniff');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  return res.json(body);
}
function secret() { return process.env.SESSION_SECRET || ''; }
function sign(value) { return crypto.createHmac('sha256', secret()).update(value).digest('base64url'); }
function readCookie(req) {
  const part = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='));
  return part ? decodeURIComponent(part.slice(COOKIE.length + 1)) : '';
}
function isAdmin(req) {
  if (!secret()) return false;
  const pieces = readCookie(req).split('.');
  if (pieces.length !== 2 || !/^\d+$/.test(pieces[0]) || Number(pieces[0]) < Date.now()) return false;
  const expected = Buffer.from(sign(pieces[0]));
  const actual = Buffer.from(pieces[1]);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  send(res, 401, { error: 'unauthorized' });
  return false;
}
function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch (_) { return {}; }
}
async function pantry(method, basket, data) {
  const id = process.env.PANTRY_ID;
  if (!id) throw new Error('PANTRY_ID missing');
  const url = 'https://getpantry.cloud/apiv1/pantry/' + encodeURIComponent(id) + '/basket/' + basket;
  const r = await fetch(url, {
    method,
    headers: data ? { 'Content-Type': 'application/json' } : {},
    body: data ? JSON.stringify(data) : undefined
  });
  if (!r.ok) throw new Error('Storage unavailable');
  return method === 'GET' ? r.json() : true;
}
module.exports = { COOKIE, send, secret, sign, requireAdmin, body, pantry };