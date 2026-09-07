/**
 * Who gets to spend a claim token.
 *
 * Two ways to get this wrong, and they cost very different amounts:
 *
 *   a prefetch treated as a guest  -> the token burns, no voucher is issued,
 *                                     and the guest is told it was already used
 *   a guest treated as a prefetch  -> they see a page with a button and tap it
 *
 * So the rule is: spend on sight unless the request is positively identifiable
 * as automated. Every "unrecognised client still gets their voucher" case below
 * is guarding the expensive direction -- particularly the guest whose browser
 * sends no Sec-Fetch headers at all, which is every iPhone before iOS 16.4.
 *
 * History: until 2026-09-05 any GET spent the token, and guests lost prizes to
 * link previews. From 2026-09-05 only a POST spent it, which stopped that but
 * cost about 40% of completed claims (24.9% -> 13.2% within six hours of
 * winning, measured at matched age). This is the third shape: one tap again,
 * with automated requests filtered out.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import express from "express";

const SERVER_DIR = path.resolve(import.meta.dirname, "..");
const url = (rel) => pathToFileURL(path.join(SERVER_DIR, rel)).href;

const TOKEN = "tok_abc123";
const LINK = "https://example.test/coupon/xyz";
const PRIZE = "高雄洲際酒店 天然楠竹不鏽鋼環保隨行瓶";

const DB = { usedAt: null, couponLink: LINK, exists: true };
const resetDB = () => Object.assign(DB, { usedAt: null, couponLink: LINK, exists: true });

function run(sql, params) {
  const q = sql.replace(/\s+/g, " ").trim();
  if (q.startsWith("SELECT d.prize_name, d.claim_used_at")) {
    if (!DB.exists || params[0] !== TOKEN) return { rows: [] };
    return { rows: [{ prize_name: PRIZE, claim_used_at: DB.usedAt, expiry_note: "請於活動期間內使用" }] };
  }
  if (q.startsWith("UPDATE draws SET claim_used_at")) {
    if (!DB.exists || params[0] !== TOKEN || DB.usedAt) return { rows: [] };
    DB.usedAt = new Date();
    return { rows: [{ prize_id: "kh-1-5", prize_name: PRIZE }] };
  }
  if (q.startsWith("SELECT coupon_link")) return { rows: [{ coupon_link: DB.couponLink }] };
  throw new Error("假 DB 沒有對應的查詢：" + q.slice(0, 90));
}

mock.module(url("db.js"), { exports: { query: async (sql, params) => run(sql, params) } });

const { default: router } = await import(url("routes/claim.js"));
const app = express();
app.use("/api/claim", router);
const server = app.listen(0);
server.unref();
const base = `http://127.0.0.1:${server.address().port}`;

/** A recent mobile browser doing a real top-level navigation from a tap. */
const TAP = {
  "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15",
  "sec-fetch-dest": "document",
  "sec-fetch-site": "cross-site",
  "sec-fetch-user": "?1",
};
// Node's fetch rewrites Sec-Fetch-Mode to match its own request mode, so these
// tests cannot express "navigate" and nothing here may depend on it.

const get = (headers = TAP, t = TOKEN) =>
  fetch(`${base}/api/claim/${t}`, { headers, redirect: "manual" });
const post = (t = TOKEN) =>
  fetch(`${base}/api/claim/${t}`, { method: "POST", redirect: "manual" });

/* ── a guest taps: one tap, straight to the voucher ───────────────── */

test("真人點擊 → 直接消耗並轉去券連結", async () => {
  resetDB();
  const r = await get();
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), LINK);
  assert.ok(DB.usedAt, "真人點擊卻沒有消耗 token");
});

test("舊 iPhone（完全沒有 Sec-Fetch 標頭）也要領得到", async () => {
  resetDB();
  const r = await get({ "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15" });
  assert.equal(r.status, 302, "沒有 Sec-Fetch 標頭就被當成機器人 —— 這些客人會永遠領不到");
  assert.equal(r.headers.get("location"), LINK);
});

test("LINE 內建瀏覽器不可以被誤判成機器人", async () => {
  resetDB();
  const r = await get({
    "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Line/14.2.0",
    "sec-fetch-dest": "document",
  });
  assert.equal(r.status, 302);
  assert.ok(DB.usedAt);
});

test("Android WebView 的 LINE 一樣放行", async () => {
  resetDB();
  const r = await get({
    "user-agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36 Line/14.2.0",
    "sec-fetch-dest": "document", "sec-fetch-user": "?1",
  });
  assert.equal(r.status, 302);
});

