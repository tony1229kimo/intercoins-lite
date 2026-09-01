import { randomInt, randomBytes } from "node:crypto";

/**
 * 加權隨機。用 CSPRNG 而不是 Math.random —— 這是真的抽獎，要經得起檢視。
 * items 需含數字 weight；回傳被選中的 item。
 */
export function weightedPick(items) {
  const weights = items.map((i) => Number(i.weight) || 0);
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return null;

  // 權重可能是小數（例如 0.3）→ 放大成整數再抽，避免浮點誤差。
  const SCALE = 1_000_000;
  const scaled = weights.map((w) => Math.round(w * SCALE));
  const scaledTotal = scaled.reduce((s, w) => s + w, 0);
  if (scaledTotal <= 0) return null;

  let r = randomInt(scaledTotal);
  for (let i = 0; i < items.length; i++) {
    r -= scaled[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
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
