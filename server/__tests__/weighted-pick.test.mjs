/**
 * weightedPick 的分母行為。
 *
 * 2026-09-02：行銷要「二等獎每個獎品 4%、其餘 80% 不中獎」。
 * 舊的 weightedPick 是對【權重總和】抽，所以 5 個各 4% 會被正規化成各 20% ——
 * 設定看起來對，實際效果完全不同，而且從外面看不出來。
 *
 * 現在 outOf:100 是對固定分母抽，缺口才是真正的「沒中獎」。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { weightedPick } from "../lib/random.js";

const N = 200_000;

/** 跑 N 次，回傳每個 id 的實際命中率（%），null 記成 __miss。 */
function simulate(items, opts) {
  const hit = { __miss: 0 };
  for (let i = 0; i < N; i++) {
    const p = weightedPick(items, opts);
    const k = p ? p.id : "__miss";
    hit[k] = (hit[k] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(hit).map(([k, v]) => [k, (v / N) * 100]));
}

const near = (actual, expected, tol = 0.6) =>
  assert.ok(Math.abs(actual - expected) < tol,
    `期望 ${expected}% 左右，實際 ${actual.toFixed(2)}%`);

test("預設（不給 outOf）＝ 對權重總和抽，一定會中一個", () => {
  const items = [{ id: "a", weight: 4 }, { id: "b", weight: 4 }, { id: "c", weight: 4 }];
  const r = simulate(items);
  assert.equal(r.__miss || 0, 0, "沒給 outOf 就不該出現未中獎");
  near(r.a, 33.33);
});

test("outOf:100 —— 二等獎的實際情境：5 項各 4%，其餘 80% 不中獎", () => {
  const items = ["a", "b", "c", "d", "e"].map((id) => ({ id, weight: 4 }));
  const r = simulate(items, { outOf: 100 });
  for (const id of ["a", "b", "c", "d", "e"]) near(r[id], 4);
  near(r.__miss, 80);
});

test("outOf:100 —— 三等獎的實際情境：6 項平分 100%，不會有未中獎", () => {
  const w = 100 / 6;
  const items = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, weight: w }));
  const r = simulate(items, { outOf: 100 });
  assert.ok((r.__miss || 0) < 0.2, `平分滿 100% 不該有未中獎，實際 ${(r.__miss || 0).toFixed(2)}%`);
  near(r.a, w);
});

test("洲遊幣 weight=0 就抽不到", () => {
  const items = [{ id: "coin", weight: 0 }, { id: "a", weight: 50 }, { id: "b", weight: 50 }];
  const r = simulate(items, { outOf: 100 });
  assert.equal(r.coin || 0, 0, "weight 0 的獎項不可以被抽到");
});

test("權重總和超過 100 時退回按比例抽，不會讓後面的項目抽不到", () => {
  const items = [{ id: "a", weight: 80 }, { id: "b", weight: 80 }];
  const r = simulate(items, { outOf: 100 });
  assert.equal(r.__miss || 0, 0);
  near(r.a, 50);
  near(r.b, 50);
});

test("池子全是 0 權重 → null（呼叫端要當成「獎發完了」，不扣幣）", () => {
  assert.equal(weightedPick([{ id: "a", weight: 0 }], { outOf: 100 }), null);
  assert.equal(weightedPick([], { outOf: 100 }), null);
});
