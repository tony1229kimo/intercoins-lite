/**
 * Is this request something other than a guest tapping a link?
 *
 * The claim URL spends a single-use token, so it matters who is asking. Two
 * failures are possible and they are not equally bad:
 *
 *   treat a prefetch as a guest  -> the token burns, the guest gets nothing,
 *                                   and the page tells them it was already used
 *   treat a guest as a prefetch  -> they see a page with a button and tap it
 *
 * The second costs one tap. The first costs the prize. So this answers "yes"
 * only on positive evidence of an automated fetch, and anything unrecognised is
 * treated as a guest.
 *
 * That matters more than it looks: Safari only began sending Sec-Fetch-* in
 * 16.4, so a guest on an older iPhone sends none of these headers at all.
 * Requiring a positive human signal would lock those guests out permanently --
 * which is exactly the failure this whole exercise is meant to prevent.
 */

/** Explicit "I am fetching this ahead of time" markers, across browsers. */
const PREFETCH_HEADERS = [
  ["sec-purpose", /prefetch|prerender/],
  ["purpose", /prefetch|preview/],
  ["x-purpose", /prefetch|preview/],
  ["x-moz", /prefetch/],
];

/**
 * Clients that are certainly not a person with a phone.
 *
 * Deliberately specific. A loose word like "preview" on its own would also
 * match real browser builds, and a false positive here costs a guest their tap.
 * LINE's in-app browser ("Line/12.x") matches none of these.
 */
const ROBOT_UA = new RegExp([
  "bot\\b", "crawler", "spider", "scrapy",
  "curl/", "wget", "python-requests", "okhttp", "java/", "go-http-client",
  "headless", "phantomjs", "puppeteer", "playwright",
  "facebookexternalhit", "slackbot", "twitterbot", "whatsapp",
  "telegrambot", "discordbot", "bingpreview", "google-read-aloud",
  "uptime", "pingdom", "statuscake", "site24x7",
].join("|"), "i");

/**
 * True when the request is positively identifiable as automated.
 * Anything ambiguous returns false, so the guest is let through.
 */
export function looksAutomated(req) {
  // A HEAD never comes from someone opening a link.
  if (req.method === "HEAD") return true;

  const h = (name) => String(req.headers?.[name] ?? "").toLowerCase();

  for (const [name, re] of PREFETCH_HEADERS) {
    if (re.test(h(name))) return true;
  }

  // A top-level navigation is always dest=document; a fetch(), an <img> or an
  // <iframe> is not. Absent tells us nothing, so absence is not evidence.
  //
  // Only dest is checked. Sec-Fetch-Mode would flag the same requests -- a
  // fetch() is mode=cors and dest=empty together -- while adding another way to
  // misjudge a real navigation, and a wrong "yes" here is what costs a guest
  // their prize.
  const dest = h("sec-fetch-dest");
  if (dest && dest !== "document") return true;

  const ua = h("user-agent");
  if (!ua) return true;                 // every real browser sends one
  if (ROBOT_UA.test(ua)) return true;

  return false;
}

/** Short, non-identifying description of a request, for the server log. */
export function requestShape(req) {
  const h = (name) => req.headers?.[name] ?? "-";
  return [
    req.method,
    `dest=${h("sec-fetch-dest")}`,
    `mode=${h("sec-fetch-mode")}`,
    `user=${h("sec-fetch-user")}`,
    `purpose=${h("sec-purpose")}`,
    `line=${/\bLine\//i.test(String(h("user-agent"))) ? "yes" : "no"}`,
  ].join(" ");
}
