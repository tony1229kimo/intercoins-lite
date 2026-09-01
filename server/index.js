/**
 * 洲遊幣 Lite —— Express 伺服器。
 *
 * 前端（public/）與 API（/api/*）由同一個服務、同一個網域提供。
 * 這是刻意的：味蕾旅遊地圖 POSTMORTEM Bug #9B 的教訓是前後端分網域時，
 * Flex 訊息裡的 /api/claim/:token 很容易指錯 host 而 404。同網域就沒這問題。
 */
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { ensureSchema, hasDb, query } from "./db.js";
import { seedPrizes } from "./prizes.js";
import { verifyPushToken } from "./lib/line.js";
import gameRoutes from "./routes/game.js";
import claimRoutes from "./routes/claim.js";
import adminRoutes from "./routes/admin.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(HERE, "..", "public");
const PORT = Number(process.env.PORT) || 8080;

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // Zeabur gateway 在前面
app.use(express.json({ limit: "64kb" }));

// ── 健康檢查 ───────────────────────────────────────────────────
// ⚠️ *_configured: true 只代表環境變數非空，不代表 key 有效（踩雷 T09）。
//    要真的驗證請加 ?deep=1 —— 會實際打 LINE 與 DB 確認，並回報獎項庫存概況。
app.get("/api/health", async (req, res) => {
  let db = "not_configured";
  if (hasDb) {
    try {
      await query("SELECT 1");
      db = "ok";
    } catch (err) {
      db = `error: ${err.message}`;
    }
  }

  const out = {
    ok: db === "ok" || !hasDb,
    service: "intercoins-lite",
    db,
    liff_id_configured: Boolean(process.env.LIFF_ID),
    line_channel_id_configured: Boolean(process.env.LINE_CHANNEL_ID),
    line_push_token_configured: Boolean(process.env.LINE_MESSAGING_ACCESS_TOKEN_KH),
    admin_token_configured: Boolean(process.env.ADMIN_TOKEN),
    public_base_url: process.env.PUBLIC_BASE_URL || null,
    time: new Date().toISOString(),
  };

  if (req.query.deep) {
    // 真的打 LINE 問這把 token 有沒有效、對應到哪個官方帳號。
    out.line_push_token_verified = await verifyPushToken("KH");
    if (db === "ok") {
      const { rows } = await query(
        `SELECT hotel, claim_mode, count(*)::int AS prizes,
                sum(quota)::int AS quota, sum(issued)::int AS issued
           FROM prizes WHERE active AND visible
          GROUP BY hotel, claim_mode ORDER BY hotel`,
      );
      out.prize_pool = rows;
      const { rows: [t] } = await query(
        `SELECT count(*)::int AS players,
                (SELECT count(*)::int FROM draws) AS draws,
                (SELECT count(*)::int FROM prize_contacts) AS contacts_filled
           FROM players`,
      );
      out.usage = t;
    }
  }

  res.json(out);
});

/**
 * 把 LIFF_ID 從伺服器端餵給前端，前端不用 build、也不用把 ID 寫死進 repo。
 * LIFF ID 本來就是公開資訊（會出現在網址列），這裡不涉及機密。
 */
app.get("/api/config.js", (_req, res) => {
  res.type("application/javascript").set("Cache-Control", "no-store");
  res.send(`window.IC_CONFIG=${JSON.stringify({
    liffId: process.env.LIFF_ID || "",
    addFriendUrl: process.env.LINE_ADD_FRIEND_URL || "https://lin.ee/uKzkNI9",
    serverMode: hasDb,
  })};`);
});

app.use("/api/claim", claimRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", gameRoutes);

// API 的 404 要回 JSON，不要掉進 SPA fallback 回 index.html
// （否則前端 fetch 會拿到一坨 HTML 然後 JSON.parse 爆掉，很難查）。
app.use("/api", (_req, res) => res.status(404).json({ error: "not_found" }));

app.use(express.static(PUBLIC_DIR, {
  maxAge: "1h",
  setHeaders(res, path) {
    // 遊戲本體不快取，改版要立刻生效；圖檔可以放心長快取。
    if (path.endsWith("index.html")) res.setHeader("Cache-Control", "no-store");
    else if (/\.(png|jpe?g|webp|mp4|woff2?)$/.test(path)) {
      res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    }
  },
}));
// 後台頁面。頁面本身沒有任何資料 —— 所有內容都要帶 ADMIN_TOKEN 打 /api/admin/*
// 才拿得到，所以靜態檔公開沒關係。
app.get("/admin", (_req, res) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(join(PUBLIC_DIR, "admin.html"));
});

app.get("*", (_req, res) => res.sendFile(join(PUBLIC_DIR, "index.html")));

// 統一錯誤處理。POSTMORTEM Bug #3 的教訓：不要把所有錯誤吞成同一個誤導訊息，
// 一定要把真實原因帶出來，否則現場只會看到「無效」然後所有人猜錯方向。
app.use((err, _req, res, _next) => {
  console.error("[unhandled]", err);
  res.status(err.status || 500).json({
    error: err.code || "internal_error",
    detail: String(err.message || err).slice(0, 300),
  });
});

async function main() {
  try {
    const ready = await ensureSchema();
    if (ready) await seedPrizes();
  } catch (err) {
    // DB 掛掉不該讓整個站台起不來 —— 靜態頁還是要看得到，健康檢查會說明原因。
    console.error("[boot] 資料庫初始化失敗，以降級模式啟動:", err.message);
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[boot] 洲遊幣 Lite 已啟動 → http://0.0.0.0:${PORT}`);
    console.log(`[boot] DB=${hasDb ? "on" : "off"} LIFF=${process.env.LIFF_ID ? "on" : "off"}`);
  });
}

main();
