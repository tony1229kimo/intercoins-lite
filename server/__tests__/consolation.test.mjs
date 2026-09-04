/**
 * 安慰獎（85 折餐飲優惠）取代「銘謝惠顧」。Tony 2026-09-04。
 *
 * 承諾很簡單：**只要池子裡有安慰獎，客人就不可能空手而回。**
 * 這條承諾要靠測試守住，因為它有兩個都很難用眼睛看出來的破口：
 *   1. 權重加起來不到 100 時，缺口原本會變成銘謝惠顧
 *   2. 其他獎品發完後，池子只剩安慰獎，權重也不到 100
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DB, resetDB, startApp } from "./_harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(() => app?.close());

/** 讓假 DB 回傳一整池獎品（harness 預設只有一件）。 */
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
