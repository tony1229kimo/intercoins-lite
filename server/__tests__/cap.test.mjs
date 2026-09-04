/**
 * Per-person physical-prize limit (MAX_PHYSICAL_WINS): behaviour when it is ON.
 *
 * The default has been 0, meaning no limit, since 2026-09-02, so this file turns
 * it on explicitly. The mechanism is kept because it may be needed again -- a
 * refund loop reappearing, or prizes being swept.
 *
 * When it is on, both directions of failure are expensive, so both are tested:
 *   blocking too little  one person walks off with a pile of physical prizes
 *   blocking too much    guests are locked out on arrival, which is worse than
 *                        not having the limit at all
 */
// The default is now no limit, so this file has to turn the limit ON to see any blocking at all.
// The environment has to be set before startApp(): the constant is read at module load.
process.env.MAX_PHYSICAL_WINS = "2";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DB, resetDB, startApp } from "./_harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(() => app?.close());

test("預設上限 2：前兩次正常中獎", async () => {
  resetDB();
  for (const n of [1, 2]) {
    const r = await app.post("/api/spin", { tier: 1 });
    assert.equal(r.status, 200);
    assert.ok(!r.json.capReached, `第 ${n} 次不該被擋 —— 擋太多等於把客人鎖在門外`);
    assert.equal(r.json.prize, "測試實體獎");
  }
  assert.equal(DB.player.balance, 6, "兩次各扣 1 枚");
  assert.equal(DB.draws.length, 2);
});

test("第 3 次被擋，且不扣幣、不開獎、不扣庫存", async () => {
  resetDB();
  await app.post("/api/spin", { tier: 1 });
  await app.post("/api/spin", { tier: 1 });

  const balanceBefore = DB.player.balance;
  const issuedBefore = DB.prize.issued;
  const r = await app.post("/api/spin", { tier: 1 });

  assert.equal(r.status, 200, "被擋是正常結果不是錯誤，要回 200");
  assert.equal(r.json.capReached, true);
  assert.equal(r.json.wins, 2);
  assert.equal(r.json.maxPhysicalWins, 2);
  assert.equal(r.json.costCharged, 0);
  assert.equal(DB.player.balance, balanceBefore, "被擋不可以扣客人的洲遊幣");
  assert.equal(DB.draws.length, 2, "不可以寫入新的中獎紀錄");
  assert.equal(DB.prize.issued, issuedBefore, "不可以扣獎品庫存");
});

test("洲遊幣獎不計入上限", async () => {
  resetDB();
  DB.draws.push({ coin_reward: 1 }, { coin_reward: 3 }, { coin_reward: 5 });
  const r = await app.post("/api/spin", { tier: 1 });
  assert.ok(!r.json.capReached, "洲遊幣是退幣不是獎品，不該吃掉中獎額度");
});

test("待聯繫類（contact）的獎也計入上限，且推播要帶對飯店", async () => {
  resetDB();
  DB.prize.claim_mode = "contact";
  DB.prize.hotel = "TPE";
  DB.prize.name = "臺北洲際酒店 豪華經典房";

  const r = await app.post("/api/spin", { tier: 1 });
  assert.equal(r.json.claimMode, "contact");
  assert.equal(DB.pushes.length, 1);
  assert.equal(DB.pushes[0].prizeHotel, "TPE",
    "prizeHotel 沒帶到的話，客人收到的 LINE 訊息會寫「本酒店」而不是館別名");

  DB.draws.push({ coin_reward: 0 });          // reach the limit
  const blocked = await app.post("/api/spin", { tier: 1 });
  assert.equal(blocked.json.capReached, true, "住宿大獎也要算進上限");
});

test("/api/state 會吐 physicalWins 與 maxPhysicalWins", async () => {
  resetDB();
  DB.draws.push({ coin_reward: 0 });
  const r = await app.get("/api/state");
  assert.equal(r.status, 200);
  assert.equal(r.json.physicalWins, 1);
  assert.equal(r.json.maxPhysicalWins, 2);
});
