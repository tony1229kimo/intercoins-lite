/**
 * 消費者端 API。所有端點都要通過 LIFF id_token 驗證。
 */
import { asyncRouter } from "../lib/router.js";
import { query, withTx } from "../db.js";
import { requireLiffAuth } from "../middleware/liffAuth.js";
import { checkFriendship, pushRewardCoupon, pushContactReminder } from "../lib/line.js";
import { weightedPick, makeCode, makeClaimToken } from "../lib/random.js";
import { PUBLISHED_TASKS, TASK_BY_ID, MAX_EARNABLE } from "../lib/tasks.js";
import { TIER_LABEL, TIER_COST, TIERS } from "../prizes.js";

const router = asyncRouter();
const liffAuth = requireLiffAuth();

// 加好友檢查與所有推播都走【高雄洲際的 LINE 官方帳號】—— 客人是從高雄的 LIFF 進來的。
// 轉盤上雖然同時有臺北的獎項，但臺北是另一個 OA，我們沒有它的 token，
// 所以臺北的獎不推券、改收聯絡資訊（prizes.claim_mode = 'contact'）。
const OA_HOTEL = "KH";

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
    [req.lineUserId, req.lineDisplayName ?? null, req.linePictureUrl ?? null, OA_HOTEL],
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
  const result = await checkFriendship(OA_HOTEL, req.lineUserId);
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

  const [{ rows: claimed }, { rows: prizes }, { rows: won }, { rows: pending }, { rows: profile }] =
    await Promise.all([
      query("SELECT task_id FROM task_claims WHERE line_user_id = $1", [req.lineUserId]),
      query(
        `SELECT id, hotel, tier, position, name, coin_reward, claim_mode,
                (weight > 0 AND (quota = 0 OR issued < quota)) AS winnable
           FROM prizes
          WHERE active AND visible
          ORDER BY tier, position`,
      ),
      query(
        `SELECT prize_name, tier, code, coin_reward, created_at
           FROM draws WHERE line_user_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [req.lineUserId],
      ),
      // 中了臺北的獎但還沒留聯絡資訊 —— 客人關掉彈窗就跑掉的話，下次進來要再提醒。
      query(
        `SELECT d.id, d.prize_name, d.tier, d.code
           FROM draws d
           JOIN prizes p ON p.id = d.prize_id
      LEFT JOIN prize_contacts c ON c.draw_id = d.id
          WHERE d.line_user_id = $1 AND p.claim_mode = 'contact' AND c.draw_id IS NULL
          ORDER BY d.created_at`,
        [req.lineUserId],
      ),
      query(
        "SELECT name, phone, email FROM player_profiles WHERE line_user_id = $1",
        [req.lineUserId],
      ),
    ]);

  const done = Object.fromEntries(claimed.map((r) => [r.task_id, true]));

  // 轉盤盤面：每個等級的獎品按 position 排好（兩館的獎項在同一個盤面上）。
  // ⚠️ 只吐 id / 名稱 / 館別 / 領獎方式，不吐 weight / quota / issued ——
  //    機率與庫存不對客人公開（Tony 2026-09-01：客人不該從 F12 看到中獎率或剩幾張）。
  const wheel = {};
  const tierOpen = {};
  for (const tier of TIERS) {
    const slots = prizes.filter((p) => p.tier === tier);
    wheel[tier] = slots.map((p) => ({
      id: p.id, hotel: p.hotel, name: p.name,
      coin: p.coin_reward, claimMode: p.claim_mode,
    }));
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
    // 還沒補聯絡資訊的臺北中獎紀錄，前端會再跳一次表單。
    pendingContacts: pending.map((d) => ({
      drawId: d.id, prize: d.prize_name, tier: d.tier, code: d.code,
    })),
    // 已填過個人資料就幫客人帶入，不用重打一次。
    contactPrefill: profile[0] ?? null,
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
          WHERE tier = $1 AND active AND visible
            AND weight > 0 AND (quota = 0 OR issued < quota)
          ORDER BY position
          FOR UPDATE`,
        [tier],
      );
      // 該等級的獎全部發完 → 不是錯誤，是「銘謝惠顧」（Tony 2026-09-01）。
      // 刻意【不扣幣】：獎都沒了還收客人的洲遊幣，客訴與法遵風險都不划算。
      // 要改成扣幣的話，把下面的 EMPTY_TIER_COST 改成 cost 即可。
      const EMPTY_TIER_COST = 0;
      if (!pool.length) return { soldOut: true, cost: EMPTY_TIER_COST, balance: player.balance };

      const prize = weightedPick(pool);
      if (!prize) return { soldOut: true, cost: EMPTY_TIER_COST, balance: player.balance };

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
      // 臺北的獎（claim_mode='contact'）也不開 claim_token —— 細則未定案，不發 Omnichat 券，
      // 改請中獎者留聯絡資訊。兌換碼還是給，方便日後對帳與客服查詢。
      const isContact = prize.claim_mode === "contact";
      const code = isCoinPrize ? null : makeCode();
      const claimToken = (isCoinPrize || isContact || !prize.coupon_link) ? null : makeClaimToken();

      const { rows: [draw] } = await client.query(
        `INSERT INTO draws
           (line_user_id, hotel, tier, cost, prize_id, prize_name, coin_reward, code, claim_token)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [req.lineUserId, prize.hotel, tier, cost, prize.id, prize.name,
         prize.coin_reward, code, claimToken],
      );

      return { draw, prize, balance, isCoinPrize, isContact };
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("[spin]", err);
    return res.status(500).json({ error: "internal_error" });
  }

  // 該等級已全數發完 → 回「銘謝惠顧」，前端照樣轉一圈再開獎，不當成錯誤。
  if (outcome.soldOut) {
    return res.json({
      ok: true,
      soldOut: true,
      prizeId: null,
      prize: "銘謝惠顧",
      tier,
      tierLabel: TIER_LABEL[tier],
      code: null,
      coin: 0,
      balance: outcome.balance,
      costCharged: outcome.cost,
    });
  }

  const { draw, prize, balance, isCoinPrize, isContact } = outcome;

  // 推播刻意放在 transaction 之外 —— LINE 掛掉不該讓客人已經抽中的獎消失。
  //
  // 但也刻意【等它回來】才回應：轉盤動畫要跑 5.4 秒，LINE push 通常 <500ms，
  // 客人不會感覺到延遲，我們卻能誠實告訴他券到底有沒有送出去。
  // （非同步 fire-and-forget 的話，推播失敗時畫面仍會寫「已發送至你的 LINE」，
  //   客人翻遍聊天室找不到券，只會變成客訴。）
  let pushed = false;
  if (!isCoinPrize && draw.claim_token) {
    const r = await pushRewardCoupon(OA_HOTEL, req.lineUserId, {
      ...draw,
      tier_label: TIER_LABEL[tier],
      spend_threshold: prize.spend_threshold,
      expiry_note: prize.expiry_note,
    });
    pushed = r.ok;
    if (!r.ok) console.error(`[spin] push 失敗 draw=${draw.id}:`, r.reason);
    await query("UPDATE draws SET pushed = $2, push_error = $3 WHERE id = $1",
      [draw.id, r.ok, r.ok ? null : r.reason])
      .catch((e) => console.error("[spin] push 結果寫入失敗:", e));
  } else if (isContact) {
    // 臺北的獎：推一則提醒，避免客人關掉彈窗後就忘了要留聯絡資訊。
    // 走的還是高雄的 OA（客人是從那裡進來的），內容只說明後續由臺北洲際聯繫。
    const r = await pushContactReminder(OA_HOTEL, req.lineUserId, {
      prizeName: draw.prize_name,
      code: draw.code,
      tierLabel: TIER_LABEL[tier],
    });
    pushed = r.ok;
    if (!r.ok) console.warn(`[spin] 聯絡提醒推播失敗 draw=${draw.id}:`, r.reason);
    await query("UPDATE draws SET pushed = $2, push_error = $3 WHERE id = $1",
      [draw.id, r.ok, r.ok ? null : r.reason])
      .catch((e) => console.error("[spin] push 結果寫入失敗:", e));
  }

  res.json({
    ok: true,
    prizeId: prize.id,
    prize: prize.name,
    hotel: prize.hotel,
    claimMode: prize.claim_mode,
    drawId: draw.id,
    tier,
    tierLabel: TIER_LABEL[tier],
    code: draw.code,
    coin: prize.coin_reward,
    balance,
    pushed,
    terms: prize.terms,
    spendThreshold: prize.spend_threshold,
    expiryNote: prize.expiry_note,
  });
});

// ── 中獎聯絡資訊（臺北獎項專用）────────────────────────────────
// 臺北洲際的兌換細則還沒定案 → 不發 Omnichat 券，改收聯絡方式，
// 由臺北洲際的人後續以信件聯繫。
router.post("/draws/:id/contact", liffAuth, async (req, res) => {
  const drawId = Number(req.params.id);
  if (!Number.isInteger(drawId)) return res.status(400).json({ error: "bad_draw_id" });

  const name = String(req.body?.name ?? "").trim();
  const phone = String(req.body?.phone ?? "").replace(/[-\s]/g, "");
  const email = String(req.body?.email ?? "").trim();
  const rawWindow = String(req.body?.contactWindow ?? "").trim();
  const contactWindow = ["上午", "下午", "晚上", "皆可"].includes(rawWindow) ? rawWindow : null;

  if (!name) return res.status(400).json({ error: "name_required" });
  if (!/^09\d{8}$/.test(phone)) return res.status(400).json({ error: "phone_invalid" });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: "email_invalid" });

  // 一定要確認這筆中獎紀錄是【這個人自己的】，否則任何人都能覆蓋別人的聯絡資訊。
  const { rows } = await query(
    `SELECT d.id, p.claim_mode
       FROM draws d JOIN prizes p ON p.id = d.prize_id
      WHERE d.id = $1 AND d.line_user_id = $2`,
    [drawId, req.lineUserId],
  );
  if (!rows.length) return res.status(404).json({ error: "draw_not_found" });
  if (rows[0].claim_mode !== "contact") return res.status(400).json({ error: "not_contact_prize" });

  await query(
    `INSERT INTO prize_contacts
       (draw_id, line_user_id, name, phone, email, contact_window)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (draw_id) DO UPDATE SET
       name = EXCLUDED.name, phone = EXCLUDED.phone, email = EXCLUDED.email,
       contact_window = EXCLUDED.contact_window, updated_at = now()`,
    [drawId, req.lineUserId, name, phone, email, contactWindow],
  );

  res.json({ ok: true });
});

export default router;
