/**
 * seedPrizes 不可以無條件覆蓋營運欄位。
 *
 * 2026-09-02 事故：seedPrizes() 每次容器啟動都跑，而 ON CONFLICT 會把
 * quota 與 weight 蓋回 prizes.json 的值。結果當天在後台把洲遊幣機率調成 0%、
 * 補回 44 個名額，20 分鐘後一次部署就全部消失，而且完全沒有任何提示。
 *
 * 規則：
 *   目錄欄位（名稱／連結／等級／領獎方式）→ 每次以 prizes.json 為準
 *   營運欄位（quota / weight / visible / active）→ 只在 INSERT 時設，之後由後台管理
 *   要覆蓋 → 設 PRIZES_RESEED_OPS=1（明示的逃生門）
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = readFileSync(path.join(import.meta.dirname, "..", "prizes.js"), "utf8");

// ON CONFLICT ... DO UPDATE 的那一段
const conflict = SRC.slice(
  SRC.indexOf("ON CONFLICT (id) DO UPDATE"),
  SRC.indexOf("updated_at      = now()"),
);

for (const col of ["quota", "weight"]) {
  test(`seedPrizes 不可以無條件覆蓋 ${col}`, () => {
    const lines = conflict.split("\n").filter((l) => new RegExp(`\\b${col}\\s*=`).test(l));
    for (const l of lines) {
      assert.match(
        l, /RESEED_OPS/,
        `seedPrizes 的 ON CONFLICT 直接覆蓋了 ${col}：${l.trim()}\n` +
          `這會讓每一次部署都把後台調好的營運值洗掉（2026-09-02 就這樣沒了）。` +
          `要覆蓋請走 PRIZES_RESEED_OPS=1。`,
      );
    }
  });
}

test("逃生門還在：PRIZES_RESEED_OPS=1 可以覆蓋", () => {
  assert.match(SRC, /PRIZES_RESEED_OPS\s*===\s*"1"/, "少了明示覆蓋的環境變數");
  assert.match(conflict, /RESEED_OPS\s*\?/, "ON CONFLICT 裡少了 RESEED_OPS 的條件分支");
});

test("visible / active 本來就不該出現在 ON CONFLICT", () => {
  for (const col of ["visible", "active"]) {
    assert.ok(
      !new RegExp(`\\b${col}\\s*=\\s*EXCLUDED`).test(conflict),
      `${col} 不該被 seed 覆蓋 —— 那是後台用來上下架的開關`,
    );
  }
});
