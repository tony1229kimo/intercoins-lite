/**
 * 每人實體獎上限（MAX_PHYSICAL_WINS，預設 2）。
 *
 * 這條規則有兩個都很貴的失敗方向，所以兩邊都要測：
 *   擋太少 → 一個人抱走 8 件實體獎，132 份獎品 4 個人就清空
 *   擋太多 → 客人一進來就被鎖住不能玩（比不擋還糟）
 */
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

  DB.draws.push({ coin_reward: 0 });          // 湊到上限
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
