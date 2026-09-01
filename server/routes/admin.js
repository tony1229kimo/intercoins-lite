/**
 * 後台 API —— 給行銷/主管查庫存、調機率、匯出中獎名單、補推播。
 * 全部需要 Authorization: Bearer <ADMIN_TOKEN>（或 ?token=）。
 */
import { asyncRouter } from "../lib/router.js";
import { query } from "../db.js";
import { requireAdmin } from "../middleware/liffAuth.js";
import { pushRewardCoupon } from "../lib/line.js";
import { TIER_LABEL } from "../prizes.js";

const router = asyncRouter();
router.use(requireAdmin);

/** 獎項與庫存總表（含機率，僅後台可見）。 */
router.get("/prizes", async (_req, res) => {
  const { rows } = await query(
    `SELECT id, hotel, tier, slot, name, quota, issued, weight, coin_reward,
            visible, active, coupon_link IS NOT NULL AS has_link
       FROM prizes ORDER BY tier, slot`,
  );
  const byTier = {};
  for (const r of rows) {
    (byTier[r.tier] ??= []).push(r);
  }
  const summary = Object.entries(byTier).map(([tier, list]) => {
    const live = list.filter((p) => p.active && p.visible && Number(p.weight) > 0
      && (p.quota === 0 || p.issued < p.quota));
    const total = live.reduce((s, p) => s + Number(p.weight), 0);
    return {
      tier: Number(tier),
      label: TIER_LABEL[tier],
      open: live.length > 0,
      prizes: list.map((p) => ({
        ...p,
        weight: Number(p.weight),
        pct: total > 0 && live.includes(p) ? +(Number(p.weight) / total * 100).toFixed(2) : 0,
        remaining: p.quota === 0 ? null : p.quota - p.issued,
      })),
    };
  });
  res.json({ tiers: summary });
});

/** 調整單一獎項的機率權重 / 名額 / 顯示。行銷改完立即生效，不用重新部署。 */
router.patch("/prizes/:id", async (req, res) => {
  const fields = [];
  const values = [req.params.id];
  for (const [key, col] of [["weight", "weight"], ["quota", "quota"],
                            ["visible", "visible"], ["active", "active"]]) {
    if (req.body?.[key] !== undefined) {
      values.push(req.body[key]);
      fields.push(`${col} = $${values.length}`);
    }
  }
  if (!fields.length) return res.status(400).json({ error: "no_fields" });

  const { rows } = await query(
    `UPDATE prizes SET ${fields.join(", ")}, updated_at = now()
      WHERE id = $1 RETURNING *`, values);
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true, prize: rows[0] });
});

/** 營運總覽。 */
router.get("/stats", async (_req, res) => {
  const [{ rows: [players] }, { rows: [coins] }, { rows: draws }, { rows: [push] }] =
    await Promise.all([
      query("SELECT count(*)::int AS total, sum(balance)::int AS balance FROM players"),
      query("SELECT coalesce(sum(delta) FILTER (WHERE delta > 0), 0)::int AS issued FROM coin_ledger"),
      query(`SELECT tier, count(*)::int AS spins,
                    count(*) FILTER (WHERE coin_reward = 0)::int AS physical
               FROM draws GROUP BY tier ORDER BY tier`),
      query(`SELECT count(*) FILTER (WHERE pushed)::int AS ok,
                    count(*) FILTER (WHERE NOT pushed AND claim_token IS NOT NULL)::int AS failed,
                    count(*) FILTER (WHERE claim_used_at IS NOT NULL)::int AS claimed
               FROM draws`),
    ]);
  res.json({
    players: players.total,
    coinsOutstanding: players.balance ?? 0,
    coinsIssued: coins.issued,
    draws: draws.map((d) => ({ ...d, label: TIER_LABEL[d.tier] })),
    push,
  });
});

/** 中獎名單 CSV（UTF-8 BOM，Excel 直接開得起來）。
 *  臺北的獎（claim_mode='contact'）不發券，靠這份名單的聯絡資訊由專人聯繫。 */
