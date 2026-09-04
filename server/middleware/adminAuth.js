/**
 * Admin authentication -- individual accounts, not one shared password.
 *
 * Why not a single ADMIN_TOKEN: the winners list carries names, phone numbers and
 * email addresses. A shared password gets forwarded, cannot be taken back when
 * someone leaves, and leaves no way to tell who looked at what. With individual
 * accounts, removing one person means removing their entry from ADMIN_USERS and
 * nobody else is disturbed, and every look at the list records who did it
 * (admin_access_log).
 *
 * Environment:
 *   ADMIN_USERS = "alice:passwordA,kh-mktg:passwordB,tpe-mktg:passwordC"
 *     Usernames are case-insensitive, passwords are not; entries are
 *     comma-separated, and a password may contain neither a comma nor a colon.
 *   ADMIN_TOKEN = master key for curl and automation; logged as user "master".
 *
 * With neither set, the admin API is disabled and answers 503.
 */
import { createHash, timingSafeEqual } from "node:crypto";

const SALT = "ic-admin-v1";

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

/** Token derived from the credentials, so the password itself never reaches browser storage or a request header. */
export function tokenFor(username, password) {
  return sha256(`${username}:${password}:${SALT}`);
}

/** Parse ADMIN_USERS. A malformed entry is skipped with a warning rather than taking the whole admin API down. */
export function adminUsers() {
  const raw = process.env.ADMIN_USERS || "";
  const users = [];
  for (const entry of raw.split(",")) {
    const part = entry.trim();
    if (!part) continue;
    const idx = part.indexOf(":");
    if (idx < 1 || idx === part.length - 1) {
      console.warn(`[adminAuth] ADMIN_USERS 有一組格式不對（應為 帳號:密碼）：${part.slice(0, 12)}…`);
      continue;
    }
    const username = part.slice(0, idx).trim().toLowerCase();
    const password = part.slice(idx + 1);
    users.push({ username, token: tokenFor(username, password) });
  }
  return users;
}

/** Constant-time comparison, so response timing cannot be used to guess a token. */
function sameToken(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Work out which user this request is; null when it is nobody we know. */
export function adminFromRequest(req) {
  const header = req.header("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : req.query.token;
  if (!provided) return null;

  const master = process.env.ADMIN_TOKEN;
  if (master && sameToken(provided, master)) return { username: "master", master: true };

  for (const u of adminUsers()) {
    if (sameToken(provided, u.token)) return { username: u.username, master: false };
  }
  return null;
}

export function adminEnabled() {
  return Boolean(process.env.ADMIN_TOKEN) || adminUsers().length > 0;
}

export function requireAdmin(req, res, next) {
  if (!adminEnabled()) {
    return res.status(503).json({ error: "後台停用：ADMIN_USERS 與 ADMIN_TOKEN 都沒設定" });
  }
  const who = adminFromRequest(req);
  if (!who) return res.status(401).json({ error: "unauthorized" });
  req.adminUser = who.username;
  next();
}

/*
 * The gate on the admin PAGE.
 *
 * The /admin HTML used to be available to anyone. The sign-in form kept people
 * out of the data, but not out of the source: the panel's structure, its field
 * names and its endpoints were all there to read. The page itself now needs a
 * session too.
 *
 * This cookie decides one thing only: whether the HTML is sent. /api/admin/*
 * stays bearer-only, so the cookie cannot read or change any data and there is no
 * CSRF surface -- another site can lead a browser here and get back a page, and
 * nothing more.
 */
export const ADMIN_COOKIE = "ic_admin";

function cookiesOf(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

/** May this request have the admin page? Cookie only; the bearer token is not consulted. */
export function adminPageAllowed(req) {
  const token = cookiesOf(req)[ADMIN_COOKIE];
  if (!token) return false;
  const master = process.env.ADMIN_TOKEN;
  if (master && sameToken(token, master)) return true;
  return adminUsers().some((u) => sameToken(token, u.token));
}

/** The page-access cookie handed to the browser after a successful sign-in. */
export function setAdminCookie(req, res, token) {
  res.cookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: req.secure || req.header("x-forwarded-proto") === "https",
    path: "/",
    maxAge: 12 * 60 * 60 * 1000,
  });
}

export function clearAdminCookie(res) {
  res.clearCookie(ADMIN_COOKIE, { path: "/" });
}
