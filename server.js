require("dotenv").config(); // PRIMA LINIE

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");

// ======================
// VALIDARE ENV
// ======================
if (
  !process.env.SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY
) {
  console.error("❌ Missing SUPABASE env variables");
  process.exit(1);
}

if (
  !process.env.STRIPE_SECRET_KEY ||
  !process.env.STRIPE_WEBHOOK_SECRET
) {
  console.error("❌ Missing STRIPE env variables");
  process.exit(1);
}

// ======================
// CLIENTS
// ======================
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();

// ⚠️ ATENȚIE: webhook-ul Stripe cere RAW body,
// deci JSON middleware NU trebuie să-l afecteze
app.use(
  "/stripe/webhook",
  bodyParser.raw({ type: "application/json" })
);

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

    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ ok: false, error: "Invalid token" });
    }

    const user = data.user;

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
// STRIPE WEBHOOK
// ======================
app.post("/stripe/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Stripe signature error:", err.message);
    return res.status(400).send("Webhook Error");
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        console.log("✅ Checkout completed:", session.id);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        console.log("❌ Subscription deleted:", subscription.id);
        break;
      }

      default:
        console.log("ℹ️ Unhandled event:", event.type);
    }

    res.json({ received: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Webhook handler failed" });
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
