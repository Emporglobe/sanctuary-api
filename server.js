require("dotenv").config(); // 🔹 PRIMA LINIE, EXACT CUM AI CERUT

const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

// 🔒 VALIDARE ENV (ca să nu mai crape fără mesaj)
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE env variables");
  process.exit(1);
}

// Supabase admin client (SERVICE ROLE)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));

// ======================
// HEALTH
// ======================
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "sanctuary-api",
    ts: new Date().toISOString()
  });
});

// ======================
// AUTH / ME
// ======================
app.get("/auth/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "Missing token" });
    }

    const token = authHeader.replace("Bearer ", "");

    // 1️⃣ verificăm JWT Supabase
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ ok: false, error: "Invalid token" });
    }

    const user = data.user;

    // 2️⃣ citim planul
    const { data: subscription } = await supabaseAdmin
      .from("subscriptions")
      .select("plan")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email
      },
      plan: subscription?.plan || "free"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ======================
// 404
// ======================
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

// ======================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`sanctuary-api listening on http://localhost:${PORT}`);
});
