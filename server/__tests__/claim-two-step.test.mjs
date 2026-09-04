/**
 * Collecting a prize must not be spendable by a GET.
 *
 * 2026-09-04: a guest won a prize and could not reach the voucher. The claim
 * link was a GET that consumed the single-use token on the spot, so anything
 * that merely touched the URL -- a link preview, a security scanner, a browser
 * prefetch -- burned it, and the guest's own first tap was told the link had
 * already been used.
 *
 * The rule this file holds: a GET may render, and only a POST may spend. That
 * is what makes the flow safe against anything that fetches URLs on its own,
 * because nothing does that with POST.
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

/** One draw row, plus a switch for the missing-link case. */
const DB = { usedAt: null, couponLink: LINK, exists: true };

function resetDB() {
  DB.usedAt = null;
  DB.couponLink = LINK;
  DB.exists = true;
}

function run(sql, params) {
  const q = sql.replace(/\s+/g, " ").trim();

  if (q.startsWith("SELECT d.prize_name, d.claim_used_at")) {
    if (!DB.exists || params[0] !== TOKEN) return { rows: [] };
    return { rows: [{ prize_name: "高雄洲際酒店 天然楠竹不鏽鋼環保隨行瓶", claim_used_at: DB.usedAt, expiry_note: "請於活動期間內使用" }] };
  }
  if (q.startsWith("UPDATE draws SET claim_used_at")) {
    if (!DB.exists || params[0] !== TOKEN || DB.usedAt) return { rows: [] };
    DB.usedAt = new Date();
    return { rows: [{ prize_id: "kh-1-5", prize_name: "高雄洲際酒店 天然楠竹不鏽鋼環保隨行瓶" }] };
  }
  if (q.startsWith("SELECT coupon_link")) {
    return { rows: [{ coupon_link: DB.couponLink }] };
  }
  throw new Error("假 DB 沒有對應的查詢：" + q.slice(0, 90));
}

mock.module(url("db.js"), {
  exports: { query: async (sql, params) => run(sql, params) },
});

const { default: router } = await import(url("routes/claim.js"));
const app = express();
app.use("/api/claim", router);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
// unref, or the open socket keeps the test runner alive after the last test.
server.unref();

const get = (t) => fetch(`${base}/api/claim/${t}`, { redirect: "manual" });
const post = (t) => fetch(`${base}/api/claim/${t}`, { method: "POST", redirect: "manual" });

test("GET 不會消耗 token，只會顯示領取頁", async () => {
  resetDB();
  const r = await get(TOKEN);
  const html = await r.text();

  assert.equal(r.status, 200);
  assert.equal(DB.usedAt, null, "GET 竟然把 token 用掉了");
  assert.match(html, /method="POST"/, "領取頁應該用 POST 表單");
  assert.match(html, /隨行瓶/, "領取頁應該顯示獎品名稱");
  assert.doesNotMatch(html, new RegExp(LINK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    "券的連結不可以出現在頁面上 —— 出現了就等於可以無限領");
});

test("預覽 / 掃描器連打 GET 也不會燒掉，客人之後仍領得到", async () => {
  resetDB();
  for (let i = 0; i < 5; i++) await get(TOKEN);
  assert.equal(DB.usedAt, null, "連續 GET 之後 token 就不見了");

  const r = await post(TOKEN);
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), LINK);
});

test("POST 才會消耗，並且轉去券的連結", async () => {
  resetDB();
  const r = await post(TOKEN);
  assert.equal(r.status, 303, "要用 303，這樣按上一頁不會重送表單");
  assert.equal(r.headers.get("location"), LINK);
  assert.ok(DB.usedAt, "POST 之後 token 應該被標記使用");
});

test("第二次 POST 擋下來，不會發第二張券", async () => {
  resetDB();
  await post(TOKEN);
  const r = await post(TOKEN);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /已使用過/);
});

test("已使用過的 token，GET 直接顯示已使用", async () => {
  resetDB();
  DB.usedAt = new Date();
  const html = await (await get(TOKEN)).text();
  assert.match(html, /已使用過/);
  assert.doesNotMatch(html, /method="POST"/, "已使用的券不該再給領取按鈕");
});

test("不存在的 token 跟已使用的看起來一樣（不洩漏 token 是否存在）", async () => {
  resetDB();
  const unknown = await (await get("tok_does_not_exist")).text();
  DB.usedAt = new Date();
  const used = await (await get(TOKEN)).text();
  assert.equal(unknown, used, "兩者畫面不同的話，就能用來試出哪些 token 是真的");
});

test("獎項沒有券連結時，POST 給櫃檯領取頁而不是壞掉", async () => {
  resetDB();
  DB.couponLink = null;
  const r = await post(TOKEN);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /櫃檯/);
});

test("領取頁把獎品名稱做 HTML escape", async () => {
  resetDB();
  const r = await get(TOKEN);
  const html = await r.text();
  // 名稱來自資料庫，直接內插會變成注入點。
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /隨行瓶/);
});
