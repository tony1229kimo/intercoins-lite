/**
 * MAX_PHYSICAL_WINS=0 = 關掉上限。
 *
 * 這是緊急逃生門：真的出事（例如上限設錯把客人全鎖住）時，Tony 會去 Zeabur
 * 把這個變數設成 0 再重新部署。所以它必須真的有效，不能只是「看起來會關」。
 *
 * ⚠️ 這個常數是 module load 時讀的 → env 一定要在 startApp() 之前設好，
 *    也因此不能跟 cap.test.mjs 放同一個檔（同一個 process 只會 load 一次）。
 */
process.env.MAX_PHYSICAL_WINS = "0";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DB, resetDB, startApp } from "./_harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(() => app?.close());

test("設 0 之後，已中 5 件仍然可以繼續抽", async () => {
  resetDB();
  DB.draws.push(...Array.from({ length: 5 }, () => ({ coin_reward: 0 })));
  const r = await app.post("/api/spin", { tier: 1 });
  assert.equal(r.status, 200);
  assert.ok(!r.json.capReached, "上限關掉了就不該擋");
  assert.equal(r.json.prize, "測試實體獎");
});

test("設 0 之後，/api/state 的 maxPhysicalWins 回 0（前端據此不停用按鈕）", async () => {
  resetDB();
  const r = await app.get("/api/state");
  assert.equal(r.json.maxPhysicalWins, 0);
});
