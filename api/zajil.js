import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

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
  return entry.count <= (action === "submit_question" ? 5 : 120);
}

async function readBasket(url) {
  const response = await fetch(url, { headers: { "Content-Type": "application/json" } });
  if (!response.ok) throw new Error("Pantry read failed: " + response.status);
  const data = await response.json();
  return data && typeof data === "object" ? data : {};
}

async function writeBasket(url, data) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error("Pantry write failed: " + response.status);
  return response;
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

  if (bucket === "zajil_inbox" && !isAdmin) {
    return send(res, 403, { error: "Forbidden" });
  }
  if (req.method === "POST" && bucket === "zajil_live" && !isAdmin) {
    return send(res, 403, { error: "Forbidden" });
  }

  try {
    if (req.method === "GET") {
      const upstream = await fetch(url, { headers: { "Content-Type": "application/json" } });
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    }
    await writeBasket(url, req.body || {});
    return send(res, 200, { ok: true });
  } catch {
    return send(res, 502, { error: "Storage unavailable" });
  }
}