/* ── automated fetches: never spend ───────────────────────────────── */

const NO_SPEND = [
  ["Chrome 預先載入", { ...TAP, "sec-purpose": "prefetch" }],
  ["prerender", { ...TAP, "sec-purpose": "prefetch;prerender" }],
  ["舊式 Purpose 標頭", { ...TAP, purpose: "prefetch" }],
  ["Safari 的 X-Purpose", { ...TAP, "x-purpose": "preview" }],
  ["Firefox 的 X-moz", { ...TAP, "x-moz": "prefetch" }],
  ["fetch() 而非導覽", { ...TAP, "sec-fetch-dest": "empty" }],
  ["當成圖片抓", { ...TAP, "sec-fetch-dest": "image" }],
  ["Facebook 預覽", { "user-agent": "facebookexternalhit/1.1" }],
  ["curl", { "user-agent": "curl/8.4.0" }],
  ["爬蟲", { "user-agent": "Mozilla/5.0 (compatible; SomeBot/2.1; +http://example.com/bot)" }],
  ["監測服務", { "user-agent": "Pingdom.com_bot_version_1.4" }],
];

for (const [name, headers] of NO_SPEND) {
  test(`${name} → 不消耗，改顯示領取按鈕`, async () => {
    resetDB();
    const r = await get(headers);
    const html = await r.text();
    assert.equal(r.status, 200);
    assert.equal(DB.usedAt, null, `${name} 把客人的 token 燒掉了`);
    assert.match(html, /method="POST"/, "應該給客人一顆可以按的按鈕");
    assert.doesNotMatch(html, new RegExp(LINK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      "券的連結不可以出現在頁面上");
  });
}

test("HEAD 不消耗", async () => {
  resetDB();
  const r = await fetch(`${base}/api/claim/${TOKEN}`, { method: "HEAD", headers: TAP, redirect: "manual" });
  assert.equal(DB.usedAt, null, "HEAD 竟然消耗了 token");
  assert.equal(r.status, 200);
});

test("完全沒有 User-Agent（掃描器）不消耗", async () => {
  resetDB();
  // undici always sends one, so blank it explicitly.
  const r = await get({ "user-agent": "" });
  assert.equal(r.status, 200);
  assert.equal(DB.usedAt, null);
});

test("被判定為自動之後，客人按按鈕仍然領得到", async () => {
  resetDB();
  await get({ ...TAP, "sec-purpose": "prefetch" });
  assert.equal(DB.usedAt, null);
  const r = await post();
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), LINK);
});

test("連打 5 次預先載入也燒不掉", async () => {
  resetDB();
  for (let i = 0; i < 5; i++) await get({ ...TAP, "sec-purpose": "prefetch" });
  assert.equal(DB.usedAt, null);
  assert.equal((await post()).status, 303);
});

/* ── spending exactly once ────────────────────────────────────────── */

test("第二次點擊擋下來，不會發第二張券", async () => {
  resetDB();
  await get();
  const r = await get();
  assert.equal(r.status, 200);
  assert.match(await r.text(), /已使用過/);
});

test("POST 兩次也只發一張", async () => {
  resetDB();
  assert.equal((await post()).status, 303);
  const r = await post();
  assert.equal(r.status, 200);
  assert.match(await r.text(), /已使用過/);
});

test("已使用過的 token，連自動請求也只看到「已使用過」", async () => {
  resetDB();
  DB.usedAt = new Date();
  const html = await (await get({ ...TAP, "sec-purpose": "prefetch" })).text();
  assert.match(html, /已使用過/);
  assert.doesNotMatch(html, /method="POST"/);
});

test("不存在的 token 跟已使用的看起來一樣", async () => {
  resetDB();
  const unknown = await (await get(TAP, "tok_does_not_exist")).text();
  DB.usedAt = new Date();
  const used = await (await get()).text();
  assert.equal(unknown, used, "兩者不同就能用來試出哪些 token 是真的");
});

test("獎項沒有券連結時給櫃檯領取頁", async () => {
  resetDB();
  DB.couponLink = null;
  const r = await get();
  assert.equal(r.status, 200);
  assert.match(await r.text(), /櫃檯/);
});

test("獎品名稱有做 HTML escape", async () => {
  resetDB();
  const html = await (await get({ ...TAP, "sec-purpose": "prefetch" })).text();
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /隨行瓶/);
});
