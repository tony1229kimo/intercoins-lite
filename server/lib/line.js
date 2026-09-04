/**
 * LINE Messaging API: friend check and voucher push.
 *
 * Uses the long-lived channel access token of the Kaohsiung official account
 * (LINE_MESSAGING_ACCESS_TOKEN_KH).
 */

const BRAND_GOLD = "#B8975A";
const BRAND_INK = "#3D3935";

function tokenFor(hotel) {
  return process.env[`LINE_MESSAGING_ACCESS_TOKEN_${String(hotel).toUpperCase()}`];
}

/**
 * Check whether a Messaging API token actually works.
 *
 * *_configured: true only means the variable is non-empty. A token that is
 * mistyped, expired, or from a different channel all look exactly the same that
 * way. Only calling LINE tells them apart.
 *
 * GET /v2/bot/info takes no parameters and returns the official account the token
 * belongs to, which is the cleanest way to ask whether this key opens this door.
 */
export async function verifyPushToken(hotel) {
  const token = tokenFor(hotel);
  if (!token) return { ok: false, reason: "token 未設定" };
  try {
    const resp = await fetch("https://api.line.me/v2/bot/info", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.status === 401) return { ok: false, reason: "token 無效或已過期（401）" };
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return { ok: false, reason: `HTTP ${resp.status} ${body.slice(0, 160)}` };
    }
    const info = await resp.json();
    // Return only the account's public identifiers, never the token.
    return {
      ok: true,
      basicId: info.basicId,          // e.g. @xxx
      displayName: info.displayName,  // e.g. the property name
      chatMode: info.chatMode,
    };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Friend check.
 * GET /v2/bot/profile/:userId -- 200 means they are a friend, 404 means they are not.
 * This is the only way to ask whether someone is a friend without extra authorisation.
 */
/**
 * Follower count for the official account (LINE Insight API).
 *
 * GET /v2/bot/insight/followers?date=yyyyMMdd
 *   followers        cumulative friends, blocks excluded
 *   targetedReaches  how many a push can actually reach
 *   blocks           blocked count
 *
 * Three limits, which the UI has to state rather than paper over:
 *   1. the data appears a day late, so today's date returns nothing
 *   2. with too few friends LINE answers status "unavailable" -- not an error,
 *      it simply will not say
 *   3. only the last 60 days can be queried
 *
 * So this walks back from daysBack and returns the first response marked ready.
 */
export async function getFollowerInsight(hotel, { daysBack = 1, maxTry = 5 } = {}) {
  const token = tokenFor(hotel);
  if (!token) return { ok: false, reason: `LINE_MESSAGING_ACCESS_TOKEN_${hotel} 未設定` };

  const ymd = (d) => `${d.getUTCFullYear()}`
    + String(d.getUTCMonth() + 1).padStart(2, "0")
    + String(d.getUTCDate()).padStart(2, "0");

  let lastReason = "沒有可用的資料";
  for (let i = 0; i < maxTry; i++) {
    // Work the day boundary out in Taipei time, so a UTC rollover cannot be a day out.
    const d = new Date(Date.now() + 8 * 3600_000 - (daysBack + i) * 86400_000);
    const date = ymd(d);
    try {
      const resp = await fetch(
        `https://api.line.me/v2/bot/insight/followers?date=${date}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        lastReason = `HTTP ${resp.status} ${body.slice(0, 160)}`;
        continue;
      }
      const j = await resp.json();
      if (j.status !== "ready") { lastReason = `LINE 回 status=${j.status}`; continue; }
      return {
        ok: true, date,
        followers: j.followers ?? null,
        targetedReaches: j.targetedReaches ?? null,
        blocks: j.blocks ?? null,
      };
    } catch (err) {
      lastReason = err instanceof Error ? err.message : String(err);
    }
  }
  return { ok: false, reason: lastReason };
}

export async function checkFriendship(hotel, userId) {
  const token = tokenFor(hotel);
  if (!token) {
    return { ok: false, reason: `LINE_MESSAGING_ACCESS_TOKEN_${hotel} 未設定` };
  }
  try {
    const resp = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.status === 200) return { ok: true, isFriend: true };
    if (resp.status === 404) return { ok: true, isFriend: false };
    const body = await resp.text().catch(() => "");
    return { ok: false, reason: `HTTP ${resp.status} ${body.slice(0, 200)}` };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Push the "please leave your contact details" reminder, for prizes with
 * claim_mode 'contact'.
 *
 * Which prizes take this path:
 *   every Taipei prize -- the redemption terms are not settled, and Taipei is a
 *   separate official account we cannot push vouchers through
 *   the two Kaohsiung room prizes -- a stay has to be scheduled, so it is better
 *   for the hotel to make contact
 *
 * A guest may close the dialog and leave straight after the draw, so a reminder
 * goes into the chat with a button that brings them back to fill the form in.
 *
 * hotel is which account does the pushing (always KH, where the guest came from);
 * prizeHotel is whose prize it is, which the message text has to get right. They
 * are not always the same.
 */
const HOTEL_ZH = { KH: "高雄洲際酒店", TPE: "臺北洲際酒店" };

export async function pushContactReminder(hotel, userId, { prizeName, code, tierLabel, prizeHotel }) {
  const token = tokenFor(hotel);
  if (!token) return { ok: false, reason: `LINE_MESSAGING_ACCESS_TOKEN_${hotel} 未設定` };

  // A LIFF link is what reopens the game inside LINE with the session intact; without a LIFF id, fall back to the plain URL.
  const liffId = process.env.LIFF_ID;
  const backUrl = liffId
    ? `https://liff.line.me/${liffId}`
    : (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  if (!backUrl) return { ok: false, reason: "LIFF_ID / PUBLIC_BASE_URL 都沒設定" };

  const bubble = {
    type: "bubble",
    header: {
      type: "box", layout: "vertical", paddingAll: "16px", backgroundColor: BRAND_INK,
      contents: [
        // Do not add letterSpacing -- LINE Flex text has no such property and the whole
        // message is rejected with a 400. On 2026-09-02 that one property failed all 76
        // winner pushes, and not a single guest received a voucher.
        { type: "text", text: "洲 遊 幣 · 恭 喜 中 獎", color: "#F4D489", size: "sm", weight: "bold" },
        { type: "text", text: tierLabel, color: "#FFFFFF", size: "xxl", weight: "bold", margin: "sm" },
      ],
    },
    body: {
      type: "box", layout: "vertical", spacing: "md", paddingAll: "18px",
      contents: [
        { type: "text", text: prizeName, weight: "bold", size: "lg", wrap: true, color: BRAND_INK },
        { type: "separator", margin: "md" },
        { type: "text", text: code ? `兌換碼 ${code}` : "", size: "sm", color: "#686869", margin: "md" },
        {
          type: "text", size: "sm", color: BRAND_INK, wrap: true, margin: "md",
          // The property giving the prize is not the account doing the pushing: the Kaohsiung room prizes take this path too, so it cannot be hardcoded.
          text: `本獎項由${HOTEL_ZH[prizeHotel] || "本酒店"}提供，兌換方式將由專人與您聯繫。\n`
              + "請點下方按鈕留下聯絡資訊，我們會盡快與您聯絡。",
        },
      ],
    },
    footer: {
      type: "box", layout: "vertical", paddingAll: "16px",
      contents: [{
        type: "button", style: "primary", color: BRAND_GOLD, height: "sm",
        action: { type: "uri", label: "填寫聯絡資訊", uri: backUrl },
      }],
    },
  };

  try {
    const resp = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        to: userId,
        messages: [{ type: "flex", altText: `恭喜中獎：${prizeName}（請留下聯絡資訊）`, contents: bubble }],
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return { ok: false, reason: `HTTP ${resp.status} ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Push a winning voucher as a Flex Message.
 *
 * The button points at our own /api/claim/:token, which is single use and then
 * redirects onward. A screenshot passed to someone else is therefore worthless --
 * a voucher can be collected once.
 */
export async function pushRewardCoupon(hotel, userId, draw) {
  const token = tokenFor(hotel);
  if (!token) return { ok: false, reason: `LINE_MESSAGING_ACCESS_TOKEN_${hotel} 未設定` };

  const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  if (!base) return { ok: false, reason: "PUBLIC_BASE_URL 未設定，無法產生領取連結" };
  const claimUrl = `${base}/api/claim/${draw.claim_token}`;

  const details = [
    draw.spend_threshold ? `使用門檻：${draw.spend_threshold}` : null,
    draw.expiry_note ? `兌換期限：${draw.expiry_note}` : null,
  ].filter(Boolean);

  const bubble = {
    type: "bubble",
    header: {
      type: "box", layout: "vertical", paddingAll: "16px", backgroundColor: BRAND_INK,
      contents: [
        // Do not add letterSpacing -- LINE Flex text has no such property and the whole
        // message is rejected with a 400. On 2026-09-02 that one property failed all 76
        // winner pushes, and not a single guest received a voucher.
        { type: "text", text: "洲 遊 幣 · 恭 喜 中 獎", color: "#F4D489", size: "sm", weight: "bold" },
        { type: "text", text: draw.tier_label, color: "#FFFFFF", size: "xxl", weight: "bold", margin: "sm" },
      ],
    },
    body: {
      type: "box", layout: "vertical", spacing: "md", paddingAll: "18px",
      contents: [
        { type: "text", text: draw.prize_name, weight: "bold", size: "lg", wrap: true, color: BRAND_INK },
        { type: "separator", margin: "md" },
        {
          type: "box", layout: "vertical", spacing: "xs", margin: "md",
          contents: [
            { type: "text", text: `兌換碼 ${draw.code}`, size: "sm", color: "#686869" },
            ...details.map((t) => ({ type: "text", text: t, size: "xs", color: "#686869", wrap: true })),
          ],
        },
        { type: "text", text: "點下方按鈕領取，連結僅能使用一次。", size: "xs", color: "#9A9A9A", wrap: true, margin: "md" },
      ],
    },
    footer: {
      type: "box", layout: "vertical", paddingAll: "16px",
      contents: [{
        type: "button", style: "primary", color: BRAND_GOLD, height: "sm",
        action: { type: "uri", label: "領取我的獎品", uri: claimUrl },
      }],
    },
  };

  try {
    const resp = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        to: userId,
        messages: [{ type: "flex", altText: `恭喜中獎：${draw.prize_name}`, contents: bubble }],
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return { ok: false, reason: `HTTP ${resp.status} ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
