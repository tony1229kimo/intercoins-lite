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

/** 兩館的獎項共用同一個轉盤；差別在領獎方式（見 prizes.json 的 claim_mode）。 */
export const HOTEL_LABEL = { KH: "高雄洲際酒店", TPE: "臺北洲際酒店" };

export const TIER_LABEL = { 5: "一等獎", 3: "二等獎", 1: "三等獎" };
export const TIER_COST = { 5: 5, 3: 3, 1: 1 };
export const TIERS = [1, 3, 5];

export async function loadPrizeSeed() {
  const raw = await readFile(join(HERE, "prizes.json"), "utf8");
  return JSON.parse(raw);
}

/**
 * 把 prizes.json 匯入資料庫。**每次容器啟動都會跑**（server/index.js）。
 *
 * ⚠️ 2026-09-02 事故：原本 ON CONFLICT 會把 quota 與 weight 一起蓋回 seed 檔的值，
 *    結果後台改的名額與機率【每次部署都被還原】—— 而且完全沒有任何提示。
 *    當天把洲遊幣機率調成 0%、補回 44 個名額，20 分鐘後一次部署全部消失。
 *
 * 所以現在分成兩類欄位：
 *   目錄欄位（名稱／連結／等級／領獎方式…）→ 每次都以 prizes.json 為準
 *   營運欄位（quota / weight / visible / active）→ **只在第一次 INSERT 時設定**，
 *                                                  之後一律由後台 PATCH 管理
 *
 * 真的要用 seed 檔覆蓋營運值時（例如行銷重新給了一版獎項表），
 * 設環境變數 PRIZES_RESEED_OPS=1 再重新部署，跑完記得拿掉。
 */
export async function seedPrizes() {
  const seed = await loadPrizeSeed();
  if (!seed.length) {
    console.warn("[prizes] seed 檔是空的，跳過匯入");
    return 0;
  }

  // 營運欄位預設【不覆蓋】，避免部署把後台調好的名額與機率洗掉。
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

  // seed 裡沒有的獎項 → 下架（例如行銷把某一格拿掉了），但保留歷史紀錄。
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
