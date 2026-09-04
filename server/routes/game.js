/**
 * Consumer API. Every route requires a verified LIFF id token.
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

// The friend check and every push go through the Kaohsiung official account,
// because that is the LIFF the guest arrived through. Taipei prizes share the
// wheel, but Taipei is a separate account we hold no token for, so Taipei prizes
// issue no voucher and collect contact details instead (claim_mode 'contact').
const OA_HOTEL = "KH";

/**
 * How many physical prizes one LINE account may win. 0, the default, is no limit.
 *
 * The limit was added on 2026-09-02 to stop the bleeding: coins were refunded in
 * full at the time, so every coin cycled back into another physical prize and a
 * handful of people could empty a tier.
 *
 * The wheel was reconfigured later the same day and the refund loop went with it.
 * Every draw now costs coins and each person can earn only a fixed number, so
 * consumption is capped on its own and the limit stopped being necessary. Turned
 * off on 2026-09-02.
 *
 * The mechanism stays: set MAX_PHYSICAL_WINS to a number to switch it back on,
 * and remember that the container reads process.env only at startup, so it needs
 * a real redeploy. A value that will not parse falls open to "no limit" on
 * purpose -- if this switch breaks, it has to break towards letting guests play,
 * not towards locking all of them out.
 */
const MAX_PHYSICAL_WINS = Number.parseInt(process.env.MAX_PHYSICAL_WINS ?? "0", 10) || 0;

/** How many physical prizes this person has already won (draws with no coin reward, including those awaiting contact). */
async function countPhysicalWins(client, userId) {
  const { rows: [r] } = await client.query(
    "SELECT COUNT(*)::int AS n FROM draws WHERE line_user_id = $1 AND coin_reward = 0",
    [userId],
  );
  return r.n;
}

/** Create the player on first arrival; refresh the LINE display name and avatar every time. */
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

// -- friend gate --------------------------------------------------
// A guest has to add the official account before playing, because vouchers are
// delivered by push: to a non-friend that fails silently, which would mean
// winning a prize and never receiving it.
router.get("/me/friendship", liffAuth, async (req, res) => {
  const result = await checkFriendship(OA_HOTEL, req.lineUserId);
  if (!result.ok) {
    // Our own infrastructure failing must not shut a real guest out -- let them through and log it.
    console.warn("[friendship] 檢查失敗，降級為已加好友:", result.reason);
    return res.json({ ok: true, isFriend: true, degraded: true });
  }
  res.json({ ok: true, isFriend: result.isFriend });
});

