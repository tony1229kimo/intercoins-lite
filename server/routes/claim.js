/**
 * GET /api/claim/:token -- single-use redirect to collect a prize.
 *
 * Why this layer exists: the voucher provider's bind URL is completely stateless
 * and does not deduplicate per user. One tap issues one voucher, so N taps issue
 * N vouchers -- and a LINE Flex message stays in the chat history forever, so a
 * guest could simply keep tapping. That behaviour is not ours to change, so it is
 * wrapped here.
 *
 * How: an atomic UPDATE ... WHERE claim_token = $1 AND claim_used_at IS NULL.
 *   rowCount 1  first tap      -> 302 onward, the voucher is issued
 *   rowCount 0  repeat or bad token -> show the "already collected" page
 * Concurrent taps are serialised by Postgres, so exactly one wins.
 *
 * This route has to sit on the same domain as the button in the Flex message: a
 * wrapper URL pointing at a retired or mistyped host 404s. Front end and API are
 * one Express service on one domain here, so getting PUBLIC_BASE_URL right is
 * enough.
 */
import { asyncRouter } from "../lib/router.js";
import { query } from "../db.js";

const router = asyncRouter();

const LINE_OA_URL = process.env.LINE_ADD_FRIEND_URL || "https://lin.ee/uKzkNI9";

/** Rendered inline by the server rather than redirected across domains. */
function noticePage({ title, body, cta }) {
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>洲遊幣 · ${title}</title>
<style>
  :root{--gold:#B8975A;--ink:#3D3935;--grey:#686869;--cream:#FAF8F5}
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px;
    background:#EAE7E1;color:var(--ink);
    font-family:"PingFang TC","Noto Sans TC",-apple-system,BlinkMacSystemFont,sans-serif}
  .card{width:100%;max-width:360px;background:linear-gradient(180deg,#fff,var(--cream));
    border:1px solid rgba(61,57,53,.08);border-radius:8px;padding:36px 28px;text-align:center;
    box-shadow:0 1px 2px rgba(61,57,53,.06),0 18px 48px rgba(61,57,53,.14)}
  .tag{letter-spacing:3px;font-size:10px;color:var(--grey)}
  h1{font-family:Georgia,"Noto Serif TC",serif;font-size:22px;letter-spacing:2px;margin:12px 0 6px}
  .rule{width:42px;height:1px;background:var(--gold);margin:18px auto}
  p{font-size:14px;line-height:1.8;color:var(--grey)}
  a.btn{display:block;margin-top:24px;padding:14px;border-radius:6px;background:var(--ink);
    color:#fff;text-decoration:none;font-size:15px;letter-spacing:2px}
</style>
</head>
<body>
  <div class="card">
    <div class="tag">INTERCONTINENTAL KAOHSIUNG</div>
    <h1>${title}</h1>
    <div class="rule"></div>
    <p>${body}</p>
    ${cta ? `<a class="btn" href="${cta.href}">${cta.label}</a>` : ""}
  </div>
</body>
</html>`;
}

router.get("/:token", async (req, res) => {
  const token = String(req.params.token || "");
  if (!token) return res.status(400).send("bad request");

  try {
    const { rows } = await query(
      `UPDATE draws SET claim_used_at = now()
        WHERE claim_token = $1 AND claim_used_at IS NULL
        RETURNING prize_id, prize_name`,
      [token],
    );

    if (rows.length === 1) {
      const { rows: [prize] } = await query(
        "SELECT coupon_link FROM prizes WHERE id = $1", [rows[0].prize_id]);
      if (prize?.coupon_link) {
        return res.redirect(302, prize.coupon_link);
      }
      // A winning entry with no voucher link: a data gap, so give the guest something they can take to the front desk.
      console.error(`[claim] ${rows[0].prize_id} 沒有 coupon_link，無法轉址`);
      return res.status(200).send(noticePage({
        title: "請至櫃檯領取",
        body: `您的獎品「${rows[0].prize_name}」需由現場人員為您處理，<br/>請持本頁面至高雄洲際酒店櫃檯出示。`,
      }));
    }

    // No row means already collected, or the token never existed. Both go to the same page, so nothing reveals whether a token is real.
    return res.status(200).send(noticePage({
      title: "此連結已使用過",
      body: "這張券已經領取完成了。<br/>您先前領到的優惠券都在 LINE 聊天室裡，<br/>可以直接打開查看。",
      cta: { href: LINE_OA_URL, label: "打開 LINE 官方帳號" },
    }));
  } catch (err) {
    // Do not collapse every failure into the same misleading message.
    console.error("[claim] 失敗:", err);
    return res.status(500).send(noticePage({
      title: "系統忙碌中",
      body: `請稍後再點一次這個連結，您的獎品仍然保留。<br/><br/>
             <span style="font-size:11px;color:#B14A4A">[${String(err.message).slice(0, 120)}]</span>`,
    }));
  }
});

export default router;
