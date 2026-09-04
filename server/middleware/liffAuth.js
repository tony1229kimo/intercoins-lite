/**
 * LIFF id token verification.
 *
 * Without this layer, anyone could pass a userId with curl and read or write
 * somebody else's coins and win history.
 *
 * Needs LINE_CHANNEL_ID, the numeric prefix of the LIFF id.
 * In local development, an unset value lets requests through with a warning so
 * the front end can be worked on; in production an unset value answers 503.
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
