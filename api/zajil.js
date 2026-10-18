export default async function handler(req, res) {
  const PANTRY_ID = process.env.PANTRY_ID;
  const ADMIN_PASS = process.env.ADMIN_PASS || "ZAJIL@201919";
  const SECRET_TOKEN = Buffer.from(ADMIN_PASS + "_zajil_sec").toString("base64");

  if (req.query.action === "login" && req.method === "POST") {
    const { password } = req.body || {};
    if (password === ADMIN_PASS) {
      return res.status(200).json({ token: SECRET_TOKEN });
    }
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!PANTRY_ID) return res.status(404).json({ error: "No server config" });

  const bucket = req.query.bucket === "zajil_inbox" ? "zajil_inbox" : "zajil_live";
  const url = `https://getpantry.cloud/apiv1/pantry/${PANTRY_ID}/basket/${bucket}`;

  if (req.method === "POST" && bucket === "zajil_live") {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${SECRET_TOKEN}`) {
      return res.status(403).json({ error: "Forbidden" });
    }
  }

  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers: { "Content-Type": "application/json" },
      body: req.method === "POST" ? JSON.stringify(req.body) : undefined
    });
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: "Upstream error" });
  }
}
