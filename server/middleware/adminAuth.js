/**
 * 後台身分驗證 —— 個人帳號，不是一組共用密碼。
 *
 * 為什麼不用單一 ADMIN_TOKEN 就好（Tony 2026-09-01「要特定的人才能看到」）：
 * 中獎名單裡有中獎者的姓名 / 手機 / Email，是個資。一組共用密碼會被轉傳、
 * 離職也收不回、而且出事查不出是誰看的。改成個人帳號後：
 *   - 要移除某個人，只要從 ADMIN_USERS 拿掉他那組，其他人不受影響
 *   - 每次查名單都留下是「誰」查的（admin_access_log）
 *
 * 環境變數：
 *   ADMIN_USERS = "tony:密碼A,alisha:密碼B,katniss:密碼C"
 *     帳號不分大小寫；密碼區分大小寫；用逗號分隔多組。
 *     ⚠️ 密碼裡不能有逗號或冒號。
 *   ADMIN_TOKEN = 主金鑰，給 curl / 自動化用（會記成使用者 "master"）。
 *
 * 兩個都沒設 → 後台整個停用（回 503）。
 */
import { createHash, timingSafeEqual } from "node:crypto";

const SALT = "ic-admin-v1";

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

/** 由帳密推導出的 token —— 密碼本身不會出現在瀏覽器儲存或網路請求標頭裡。 */
export function tokenFor(username, password) {
  return sha256(`${username}:${password}:${SALT}`);
}

/** 解析 ADMIN_USERS。格式錯的那一組會被跳過並印警告，不會讓整個後台掛掉。 */
export function adminUsers() {
  const raw = process.env.ADMIN_USERS || "";
  const users = [];
  for (const entry of raw.split(",")) {
    const part = entry.trim();
    if (!part) continue;
    const idx = part.indexOf(":");
    if (idx < 1 || idx === part.length - 1) {
      console.warn(`[adminAuth] ADMIN_USERS 有一組格式不對（應為 帳號:密碼）：${part.slice(0, 12)}…`);
      continue;
    }
    const username = part.slice(0, idx).trim().toLowerCase();
    const password = part.slice(idx + 1);
    users.push({ username, token: tokenFor(username, password) });
  }
  return users;
}

/** 定時安全比對，避免用回應時間猜 token。 */
function sameToken(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/** 由請求解出是哪一位使用者；認不出來回 null。 */
export function adminFromRequest(req) {
  const header = req.header("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : req.query.token;
  if (!provided) return null;

  const master = process.env.ADMIN_TOKEN;
  if (master && sameToken(provided, master)) return { username: "master", master: true };

  for (const u of adminUsers()) {
    if (sameToken(provided, u.token)) return { username: u.username, master: false };
  }
  return null;
}

export function adminEnabled() {
  return Boolean(process.env.ADMIN_TOKEN) || adminUsers().length > 0;
}

export function requireAdmin(req, res, next) {
  if (!adminEnabled()) {
    return res.status(503).json({ error: "後台停用：ADMIN_USERS 與 ADMIN_TOKEN 都沒設定" });
  }
  const who = adminFromRequest(req);
  if (!who) return res.status(401).json({ error: "unauthorized" });
  req.adminUser = who.username;
  next();
}
