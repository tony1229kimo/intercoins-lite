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
 * 驗證 Messaging API token 是不是【真的有效】。
 *
 * 踩雷 T09：`*_configured: true` 只代表環境變數非空，貼錯、貼到過期的、
 * 貼到別的 channel 的，看起來都一樣是 true。這支真的打一次 LINE 才知道。
 *
 * GET /v2/bot/info 不需要任何參數，回傳這把 token 對應的官方帳號基本資料 ——
 * 拿來當「這把鑰匙能不能開這道門」的檢查最乾淨。
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
    // 只回官方帳號的公開識別資訊，不回 token 本身。
    return {
      ok: true,
      basicId: info.basicId,          // 例 @xxx
      displayName: info.displayName,  // 例 高雄洲際酒店
      chatMode: info.chatMode,
    };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
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
 * 推播「請留聯絡資訊」提醒（claim_mode = 'contact' 的獎項）。
 *
 * 哪些獎走這條路：
 *   臺北全部 —— 兌換細則還沒定案，而且臺北是另一個 OA，我們推不了券
 *   高雄的兩項住宿大獎 —— 住宿券要安排入住日期，由飯店的人主動聯繫比較妥當
 *
 * 客人有可能抽完就關掉彈窗跑了，所以推一則提醒進聊天室，按鈕帶他回遊戲補填。
 *
 * ⚠️ hotel 是「用哪個 OA 推播」（永遠是 KH，客人從那裡進來的），
 *    prizeHotel 是「這個獎是哪一家的」（訊息內文要講對）—— 兩者不一定相同。
 */
const HOTEL_ZH = { KH: "高雄洲際酒店", TPE: "臺北洲際酒店" };

export async function pushContactReminder(hotel, userId, { prizeName, code, tierLabel, prizeHotel }) {
  const token = tokenFor(hotel);
  if (!token) return { ok: false, reason: `LINE_MESSAGING_ACCESS_TOKEN_${hotel} 未設定` };

  // LIFF 連結才能在 LINE 內開回遊戲並保有登入狀態；沒設 LIFF_ID 時退回一般網址。
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
        // ⚠️ 不要加 letterSpacing —— LINE Flex 的 text 沒有這個屬性，整則訊息會被退 400。
        //    2026-09-02 就是它害 76 筆中獎推播【全部】失敗，客人一張券都沒收到。
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
          // 獎項所屬飯店 ≠ 推播用的 OA —— 高雄的住宿大獎也走這條路，不能寫死臺北。
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
        // ⚠️ 不要加 letterSpacing —— LINE Flex 的 text 沒有這個屬性，整則訊息會被退 400。
        //    2026-09-02 就是它害 76 筆中獎推播【全部】失敗，客人一張券都沒收到。
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