// -- game state ---------------------------------------------------
router.get("/state", liffAuth, async (req, res) => {
  const player = await upsertPlayer(req);

  const [{ rows: claimed }, { rows: prizes }, { rows: won }, { rows: pending }, { rows: profile },
         { rows: physical }] =
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
      // Won a prize that needs contact details but has not left any. If the guest closed the dialog and left, ask again next time.
      query(
        `SELECT d.id, d.prize_name, d.tier, d.code, d.hotel
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
      // Physical prizes won so far, so the front end can disable the button on reaching any limit instead of spinning first.
      query(
        "SELECT COUNT(*)::int AS n FROM draws WHERE line_user_id = $1 AND coin_reward = 0",
        [req.lineUserId],
      ),
    ]);

  const done = Object.fromEntries(claimed.map((r) => [r.task_id, true]));

  // The wheel: each tier's prizes in position order, both hotels on one wheel.
  // Only id, name, hotel and claim mode go out -- never weight, quota or issued.
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
    // Wins still missing contact details; the front end asks again.
    // The hotel comes along because the form shows the emblem and name of whichever
    // property the prize belongs to, and two Kaohsiung room prizes take this path too.
    pendingContacts: pending.map((d) => ({
      drawId: d.id, prize: d.prize_name, tier: d.tier, code: d.code, hotel: d.hotel,
    })),
    // Prefill from details already given, so nothing is typed twice.
    contactPrefill: profile[0] ?? null,
    // Per-person prize limit. The front end disables the draw button on reaching it; /spin enforces it again server-side.
    physicalWins: physical[0].n,
    maxPhysicalWins: MAX_PHYSICAL_WINS,
  });
});

// -- task rewards -------------------------------------------------
router.post("/tasks/:id/claim", liffAuth, async (req, res) => {
  const task = TASK_BY_ID[req.params.id];
  if (!task) return res.status(404).json({ error: "task_not_found" });

  await upsertPlayer(req);

  try {
    const balance = await withTx(async (client) => {
      // A primary-key conflict means it was already claimed. DO NOTHING plus a rowCount check makes repeat taps harmless on its own.
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

// -- details form (also completes the profile task) ---------------
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
      // The coin is issued once; editing the details again does not issue another.
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

// -- draw ---------------------------------------------------------
// The whole sequence runs in one transaction: lock the player's balance, lock the
// tier's prize rows, draw by weight, decrement stock, charge coins, issue the
// ticket. That is what stops stock being over-issued, and it is not something a
// front end could do.
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

      // Per-person prize limit, checked after the FOR UPDATE on players on purpose: two
      // rapid taps from one person are serialised by that lock, so they cannot both
      // slip past the limit.
      // No coins are charged here either -- charging for a draw that was refused is not
      // worth the complaint or the compliance risk.
      if (MAX_PHYSICAL_WINS > 0) {
        const wins = await countPhysicalWins(client, req.lineUserId);
        if (wins >= MAX_PHYSICAL_WINS) {
          return { capReached: true, cost: 0, balance: player.balance, wins };
        }
      }

      // A consolation prize has to be drawable even with visible = false: the higher
      // tiers do not list it, but it still has to be awarded when it comes up.
      const { rows: pool } = await client.query(
        `SELECT * FROM prizes
          WHERE tier = $1 AND active AND (visible OR is_consolation)
            AND weight > 0 AND (quota = 0 OR issued < quota)
          ORDER BY position
          FOR UPDATE`,
        [tier],
      );
      // Every prize in this tier has gone. Not an error -- this is a losing draw.
      //
      // Coins ARE charged. Originally they were not, on the grounds that charging when
      // nothing is left invites complaints; charging keeps a cost on aiming at the top
      // tiers while they remain on screen as a goal, and the lower tiers still hold
      // physical prizes, so nobody leaves empty-handed.
      if (!pool.length) {
        await addCoins(client, req.lineUserId, -cost, "spin_miss", `tier${tier}_soldout`);
        return { soldOut: true, cost, balance: player.balance - cost };
      }

      // Drawing against a fixed denominator: the shortfall between the weights and that
      // denominator is a losing draw.
      //
      // Coins ARE charged. Without that, a player could retry for free until they win
      // and the weighting would mean nothing.
      //
      // This is not the same as the sold-out case above, which does NOT charge: an
      // empty pool means the player never had a chance, so taking their coins would not
      // be defensible.
      // Landing in the shortfall awards the consolation prize instead, which is
      // unlimited. As long as one is in the pool nobody goes away with nothing, and
      // once every other prize has gone the pool holds only this.
      const picked = weightedPick(pool, { outOf: 100 });
      const prize = picked ?? pool.find((x) => x.is_consolation);

      // Only reachable with no consolation prize at all -- if it were deactivated, say -- so the original losing path is kept as a safety net.
      if (!prize) {
        await addCoins(client, req.lineUserId, -cost, "spin_miss", `tier${tier}`);
        return { missed: true, cost, balance: player.balance - cost };
      }

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

      // Coin rewards are credited directly: no ticket, no push.
      // Prizes with claim_mode 'contact' get no claim token either. They issue no
      // voucher and ask the winner for contact details instead. A redemption code is
      // still produced, which makes reconciliation and support enquiries easier.
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

  // Per-person limit reached: no spin, no charge, tell the guest plainly.
  if (outcome.capReached) {
    return res.json({
      ok: true,
      capReached: true,
      wins: outcome.wins,
      maxPhysicalWins: MAX_PHYSICAL_WINS,
      tier,
      tierLabel: TIER_LABEL[tier],
      balance: outcome.balance,
      costCharged: 0,
    });
  }

  // A losing draw from the shortfall. Coins ARE charged.
  if (outcome.missed) {
    return res.json({
      ok: true,
      soldOut: true,          // the front end reuses the same screen
      missed: true,           // but the copy has to say how many coins were taken
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

  // Tier sold out. Return the losing result; the front end still spins before revealing it, rather than treating it as an error.
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

  // The push sits outside the transaction on purpose: LINE being down must not make
  // a prize the guest has already won disappear.
  //
  // It is also awaited on purpose. The wheel animates for 5.4 seconds and a push
  // usually takes under half of one, so the guest notices no delay while we can
  // still tell them honestly whether the voucher went out. Fire-and-forget would
  // leave the screen saying "sent to your LINE" after a failure, and the guest
  // hunting through the chat for a voucher that is not there.
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
    // Prizes that collect contact details get a reminder pushed, so a guest who
    // closed the dialog does not simply forget.
    // It goes through the Kaohsiung account, which is where the guest came from, but
    // the text has to name the property that is actually giving the prize -- hence
    // prizeHotel. Leave it out and the message falls back to saying "this hotel",
    // which reads like nothing at all.
    const r = await pushContactReminder(OA_HOTEL, req.lineUserId, {
      prizeName: draw.prize_name,
      code: draw.code,
      tierLabel: TIER_LABEL[tier],
      prizeHotel: prize.hotel,
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

// -- winner contact details ---------------------------------------
// Taipei redemption terms are not settled, so no voucher is issued: contact
// details are collected and Taipei follow up by email.
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

  // Check the win actually belongs to this person, or anyone could overwrite somebody else's contact details.
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
