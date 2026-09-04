/**
 * 銘謝惠顧要扣洲遊幣（Tony 2026-09-04）。
 *
 * 這條規則會動到客人的錢包，所以兩種情況都要測：
 *   soldOut  該等級一件獎品都沒有  → 扣幣
 *   missed   有獎但這次沒抽中      → 扣幣
 *
 * 背景：原本兩種都不扣。公司後來決定要有銘謝惠顧機制、前台會對客人說明，
 * 同時三等獎維持 100% 必中（洲賀熊 / 旅行外幣收納錢包），客人一定拿得到東西。
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DB, resetDB, startApp } from "./_harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(() => app?.close());

test("該等級一件獎品都沒有 → 銘謝惠顧，而且要扣幣", async () => {
  resetDB({ balance: 8 });
  DB.prize = null;                       // 池子是空的

  const r = await app.post("/api/spin", { tier: 1 });
  assert.equal(r.status, 200, "銘謝惠顧是正常結果，不是錯誤");
  assert.equal(r.json.soldOut, true);
  assert.equal(r.json.prize, "銘謝惠顧");
  assert.equal(r.json.costCharged, 1, "要扣 1 枚");
  assert.equal(r.json.balance, 7);
  assert.equal(DB.player.balance, 7, "餘額真的要少 1 枚");
  assert.equal(DB.draws.length, 0, "沒中獎就不該有中獎紀錄");
});

test("一等獎沒庫存 → 扣 5 枚（等級成本要對）", async () => {
  resetDB({ balance: 8 });
  DB.prize = null;
  const r = await app.post("/api/spin", { tier: 5 });
  assert.equal(r.json.costCharged, 5);
  assert.equal(DB.player.balance, 3);
});

test("有獎但沒抽中（權重缺口）→ 也要扣幣", async () => {
  resetDB({ balance: 50 });
  DB.prize.weight = 1;                   // 1% 中獎、99% 沒中
  let missed = 0, won = 0;
  for (let i = 0; i < 8; i++) {
    const r = await app.post("/api/spin", { tier: 1 });
    if (r.json.missed) missed++; else won++;
  }
  assert.ok(missed > 0, "1% 中獎率抽 8 次不可能次次都中");
  assert.equal(DB.player.balance, 50 - 8, "不管中沒中，8 次都要各扣 1 枚");
});

test("洲遊幣不夠時仍然擋在前面，不會扣成負的", async () => {
  resetDB({ balance: 0 });
  DB.prize = null;
  const r = await app.post("/api/spin", { tier: 1 });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, "insufficient_coins");
  assert.equal(DB.player.balance, 0);
});
