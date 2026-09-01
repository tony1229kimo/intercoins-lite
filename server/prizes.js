/**
 * 獎項匯入。
 *
 * 真相來源是行銷提供的「獎項一覽表.xlsx」，用 scripts/import-prizes.py 轉成
 * server/prizes.kh.json，這裡再寫進 DB。
 *
 * 機率規則（Tony 2026-09-01 拍板）：Excel 沒有機率欄，權重 = 名額。
 * 也就是同一等級內，名額越多越容易抽中，庫存會均勻消耗完。
 * 之後行銷若給了明確機率，改 JSON 的 weight 重跑即可，程式不用動。
 *
 * ⚠️ issued（已發出數）刻意【不】被匯入覆蓋 —— 重跑匯入不會把已發出的獎品歸零。
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { query } from "./db.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/** 本階段只開放高雄。臺北待開幕後另行公告（Tony 2026-09-01）。 */
export const ACTIVE_HOTELS = ["KH"];

export const TIER_LABEL = { 5: "一等獎", 3: "二等獎", 1: "三等獎" };
export const TIER_COST = { 5: 5, 3: 3, 1: 1 };
export const TIERS = [1, 3, 5];

export async function loadPrizeSeed() {
  const all = [];
  for (const hotel of ACTIVE_HOTELS) {
    const raw = await readFile(join(HERE, `prizes.${hotel.toLowerCase()}.json`), "utf8");
    all.push(...JSON.parse(raw));
  }
  return all;
}

export async function seedPrizes() {
  const seed = await loadPrizeSeed();
  if (!seed.length) {
    console.warn("[prizes] seed 檔是空的，跳過匯入");
    return 0;
  }

  for (const p of seed) {
    await query(
      `INSERT INTO prizes
         (id, hotel, tier, slot, name, coupon_link, coin_reward, quota,
          weight, spend_threshold, terms, expiry_note, owner, visible, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,true)
       ON CONFLICT (id) DO UPDATE SET
         hotel           = EXCLUDED.hotel,
         tier            = EXCLUDED.tier,
         slot            = EXCLUDED.slot,
         name            = EXCLUDED.name,
         coupon_link     = EXCLUDED.coupon_link,
         coin_reward     = EXCLUDED.coin_reward,
         quota           = EXCLUDED.quota,
         weight          = EXCLUDED.weight,
         spend_threshold = EXCLUDED.spend_threshold,
         terms           = EXCLUDED.terms,
         expiry_note     = EXCLUDED.expiry_note,
         owner           = EXCLUDED.owner,
         updated_at      = now()`,
      [p.id, p.hotel, p.tier, p.slot, p.name, p.coupon_link, p.coin_reward,
       p.quota, p.weight, p.spend_threshold, p.terms, p.expiry_note, p.owner],
    );
  }

  // seed 裡沒有的獎項 → 下架（例如行銷把某一格拿掉了），但保留歷史紀錄。
  const ids = seed.map((p) => p.id);
  const { rowCount } = await query(
    `UPDATE prizes SET active = false, updated_at = now()
      WHERE active = true AND NOT (id = ANY($1::text[]))`,
    [ids],
  );
  if (rowCount) console.warn(`[prizes] ${rowCount} 個獎項不在 seed 中，已自動下架`);

  console.log(`[prizes] 匯入 ${seed.length} 個獎項`);
  return seed.length;
}
