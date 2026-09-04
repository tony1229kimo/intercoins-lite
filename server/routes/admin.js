/**
 * Admin API: stock, weights, winner exports and re-sending a push.
 * Every route needs Authorization: Bearer <token> (or ?token=).
 */
import { asyncRouter } from "../lib/router.js";
import { query } from "../db.js";
import {
  requireAdmin, tokenFor, adminUsers, adminEnabled,
  setAdminCookie, clearAdminCookie,
} from "../middleware/adminAuth.js";
import { pushRewardCoupon, getFollowerInsight } from "../lib/line.js";
import { TIER_LABEL } from "../prizes.js";
import { PUBLISHED_TASKS, MAX_EARNABLE } from "../lib/tasks.js";

const router = asyncRouter();

// Follower insight reads the Kaohsiung official account -- that is where guests added us from.
const OA_HOTEL = "KH";

/** Credentials in, token out. The password passes through once; everything after uses the derived token. */
router.post("/login", async (req, res) => {
  if (!adminEnabled()) {
    return res.status(503).json({ error: "後台停用：ADMIN_USERS 與 ADMIN_TOKEN 都沒設定" });
  }
  const username = String(req.body?.username ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!username || !password) return res.status(400).json({ error: "缺少帳號或密碼" });

  const token = tokenFor(username, password);
  const hit = adminUsers().find((u) => u.username === username && u.token === token);
  if (!hit) return res.status(401).json({ error: "帳號或密碼錯誤" });

  await logAccess(username, "login", req).catch(() => {});
  // This cookie only releases the /admin HTML. Data still needs a bearer token.
  setAdminCookie(req, res, token);
  res.json({ ok: true, username, token });
});

/** Sign out: take the page cookie back, so /admin returns to the sign-in page. */
router.post("/logout", (_req, res) => {
  clearAdminCookie(res);
  res.json({ ok: true });
});

router.use(requireAdmin);

/** Record who looked at a list containing personal data. A failed write must not block the query itself. */
async function logAccess(username, action, req) {
  await query(
    "INSERT INTO admin_access_log (username, action, ip) VALUES ($1, $2, $3)",
    [username, action, (req.headers["x-forwarded-for"] || req.ip || "").toString().slice(0, 60)],
  );
}

/** Prizes and stock. Admin only. */
router.get("/prizes", async (_req, res) => {
  const { rows } = await query(
    `SELECT id, hotel, tier, slot, position, name, claim_mode, quota, issued,
            weight, coin_reward, visible, active, is_consolation,
            coupon_link IS NOT NULL AS has_link
       FROM prizes ORDER BY tier, position`,
  );
  const byTier = {};
  for (const r of rows) {
    (byTier[r.tier] ??= []).push(r);
  }
  const summary = Object.entries(byTier).map(([tier, list]) => {
    // These conditions have to match the draw pool in /spin exactly, or the panel
    // will wrongly report a tier as closed. A consolation prize is drawable even with
    // visible = false.
    const live = list.filter((p) => p.active && (p.visible || p.is_consolation)
      && Number(p.weight) > 0 && (p.quota === 0 || p.issued < p.quota));
    // The draw is against a fixed denominator, so weight is already the real figure. Do not normalise it again.
    // any shortfall against that denominator is the chance of not winning
    const total = live.reduce((s, p) => s + Number(p.weight), 0);
    return {
      tier: Number(tier),
      label: TIER_LABEL[tier],
      open: live.length > 0,
      totalPct: +total.toFixed(2),
      missPct: +Math.max(0, 100 - total).toFixed(2),   // chance of not winning
      prizes: list.map((p) => ({
        ...p,
        weight: Number(p.weight),
        pct: live.includes(p) ? +Number(p.weight).toFixed(2) : 0,
        remaining: p.quota === 0 ? null : p.quota - p.issued,
      })),
    };
  });
  res.json({ tiers: summary });
});

/** Adjust one prize: weight, quota, visibility. Takes effect immediately, with no redeploy. */
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

/**
 * Growth figures: official-account followers, and new players per day.
 *
 * These are different things and the UI has to keep them apart:
 *   followers  actual friends of the LINE official account, reported by LINE,
 *              available only from the next day
 *   newPlayers people who opened the game for the first time, from our own
 *              database, immediate and exact
 * Someone who adds the account but never plays counts only towards the first, so
 * the two numbers are not meant to agree.
 */
