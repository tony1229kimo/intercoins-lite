/**
 * 消費者端 API。所有端點都要通過 LIFF id_token 驗證。
 */
import { asyncRouter } from "../lib/router.js";
import { query, withTx } from "../db.js";
import { requireLiffAuth } from "../middleware/liffAuth.js";
import { checkFriendship, pushRewardCoupon } from "../lib/line.js";
import { weightedPick, makeCode, makeClaimToken } from "../lib/random.js";
import { PUBLISHED_TASKS, TASK_BY_ID, MAX_EARNABLE } from "../lib/tasks.js";
import { TIER_LABEL, TIER_COST, TIERS } from "../prizes.js";

const router = asyncRouter();
const liffAuth = requireLiffAuth();
const HOTEL = "KH"; // 本階段只開放高雄

/** 首次進來自動建檔；每次都更新 LINE 顯示名稱/頭像。 */
async function upsertPlayer(req) {
  const { rows } = await query(
    `INSERT INTO players (line_user_id, display_name, picture_url, hotel)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (line_user_id) DO UPDATE SET
       display_name = COALESCE(EXCLUDED.display_name, players.display_name),
       picture_url  = COALESCE(EXCLUDED.picture_url,  players.picture_url),
       updated_at   = now()
     RETURNING *`,
    [req.lineUserId, req.lineDisplayName ?? null, req.linePictureUrl ?? null, HOTEL],
  );
  return rows[0];
}

async function addCoins(client, userId, delta, reason, ref) {
  const { rows } = await client.query(
    `UPDATE players SET balance = balance + $2, updated_at = now()
      WHERE line_user_id = $1 RETURNING balance`,
    [userId, delta],
  );
  const balance = rows[0].balance;
  await client.query(
    `INSERT INTO coin_ledger (line_user_id, delta, balance_after, reason, ref)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, delta, balance, reason, ref ?? null],
  );
  return balance;
}

// ── 加好友 gate ────────────────────────────────────────────────
// 客人沒加高雄洲際 LINE 好友之前不能進遊戲 —— 中獎券是用 push 發的，
// 不是好友就 silent fail，等於中了獎卻拿不到東西。
router.get("/me/friendship", liffAuth, async (req, res) => {
  const result = await checkFriendship(HOTEL, req.lineUserId);
  if (!result.ok) {
    // 我們自己的基礎設施壞掉不該把真實客人擋在外面 —— 降級放行並留 log。
    console.warn("[friendship] 檢查失敗，降級為已加好友:", result.reason);
    return res.json({ ok: true, isFriend: true, degraded: true });
  }
  res.json({ ok: true, isFriend: result.isFriend });
});

// ── 遊戲狀態 ───────────────────────────────────────────────────
router.get("/state", liffAuth, async (req, res) => {
  const player = await upsertPlayer(req);

  const [{ rows: claimed }, { rows: prizes }, { rows: won }] = await Promise.all([
    query("SELECT task_id FROM task_claims WHERE line_user_id = $1", [req.lineUserId]),
    query(
      `SELECT tier, slot, name, coin_reward,
              (weight > 0 AND (quota = 0 OR issued < quota)) AS winnable
         FROM prizes
        WHERE hotel = $1 AND active AND visible
        ORDER BY tier, slot`,
      [HOTEL],
    ),
    query(
      `SELECT prize_name, tier, code, coin_reward, created_at
         FROM draws WHERE line_user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [req.lineUserId],
    ),
  ]);

  const done = Object.fromEntries(claimed.map((r) => [r.task_id, true]));

  // 轉盤盤面：每個等級的獎品按格位排好。
  // ⚠️ 只吐名稱與格位，不吐 weight / quota / issued —— 機率與庫存不對客人公開
  //    （Tony 2026-09-01：客人不該從 F12 看到中獎率或剩幾張）。
  const wheel = {};
  const tierOpen = {};
  for (const tier of TIERS) {
    const slots = prizes.filter((p) => p.tier === tier);
    wheel[tier] = slots.map((p) => ({ slot: p.slot, name: p.name, coin: p.coin_reward }));
    tierOpen[tier] = slots.some((p) => p.winnable);
  }

  res.json({
    user: {
      userId: player.line_user_id,
      displayName: player.display_name,
      pictureUrl: player.picture_url,
    },
    balance: player.balance,
    done,
    tasks: PUBLISHED_TASKS.map((t) => ({
      id: t.id, title: t.title, kind: t.kind, url: t.url, reward: t.reward,
    })),
    maxEarnable: MAX_EARNABLE,
    wheel,
    tierOpen,
    tierCost: TIER_COST,
    tierLabel: TIER_LABEL,
    won: won.map((w) => ({
      prize: w.prize_name, tier: w.tier, code: w.code,
      coin: w.coin_reward, at: w.created_at,
    })),
  });
});

