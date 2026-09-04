/**
 * The consolation prize replaces the old empty-handed result.
 *
 * The promise is simple: while a consolation prize is in the pool, nobody can
 * leave with nothing. It needs a test to hold it, because it has two failure
 * modes that are very hard to see by reading:
 *   1. when the weights do not fill the denominator, the shortfall used to be an
 *      empty-handed result
 *   2. once the other prizes have gone, the pool holds only the consolation one,
 *      whose weight also does not fill the denominator
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DB, resetDB, startApp } from "./_harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(() => app?.close());

/** Make the fake database return a whole pool; the harness returns a single prize by default. */
function setPool(rows) {
  DB.pool = rows;
}

test("權重只有 50% 時，另外 50% 也要給安慰獎，不能是銘謝惠顧", async () => {
  resetDB({ balance: 60 });
  DB.pool = [
    { ...DB.prize, id: "kh-1-3", name: "洲賀熊", weight: 25, quota: 100, issued: 0 },
    { ...DB.prize, id: "kh-consol-1", name: "高雄洲際酒店 餐飲 85 折優惠禮遇",
      weight: 50, quota: 0, issued: 0, is_consolation: true },
  ];
  const seen = {};
  for (let i = 0; i < 40; i++) {
    const r = await app.post("/api/spin", { tier: 1 });
    assert.ok(!r.json.soldOut, "有安慰獎在池子裡就不該出現銘謝惠顧");
    seen[r.json.prize] = (seen[r.json.prize] || 0) + 1;
  }
  assert.ok(seen["高雄洲際酒店 餐飲 85 折優惠禮遇"] > 0, "應該抽得到安慰獎");
  assert.ok(seen["洲賀熊"] > 0, "也應該抽得到真正的獎品");
});

test("其他獎品都發完 → 100% 安慰獎，而且不限量", async () => {
  resetDB({ balance: 40 });
  DB.pool = [
    { ...DB.prize, id: "kh-consol-3", name: "高雄洲際酒店 餐飲 85 折優惠禮遇",
      weight: 100, quota: 0, issued: 0, is_consolation: true },
  ];
  for (let i = 0; i < 12; i++) {
    const r = await app.post("/api/spin", { tier: 3 });
    assert.equal(r.json.prize, "高雄洲際酒店 餐飲 85 折優惠禮遇");
    assert.ok(!r.json.soldOut);
  }
  assert.equal(DB.player.balance, 40 - 12 * 3, "每抽都要扣 3 枚");
  assert.equal(DB.draws.length, 12, "quota=0 是不限量，12 次都要開得出來");
});

test("安慰獎即使 visible=false 也抽得到（二等／一等不列在獎項一覽裡）", async () => {
  resetDB({ balance: 10 });
  DB.pool = [
    { ...DB.prize, id: "kh-consol-5", name: "高雄洲際酒店 餐飲 85 折優惠禮遇",
      weight: 100, quota: 0, issued: 0, is_consolation: true, visible: false },
  ];
  const r = await app.post("/api/spin", { tier: 5 });
  assert.equal(r.json.prize, "高雄洲際酒店 餐飲 85 折優惠禮遇");
  assert.equal(r.json.costCharged ?? 5, 5);
});

test("連安慰獎都沒有 → 還是銘謝惠顧並扣幣（安全網沒被拆掉）", async () => {
  resetDB({ balance: 8 });
  DB.pool = [];
  const r = await app.post("/api/spin", { tier: 1 });
  assert.equal(r.json.soldOut, true);
  assert.equal(r.json.costCharged, 1);
});
