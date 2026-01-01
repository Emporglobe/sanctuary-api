const express = require("express");
const cors = require("cors");

const app = express();

// IMPORTANT: pentru început lăsăm permissive, ca să nu te blochezi.
// În PASUL 4/5 strângem CORS la domeniile tale.
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));

// Healthcheck
app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "sanctuary-api",
    ts: new Date().toISOString()
  });
});

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

// Railway / local
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`sanctuary-api listening on http://localhost:${PORT}`);
});
