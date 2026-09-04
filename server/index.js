/**
 * InterCoins Lite -- Express server.
 *
 * The front end (public/) and the API (/api/*) are served by one service on one
 * domain. That is deliberate: when they are split across domains, the
 * /api/claim/:token URL inside a Flex message easily points at the wrong host and
 * 404s. One domain removes the problem.
 */
import express from "express";
import { existsSync, readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, normalize, sep } from "node:path";

import { ensureSchema, hasDb, query } from "./db.js";
import { seedPrizes } from "./prizes.js";
import { verifyPushToken } from "./lib/line.js";
import { TASKS, PUBLISHED_TASKS, MAX_EARNABLE } from "./lib/tasks.js";
import { adminUsers, adminPageAllowed, adminFromRequest } from "./middleware/adminAuth.js";
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
    // The deep check reports live stock, how much of it has gone, and how many
    // people have played. That is operational detail, and this endpoint has no
    // other protection, so it needs the admin token. The shallow check above
    // stays open: it carries only booleans, and uptime monitoring reads it.
    if (!adminFromRequest(req)) {
      return res.status(401).json({ ...out, deep: "unauthorized" });
    }

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
    // Whether the internal preview gate is on -- never the password itself.
    // Sending the password here would be no better than writing it into the
    // page: anyone can read this file. The answer comes from
    // POST /api/preview-access instead, which compares it server-side.
    previewGate: Boolean(process.env.PREVIEW_PASSWORD),
    addFriendUrl: process.env.LINE_ADD_FRIEND_URL || "https://lin.ee/uKzkNI9",
    serverMode: hasDb,
  })};`);
});

/**
 * Internal preview gate.
 *
 * The password is compared here and never leaves the server. An earlier version
 * handed it to the browser so the page could compare it locally, which is the
 * same exposure as writing it into the page -- anyone can read what the server
 * sends. With no password configured the gate is simply off.
 *
 * This is a convenience for previewing before launch, not a security control:
 * what actually protects the live campaign is signing in with LINE and adding
 * the official account. The attempt limit below is only there so the gate
 * cannot be brute-forced in a loop.
 */
const previewTries = new Map();

app.post("/api/preview-access", (req, res) => {
  const secret = process.env.PREVIEW_PASSWORD || "";
  if (!secret) return res.json({ ok: true });

  const ip = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
  const now = Date.now();
  if (previewTries.size > 5000) previewTries.clear();
  const seen = previewTries.get(ip) || { n: 0, until: 0 };
  if (seen.until > now) {
    return res.status(429).json({ ok: false, retryAfter: Math.ceil((seen.until - now) / 1000) });
  }

  const given = Buffer.from(String(req.body?.password ?? ""));
  const want = Buffer.from(secret);
  const ok = given.length === want.length && timingSafeEqual(given, want);

  if (ok) {
    previewTries.delete(ip);
    return res.json({ ok: true });
  }
  seen.n += 1;
  if (seen.n >= 8) { seen.n = 0; seen.until = now + 60_000; }
  previewTries.set(ip, seen);
  return res.status(401).json({ ok: false });
});

app.use("/api/claim", claimRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", gameRoutes);

// A 404 under /api must answer JSON rather than falling through to the SPA and
// returning index.html; otherwise fetch() receives a page of HTML, JSON.parse
// throws, and the real cause is very hard to see.
app.use("/api", (_req, res) => res.status(404).json({ error: "not_found" }));

/**
 * Files we serve out of public/ are text a guest can read in full: "view
 * source" hands over the whole thing. So every strippable file is served with
 * its comments removed -- the source on disk keeps its documentation, and the
 * browser never receives a word of it.
 *
 * This has to be closed by default rather than by a list of filenames. An
 * earlier version named index.html and the admin pages explicitly and let
 * everything else fall through to express.static, which would have served a
 * newly added page verbatim, comments and all. Now anything matching
 * STRIPPABLE is served from here or not at all.
 */
const STRIPPABLE = /\.(html|css|js|mjs)$/i;
const CACHE = new Map();

function modeFor(rel) {
  if (/\.css$/i.test(rel)) return "css";
  if (/\.m?js$/i.test(rel)) return "js";
  return "html";
}

function stripped(rel) {
  if (!CACHE.has(rel)) {
    const text = readFileSync(join(PUBLIC_DIR, rel), "utf8");
    CACHE.set(rel, stripComments(text, { mode: modeFor(rel) }));
  }
  return CACHE.get(rel);
}

function sendPage(res, name) {
  res.type("html").set("Cache-Control", "no-store").send(stripped(name));
}

app.get(STRIPPABLE, (req, res, next) => {
  // Resolve inside PUBLIC_DIR, so no request can walk out of it. normalize()
  // returns backslashes on Windows, hence both separators below.
  let rel;
  try {
    rel = normalize(decodeURIComponent(req.path)).replace(/^[\\/]+/, "");
  } catch {
    return res.sendStatus(400);          // malformed percent-encoding
  }
  const abs = join(PUBLIC_DIR, rel);
  if (!abs.startsWith(PUBLIC_DIR + sep)) return res.sendStatus(404);

  // The admin pages are never served by filename; they go through the gate below.
  const name = rel.split(/[\\/]/).pop();
  if (name === "admin.html" || name === "admin-login.html") return res.redirect(302, "/admin");

  if (!existsSync(abs)) return next();
  res.type(extname(abs))
     .set("Cache-Control", name === "index.html" ? "no-store" : "public, max-age=3600")
     .send(stripped(rel));
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
