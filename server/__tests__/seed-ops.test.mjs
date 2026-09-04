/**
 * seedPrizes must not overwrite the operational columns unconditionally.
 *
 * 2026-09-02 incident: seedPrizes() runs on every container start, and its
 * ON CONFLICT clause wrote quota and weight back to the values in prizes.json.
 * Settings adjusted in the admin panel that day were gone twenty minutes later,
 * taken out by a single deploy, with no warning at all.
 *
 * The rule:
 *   catalogue (name, link, tier, claim mode) follows prizes.json every time
 *   operational (quota, weight, visible, active) is set on INSERT only, and
 *   managed from the admin panel afterwards
 *   to overwrite deliberately, set PRIZES_RESEED_OPS=1 -- an explicit escape hatch
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = readFileSync(path.join(import.meta.dirname, "..", "prizes.js"), "utf8");

// the ON CONFLICT ... DO UPDATE clause
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
