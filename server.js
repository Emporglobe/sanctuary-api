require("dotenv").config(); // PRIMA LINIE

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");

// ======================
// VALIDARE ENV
// ======================
const REQUIRED_ENVS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_STANDARD",
  "STRIPE_PRICE_PREMIUM"
];

for (const key of REQUIRED_ENVS) {
  if (!process.env[key]) {
    console.error(`❌ Missing env var: ${key}`);
    process.exit(1);
  }
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

// ⚠️ Stripe webhook MUST use RAW body
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

        const customerEmail = session.customer_email;
        const stripeCustomerId = session.customer;
        const stripeSubscriptionId = session.subscription;

        if (!customerEmail || !stripeSubscriptionId) {
          console.warn("⚠️ Missing email or subscription id");
          break;
        }

        // 1️⃣ găsim user Supabase după email
        const { data: userData, error: userError } =
          await supabaseAdmin.auth.admin.listUsers({
            email: customerEmail
          });

        if (userError || !userData?.users?.length) {
          console.error(
            "❌ Supabase user not found for email:",
            customerEmail
          );
          break;
        }

        const user = userData.users[0];

        // 2️⃣ luăm detalii abonament Stripe
        const subscription = await stripe.subscriptions.retrieve(
          stripeSubscriptionId
        );

        const priceId = subscription.items.data[0].price.id;

        // 3️⃣ mapare price → plan
        let plan = "free";
        if (priceId === process.env.STRIPE_PRICE_STANDARD)
          plan = "standard";
        if (priceId === process.env.STRIPE_PRICE_PREMIUM)
          plan = "premium";

        // 4️⃣ upsert în Supabase
        await supabaseAdmin.from("subscriptions").upsert({
          user_id: user.id,
          plan,
          status: "active",
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          current_period_end: new Date(
            subscription.current_period_end * 1000
          ).toISOString()
        });

        console.log(
          "✅ Subscription activated:",
          user.email,
          plan
        );
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;

        await supabaseAdmin
          .from("subscriptions")
          .update({ status: "canceled" })
          .eq("stripe_subscription_id", sub.id);

        console.log("❌ Subscription canceled:", sub.id);
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
