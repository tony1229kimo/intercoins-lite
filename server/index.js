/**
 * InterCoins Lite -- Express server.
 *
 * The front end (public/) and the API (/api/*) are served by one service on one
 * domain. That is deliberate: when they are split across domains, the
 * /api/claim/:token URL inside a Flex message easily points at the wrong host and
 * 404s. One domain removes the problem.
 */
import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { ensureSchema, hasDb, query } from "./db.js";
import { seedPrizes } from "./prizes.js";
import { verifyPushToken } from "./lib/line.js";
import { TASKS, PUBLISHED_TASKS, MAX_EARNABLE } from "./lib/tasks.js";
import { adminUsers, adminPageAllowed } from "./middleware/adminAuth.js";
import { stripComments } from "./lib/htmlComments.js";
import gameRoutes from "./routes/game.js";
import claimRoutes from "./routes/claim.js";
import adminRoutes from "./routes/admin.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(HERE, "..", "public");
const PORT = Number(process.env.PORT) || 8080;

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // the platform gateway sits in front
app.use(express.json({ limit: "64kb" }));

// -- health check ------------------------------------------------
// *_configured: true only means the variable is non-empty, not that the key
// works. Add ?deep=1 to actually call LINE and the database, which also reports
// the prize pool.
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
    // Report how many admin accounts exist, never their names or passwords. This is
    // how you confirm the container actually read ADMIN_USERS -- setting a variable
    // and not redeploying is the most common way a change appears live but is not.
    admin_users_configured: adminUsers().length,
    public_base_url: process.env.PUBLIC_BASE_URL || null,
    time: new Date().toISOString(),
  };

  if (req.query.deep) {
    // ask LINE whether this token is valid, and which official account it belongs to
    out.line_push_token_verified = await verifyPushToken("KH");

    // Task list. The URLs are public channel links, nothing confidential.
    // A follow task with no URL is never published, so this also shows what is
    // missing, and the per-person coin ceiling.
    out.tasks = {
      published: PUBLISHED_TASKS.length,
      maxEarnable: MAX_EARNABLE,
      unpublished: TASKS.filter((t) => !PUBLISHED_TASKS.includes(t)).map((t) => t.id),
      list: PUBLISHED_TASKS.map((t) => ({ id: t.id, title: t.title, reward: t.reward })),
    };
    if (db === "ok") {
      const { rows } = await query(
        // Match the draw pool in /spin exactly: a consolation prize is drawable even
        // with visible = false. quota = 0 means unlimited, where a sum is meaningless,
        // so those are counted separately.
        `SELECT hotel, claim_mode, count(*)::int AS prizes,
                sum(quota)::int AS quota, sum(issued)::int AS issued,
                (count(*) FILTER (WHERE quota = 0))::int AS unlimited
           FROM prizes WHERE active AND (visible OR is_consolation)
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
 * Hand LIFF_ID to the front end from the server, so the front end needs no build
 * step and the id is not baked into the repo. A LIFF id is public information --
 * it appears in the address bar -- so nothing confidential passes through here.
 */
app.get("/api/config.js", (_req, res) => {
  res.type("application/javascript").set("Cache-Control", "no-store");
  res.send(`window.IC_CONFIG=${JSON.stringify({
    liffId: process.env.LIFF_ID || "",
    // 內部預覽用的密碼閘。沒設 PREVIEW_PASSWORD 就停用 ——
    // 正式上線的門檻是 LINE 登入 + 加好友，本來就不靠這道閘。
    // ⚠️ 不要把密碼寫死在 public/index.html：那是公開原始碼，按 F12 就看得到。
    previewPassword: process.env.PREVIEW_PASSWORD || "",
    addFriendUrl: process.env.LINE_ADD_FRIEND_URL || "https://lin.ee/uKzkNI9",
    serverMode: hasDb,
  })};`);
});

app.use("/api/claim", claimRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", gameRoutes);

// A 404 under /api must answer JSON rather than falling through to the SPA and
// returning index.html; otherwise fetch() receives a page of HTML, JSON.parse
// throws, and the real cause is very hard to see.
app.use("/api", (_req, res) => res.status(404).json({ error: "not_found" }));

/**
 * Every public/*.html file is served with its comments removed.
 *
 * Those files reach the browser byte for byte, and guests have read them: what
 * they found looked, fairly, like something to be suspicious of. The source keeps
 * its documentation and the browser receives none of it.
 */
const PAGES = new Map();

function page(name) {
  if (!PAGES.has(name)) {
    PAGES.set(name, stripComments(readFileSync(join(PUBLIC_DIR, name), "utf8")));
  }
  return PAGES.get(name);
}

function sendPage(res, name) {
  res.type("html").set("Cache-Control", "no-store").send(page(name));
}

// Requests that name a .html file directly must not reach express.static, or they would bypass the stripping above.
app.get(/\.html$/i, (req, res, next) => {
  const name = req.path.slice(req.path.lastIndexOf("/") + 1);
  if (name === "index.html") return sendPage(res, "index.html");
  if (name === "admin.html" || name === "admin-login.html") return res.redirect(302, "/admin");
  next();
});

/**
 * The admin page. Signing in is required before the HTML is served.
 *
 * This page used to be downloadable by anyone: the sign-in form kept people out
 * of the data but not out of the source, where the panel's layout, its field
 * names and every endpoint it calls were all plainly visible. An unauthenticated
 * visitor now receives a sign-in page and nothing else.
 *
 * Data still requires a bearer token on /api/admin/*. This gate is one more layer,
 * not a replacement for that.
 */
app.get("/admin", (req, res) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  sendPage(res, adminPageAllowed(req) ? "admin.html" : "admin-login.html");
});

app.use(express.static(PUBLIC_DIR, {
  index: false,
  maxAge: "1h",
  setHeaders(res, path) {
    // images are safe to cache for a long time
    if (/\.(png|jpe?g|webp|mp4|woff2?)$/.test(path)) {
      res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    }
  },
}));

app.get("*", (_req, res) => sendPage(res, "index.html"));

// One error handler. Do not collapse every failure into the same misleading
// message -- carry the real cause out, or the only thing anyone sees on the day
// is "invalid" and everybody guesses in the wrong direction.
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
    // A database outage must not stop the site booting -- the static pages should
    // still load, and the health check explains why the rest is down.
    console.error("[boot] 資料庫初始化失敗，以降級模式啟動:", err.message);
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[boot] 洲遊幣 Lite 已啟動 → http://0.0.0.0:${PORT}`);
    console.log(`[boot] DB=${hasDb ? "on" : "off"} LIFF=${process.env.LIFF_ID ? "on" : "off"}`);
  });
}

main();
