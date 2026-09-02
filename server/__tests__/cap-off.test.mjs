/**
 * 每人實體獎上限 —— **預設（未設環境變數）** 的行為：不擋。
 *
 * Tony 2026-09-02 決定關掉上限（洲遊幣設 0% 之後退幣循環沒了，
 * 每人 8 枚幣自然封頂，三等獎還有 78 個名額）。
 *
 * 這個檔案守住兩件事：
 *   1. 沒設環境變數 = 不擋（預設值不能哪天被人改回 2 卻沒人發現）
 *   2. 設 0 這個逃生門真的有效 —— 上限設錯把客人全鎖住時要靠它救
 *
 * ⚠️ 常數是 module load 時讀的 → env 一定要在 startApp() 之前處理好，
 *    也因此不能跟 cap.test.mjs 放同一個檔（同一個 process 只會 load 一次）。
 */
// 不設 env —— 這裡測的就是【預設值】。Tony 2026-09-02 把預設改成不限，
// 所以「沒設環境變數」必須等於「不擋」，這是這個檔案要守住的事。
delete process.env.MAX_PHYSICAL_WINS;

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DB, resetDB, startApp } from "./_harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(() => app?.close());

test("預設（未設環境變數）之下，已中 5 件仍然可以繼續抽", async () => {
  resetDB();
  DB.draws.push(...Array.from({ length: 5 }, () => ({ coin_reward: 0 })));
  const r = await app.post("/api/spin", { tier: 1 });
  assert.equal(r.status, 200);
  assert.ok(!r.json.capReached, "上限關掉了就不該擋");
  assert.equal(r.json.prize, "測試實體獎");
});

test("預設（未設環境變數）之下，/api/state 的 maxPhysicalWins 回 0（前端據此不停用按鈕）", async () => {
  resetDB();
  const r = await app.get("/api/state");
  assert.equal(r.json.maxPhysicalWins, 0);
});
