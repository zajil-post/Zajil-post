const { send, requireAdmin, body, pantry } = require('../lib/security');
module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const d = await pantry('GET', 'zajil_live');
      return send(res, 200, d && typeof d === 'object' ? d : {});
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
    if (!requireAdmin(req, res)) return;
    const d = body(req);
    const b = Number(d.b), s = Number(d.s);
    if (!Number.isFinite(b) || !Number.isFinite(s) || b <= 0 || s <= 0 || b > 1e9 || s > 1e9) return send(res, 400, { error: 'invalid_rates' });
    const validStatus = v => ['ok', 'warn', 'err'].includes(v) ? v : 'ok';
    const clean = {
      ts: Date.now(), b, s, upd: String(d.upd || '').slice(0, 100), tk: String(d.tk || '').slice(0, 1000),
      banks: { bankak: validStatus(d.banks && d.banks.bankak), fawry: validStatus(d.banks && d.banks.fawry), okash: validStatus(d.banks && d.banks.okash) },
      arts: Array.isArray(d.arts) ? d.arts.slice(0, 100).map(a => ({
        t: String(a.t || '').slice(0, 250), b: String(a.b || '').slice(0, 10000),
        i: /^https:\/\//i.test(String(a.i || '')) ? String(a.i).slice(0, 2000) : ''
      })) : []
    };
    await pantry('POST', 'zajil_live', clean);
    return send(res, 200, { ok: true });
  } catch (_) { return send(res, 502, { error: 'storage_unavailable' }); }
};