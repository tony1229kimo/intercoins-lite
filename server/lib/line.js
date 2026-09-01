/**
 * LINE Messaging API —— 加好友檢查 + 中獎券推播。
 * 移植自 ickaohsiungculinaryjourneymap/server/lib/linePush.ts。
 *
 * 用的是「高雄洲際 LINE 官方帳號」的 long-lived channel access token，
 * 跟味蕾旅遊地圖同一把（LINE_MESSAGING_ACCESS_TOKEN_KH）。
 */

const BRAND_GOLD = "#B8975A";
const BRAND_INK = "#3D3935";

function tokenFor(hotel) {
  return process.env[`LINE_MESSAGING_ACCESS_TOKEN_${String(hotel).toUpperCase()}`];
}

/**
 * 加好友檢查。
 * GET /v2/bot/profile/:userId —— 200 = 已加好友、404 = 未加好友。
 * 這是唯一不用額外授權就能問「這個人是不是我的好友」的方法。
 */
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
 * 推播中獎券（Flex Message）。
 *
 * 按鈕連到我們自己的 /api/claim/:token（單次有效），由它再 302 導去 Omnichat。
 * 這樣客人截圖轉傳也沒用 —— 券只能被領一次。
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
        { type: "text", text: "洲遊幣 · 恭喜中獎", color: "#F4D489", size: "sm", weight: "bold", letterSpacing: "2px" },
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
