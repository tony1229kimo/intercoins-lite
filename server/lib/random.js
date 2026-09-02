import { randomInt, randomBytes } from "node:crypto";

/**
 * 加權隨機。用 CSPRNG 而不是 Math.random —— 這是真的抽獎，要經得起檢視。
 * items 需含數字 weight；回傳被選中的 item。
 */
/**
 * 依權重抽一個。
 *
 * @param items  每個元素要有 weight（單位：百分點）
 * @param outOf  抽獎的分母。
 *               null（預設）＝ 對權重總和抽 —— 池子裡一定會中一個（舊行為）
 *               100          ＝ 對 100 抽 —— **權重總和不足 100 的缺口就是「沒中獎」**，
 *                              此時回傳 null。行銷用這個缺口控制發獎速度。
 *
 * ⚠️ 回傳 null 有兩種意思，呼叫端要分清楚：
 *      池子是空的（獎發完了）→ 不該扣客人的幣
 *      抽到缺口（機率性未中獎）→ **要扣幣**，否則客人可以無限重抽直到中獎
 */
export function weightedPick(items, { outOf = null } = {}) {
  const weights = items.map((i) => Number(i.weight) || 0);
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return null;

  // 權重可能是小數（例如 0.3）→ 放大成整數再抽，避免浮點誤差。
  const SCALE = 1_000_000;
  const scaled = weights.map((w) => Math.round(w * SCALE));
  const scaledTotal = scaled.reduce((s, w) => s + w, 0);
  if (scaledTotal <= 0) return null;

  // outOf=100 時對固定分母抽；權重已經超過 100 就退回按比例抽，
  // 免得行銷不小心把總和設超過 100 反而讓最後幾項抽不到。
  const denom = outOf && outOf * SCALE > scaledTotal ? outOf * SCALE : scaledTotal;

  let r = randomInt(denom);
  for (let i = 0; i < items.length; i++) {
    r -= scaled[i];
    if (r < 0) return items[i];
  }
  // 落在權重缺口 → 這次沒中獎（只有 outOf 模式才可能走到這裡）。
  // ⚠️ 不可以 fallthrough 回傳最後一項 —— 那會讓最後那個獎品把整個缺口吃掉。
  //    2026-09-02 第一版就是這樣寫，測試跑出「玫果沁釀 84%」才發現。
  return outOf ? null : items[items.length - 1];
}

// 去掉容易看錯的 0/O/1/I
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** 兌換碼 IC-XXXX-XXXX，給櫃檯人工核對用。 */
export function makeCode() {
  const pick = () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  const block = () => Array.from({ length: 4 }, pick).join("");
  return `IC-${block()}-${block()}`;
}

/** 單次有效領取 token。 */
export function makeClaimToken() {
  return randomBytes(24).toString("base64url");
}