// ── 任務發幣 ───────────────────────────────────────────────────
router.post("/tasks/:id/claim", liffAuth, async (req, res) => {
  const task = TASK_BY_ID[req.params.id];
  if (!task) return res.status(404).json({ error: "task_not_found" });

  await upsertPlayer(req);

  try {
    const balance = await withTx(async (client) => {
      // PK 衝突 = 已經領過。DO NOTHING + rowCount 判斷，天然防連點重複發幣。
      const ins = await client.query(
        `INSERT INTO task_claims (line_user_id, task_id, reward)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [req.lineUserId, task.id, task.reward],
      );
      if (!ins.rowCount) throw Object.assign(new Error("already_claimed"), { status: 409 });
      return addCoins(client, req.lineUserId, task.reward, "task", task.id);
    });
    res.json({ ok: true, reward: task.reward, balance });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("[tasks/claim]", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── 填個資（同時完成 profile 任務）────────────────────────────
router.post("/profile", liffAuth, async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const phone = String(req.body?.phone ?? "").replace(/[-\s]/g, "");
  const email = String(req.body?.email ?? "").trim();
  const consentKh = Boolean(req.body?.consentKh);
  const consentTpe = Boolean(req.body?.consentTpe);

  if (!name) return res.status(400).json({ error: "name_required" });
  if (!/^09\d{8}$/.test(phone)) return res.status(400).json({ error: "phone_invalid" });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: "email_invalid" });
  if (!consentKh && !consentTpe) return res.status(400).json({ error: "consent_required" });

  await upsertPlayer(req);
  const reward = TASK_BY_ID.profile?.reward ?? 1;

  try {
    const out = await withTx(async (client) => {
      await client.query(
        `INSERT INTO player_profiles
           (line_user_id, name, phone, email, consent_kh, consent_tpe)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (line_user_id) DO UPDATE SET
           name = EXCLUDED.name, phone = EXCLUDED.phone, email = EXCLUDED.email,
           consent_kh = EXCLUDED.consent_kh, consent_tpe = EXCLUDED.consent_tpe`,
        [req.lineUserId, name, phone, email, consentKh, consentTpe],
      );
      // 幣只發一次，重填資料不會再發。
      const ins = await client.query(
        `INSERT INTO task_claims (line_user_id, task_id, reward)
         VALUES ($1, 'profile', $2) ON CONFLICT DO NOTHING`,
        [req.lineUserId, reward],
      );
      if (!ins.rowCount) {
        const { rows } = await client.query(
          "SELECT balance FROM players WHERE line_user_id = $1", [req.lineUserId]);
        return { balance: rows[0].balance, rewarded: 0 };
      }
      const balance = await addCoins(client, req.lineUserId, reward, "task", "profile");
      return { balance, rewarded: reward };
    });
    res.json({ ok: true, ...out });
  } catch (err) {
    console.error("[profile]", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ── 抽獎 ───────────────────────────────────────────────────────
// 整段包在 transaction 裡：鎖玩家餘額 → 鎖該等級獎項列 → 加權抽 → 扣庫存 → 扣幣 → 開票。
// 這是庫存不會超發的關鍵（前端純 Math.random 做不到這件事）。
router.post("/spin", liffAuth, async (req, res) => {
  const tier = Number(req.body?.tier);
  if (!TIERS.includes(tier)) return res.status(400).json({ error: "bad_tier" });
  const cost = TIER_COST[tier];

  await upsertPlayer(req);

  let outcome;
  try {
    outcome = await withTx(async (client) => {
      const { rows: [player] } = await client.query(
        "SELECT balance FROM players WHERE line_user_id = $1 FOR UPDATE",
        [req.lineUserId],
      );
      if (!player) throw Object.assign(new Error("no_player"), { status: 404 });
      if (player.balance < cost) throw Object.assign(new Error("insufficient_coins"), { status: 400 });

      const { rows: pool } = await client.query(
        `SELECT * FROM prizes
          WHERE hotel = $1 AND tier = $2 AND active AND visible
            AND weight > 0 AND (quota = 0 OR issued < quota)
          ORDER BY slot
          FOR UPDATE`,
        [HOTEL, tier],
      );
      if (!pool.length) throw Object.assign(new Error("tier_unavailable"), { status: 409 });

      const prize = weightedPick(pool);
      if (!prize) throw Object.assign(new Error("tier_unavailable"), { status: 409 });

      const upd = await client.query(
        `UPDATE prizes SET issued = issued + 1, updated_at = now()
          WHERE id = $1 AND (quota = 0 OR issued < quota) RETURNING issued`,
        [prize.id],
      );
      if (!upd.rowCount) throw Object.assign(new Error("prize_sold_out"), { status: 409 });

      await addCoins(client, req.lineUserId, -cost, "spin_cost", prize.id);
      const isCoinPrize = prize.coin_reward > 0;
      let balance = player.balance - cost;
      if (isCoinPrize) {
        balance = await addCoins(client, req.lineUserId, prize.coin_reward, "spin_reward", prize.id);
      }

      // 虛擬獎（洲遊幣）直接入帳，不開票、不推播。
      const code = isCoinPrize ? null : makeCode();
      const claimToken = isCoinPrize || !prize.coupon_link ? null : makeClaimToken();

      const { rows: [draw] } = await client.query(
        `INSERT INTO draws
           (line_user_id, hotel, tier, cost, prize_id, prize_name, coin_reward, code, claim_token)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [req.lineUserId, HOTEL, tier, cost, prize.id, prize.name, prize.coin_reward, code, claimToken],
      );

      return { draw, prize, balance, isCoinPrize };
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("[spin]", err);
    return res.status(500).json({ error: "internal_error" });
  }

  const { draw, prize, balance, isCoinPrize } = outcome;

  // 推播在 transaction 之外 —— LINE 掛掉不該讓客人的獎消失。
  // 失敗原因留在 draws.push_error，後台可查、可補發。
  if (!isCoinPrize && draw.claim_token) {
    pushRewardCoupon(HOTEL, req.lineUserId, {
      ...draw,
      tier_label: TIER_LABEL[tier],
      spend_threshold: prize.spend_threshold,
      expiry_note: prize.expiry_note,
    })
      .then((r) =>
        query("UPDATE draws SET pushed = $2, push_error = $3 WHERE id = $1",
          [draw.id, r.ok, r.ok ? null : r.reason]))
      .catch((e) => console.error("[spin] push 記錄失敗:", e));
  }

  res.json({
    ok: true,
    slot: prize.slot,
    prize: prize.name,
    tier,
    tierLabel: TIER_LABEL[tier],
    code: draw.code,
    coin: prize.coin_reward,
    balance,
    terms: prize.terms,
    spendThreshold: prize.spend_threshold,
    expiryNote: prize.expiry_note,
  });
});

export default router;
