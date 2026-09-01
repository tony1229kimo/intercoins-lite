/**
 * LIFF id_token 驗證。
 *
 * 移植自 ickaohsiungculinaryjourneymap/server/middleware/liffAuth.ts。
 * 沒有這層的話，任何人用 curl 帶個 userId 就能讀寫別人的洲遊幣與中獎紀錄。
 *
 * 需要的環境變數：LINE_CHANNEL_ID（= LIFF_ID 的數字前綴，高雄洲際 = 1656533531）
 * 本機開發沒設時放行並印警告，方便純前端除錯；production 沒設則直接 503。
 */
const VERIFY_ENDPOINT = "https://api.line.me/oauth2/v2.1/verify";
const isProduction = process.env.NODE_ENV === "production";

export function requireLiffAuth() {
  return async (req, res, next) => {
    const channelId = process.env.LINE_CHANNEL_ID;

    if (!channelId) {
      if (isProduction) {
        return res.status(503).json({ error: "LIFF auth 未設定（production 缺 LINE_CHANNEL_ID）" });
      }
      req.lineUserId = req.header("x-dev-userid") || "dev_user";
      req.lineDisplayName = "開發模式";
      console.warn(`[liffAuth] LINE_CHANNEL_ID 未設定 —— dev 放行為 ${req.lineUserId}`);
      return next();
    }

    const authHeader = req.header("authorization") || req.header("Authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!idToken) {
      return res.status(401).json({ error: "缺少 Authorization: Bearer <id_token>" });
    }

    try {
      const body = new URLSearchParams({ id_token: idToken, client_id: channelId });
      const lineRes = await fetch(VERIFY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const data = await lineRes.json();

      if (!lineRes.ok || !data.sub) {
        return res.status(401).json({
          error: "id_token 驗證失敗",
          detail: data.error_description || data.error || `HTTP ${lineRes.status}`,
        });
      }

      req.lineUserId = data.sub;
      req.lineDisplayName = data.name;
      req.linePictureUrl = data.picture;
      next();
    } catch (err) {
      console.error("[liffAuth] 呼叫 LINE verify 失敗:", err);
      return res.status(502).json({ error: "無法連線 LINE 驗證服務" });
    }
  };
}
