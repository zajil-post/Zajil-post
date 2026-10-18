const crypto = require('crypto');
const { send, requireAdmin, body, pantry } = require('../lib/security');
module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      const d = await pantry('GET', 'zajil_inbox');
      return send(res, 200, { questions: Array.isArray(d.questions) ? d.questions : [], views: Number(d.views) || 1 });
    }
    if (req.method === 'POST') {
      const d = body(req), sender = String(d.sender || 'متابع زاجل').trim().slice(0, 80) || 'متابع زاجل';
      const text = String(d.text || '').trim();
      if (!text || text.length > 2000) return send(res, 400, { error: 'invalid_question' });
      const old = await pantry('GET', 'zajil_inbox').catch(() => ({ questions: [], views: 1 }));
      const questions = Array.isArray(old.questions) ? old.questions.slice(0, 499) : [];
      questions.unshift({ id: crypto.randomUUID(), sender, text, createdAt: Date.now() });
      await pantry('POST', 'zajil_inbox', { questions, views: Number(old.views) || 1 });
      return send(res, 201, { ok: true });
    }
    if (req.method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      const id = String(body(req).id || '');
      const old = await pantry('GET', 'zajil_inbox');
      const questions = (Array.isArray(old.questions) ? old.questions : []).filter(q => String(q.id) !== id);
      await pantry('POST', 'zajil_inbox', { questions, views: Number(old.views) || 1 });
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST, DELETE' });
  } catch (_) { return send(res, 502, { error: 'storage_unavailable' }); }
};