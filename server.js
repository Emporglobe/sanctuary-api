// sanctuary-api server.js
// PASUL 1 + PASUL 2.4 (health + auth/me)

const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();

/* =========================
   MIDDLEWARE
========================= */
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));

/* =========================
   SUPABASE ADMIN CLIENT
   (SERVICE ROLE - backend only)
========================= */
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE env variables");
}

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* =========================
   HEALTHCHECK
========================= */
app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "sanctuary-api",
    ts: new Date().toISOString()
  });
});

/* =========================
   AUTH / ME
========================= */
app.get("/auth/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";

    // 1️⃣ Verificăm dacă există token
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        ok: false,
        error: "Missing token"
      });
    }

    const token = authHeader.replace("Bearer ", "");

    // 2️⃣ Verificăm JWT-ul cu Supabase
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(token);

    if (userError || !userData?.user) {
      return res.status(401).json({
        ok: false,
        error: "Invalid token"
      });
    }

    const user = userData.user;

    // 3️⃣ Citim abonamentul (dacă există)
    const { data: subscription, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("plan, status, current_period_end")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (subError) {
      console.error("Subscription read error:", subError);
    }

    // 4️⃣ Răspuns final
    return res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email
      },
      plan: subscription?.plan || "free"
    });
  } catch (err) {
    console.error("AUTH /me error:", err);
    return res.status(500).json({
      ok: false,
      error: "Server error"
    });
  }
});

/* =========================
   404 FALLBACK
========================= */
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Not found"
  });
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`sanctuary-api listening on http://localhost:${PORT}`);
});
