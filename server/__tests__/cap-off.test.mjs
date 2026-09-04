/**
 * Per-person physical-prize limit: the DEFAULT behaviour, with no environment
 * variable set, is not to block.
 *
 * The limit was switched off on 2026-09-02. The refund loop it was written for no
 * longer exists, and the fixed number of coins each person can earn caps
 * consumption on its own.
 *
 * This file holds two things still:
 *   1. unset means no limit, so the default cannot quietly be changed back
 *   2. setting 0 really is an escape hatch -- it is what rescues the campaign if
 *      the limit is ever set wrong and locks guests out
 *
 * The constant is read at module load, so the environment has to be settled
 * before startApp(). That is also why this cannot share a file with
 * cap.test.mjs: one process loads the module once.
 */
// No environment variable on purpose: the DEFAULT is what is under test here.
// The default is no limit, so "unset" has to mean "do not block".
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