router.get("/winners.csv", async (_req, res) => {
  const { rows } = await query(
    `SELECT d.id, d.created_at, d.hotel, d.tier, d.prize_name, d.code, d.coin_reward,
            d.pushed, d.push_error, d.claim_used_at,
            pl.display_name, d.line_user_id,
            pz.claim_mode,
            c.name AS contact_name, c.phone AS contact_phone,
            c.email AS contact_email, c.contact_window,
            pr.name AS profile_name, pr.phone AS profile_phone, pr.email AS profile_email
       FROM draws d
       JOIN players pl ON pl.line_user_id = d.line_user_id
       JOIN prizes pz  ON pz.id = d.prize_id
  LEFT JOIN prize_contacts c   ON c.draw_id = d.id
  LEFT JOIN player_profiles pr ON pr.line_user_id = d.line_user_id
      ORDER BY d.created_at DESC`,
  );
  const head = ["中獎編號", "時間", "館別", "等級", "獎品", "領獎方式", "兌換碼", "洲遊幣",
                "已推播", "推播錯誤", "券已領取",
                "聯絡姓名", "聯絡手機", "聯絡Email", "方便聯繫時段", "聯絡資訊已填",
                "LINE 名稱", "LINE UserId", "會員姓名", "會員手機", "會員Email"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const HOTEL_CH = { KH: "高雄洲際", TPE: "臺北洲際" };
  const body = rows.map((r) => [
    r.id, r.created_at.toISOString(), HOTEL_CH[r.hotel] ?? r.hotel, TIER_LABEL[r.tier],
    r.prize_name,
    r.coin_reward ? "洲遊幣入帳" : (r.claim_mode === "contact" ? "留聯絡資訊（專人聯繫）" : "Omnichat 發券"),
    r.code ?? "", r.coin_reward || "",
    r.pushed ? "是" : "否", r.push_error ?? "",
    r.claim_used_at ? r.claim_used_at.toISOString() : "",
    r.contact_name ?? "", r.contact_phone ?? "", r.contact_email ?? "", r.contact_window ?? "",
    r.claim_mode === "contact" && !r.coin_reward ? (r.contact_name ? "是" : "❌ 未填") : "",
    r.display_name ?? "", r.line_user_id,
    r.profile_name ?? "", r.profile_phone ?? "", r.profile_email ?? "",
  ].map(esc).join(","));

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition",
    `attachment; filename="intercoins-winners-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send("﻿" + [head.map(esc).join(","), ...body].join("\r\n"));
});

/** 臺北待聯繫名單 —— 中了臺北的獎、已留聯絡資訊、還沒處理的。給臺北洲際的人用。 */
router.get("/contacts", async (_req, res) => {
  const { rows } = await query(
    `SELECT d.id AS draw_id, d.created_at, d.prize_name, d.code, d.tier,
            c.name, c.phone, c.email, c.contact_window, c.created_at AS filled_at
       FROM draws d
       JOIN prizes pz ON pz.id = d.prize_id
  LEFT JOIN prize_contacts c ON c.draw_id = d.id
      WHERE pz.claim_mode = 'contact' AND d.coin_reward = 0
      ORDER BY d.created_at DESC`,
  );
  res.json({
    total: rows.length,
    filled: rows.filter((r) => r.name).length,
    pending: rows.filter((r) => !r.name).length,
    winners: rows.map((r) => ({ ...r, label: TIER_LABEL[r.tier] })),
  });
});

/** 補推播：推播失敗的中獎紀錄重送一次。 */
router.post("/draws/:id/repush", async (req, res) => {
  const { rows } = await query(
    `SELECT d.*, pr.spend_threshold, pr.expiry_note
       FROM draws d JOIN prizes pr ON pr.id = d.prize_id
      WHERE d.id = $1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  const draw = rows[0];
  if (!draw.claim_token) return res.status(400).json({ error: "no_claim_token" });
  if (draw.claim_used_at) return res.status(409).json({ error: "already_claimed" });

  const r = await pushRewardCoupon(draw.hotel, draw.line_user_id,
    { ...draw, tier_label: TIER_LABEL[draw.tier] });
  await query("UPDATE draws SET pushed = $2, push_error = $3 WHERE id = $1",
    [draw.id, r.ok, r.ok ? null : r.reason]);
  res.json(r.ok ? { ok: true } : { ok: false, reason: r.reason });
});

export default router;
