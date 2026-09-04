import { randomInt, randomBytes } from "node:crypto";

/**
 * Weighted random choice, using a CSPRNG rather than Math.random: this is a real
 * prize draw and should stand up to scrutiny. Items need a numeric weight; the
 * chosen item is returned.
 */
/**
 * Pick one item by weight.
 *
 * @param items  each element needs a weight, in percentage points
 * @param outOf  the denominator of the draw.
 *               null (default) draws against the sum of the weights, so something
 *               in the pool always wins -- the original behaviour.
 *               100 draws against a fixed 100, so any shortfall between the sum
 *               of the weights and 100 is a losing outcome and null is returned.
 *
 * null means two different things and the caller has to tell them apart:
 *   the pool was empty (everything has gone) -- do not charge the player
 *   the draw landed in the shortfall (a loss) -- do charge, or a player could
 *   simply retry for free until they win
 */
export function weightedPick(items, { outOf = null } = {}) {
  const weights = items.map((i) => Number(i.weight) || 0);
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return null;

  // Weights can be fractional, so scale to integers before drawing to avoid floating-point drift.
  const SCALE = 1_000_000;
  const scaled = weights.map((w) => Math.round(w * SCALE));
  const scaledTotal = scaled.reduce((s, w) => s + w, 0);
  if (scaledTotal <= 0) return null;

  // With outOf, draw against that fixed denominator; if the weights already exceed
  // it, fall back to drawing in proportion, so a total set above 100 by mistake
  // cannot make the last few items unreachable.
  const denom = outOf && outOf * SCALE > scaledTotal ? outOf * SCALE : scaledTotal;

  let r = randomInt(denom);
  for (let i = 0; i < items.length; i++) {
    r -= scaled[i];
    if (r < 0) return items[i];
  }
  // Landed in the shortfall, so nothing was won. Only reachable in outOf mode.
  // Do not fall through and return the last item: that would hand the entire
  // shortfall to whichever prize happens to be last. The first version did exactly
  // that, and only the distribution test caught it.
  return outOf ? null : items[items.length - 1];
}

// drop the characters that are easily misread: 0/O and 1/I
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Redemption code IC-XXXX-XXXX, for staff to check by hand. */
export function makeCode() {
  const pick = () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  const block = () => Array.from({ length: 4 }, pick).join("");
  return `IC-${block()}-${block()}`;
}

/** Single-use claim token. */
export function makeClaimToken() {
  return randomBytes(24).toString("base64url");
}
