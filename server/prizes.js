/**
 * Prize import.
 *
 * The source of truth is the prize table supplied by marketing, converted by
 * scripts/import-prizes.py into server/prizes.kh.json and written to the database
 * from here.
 *
 * Weighting rule: the source table carries no odds column, so weight follows the
 * quota. Within a tier, the more units a prize has the more often it comes up,
 * and stock drains evenly. If marketing later supplies explicit weights, edit the
 * JSON and re-run; no code change is needed.
 *
 * issued is deliberately never overwritten by an import, so re-running one cannot
 * reset what has already gone out.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { query } from "./db.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Both hotels share one wheel; they differ in how a prize is claimed (see claim_mode in prizes.json). */
export const HOTEL_LABEL = { KH: "高雄洲際酒店", TPE: "臺北洲際酒店" };

export const TIER_LABEL = { 5: "一等獎", 3: "二等獎", 1: "三等獎" };
export const TIER_COST = { 5: 5, 3: 3, 1: 1 };
export const TIERS = [1, 3, 5];

export async function loadPrizeSeed() {
  const raw = await readFile(join(HERE, "prizes.json"), "utf8");
  return JSON.parse(raw);
}

/**
 * Import prizes.json into the database. This runs on every container start.
 *
 * 2026-09-02 incident: ON CONFLICT used to write quota and weight back to the
 * seed values, so anything changed in the admin panel was silently reverted by
 * every deploy, with no warning at all. Settings adjusted that day were gone
 * twenty minutes later, taken out by one deploy.
 *
 * So the columns are now in two groups:
 *   catalogue (name, link, tier, claim mode, ...)  follows prizes.json every time
 *   operational (quota, weight, visible, active)   set on the first INSERT only,
 *                                                  and managed by the admin panel
 *                                                  from then on
 *
 * To genuinely overwrite the operational values from the seed file -- a new prize
 * table from marketing, say -- set PRIZES_RESEED_OPS=1, redeploy, and remember to
 * take it off again afterwards.
 */
export async function seedPrizes() {
  const seed = await loadPrizeSeed();
  if (!seed.length) {
    console.warn("[prizes] seed 檔是空的，跳過匯入");
    return 0;
  }

  // Operational columns are left alone by default, so a deploy cannot wipe what was set in the admin panel.
  const RESEED_OPS = process.env.PRIZES_RESEED_OPS === "1";
  if (RESEED_OPS) {
    console.warn("[prizes] ⚠️ PRIZES_RESEED_OPS=1 —— 這次會用 seed 檔覆蓋 quota 與 weight");
  }

  for (const p of seed) {
    await query(
      `INSERT INTO prizes
         (id, hotel, tier, slot, position, name, claim_mode, coupon_link, coin_reward,
          quota, weight, spend_threshold, terms, expiry_note, is_consolation, visible, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true,true)
       ON CONFLICT (id) DO UPDATE SET
         hotel           = EXCLUDED.hotel,
         tier            = EXCLUDED.tier,
         slot            = EXCLUDED.slot,
         position        = EXCLUDED.position,
         name            = EXCLUDED.name,
         claim_mode      = EXCLUDED.claim_mode,
         coupon_link     = EXCLUDED.coupon_link,
         coin_reward     = EXCLUDED.coin_reward,
         spend_threshold = EXCLUDED.spend_threshold,
         terms           = EXCLUDED.terms,
         expiry_note     = EXCLUDED.expiry_note,
         is_consolation  = EXCLUDED.is_consolation,
         ${RESEED_OPS ? "quota = EXCLUDED.quota, weight = EXCLUDED.weight," : ""}
         updated_at      = now()`,
      [p.id, p.hotel, p.tier, p.slot, p.position ?? 0, p.name, p.claim_mode ?? "coupon",
       p.coupon_link, p.coin_reward, p.quota, p.weight, p.spend_threshold,
       p.terms, p.expiry_note, p.is_consolation === true],
    );
  }

  // A prize missing from the seed is deactivated rather than deleted, so its history survives.
  const ids = seed.map((p) => p.id);
  const { rowCount } = await query(
    `UPDATE prizes SET active = false, updated_at = now()
      WHERE active = true AND NOT (id = ANY($1::text[]))`,
    [ids],
  );
  if (rowCount) console.warn(`[prizes] ${rowCount} 個獎項不在 seed 中，已自動下架`);

  console.log(`[prizes] 匯入 ${seed.length} 個獎項`
    + (RESEED_OPS ? "（含 quota/weight 覆蓋）" : "（quota/weight 維持資料庫現值）"));
  return seed.length;
}
