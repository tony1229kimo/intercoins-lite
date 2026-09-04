/**
 * Collecting a prize: GET shows the page, POST spends the token.
 *
 * Why this layer exists at all: the voucher provider's bind URL is completely
 * stateless and does not deduplicate per user. One tap issues one voucher, so
 * N taps issue N vouchers -- and a LINE Flex message stays in the chat history
 * forever, so a guest could simply keep tapping. That behaviour is not ours to
 * change, so it is wrapped here and each win gets a single-use token.
 *
 * Why it is now two steps (2026-09-04): the single-use token used to be spent
 * by the GET itself. Anything that merely *touches* the URL would burn it --
 * a link preview, a security scanner, a browser prefetch, antivirus -- and the
 * guest, tapping for the first time, would be told the link had already been
 * used and never reach the voucher at all. A guest hit exactly that.
 *
 * So: GET only reads and renders. The token is spent by a POST, which nothing
 * issues on its own -- it takes a deliberate tap on the button.
 *
 * This route has to sit on the same domain as the button in the Flex message:
 * a wrapper URL pointing at a retired or mistyped host 404s. Front end and API
 * are one Express service on one domain here, so getting PUBLIC_BASE_URL right
 * is enough.
 */
import { asyncRouter } from "../lib/router.js";
import { query } from "../db.js";

const router = asyncRouter();

const LINE_OA_URL = process.env.LINE_ADD_FRIEND_URL || "https://lin.ee/uKzkNI9";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Rendered inline by the server rather than redirected across domains. */
function noticePage({ title, body, cta, form }) {
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex, nofollow" />
<title>洲遊幣 · ${esc(title)}</title>
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
  .prize{font-size:16px;line-height:1.7;color:var(--ink);margin-top:4px}
  a.btn,button.btn{display:block;width:100%;margin-top:24px;padding:14px;border:none;border-radius:6px;
    background:var(--ink);color:#fff;text-decoration:none;font-size:15px;letter-spacing:2px;
    font-family:inherit;cursor:pointer}
  button.btn:active{transform:scale(.99)}
  button.btn[disabled]{opacity:.6}
  .note{margin-top:14px;font-size:11.5px;color:var(--grey);line-height:1.7}
</style>
</head>
<body>
  <div class="card">
    <div class="tag">INTERCONTINENTAL KAOHSIUNG</div>
    <h1>${esc(title)}</h1>
    <div class="rule"></div>
    <p>${body}</p>
    ${form ? `<form method="POST" action="${esc(form.action)}">
      <button class="btn" type="submit" id="go">${esc(form.label)}</button>
    </form>
    <p class="note">${form.note ?? ""}</p>
    <script>
      // Guard against a double tap producing two submissions.
      var f = document.querySelector('form');
      f.addEventListener('submit', function(){
        var b = document.getElementById('go');
        b.disabled = true; b.textContent = '處理中…';
      });
    </script>` : ""}
    ${cta ? `<a class="btn" href="${esc(cta.href)}">${esc(cta.label)}</a>` : ""}
  </div>
</body>
</html>`;
}

const usedPage = () => noticePage({
  title: "此連結已使用過",
  body: "這張券已經領取完成了。<br/>您先前領到的優惠券都在 LINE 聊天室裡，<br/>可以直接打開查看。",
  cta: { href: LINE_OA_URL, label: "打開 LINE 官方帳號" },
});

/**
 * Step one: show what is waiting, and nothing else.
 *
 * Deliberately read-only. Whatever fetches this -- a preview, a scanner, the
 * guest themselves -- the token is untouched and the voucher is still theirs.
 */
router.get("/:token", async (req, res) => {
  const token = String(req.params.token || "");
  if (!token) return res.status(400).send("bad request");

  let rows;
  try {
    ({ rows } = await query(
      `SELECT d.prize_name, d.claim_used_at, pz.expiry_note
         FROM draws d JOIN prizes pz ON pz.id = d.prize_id
        WHERE d.claim_token = $1`,
      [token],
    ));
  } catch (err) {
    // A guest holding a winning link must never be shown a raw error. Nothing
    // has been spent, so asking them to try again is honest advice.
    console.error("[claim] 查詢失敗:", err);
    return res.status(500).send(noticePage({
      title: "系統忙碌中",
      body: "請稍後再點一次這個連結，您的獎品仍然保留。",
    }));
  }

  // An unknown token and a spent one get the same page, so nothing here reveals
  // whether a token is real.
  if (!rows.length || rows[0].claim_used_at) return res.status(200).send(usedPage());

  const { prize_name: name, expiry_note: expiry } = rows[0];
  return res.status(200).send(noticePage({
    title: "領取您的獎品",
    body: `恭喜您抽中<br/><span class="prize">${esc(name)}</span>`,
    form: {
      action: `/api/claim/${encodeURIComponent(token)}`,
      label: "領取優惠券",
      note: `按下後優惠券會立即發送到您的 LINE 聊天室。<br/>此連結僅能使用一次。${
        expiry ? `<br/>${esc(expiry)}` : ""}`,
    },
  }));
});

/**
 * Step two: spend the token and hand the guest over.
 *
 * The atomic UPDATE is what guarantees one voucher per win: concurrent taps are
 * serialised by Postgres and exactly one of them gets the row.
 */
router.post("/:token", async (req, res) => {
  const token = String(req.params.token || "");
  if (!token) return res.status(400).send("bad request");

  try {
    const { rows } = await query(
      `UPDATE draws SET claim_used_at = now()
        WHERE claim_token = $1 AND claim_used_at IS NULL
        RETURNING prize_id, prize_name`,
      [token],
    );

    if (!rows.length) return res.status(200).send(usedPage());

    const { rows: [prize] } = await query(
      "SELECT coupon_link FROM prizes WHERE id = $1", [rows[0].prize_id]);

    // 303 rather than 302: the browser should follow with a GET, so going back
    // afterwards cannot re-submit the form.
    if (prize?.coupon_link) return res.redirect(303, prize.coupon_link);

    // A winning entry with no voucher link: a data gap, so give the guest
    // something they can take to the front desk.
    console.error(`[claim] ${rows[0].prize_id} 沒有 coupon_link，無法轉址`);
    return res.status(200).send(noticePage({
      title: "請至櫃檯領取",
      body: `您的獎品「${esc(rows[0].prize_name)}」需由現場人員為您處理，<br/>請持本頁面至高雄洲際酒店櫃檯出示。`,
    }));
  } catch (err) {
    // Do not collapse every failure into the same misleading message.
    console.error("[claim] 失敗:", err);
    return res.status(500).send(noticePage({
      title: "系統忙碌中",
      body: `請稍後再點一次這個連結，您的獎品仍然保留。<br/><br/>
             <span style="font-size:11px;color:#B14A4A">[${esc(String(err.message).slice(0, 120))}]</span>`,
    }));
  }
});

export default router;