router.get("/growth", async (_req, res) => {
  const [{ rows: daily }, { rows: [totals] }, line] = await Promise.all([
    query(
      `SELECT (created_at AT TIME ZONE 'Asia/Taipei')::date AS day,
              count(*)::int AS players
         FROM players
        WHERE created_at > now() - interval '30 days'
        GROUP BY 1 ORDER BY 1 DESC`,
    ),
    query(
      // The ::int after a FILTER clause has to wrap the whole expression, or the cast binds to the FILTER parentheses and means something other than intended.
      `SELECT count(*)::int AS total,
              (count(*) FILTER (
                WHERE (created_at AT TIME ZONE 'Asia/Taipei')::date
                    = (now() AT TIME ZONE 'Asia/Taipei')::date))::int AS today,
              (count(*) FILTER (
                WHERE (created_at AT TIME ZONE 'Asia/Taipei')::date
                    = (now() AT TIME ZONE 'Asia/Taipei')::date - 1))::int AS yesterday,
              (count(*) FILTER (WHERE created_at > now() - interval '7 days'))::int AS last7
         FROM players`,
    ),
    getFollowerInsight(OA_HOTEL).catch((e) => ({ ok: false, reason: String(e) })),
  ]);

  // -- channel task completions --
  const [{ rows: taskRows }, { rows: drawDaily }, { rows: [funnel] }] = await Promise.all([
    query("SELECT task_id, count(*)::int AS done FROM task_claims GROUP BY 1"),
    query(
      `SELECT (created_at AT TIME ZONE 'Asia/Taipei')::date AS day,
              count(*)::int AS draws
         FROM draws
        WHERE created_at > now() - interval '30 days'
        GROUP BY 1`,
    ),
    query(
      `SELECT (SELECT count(*) FROM players)::int AS players,
              (SELECT count(DISTINCT line_user_id) FROM task_claims)::int AS did_task,
              (SELECT count(DISTINCT line_user_id) FROM draws)::int AS did_draw,
              (SELECT count(DISTINCT line_user_id) FROM draws WHERE coin_reward = 0)::int AS did_win,
              (SELECT count(*) FROM player_profiles)::int AS gave_profile`,
    ),
  ]);

  const doneBy = Object.fromEntries(taskRows.map((r) => [r.task_id, r.done]));
  const drawsBy = Object.fromEntries(drawDaily.map((r) => [
    r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10),
    r.draws,
  ]));
  const dayKey = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

  res.json({
    newPlayers: totals,
    daily: daily.map((d) => ({
      date: dayKey(d.day),
      players: d.players,
      draws: drawsBy[dayKey(d.day)] ?? 0,
    })),
    line,
    funnel,
    maxEarnable: MAX_EARNABLE,
    tasks: PUBLISHED_TASKS.map((t) => ({
      id: t.id,
      title: t.title,
      kind: t.kind,
      done: doneBy[t.id] ?? 0,
      // The denominator is people who did at least one task, not every player: someone
      // who looks in once and leaves should not drag the completion rate down.
      rate: funnel.did_task ? +((doneBy[t.id] ?? 0) / funnel.did_task * 100).toFixed(1) : 0,
    })),
  });
});

/** Operations overview. */
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

/**
 * Shared query behind the winners list.
 *
 * Both properties need to check each other's winners: the Kaohsiung front desk
 * has to know whether a voucher in a guest's hand is one of theirs, and Taipei
 * has to know who to contact. So this is one list across both, told apart by the
 * hotel column, rather than two.
 */
async function fetchWinners() {
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
  return rows;
}

/** Full winners list as JSON, for the admin page. One list for both hotels, filterable by hotel. */
router.get("/winners", async (req, res) => {
  await logAccess(req.adminUser, "winners", req).catch(() => {});
  const rows = await fetchWinners();
  res.json({
    total: rows.length,
    winners: rows.map((r) => ({
      id: r.id,
      at: r.created_at,
      hotel: r.hotel,
      tier: r.tier,
      label: TIER_LABEL[r.tier],
      prize: r.prize_name,
      code: r.code,
      coin: r.coin_reward,
      claimMode: r.claim_mode,
      // Prefer the contact details left at the time of winning; fall back to the ones in the member's profile.
      name: r.contact_name || r.profile_name || null,
      phone: r.contact_phone || r.profile_phone || null,
      email: r.contact_email || r.profile_email || null,
      contactWindow: r.contact_window,
      contactFilled: Boolean(r.contact_name),
      lineName: r.display_name,
      lineUserId: r.line_user_id,
      pushed: r.pushed,
      pushError: r.push_error,
      claimedAt: r.claim_used_at,
    })),
  });
});

/** Winners list as CSV, UTF-8 with a BOM so Excel opens it directly. */
router.get("/winners.csv", async (req, res) => {
  await logAccess(req.adminUser, "winners.csv", req).catch(() => {});
  const rows = await fetchWinners();
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

/**
 * Follow-up list: wins with claim_mode 'contact'.
 *
 * Not only Taipei -- the two Kaohsiung room prizes take this path as well, so
 * the hotel has to come back with each row or the panel cannot tell which
 * property should be making contact.
 */
router.get("/contacts", async (req, res) => {
  await logAccess(req.adminUser, "contacts", req).catch(() => {});
  const { rows } = await query(
    `SELECT d.id AS draw_id, d.created_at, d.prize_name, d.code, d.tier,
            pz.hotel,
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

/** Re-send: push a win again after the first attempt failed. */
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
