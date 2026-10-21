import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import webpush from "web-push";

const TOKEN_TTL_SECONDS = 8 * 60 * 60;
const publicRateLimits = new Map();

function send(res, status, body) {
  return res.status(status).json(body);
}

function sign(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function createToken(secret) {
  const payload = Buffer.from(JSON.stringify({
    sub: "zajil-admin",
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    nonce: randomUUID()
  })).toString("base64url");
  return payload + "." + sign(payload, secret);
}

function verifyToken(token, secret) {
  if (typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const expected = Buffer.from(sign(parts[0], secret));
  const actual = Buffer.from(parts[1]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return payload.sub === "zajil-admin" && Number(payload.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function allowPublicRequest(req, action) {
  const now = Date.now();
  const forwarded = req.headers["x-forwarded-for"];
  const ip = (typeof forwarded === "string" ? forwarded.split(",")[0] : "unknown").trim();
  const key = action + ":" + ip;
  const entry = publicRateLimits.get(key) || { count: 0, reset: now + 60_000 };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + 60_000;
  }
  entry.count += 1;
  publicRateLimits.set(key, entry);
  const limit = action === "submit_question" ? 5 : action === "bank_report" ? 3 : action.startsWith("push_") ? 15 : 120;
  return entry.count <= limit;
}

async function readBasket(url, missingIsEmpty = false) {
  const response = await fetch(url, { headers: { "Content-Type": "application/json" } });
  // Pantry may return 404 before a basket has been created; this is normal for first-time push subscriptions.
  if (missingIsEmpty && response.status === 404) return {};
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error("Pantry read failed: " + response.status + (detail ? " — " + detail.slice(0, 300) : ""));
  }
  const data = await response.json();
  return data && typeof data === "object" ? data : {};
}

async function writeBasket(url, data) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error("Pantry write failed: " + response.status + (detail ? " — " + detail.slice(0, 300) : ""));
  }
  return response;
}

function pushReady() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function configurePush() {
  if (!pushReady()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:push@zajil-post.vercel.app",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  return true;
}

function validSubscription(value) {
  if (!value || typeof value !== "object" || typeof value.endpoint !== "string" ||
      typeof value.keys?.p256dh !== "string" || typeof value.keys?.auth !== "string") return false;
  try {
    const endpoint = new URL(value.endpoint);
    return endpoint.protocol === "https:" && value.endpoint.length <= 2048 &&
      value.keys.p256dh.length <= 256 && value.keys.auth.length <= 256;
  } catch {
    return false;
  }
}

async function pushSubscriptionsUrl(pantryId) {
  return `https://getpantry.cloud/apiv1/pantry/${pantryId}/basket/zajil_push_subscriptions`;
}

async function sendRatePushes(pantryId, oldData, newData) {
  if (!configurePush()) {
    console.warn("Rate data saved, but Web Push is not configured (missing VAPID keys).");
    return { sent: 0, skipped: true };
  }
  const oldBuy = Number(oldData?.b), oldSell = Number(oldData?.s);
  const newBuy = Number(newData?.b), newSell = Number(newData?.s);
  if (!(oldBuy > 0 && oldSell > 0 && newBuy > 0 && newSell > 0) ||
      (oldBuy === newBuy && oldSell === newSell)) return { sent: 0, skipped: false };

  const url = await pushSubscriptionsUrl(pantryId);
  const basket = await readBasket(url, true);
  const subscriptions = Array.isArray(basket.subscriptions) ? basket.subscriptions : [];
  if (!subscriptions.length) return { sent: 0, skipped: false };

  const direction = newBuy > oldBuy || newSell > oldSell
    ? "ارتفع سعر الدولار"
    : newBuy < oldBuy || newSell < oldSell
      ? "انخفض سعر الدولار"
      : "تغيّرت أسعار الصرف";
  const payload = JSON.stringify({
    title: "تحديث أسعار الصرف | زاجل",
    body: `${direction} — شراء ${Math.round(newBuy).toLocaleString("en-US")}، بيع ${Math.round(newSell).toLocaleString("en-US")} جنيه سوداني`,
    url: "/?tab=rates",
    tag: "zajil-rate-update",
    timestamp: Date.now()
  });

  const retained = [];
  let sent = 0;
  await Promise.all(subscriptions.map(async subscription => {
    try {
      await webpush.sendNotification(subscription, payload, { TTL: 60 * 60, urgency: "normal" });
      retained.push(subscription);
      sent += 1;
    } catch (error) {
      if (error?.statusCode !== 404 && error?.statusCode !== 410) retained.push(subscription);
    }
  }));
  if (retained.length !== subscriptions.length) {
    await writeBasket(url, { subscriptions: retained });
  }
  return { sent, skipped: false };
}

export default async function handler(req, res) {
  const action = String(req.query.action || "");
  const ADMIN_PASS = process.env.ADMIN_PASS;
  const TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET;
  const PANTRY_ID = process.env.PANTRY_ID;

  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(204).end();
  }
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return send(res, 405, { error: "Method not allowed" });
  }

  if (action === "push_config") {
    if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });
    return send(res, 200, { publicKey: process.env.VAPID_PUBLIC_KEY || null, configured: pushReady() });
  }

  if (action === "login") {
    if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
    if (!ADMIN_PASS || !TOKEN_SECRET || TOKEN_SECRET.length < 32) {
      return send(res, 503, { error: "Admin authentication is not configured" });
    }
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (password.length > 256 || password !== ADMIN_PASS) {
      return send(res, 401, { error: "Unauthorized" });
    }
    return send(res, 200, { token: createToken(TOKEN_SECRET), expiresIn: TOKEN_TTL_SECONDS });
  }

  if (!PANTRY_ID) return send(res, 503, { error: "Storage is not configured" });

  const requestAuth = String(req.headers.authorization || "").replace(/^Bearer\\s+/i, "");
  const requestIsAdmin = Boolean(TOKEN_SECRET && TOKEN_SECRET.length >= 32 && verifyToken(requestAuth, TOKEN_SECRET));
  const bankReportsUrl = `https://getpantry.cloud/apiv1/pantry/${PANTRY_ID}/basket/zajil_bank_reports`;

  if (action === "bank_report") {
    if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
    if (!allowPublicRequest(req, action)) return send(res, 429, { error: "Too many reports; try again later" });
    const app = String(req.body?.app || "");
    const reportedStatus = String(req.body?.reportedStatus || "");
    const note = String(req.body?.note || "").trim().slice(0, 300);
    if (!["bankak", "fawry", "okash"].includes(app) || !["working", "unstable", "down"].includes(reportedStatus)) {
      return send(res, 400, { error: "Invalid bank report" });
    }
    try {
      const data = await readBasket(bankReportsUrl, true);
      const reports = Array.isArray(data.reports) ? data.reports : [];
      const report = { id: randomUUID(), app, reportedStatus, note, submittedAt: new Date().toISOString(), reviewStatus: "pending" };
      await writeBasket(bankReportsUrl, { reports: [report, ...reports].slice(0, 200) });
      return send(res, 201, { ok: true, message: "Report received for review" });
    } catch (error) {
      console.error("[bank_report] storage failure:", error?.message || String(error));
      return send(res, 502, { error: "Report storage unavailable" });
    }
  }

  if (action === "bank_reports") {
    if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });
    try {
      const data = await readBasket(bankReportsUrl, true);
      const reports = (Array.isArray(data.reports) ? data.reports : [])
        .filter(item => item?.reviewStatus === "approved")
        .slice(0, 20);
      return send(res, 200, { reports });
    } catch {
      return send(res, 502, { error: "Reports unavailable" });
    }
  }

  if (action === "bank_reports_admin") {
    if (!requestIsAdmin) return send(res, 403, { error: "Forbidden" });
    if (!["GET", "POST"].includes(req.method)) return send(res, 405, { error: "Method not allowed" });
    try {
      const data = await readBasket(bankReportsUrl, true);
      const reports = Array.isArray(data.reports) ? data.reports : [];
      if (req.method === "GET") return send(res, 200, { reports: reports.slice(0, 100) });
      const id = String(req.body?.id || "");
      const decision = String(req.body?.decision || "");
      if (!id || !["approved", "rejected"].includes(decision)) return send(res, 400, { error: "Invalid review decision" });
      const index = reports.findIndex(item => item?.id === id);
      if (index < 0) return send(res, 404, { error: "Report not found" });
      reports[index] = { ...reports[index], reviewStatus: decision, reviewedAt: new Date().toISOString(), reviewNote: String(req.body?.reviewNote || "").trim().slice(0, 200) };
      await writeBasket(bankReportsUrl, { reports });
      return send(res, 200, { ok: true, report: reports[index] });
    } catch (error) {
      console.error("[bank_reports_admin] storage failure:", error?.message || String(error));
      return send(res, 502, { error: "Reports unavailable" });
    }
  }

  if (action === "push_subscribe" || action === "push_unsubscribe") {
    if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
    if (!allowPublicRequest(req, action)) return send(res, 429, { error: "Too many requests" });
    if (action === "push_subscribe" && !pushReady()) {
      return send(res, 503, { error: "Web Push is not configured" });
    }
    const url = await pushSubscriptionsUrl(PANTRY_ID);
    try {
      const basket = await readBasket(url, true);
      const current = Array.isArray(basket.subscriptions) ? basket.subscriptions : [];
      if (action === "push_subscribe") {
        const subscription = req.body?.subscription;
        if (!validSubscription(subscription)) return send(res, 400, { error: "Invalid push subscription" });
        const updated = current.filter(item => item?.endpoint !== subscription.endpoint);
        updated.push(subscription);
        await writeBasket(url, { subscriptions: updated.slice(-5000) });
        return send(res, 200, { ok: true });
      }
      const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
      if (!endpoint || endpoint.length > 2048) return send(res, 400, { error: "Invalid endpoint" });
      await writeBasket(url, { subscriptions: current.filter(item => item?.endpoint !== endpoint) });
      return send(res, 200, { ok: true });
    } catch (error) {
      console.error("[push_subscribe] storage failure:", error?.message || String(error));
      return send(res, 502, { error: "Push subscription storage unavailable" });
    }
  }

  const bucket = req.query.bucket === "zajil_inbox" ? "zajil_inbox" : "zajil_live";
  const url = `https://getpantry.cloud/apiv1/pantry/${PANTRY_ID}/basket/${bucket}`;
  const auth = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const isAdmin = Boolean(TOKEN_SECRET && TOKEN_SECRET.length >= 32 && verifyToken(auth, TOKEN_SECRET));

  if (action === "submit_question" || action === "visit") {
    if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
    if (!allowPublicRequest(req, action)) return send(res, 429, { error: "Too many requests" });
    const inboxUrl = `https://getpantry.cloud/apiv1/pantry/${PANTRY_ID}/basket/zajil_inbox`;
    try {
      const data = await readBasket(inboxUrl);
      if (action === "visit") {
        data.views = Math.max(0, Number(data.views) || 0) + 1;
      } else {
        const sender = String(req.body?.sender || "متابع زاجل").trim().slice(0, 60) || "متابع زاجل";
        const text = String(req.body?.text || "").trim().slice(0, 500);
        const time = String(req.body?.time || "").trim().slice(0, 40);
        if (text.length < 4) return send(res, 400, { error: "Question is too short" });
        const questions = Array.isArray(data.questions) ? data.questions : [];
        data.questions = [{ id: randomUUID(), sender, text, time }].concat(questions).slice(0, 50);
      }
      await writeBasket(inboxUrl, data);
      return send(res, 200, { ok: true, views: Number(data.views) || 0 });
    } catch {
      return send(res, 502, { error: "Storage unavailable" });
    }
  }

  if (bucket === "zajil_inbox" && !isAdmin) return send(res, 403, { error: "Forbidden" });
  if (req.method === "POST" && bucket === "zajil_live" && !isAdmin) return send(res, 403, { error: "Forbidden" });

  try {
    if (req.method === "GET") {
      const upstream = await fetch(url, { headers: { "Content-Type": "application/json" } });
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    }

    const newData = req.body && typeof req.body === "object" ? req.body : {};
    const oldData = await readBasket(url).catch(() => ({}));
    await writeBasket(url, newData);
    let push = { sent: 0, skipped: true };
    try {
      push = await sendRatePushes(PANTRY_ID, oldData, newData);
    } catch (error) {
      console.error("Rate Push send failed:", error?.message || error);
    }
    return send(res, 200, { ok: true, push });
  } catch {
    return send(res, 502, { error: "Storage unavailable" });
  }
}
